from django.contrib import admin
from django.utils import timezone

from exams.models import ExamPurchase

from .models import PaymentTransaction, QRPaymentConfiguration


@admin.register(QRPaymentConfiguration)
class QRPaymentConfigurationAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "account_name",
        "account_number",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_active", "updated_at")
    search_fields = ("title", "account_name", "account_number", "contact_email", "contact_phone")
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
        if obj.is_active:
            QRPaymentConfiguration.objects.exclude(id=obj.id).update(is_active=False)


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "reference_id",
        "user",
        "exam_set",
        "gateway",
        "amount",
        "status",
        "gateway_reference",
        "gateway_transaction_id",
        "reviewed_by",
        "reviewed_at",
        "created_at",
    )
    list_filter = ("gateway", "status", "created_at")
    search_fields = (
        "reference_id",
        "user__username",
        "user__email",
        "gateway_reference",
        "gateway_transaction_id",
    )
    readonly_fields = (
        "reference_id",
        "created_at",
        "updated_at",
        "verified_at",
        "approved_at",
        "reviewed_at",
    )
    actions = ("approve_selected_requests", "reject_selected_requests")

    @admin.action(description="Approve selected manual QR requests")
    def approve_selected_requests(self, request, queryset):
        reviewed_count = 0
        for txn in queryset.filter(gateway="manual_qr").exclude(status__in=["approved", "rejected"]):
            txn.status = "approved"
            txn.reviewed_by = request.user
            txn.reviewed_at = timezone.now()
            txn.approved_at = timezone.now()
            txn.verified_at = timezone.now()
            txn.error_message = ""
            txn.save(
                update_fields=[
                    "status",
                    "reviewed_by",
                    "reviewed_at",
                    "approved_at",
                    "verified_at",
                    "error_message",
                    "updated_at",
                ]
            )
            ExamPurchase.objects.get_or_create(
                user=txn.user,
                exam_set=txn.exam_set,
                defaults={
                    "exam_type": txn.exam_set.exam_type,
                    "set_name": txn.exam_set.name,
                    "payment_gateway": txn.gateway,
                    "transaction_id": txn.gateway_transaction_id or txn.gateway_reference,
                    "amount": txn.amount,
                },
            )
            reviewed_count += 1
        self.message_user(request, f"Approved {reviewed_count} request(s).")

    @admin.action(description="Reject selected manual QR requests")
    def reject_selected_requests(self, request, queryset):
        reviewed_count = 0
        for txn in queryset.filter(gateway="manual_qr").exclude(status__in=["approved", "rejected"]):
            txn.status = "rejected"
            txn.reviewed_by = request.user
            txn.reviewed_at = timezone.now()
            txn.error_message = "Rejected by admin"
            txn.save(
                update_fields=[
                    "status",
                    "reviewed_by",
                    "reviewed_at",
                    "error_message",
                    "updated_at",
                ]
            )
            reviewed_count += 1
        self.message_user(request, f"Rejected {reviewed_count} request(s).")
