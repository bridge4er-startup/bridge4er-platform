import uuid

from django.conf import settings
from django.db import models

from exams.models import ExamSet


class PaymentTransaction(models.Model):
    GATEWAY_CHOICES = [
        ("esewa", "eSewa"),
        ("khalti", "Khalti"),
    ]
    STATUS_CHOICES = [
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
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="initiated")
    gateway_reference = models.CharField(max_length=255, blank=True)  # pidx, transaction_uuid, etc.
    gateway_transaction_id = models.CharField(max_length=255, blank=True)
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
        ]

    def __str__(self):
        return f"{self.gateway} | {self.reference_id} | {self.status}"
