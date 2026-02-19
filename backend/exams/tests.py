from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from .dropbox_sync import _sync_exam_set_type
from .models import ExamSet


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
