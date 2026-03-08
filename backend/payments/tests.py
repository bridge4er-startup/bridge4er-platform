from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from exams.models import ExamSet

from .models import PaymentTransaction

User = get_user_model()


@override_settings(
    BACKEND_PUBLIC_URL="https://api.example.com",
    FRONTEND_PUBLIC_URL="https://app.example.com",
    PAYMENT_RESULT_PATH="/payment/result",
)
class PaymentProfileValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="payment-user",
            password="secret123",
            email="student@example.com",
            mobile_number="9812345678",
            full_name="Payment Student",
        )
        self.client.force_authenticate(user=self.user)
        self.exam_set = ExamSet.objects.create(
            name="Paid MCQ Set",
            branch="Civil Engineering",
            exam_type="mcq",
            is_free=False,
            fee=Decimal("150.00"),
            is_active=True,
            managed_by_sync=False,
        )

    def test_esewa_initiate_rejects_when_contact_does_not_match_profile(self):
        response = self.client.post(
            "/api/payments/esewa/initiate/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "other@example.com",
                "mobile_number": "9812345678",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must match your profile", response.data.get("error", ""))
        self.assertEqual(PaymentTransaction.objects.count(), 0)

    @patch("payments.views.esewa_form_url", return_value="https://gateway.example.com/pay")
    @patch(
        "payments.views.create_esewa_form_payload",
        return_value={"transaction_uuid": "demo", "total_amount": "150.00"},
    )
    def test_esewa_initiate_accepts_profile_contact_values(
        self,
        _mock_create_payload,
        _mock_esewa_form_url,
    ):
        response = self.client.post(
            "/api/payments/esewa/initiate/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "STUDENT@example.com",
                "mobile_number": "+977-9812345678",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(PaymentTransaction.objects.count(), 1)
        txn = PaymentTransaction.objects.first()
        self.assertEqual(txn.email, "student@example.com")
        self.assertEqual(txn.mobile_number, "9812345678")
