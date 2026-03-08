from decimal import Decimal
import os
import shutil
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from .dropbox_sync import _sync_exam_set_type
from .models import ExamPurchase, ExamSet, SubjectiveSubmission

User = get_user_model()
TEST_MEDIA_ROOT = os.path.join(os.getcwd(), "tmp_test_media")


def _update_payload(name):
    return {
        "name": name,
        "description": "Imported from Dropbox",
        "instructions": "Answer all questions",
        "is_free": True,
        "fee": Decimal("0"),
        "duration_seconds": 1800,
        "grace_seconds": 60,
        "negative_marking": Decimal("0.25"),
        "is_active": True,
    }


class DropboxExamSetSyncTests(TestCase):
    def test_sync_deactivates_stale_managed_sets(self):
        branch = "Civil Engineering"
        root = f"/bridge4er/{branch}/Take Exam/Multiple Choice Exam"
        active_path = f"{root}/active_set.json"
        stale_path = f"{root}/stale_set.json"

        active_set = ExamSet.objects.create(
            name="active_set",
            branch=branch,
            exam_type="mcq",
            managed_by_sync=True,
            source_file_path=active_path,
            is_active=True,
        )
        stale_set = ExamSet.objects.create(
            name="stale_set",
            branch=branch,
            exam_type="mcq",
            managed_by_sync=True,
            source_file_path=stale_path,
            is_active=True,
        )

        normalized_row = {
            "order": 1,
            "question_header": "",
            "question_text": "What is 2 + 2?",
            "question_image_url": "",
            "option_a": "4",
            "option_b": "5",
            "option_c": "6",
            "option_d": "7",
            "correct_option": "a",
            "explanation": "Simple math.",
            "marks": 1,
        }

        with patch("exams.dropbox_sync._list_supported_files", return_value=[active_path]), patch(
            "exams.dropbox_sync.parse_rows_from_path", return_value=[{}]
        ), patch("exams.dropbox_sync.extract_exam_rows_and_metadata", return_value=([{}], {}, [])), patch(
            "exams.dropbox_sync._normalize_exam_question_payload",
            side_effect=lambda _raw, _exam_type: dict(normalized_row),
        ), patch("exams.dropbox_sync._is_valid_exam_row", return_value=True), patch(
            "exams.dropbox_sync._import_exam_set_with_resource",
            return_value={"new": 0, "updated": 1, "imported": 1, "skipped": 0, "error_rows": 0},
        ), patch(
            "exams.dropbox_sync.build_exam_set_update_payload",
            side_effect=lambda **kwargs: _update_payload(kwargs["fallback_name"]),
        ):
            result = _sync_exam_set_type(branch, "mcq", root, replace_existing=True)

        self.assertEqual(result["sets_deactivated"], 1)
        active_set.refresh_from_db()
        stale_set.refresh_from_db()
        self.assertTrue(active_set.is_active)
        self.assertFalse(stale_set.is_active)

    def test_sync_does_not_prune_when_errors_exist(self):
        branch = "Civil Engineering"
        root = f"/bridge4er/{branch}/Take Exam/Multiple Choice Exam"
        file_path = f"{root}/active_set.json"

        exam_set = ExamSet.objects.create(
            name="active_set",
            branch=branch,
            exam_type="mcq",
            managed_by_sync=True,
            source_file_path=file_path,
            is_active=True,
        )

        with patch("exams.dropbox_sync._list_supported_files", return_value=[file_path]), patch(
            "exams.dropbox_sync.parse_rows_from_path",
            side_effect=RuntimeError("network error"),
        ):
            result = _sync_exam_set_type(branch, "mcq", root, replace_existing=True)

        self.assertEqual(result["error_files"], 1)
        self.assertEqual(result.get("prune_skipped"), "sync_errors")
        exam_set.refresh_from_db()
        self.assertTrue(exam_set.is_active)

    def test_sync_keeps_manual_sets_active(self):
        branch = "Civil Engineering"
        root = f"/bridge4er/{branch}/Take Exam/Multiple Choice Exam"

        managed = ExamSet.objects.create(
            name="managed_set",
            branch=branch,
            exam_type="mcq",
            managed_by_sync=True,
            is_active=True,
        )
        manual = ExamSet.objects.create(
            name="manual_set",
            branch=branch,
            exam_type="mcq",
            managed_by_sync=False,
            is_active=True,
        )

        with patch("exams.dropbox_sync._list_supported_files", return_value=[]):
            result = _sync_exam_set_type(branch, "mcq", root, replace_existing=True)

        self.assertEqual(result["sets_deactivated"], 1)
        managed.refresh_from_db()
        manual.refresh_from_db()
        self.assertFalse(managed.is_active)
        self.assertTrue(manual.is_active)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class SubjectiveSubmissionProfileValidationTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="subjective-user",
            password="secret123",
            email="student@example.com",
            mobile_number="9812345678",
            full_name="Subjective Student",
        )
        self.client.force_authenticate(user=self.user)

        self.exam_set = ExamSet.objects.create(
            name="Paid Subjective Set",
            branch="Civil Engineering",
            exam_type="subjective",
            is_free=False,
            fee=Decimal("200.00"),
            is_active=True,
            managed_by_sync=False,
        )
        ExamPurchase.objects.create(
            user=self.user,
            exam_set=self.exam_set,
            exam_type="subjective",
            set_name=self.exam_set.name,
            payment_gateway="manual",
            transaction_id="demo-txn",
            amount=self.exam_set.fee,
        )

    def _pdf_file(self):
        return SimpleUploadedFile("answers.pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", content_type="application/pdf")

    def test_submission_rejects_when_contact_does_not_match_profile(self):
        response = self.client.post(
            "/api/exams/subjective/submissions/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "other@example.com",
                "mobile_number": "9812345678",
                "file": self._pdf_file(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must match your profile", response.data.get("error", ""))
        self.assertEqual(SubjectiveSubmission.objects.count(), 0)

    def test_submission_accepts_matching_profile_contact(self):
        response = self.client.post(
            "/api/exams/subjective/submissions/",
            {
                "exam_set_id": self.exam_set.id,
                "email": "STUDENT@example.com",
                "mobile_number": "+977-9812345678",
                "file": self._pdf_file(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SubjectiveSubmission.objects.count(), 1)
        submission = SubjectiveSubmission.objects.first()
        self.assertEqual(submission.email, "student@example.com")
        self.assertEqual(submission.mobile_number, "9812345678")
