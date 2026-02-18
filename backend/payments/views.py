from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from exams.models import ExamPurchase, ExamSet

from .gateways import (
    GatewayError,
    build_frontend_result_url,
    check_esewa_status,
    create_esewa_form_payload,
    decode_esewa_callback_data,
    esewa_form_url,
    khalti_initiate,
    khalti_lookup,
    verify_esewa_callback_signature,
)
from .models import PaymentTransaction


SUCCESS_STATUSES = {"completed", "complete", "success", "succeeded"}


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


def _build_callback_url(path, reference_id):
    backend_base = (settings.BACKEND_PUBLIC_URL or "").rstrip("/")
    if not backend_base:
        raise GatewayError("BACKEND_PUBLIC_URL is not configured.")
    return f"{backend_base}{path}?ref={reference_id}"


def _mark_transaction_failed(transaction_obj, message, raw_payload=None, status_override="failed"):
    transaction_obj.status = status_override
    transaction_obj.error_message = str(message or "")[:2000]
    if raw_payload is not None:
        transaction_obj.raw_response = raw_payload
    transaction_obj.save(update_fields=["status", "error_message", "raw_response", "updated_at"])


def _mark_transaction_success(transaction_obj, gateway_transaction_id="", raw_payload=None):
    with transaction.atomic():
        transaction_obj.status = "success"
        transaction_obj.error_message = ""
        transaction_obj.gateway_transaction_id = gateway_transaction_id or transaction_obj.gateway_transaction_id
        transaction_obj.verified_at = timezone.now()
        if raw_payload is not None:
            transaction_obj.raw_response = raw_payload
        transaction_obj.save(
            update_fields=[
                "status",
                "error_message",
                "gateway_transaction_id",
                "verified_at",
                "raw_response",
                "updated_at",
            ]
        )
        return _create_or_get_purchase(transaction_obj, transaction_obj.gateway_transaction_id)


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


def _validate_payment_profile(email, mobile_number):
    email = (email or "").strip()
    mobile_number = (mobile_number or "").strip()
    if not email or not mobile_number:
        return None, None, Response(
            {"error": "email and mobile_number are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return email, mobile_number, None


class EsewaInitiatePayment(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        exam_set, error_response = _get_exam_set_for_payment(request.data.get("exam_set_id"))
        if error_response:
            return error_response

        email, mobile_number, error_response = _validate_payment_profile(
            request.data.get("email"),
            request.data.get("mobile_number") or request.data.get("mobile"),
        )
        if error_response:
            return error_response

        txn = PaymentTransaction.objects.create(
            user=request.user,
            exam_set=exam_set,
            gateway="esewa",
            amount=exam_set.fee,
            email=email,
            mobile_number=mobile_number,
            status="initiated",
        )

        try:
            success_url = _build_callback_url("/api/payments/esewa/callback/", txn.reference_id)
            failure_url = build_frontend_result_url(
                "failed",
                "esewa",
                txn.reference_id,
                exam_set_id=exam_set.id,
                message="Payment was cancelled or failed.",
            )
            form_fields = create_esewa_form_payload(
                reference_id=txn.reference_id,
                total_amount=txn.amount,
                success_url=success_url,
                failure_url=failure_url,
            )
        except GatewayError as exc:
            _mark_transaction_failed(txn, str(exc))
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        txn.gateway_reference = str(txn.reference_id)
        txn.raw_response = {"request": form_fields}
        txn.save(update_fields=["gateway_reference", "raw_response", "updated_at"])

        return Response(
            {
                "gateway": "esewa",
                "reference_id": str(txn.reference_id),
                "payment_url": esewa_form_url(),
                "method": "POST",
                "form_fields": form_fields,
            }
        )


class KhaltiInitiatePayment(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        exam_set, error_response = _get_exam_set_for_payment(request.data.get("exam_set_id"))
        if error_response:
            return error_response

        email, mobile_number, error_response = _validate_payment_profile(
            request.data.get("email"),
            request.data.get("mobile_number") or request.data.get("mobile"),
        )
        if error_response:
            return error_response

        txn = PaymentTransaction.objects.create(
            user=request.user,
            exam_set=exam_set,
            gateway="khalti",
            amount=exam_set.fee,
            email=email,
            mobile_number=mobile_number,
            status="initiated",
        )

        try:
            return_url = _build_callback_url("/api/payments/khalti/callback/", txn.reference_id)
            payload = khalti_initiate(
                amount_npr=txn.amount,
                reference_id=txn.reference_id,
                return_url=return_url,
                website_url=settings.FRONTEND_PUBLIC_URL,
                purchase_name=exam_set.name,
                email=email,
                mobile_number=mobile_number,
                full_name=getattr(request.user, "full_name", "") or request.user.username,
            )
        except GatewayError as exc:
            _mark_transaction_failed(txn, str(exc))
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        txn.gateway_reference = str(payload.get("pidx", ""))
        txn.raw_response = payload
        txn.save(update_fields=["gateway_reference", "raw_response", "updated_at"])

        return Response(
            {
                "gateway": "khalti",
                "reference_id": str(txn.reference_id),
                "gateway_reference": txn.gateway_reference,
                "payment_url": payload.get("payment_url", ""),
                "method": "GET",
            }
        )


class EsewaCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        reference_id = request.query_params.get("ref")
        encoded_data = request.query_params.get("data")

        if not reference_id:
            return Response({"error": "Missing reference id"}, status=status.HTTP_400_BAD_REQUEST)

        txn = PaymentTransaction.objects.filter(reference_id=reference_id, gateway="esewa").first()
        if not txn:
            return Response({"error": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)

        if txn.status == "success":
            target = build_frontend_result_url("success", "esewa", txn.reference_id, txn.exam_set_id)
            return redirect(target)

        if not encoded_data:
            _mark_transaction_failed(txn, "Missing callback payload")
            target = build_frontend_result_url(
                "failed",
                "esewa",
                txn.reference_id,
                txn.exam_set_id,
                message="Missing callback payload",
            )
            return redirect(target)

        try:
            callback_payload = decode_esewa_callback_data(encoded_data)
            verify_esewa_callback_signature(callback_payload)
            status_payload = check_esewa_status(txn.reference_id, txn.amount)
        except GatewayError as exc:
            _mark_transaction_failed(txn, str(exc), raw_payload={"callback": encoded_data})
            target = build_frontend_result_url(
                "failed",
                "esewa",
                txn.reference_id,
                txn.exam_set_id,
                message=str(exc),
            )
            return redirect(target)

        transaction_status = str(status_payload.get("status", "")).lower()
        if transaction_status in SUCCESS_STATUSES:
            gateway_tx = str(
                status_payload.get("transaction_code")
                or callback_payload.get("transaction_code")
                or ""
            )
            _mark_transaction_success(
                txn,
                gateway_transaction_id=gateway_tx,
                raw_payload={"callback": callback_payload, "status": status_payload},
            )
            target = build_frontend_result_url("success", "esewa", txn.reference_id, txn.exam_set_id)
            return redirect(target)

        _mark_transaction_failed(
            txn,
            f"eSewa payment status: {status_payload.get('status', 'unknown')}",
            raw_payload={"callback": callback_payload, "status": status_payload},
        )
        target = build_frontend_result_url(
            "failed",
            "esewa",
            txn.reference_id,
            txn.exam_set_id,
            message=f"eSewa status: {status_payload.get('status', 'unknown')}",
        )
        return redirect(target)


class KhaltiCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        reference_id = request.query_params.get("ref")
        pidx = request.query_params.get("pidx")

        if not reference_id:
            return Response({"error": "Missing reference id"}, status=status.HTTP_400_BAD_REQUEST)

        txn = PaymentTransaction.objects.filter(reference_id=reference_id, gateway="khalti").first()
        if not txn:
            return Response({"error": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)

        if txn.status == "success":
            target = build_frontend_result_url("success", "khalti", txn.reference_id, txn.exam_set_id)
            return redirect(target)

        if not pidx:
            _mark_transaction_failed(txn, "Missing pidx in callback")
            target = build_frontend_result_url(
                "failed",
                "khalti",
                txn.reference_id,
                txn.exam_set_id,
                message="Missing pidx in callback",
            )
            return redirect(target)

        try:
            lookup_payload = khalti_lookup(pidx)
        except GatewayError as exc:
            _mark_transaction_failed(txn, str(exc), raw_payload={"pidx": pidx})
            target = build_frontend_result_url(
                "failed",
                "khalti",
                txn.reference_id,
                txn.exam_set_id,
                message=str(exc),
            )
            return redirect(target)

        lookup_status = str(lookup_payload.get("status", "")).lower()
        lookup_amount_paisa = lookup_payload.get("total_amount") or lookup_payload.get("amount")
        expected_amount_paisa = int((txn.amount * Decimal("100")).quantize(Decimal("1")))

        if lookup_status in SUCCESS_STATUSES and int(lookup_amount_paisa or 0) >= expected_amount_paisa:
            gateway_tx = str(
                lookup_payload.get("transaction_id")
                or request.query_params.get("transaction_id")
                or request.query_params.get("tidx")
                or ""
            )
            txn.gateway_reference = str(pidx)
            txn.save(update_fields=["gateway_reference", "updated_at"])
            _mark_transaction_success(
                txn,
                gateway_transaction_id=gateway_tx,
                raw_payload={"callback": dict(request.query_params), "lookup": lookup_payload},
            )
            target = build_frontend_result_url("success", "khalti", txn.reference_id, txn.exam_set_id)
            return redirect(target)

        _mark_transaction_failed(
            txn,
            f"Khalti payment status: {lookup_payload.get('status', 'unknown')}",
            raw_payload={"callback": dict(request.query_params), "lookup": lookup_payload},
        )
        target = build_frontend_result_url(
            "failed",
            "khalti",
            txn.reference_id,
            txn.exam_set_id,
            message=f"Khalti status: {lookup_payload.get('status', 'unknown')}",
        )
        return redirect(target)


class PaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reference_id = request.query_params.get("reference_id")
        if not reference_id:
            return Response({"error": "reference_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        txn = PaymentTransaction.objects.filter(reference_id=reference_id, user=request.user).first()
        if not txn:
            return Response({"error": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "reference_id": str(txn.reference_id),
                "gateway": txn.gateway,
                "status": txn.status,
                "exam_set_id": txn.exam_set_id,
                "amount": str(txn.amount),
                "verified_at": txn.verified_at,
                "error_message": txn.error_message,
            }
        )


class VerifyPayment(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if settings.ALLOW_INSECURE_PAYMENT_VERIFICATION:
            exam_set_id = request.data.get("exam_set_id")
            amount = _parse_amount(request.data.get("amount"))
            if not exam_set_id or amount is None:
                return Response({"error": "exam_set_id and valid amount are required"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                exam_set = ExamSet.objects.get(id=exam_set_id, is_active=True)
            except ExamSet.DoesNotExist:
                return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)
            if amount < exam_set.fee:
                return Response({"error": "Amount is less than required fee."}, status=status.HTTP_400_BAD_REQUEST)

            purchase = _create_or_get_purchase(
                PaymentTransaction(
                    user=request.user,
                    exam_set=exam_set,
                    gateway=(request.data.get("gateway") or "manual").lower(),
                    amount=amount,
                ),
                gateway_tx_id=str(request.data.get("transaction_id") or "manual"),
            )
            return Response({"status": "verified", "purchase_id": purchase.id})

        return Response(
            {
                "error": "Manual verification disabled. Use /payments/esewa/initiate/ or /payments/khalti/initiate/."
            },
            status=status.HTTP_410_GONE,
        )


class EsewaVerify(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(
            {"error": "Deprecated endpoint. Use /payments/esewa/initiate/."},
            status=status.HTTP_410_GONE,
        )


class KhaltiVerify(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(
            {"error": "Deprecated endpoint. Use /payments/khalti/initiate/."},
            status=status.HTTP_410_GONE,
        )
