import uuid

from django.conf import settings
from django.db import models

from exams.models import ExamSet


class QRPaymentConfiguration(models.Model):
    title = models.CharField(max_length=160, default="Bridge4ER Official Payment QR")
    account_name = models.CharField(max_length=200, blank=True)
    account_number = models.CharField(max_length=120, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    qr_image_url = models.URLField(max_length=1000, blank=True)
    instructions = models.TextField(
        blank=True,
        default=(
            "Scan this QR code using your wallet app, complete payment, "
            "then submit your transaction reference for admin approval."
        ),
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_qr_payment_configs",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_qr_payment_configs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return self.title


class PaymentTransaction(models.Model):
    GATEWAY_CHOICES = [
        ("manual_qr", "Manual QR"),
        ("esewa", "eSewa"),
        ("khalti", "Khalti"),
    ]
    STATUS_CHOICES = [
        ("pending_approval", "Pending Approval"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("initiated", "Initiated"),
        ("success", "Success"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
        ("expired", "Expired"),
    ]

    reference_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_transactions")
    exam_set = models.ForeignKey(ExamSet, on_delete=models.CASCADE, related_name="payment_transactions")
    gateway = models.CharField(max_length=20, choices=GATEWAY_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    email = models.EmailField(blank=True)
    mobile_number = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending_approval")
    gateway_reference = models.CharField(max_length=255, blank=True)  # transaction id / UTR / pidx
    gateway_transaction_id = models.CharField(max_length=255, blank=True)
    payer_note = models.TextField(blank=True)
    payment_screenshot_url = models.URLField(max_length=1000, blank=True)
    admin_note = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="reviewed_payment_transactions",
        null=True,
        blank=True,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    raw_response = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["gateway", "status"]),
            models.Index(fields=["gateway_reference"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        return f"{self.gateway} | {self.reference_id} | {self.status}"
