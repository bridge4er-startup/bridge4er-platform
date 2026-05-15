from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from exams.models import ExamPurchase, ExamSet

from .models import PaymentTransaction

User = get_user_model()


class ManualQrPaymentFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_client = APIClient()

        self.user = User.objects.create_user(
            username="student-user",
            password="secret123",
            email="student@example.com",
            mobile_number="9812345678",
            full_name="Student User",
        )
        self.admin = User.objects.create_user(
            username="admin-user",
            password="secret123",
            email="admin@example.com",
            mobile_number="9800000000",
            full_name="Admin User",
            is_staff=True,
            is_superuser=True,
        )

        self.exam_set = ExamSet.objects.create(
            name="Premium MCQ Set",
            branch="Civil Engineering",
            exam_type="mcq",
            is_free=False,
            fee=Decimal("250.00"),
            is_active=True,
            managed_by_sync=False,
        )

        self.client.force_authenticate(user=self.user)
        self.admin_client.force_authenticate(user=self.admin)

    def test_manual_request_rejects_when_contact_does_not_match_profile(self):
        response = self.client.post(
            "/api/payments/requests/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "other@example.com",
                "mobile_number": "9812345678",
                "transaction_reference": "TXN-001",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must match your profile", response.data.get("error", ""))
        self.assertEqual(PaymentTransaction.objects.count(), 0)

    def test_manual_request_and_admin_approval_unlocks_exam_set(self):
        create_response = self.client.post(
            "/api/payments/requests/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "STUDENT@example.com",
                "mobile_number": "+977-9812345678",
                "transaction_reference": "TXN-2026-001",
                "payer_note": "Paid from eBanking app",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        txn = PaymentTransaction.objects.get()
        self.assertEqual(txn.gateway, "manual_qr")
        self.assertEqual(txn.status, "pending_approval")
        self.assertEqual(txn.email, "student@example.com")
        self.assertEqual(txn.mobile_number, "9812345678")

        review_response = self.admin_client.post(
            f"/api/payments/requests/{txn.reference_id}/review/",
            {
                "action": "approve",
                "admin_note": "Confirmed in bank statement",
                "gateway_transaction_id": "BANK-REF-1",
            },
            format="json",
        )
        self.assertEqual(review_response.status_code, status.HTTP_200_OK)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "approved")
        self.assertEqual(txn.reviewed_by_id, self.admin.id)
        self.assertTrue(ExamPurchase.objects.filter(user=self.user, exam_set=self.exam_set).exists())

    def test_legacy_gateway_init_endpoints_return_gone(self):
        response = self.client.post(
            "/api/payments/esewa/initiate/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "student@example.com",
                "mobile_number": "9812345678",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_410_GONE)
        self.assertIn("disabled", str(response.data.get("error", "")).lower())
