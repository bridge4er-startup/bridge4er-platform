from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from exams.models import ExamPurchase, ExamSet

from .models import PaymentTransaction, QRPaymentConfiguration


MANUAL_QR_GATEWAY = "manual_qr"
LEGACY_REMOVED_ERROR = (
    "Online gateway payment is disabled. Use QR payment request and wait for admin approval."
)


def _parse_amount(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    return amount.quantize(Decimal("0.01"))


def _create_or_get_purchase(transaction_obj, gateway_tx_id=""):
    exam_set = transaction_obj.exam_set
    purchase, created = ExamPurchase.objects.get_or_create(
        user=transaction_obj.user,
        exam_set=exam_set,
        defaults={
            "exam_type": exam_set.exam_type,
            "set_name": exam_set.name,
            "payment_gateway": transaction_obj.gateway,
            "transaction_id": gateway_tx_id,
            "amount": transaction_obj.amount,
        },
    )
    if not created:
        purchase.payment_gateway = transaction_obj.gateway
        purchase.transaction_id = gateway_tx_id
        purchase.amount = transaction_obj.amount
        purchase.save(update_fields=["payment_gateway", "transaction_id", "amount"])
    return purchase


def _get_exam_set_for_payment(exam_set_id):
    try:
        exam_set = ExamSet.objects.get(id=exam_set_id, is_active=True)
    except ExamSet.DoesNotExist:
        return None, Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)

    if exam_set.is_free:
        return None, Response(
            {"error": "This exam set is free and does not require payment."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return exam_set, None


def _normalize_email(value):
    return str(value or "").strip().lower()


def _normalize_mobile(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if digits.startswith("977") and len(digits) > 10:
        return digits[-10:]
    return digits


def _validate_payment_profile(user, email, mobile_number):
    normalized_email = _normalize_email(email)
    normalized_mobile = _normalize_mobile(mobile_number)
    if not normalized_email or not normalized_mobile:
        return None, None, Response(
            {"error": "email and mobile_number are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile_email = _normalize_email(getattr(user, "email", ""))
    profile_mobile = _normalize_mobile(getattr(user, "mobile_number", ""))
    if not profile_email or not profile_mobile:
        return None, None, Response(
            {"error": "Please update your profile email and mobile number before payment."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if normalized_email != profile_email or normalized_mobile != profile_mobile:
        return None, None, Response(
            {"error": "Entered email and mobile number must match your profile details."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return profile_email, profile_mobile, None


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _build_qr_config_payload(config):
    if not config:
        return {
            "has_config": False,
            "title": "Bridge4ER Official Payment QR",
            "account_name": "",
            "account_number": "",
            "contact_email": "",
            "contact_phone": "",
            "qr_image_url": "",
            "instructions": (
                "Admin has not configured payment QR details yet. "
                "Please contact admin for payment instructions."
            ),
            "updated_at": None,
        }
    return {
        "has_config": True,
        "id": config.id,
        "title": config.title,
        "account_name": config.account_name,
        "account_number": config.account_number,
        "contact_email": config.contact_email,
        "contact_phone": config.contact_phone,
        "qr_image_url": config.qr_image_url,
        "instructions": config.instructions,
        "is_active": bool(config.is_active),
        "updated_at": config.updated_at,
    }


def _build_payment_request_payload(txn):
    return {
        "reference_id": str(txn.reference_id),
        "exam_set_id": txn.exam_set_id,
        "exam_set_name": getattr(txn.exam_set, "name", ""),
        "exam_type": getattr(txn.exam_set, "exam_type", ""),
        "gateway": txn.gateway,
        "amount": str(txn.amount),
        "email": txn.email,
        "mobile_number": txn.mobile_number,
        "transaction_reference": txn.gateway_reference,
        "status": txn.status,
        "payer_note": txn.payer_note,
        "payment_screenshot_url": txn.payment_screenshot_url,
        "admin_note": txn.admin_note,
        "error_message": txn.error_message,
        "reviewed_at": txn.reviewed_at,
        "approved_at": txn.approved_at,
        "created_at": txn.created_at,
        "updated_at": txn.updated_at,
        "reviewed_by": getattr(getattr(txn, "reviewed_by", None), "username", ""),
        "student": {
            "id": txn.user_id,
            "username": getattr(txn.user, "username", ""),
            "full_name": getattr(txn.user, "full_name", ""),
            "email": getattr(txn.user, "email", ""),
        },
    }


def _mark_request_rejected(transaction_obj, reviewer, admin_note=""):
    transaction_obj.status = "rejected"
    transaction_obj.reviewed_by = reviewer
    transaction_obj.reviewed_at = timezone.now()
    transaction_obj.admin_note = str(admin_note or "").strip()
    transaction_obj.error_message = "Rejected by admin"
    transaction_obj.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "admin_note",
            "error_message",
            "updated_at",
        ]
    )


def _mark_request_approved(transaction_obj, reviewer, admin_note="", gateway_tx_id=""):
    with transaction.atomic():
        transaction_obj.status = "approved"
        transaction_obj.reviewed_by = reviewer
        transaction_obj.reviewed_at = timezone.now()
        transaction_obj.approved_at = timezone.now()
        transaction_obj.admin_note = str(admin_note or "").strip()
        transaction_obj.gateway_transaction_id = (
            str(gateway_tx_id or "").strip() or transaction_obj.gateway_reference
        )
        transaction_obj.error_message = ""
        transaction_obj.verified_at = timezone.now()
        transaction_obj.save(
            update_fields=[
                "status",
                "reviewed_by",
                "reviewed_at",
                "approved_at",
                "admin_note",
                "gateway_transaction_id",
                "error_message",
                "verified_at",
                "updated_at",
            ]
        )
        return _create_or_get_purchase(transaction_obj, transaction_obj.gateway_transaction_id)


def _legacy_gateway_response():
    return Response({"error": LEGACY_REMOVED_ERROR}, status=status.HTTP_410_GONE)


class QRCodePaymentConfigView(APIView):
    def get_permissions(self):
        if self.request.method.lower() == "get":
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get(self, request):
        config = (
            QRPaymentConfiguration.objects.filter(is_active=True)
            .order_by("-updated_at", "-id")
            .first()
        )
        return Response(_build_qr_config_payload(config))

    def patch(self, request):
        config = QRPaymentConfiguration.objects.order_by("-updated_at", "-id").first()
        is_new = config is None
        if config is None:
            config = QRPaymentConfiguration(created_by=request.user)

        editable_fields = [
            "title",
            "account_name",
            "account_number",
            "contact_email",
            "contact_phone",
            "qr_image_url",
            "instructions",
        ]
        for field in editable_fields:
            if field in request.data:
                setattr(config, field, str(request.data.get(field) or "").strip())

        if "is_active" in request.data:
            config.is_active = _as_bool(request.data.get("is_active"), default=True)

        config.updated_by = request.user
        if not config.created_by_id:
            config.created_by = request.user
        config.save()

        if config.is_active:
            QRPaymentConfiguration.objects.exclude(id=config.id).update(is_active=False)

        payload = _build_qr_config_payload(config)
        http_status = status.HTTP_201_CREATED if is_new else status.HTTP_200_OK
        return Response(payload, status=http_status)

    def post(self, request):
        return self.patch(request)


class ManualPaymentRequestCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        exam_set, error_response = _get_exam_set_for_payment(request.data.get("exam_set_id"))
        if error_response:
            return error_response

        if ExamPurchase.objects.filter(user=request.user, exam_set=exam_set).exists():
            return Response(
                {"error": "Exam set is already unlocked for your account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email, mobile_number, error_response = _validate_payment_profile(
            request.user,
            request.data.get("email"),
            request.data.get("mobile_number") or request.data.get("mobile"),
        )
        if error_response:
            return error_response

        transaction_reference = str(
            request.data.get("transaction_reference")
            or request.data.get("gateway_reference")
            or ""
        ).strip()
        if not transaction_reference:
            return Response(
                {"error": "transaction_reference is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        screenshot_url = str(request.data.get("payment_screenshot_url") or "").strip()
        payer_note = str(request.data.get("payer_note") or "").strip()

        existing_pending = (
            PaymentTransaction.objects.filter(
                user=request.user,
                exam_set=exam_set,
                gateway=MANUAL_QR_GATEWAY,
                status="pending_approval",
            )
            .order_by("-created_at")
            .first()
        )
        if existing_pending:
            return Response(
                {
                    "error": "You already have a pending payment request for this exam set.",
                    "request": _build_payment_request_payload(existing_pending),
                },
                status=status.HTTP_409_CONFLICT,
            )

        txn = PaymentTransaction.objects.create(
            user=request.user,
            exam_set=exam_set,
            gateway=MANUAL_QR_GATEWAY,
            amount=exam_set.fee,
            email=email,
            mobile_number=mobile_number,
            status="pending_approval",
            gateway_reference=transaction_reference,
            payer_note=payer_note,
            payment_screenshot_url=screenshot_url,
            raw_response={"source": "manual_qr"},
        )

        return Response(
            {
                "message": "Payment request submitted. Please wait for admin approval.",
                "request": _build_payment_request_payload(txn),
            },
            status=status.HTTP_201_CREATED,
        )


class ManualPaymentRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = str(request.query_params.get("status") or "").strip().lower()
        queryset = PaymentTransaction.objects.filter(user=request.user, gateway=MANUAL_QR_GATEWAY).select_related(
            "exam_set", "user", "reviewed_by"
        )
        if status_filter and status_filter != "all":
            queryset = queryset.filter(status=status_filter)
        rows = [_build_payment_request_payload(txn) for txn in queryset.order_by("-created_at")]
        return Response(rows)


class ManualPaymentRequestAdminListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        status_filter = str(request.query_params.get("status") or "pending_approval").strip().lower()
        queryset = PaymentTransaction.objects.filter(gateway=MANUAL_QR_GATEWAY).select_related(
            "exam_set", "user", "reviewed_by"
        )
        if status_filter and status_filter != "all":
            queryset = queryset.filter(status=status_filter)
        rows = [_build_payment_request_payload(txn) for txn in queryset.order_by("-created_at")]
        return Response(rows)


class ManualPaymentRequestAdminReviewView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, reference_id):
        txn = (
            PaymentTransaction.objects.filter(reference_id=reference_id, gateway=MANUAL_QR_GATEWAY)
            .select_related("exam_set", "user", "reviewed_by")
            .first()
        )
        if not txn:
            return Response({"error": "Payment request not found"}, status=status.HTTP_404_NOT_FOUND)

        if txn.status in {"approved", "rejected"}:
            return Response(
                {"error": f"Payment request is already {txn.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action = str(request.data.get("action") or "").strip().lower()
        admin_note = str(request.data.get("admin_note") or "").strip()
        gateway_tx_id = str(request.data.get("gateway_transaction_id") or "").strip()

        if action not in {"approve", "reject"}:
            return Response(
                {"error": "action must be either 'approve' or 'reject'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "approve":
            purchase = _mark_request_approved(
                txn,
                reviewer=request.user,
                admin_note=admin_note,
                gateway_tx_id=gateway_tx_id,
            )
            return Response(
                {
                    "message": "Payment approved and exam unlocked.",
                    "purchase_id": purchase.id,
                    "request": _build_payment_request_payload(txn),
                }
            )

        _mark_request_rejected(txn, reviewer=request.user, admin_note=admin_note)
        return Response(
            {
                "message": "Payment request rejected.",
                "request": _build_payment_request_payload(txn),
            }
        )


class PaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reference_id = request.query_params.get("reference_id")
        if not reference_id:
            return Response({"error": "reference_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        txn = (
            PaymentTransaction.objects.filter(reference_id=reference_id, user=request.user)
            .select_related("exam_set", "user", "reviewed_by")
            .first()
        )
        if not txn:
            return Response({"error": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(_build_payment_request_payload(txn))


class VerifyPayment(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.data.get("gateway") == MANUAL_QR_GATEWAY:
            exam_set, error_response = _get_exam_set_for_payment(request.data.get("exam_set_id"))
            if error_response:
                return error_response

            amount = _parse_amount(request.data.get("amount"))
            if amount is None:
                amount = exam_set.fee

            purchase = _create_or_get_purchase(
                PaymentTransaction(
                    user=request.user,
                    exam_set=exam_set,
                    gateway=MANUAL_QR_GATEWAY,
                    amount=amount,
                ),
                gateway_tx_id=str(request.data.get("transaction_id") or ""),
            )
            return Response({"status": "verified", "purchase_id": purchase.id})

        return _legacy_gateway_response()


class EsewaInitiatePayment(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _legacy_gateway_response()


class KhaltiInitiatePayment(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _legacy_gateway_response()


class EsewaCallbackView(APIView):
    permission_classes = []

    def get(self, request):
        return _legacy_gateway_response()


class KhaltiCallbackView(APIView):
    permission_classes = []

    def get(self, request):
        return _legacy_gateway_response()


class EsewaVerify(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _legacy_gateway_response()


class KhaltiVerify(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _legacy_gateway_response()
