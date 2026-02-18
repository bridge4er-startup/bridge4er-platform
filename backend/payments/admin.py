from django.contrib import admin

from .models import PaymentTransaction


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
    readonly_fields = ("reference_id", "created_at", "updated_at", "verified_at")
