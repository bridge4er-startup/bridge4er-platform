from django.test import TestCase, override_settings
from unittest.mock import patch

from storage import dropbox_service
from storage.models import FileMetadata, FolderMetadata
from storage.views import (
    _filter_files_by_visibility,
    _metadata_listing_fallback,
    _prune_metadata_not_in_listing,
    _sort_files_by_admin_order,
    _sync_metadata_from_listing,
    sync_dropbox_content_for_branch,
)


class FolderMetadataSyncTests(TestCase):
    def test_sync_listing_creates_nested_folder_metadata(self):
        branch = "Civil Engineering"
        content_type = "objective_mcq"
        institution_path = "/bridge4ER/Civil Engineering/Objective MCQs/Public Service Commission (PSC)"
        subject_path = f"{institution_path}/Concrete Technology"
        files = [
            {
                "name": "Public Service Commission (PSC)",
                "path": institution_path,
                "is_dir": True,
            },
            {
                "name": "Chapter 1.json",
                "path": f"{subject_path}/Chapter 1.json",
                "is_dir": False,
                "size": 128,
            },
        ]

        _sync_metadata_from_listing(files, content_type=content_type, branch=branch)

        self.assertTrue(FolderMetadata.objects.filter(dropbox_path=institution_path).exists())
        self.assertTrue(FolderMetadata.objects.filter(dropbox_path=subject_path).exists())
        subject_row = FolderMetadata.objects.get(dropbox_path=subject_path)
        self.assertEqual(subject_row.parent_path, institution_path)
        self.assertEqual(subject_row.depth, 2)

    def test_hidden_folder_hides_descendant_files(self):
        branch = "Civil Engineering"
        content_type = "objective_mcq"
        hidden_folder = "/bridge4ER/Civil Engineering/Objective MCQs/PSC Civil Sub-Engineer"
        hidden_file = f"{hidden_folder}/Coming Soon Stay Tuned/Coming Soon.json"

        FolderMetadata.objects.create(
            name="PSC Civil Sub-Engineer",
            dropbox_path=hidden_folder,
            content_type=content_type,
            branch=branch,
            parent_path="/bridge4ER/Civil Engineering/Objective MCQs",
            depth=1,
            sort_order=0,
            is_visible=False,
        )

        entries = [
            {"name": "PSC Civil Sub-Engineer", "path": hidden_folder, "is_dir": True},
            {"name": "Coming Soon.json", "path": hidden_file, "is_dir": False, "size": 100},
        ]
        filtered = _filter_files_by_visibility(
            entries,
            content_type=content_type,
            branch=branch,
            include_hidden=False,
        )
        self.assertEqual(filtered, [])

        filtered_with_hidden = _filter_files_by_visibility(
            entries,
            content_type=content_type,
            branch=branch,
            include_hidden=True,
        )
        self.assertEqual(len(filtered_with_hidden), 2)
        self.assertFalse(filtered_with_hidden[0]["is_visible"])
        self.assertFalse(filtered_with_hidden[1]["is_visible"])

    def test_folder_sort_order_controls_listing_order(self):
        branch = "Civil Engineering"
        content_type = "objective_mcq"
        root = "/bridge4ER/Civil Engineering/Objective MCQs"
        first_path = f"{root}/Nepal Engineering Council (NEC)"
        second_path = f"{root}/Public Service Commission (PSC)"

        FolderMetadata.objects.create(
            name="Nepal Engineering Council (NEC)",
            dropbox_path=first_path,
            content_type=content_type,
            branch=branch,
            parent_path=root,
            depth=1,
            sort_order=2,
            is_visible=True,
        )
        FolderMetadata.objects.create(
            name="Public Service Commission (PSC)",
            dropbox_path=second_path,
            content_type=content_type,
            branch=branch,
            parent_path=root,
            depth=1,
            sort_order=1,
            is_visible=True,
        )

        entries = [
            {"name": "Nepal Engineering Council (NEC)", "path": first_path, "is_dir": True},
            {"name": "Public Service Commission (PSC)", "path": second_path, "is_dir": True},
        ]
        ordered = _sort_files_by_admin_order(entries, content_type=content_type, branch=branch)
        self.assertEqual(ordered[0]["path"], second_path)
        self.assertEqual(ordered[1]["path"], first_path)

    def test_metadata_listing_fallback_uses_saved_file_and_folder_rows(self):
        branch = "Civil Engineering"
        content_type = "subjective"
        root = "/bridge4ER/Civil Engineering/Subjective"
        folder_path = f"{root}/Institute A"
        file_path = f"{folder_path}/Hydraulics.pdf"

        FolderMetadata.objects.create(
            name="Institute A",
            dropbox_path=folder_path,
            content_type=content_type,
            branch=branch,
            parent_path=root,
            depth=1,
            sort_order=1,
            is_visible=True,
        )
        FileMetadata.objects.create(
            name="Hydraulics.pdf",
            dropbox_path=file_path,
            content_type=content_type,
            branch=branch,
            file_size=256,
            is_visible=True,
        )

        with_dirs = _metadata_listing_fallback(content_type=content_type, branch=branch, include_dirs=True)
        without_dirs = _metadata_listing_fallback(content_type=content_type, branch=branch, include_dirs=False)

        self.assertEqual(len(with_dirs), 2)
        self.assertEqual(sum(1 for row in with_dirs if row.get("is_dir")), 1)
        self.assertEqual(sum(1 for row in with_dirs if not row.get("is_dir")), 1)
        self.assertEqual(len(without_dirs), 1)
        self.assertFalse(without_dirs[0]["is_dir"])
        self.assertEqual(without_dirs[0]["path"], file_path)

    def test_prune_metadata_removes_deleted_bucket_entries(self):
        branch = "Civil Engineering"
        content_type = "objective_mcq"
        root = "/bridge4ER/Civil Engineering/Objective MCQs"
        current_folder = f"{root}/NEC"
        current_file = f"{current_folder}/Chapter 1.json"
        stale_file = f"{current_folder}/Deleted.json"

        _sync_metadata_from_listing(
            [
                {"name": "NEC", "path": current_folder, "is_dir": True},
                {"name": "Chapter 1.json", "path": current_file, "is_dir": False, "size": 100},
                {"name": "Deleted.json", "path": stale_file, "is_dir": False, "size": 100},
            ],
            content_type=content_type,
            branch=branch,
        )

        result = _prune_metadata_not_in_listing(
            [
                {"name": "NEC", "path": current_folder, "is_dir": True},
                {"name": "Chapter 1.json", "path": current_file, "is_dir": False, "size": 100},
            ],
            content_type=content_type,
            branch=branch,
        )

        self.assertEqual(result["files_deleted"], 1)
        self.assertTrue(FileMetadata.objects.filter(dropbox_path=current_file).exists())
        self.assertFalse(FileMetadata.objects.filter(dropbox_path=stale_file).exists())


class SupabasePathNormalizationTests(TestCase):
    @override_settings(SUPABASE_STORAGE_ROOT_PREFIX="bridge4er")
    def test_candidate_keys_support_rooted_and_rootless_paths(self):
        keys = dropbox_service._supabase_candidate_keys_from_app_path(
            "/bridge4ER/Civil Engineering/Notice"
        )
        self.assertIn("bridge4er/Civil Engineering/Notice", keys)
        self.assertIn("Civil Engineering/Notice", keys)

    @override_settings(SUPABASE_STORAGE_ROOT_PREFIX="bridge4er")
    def test_app_path_from_key_does_not_duplicate_root_prefix(self):
        rooted = dropbox_service._app_path_from_supabase_key("bridge4er/Civil Engineering/Notice/file.pdf")
        rootless = dropbox_service._app_path_from_supabase_key("Civil Engineering/Notice/file.pdf")

        self.assertEqual(rooted, "/bridge4ER/Civil Engineering/Notice/file.pdf")
        self.assertEqual(rootless, "/bridge4ER/Civil Engineering/Notice/file.pdf")

    @override_settings(
        STORAGE_PROVIDER="supabase",
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-role",
        SUPABASE_STORAGE_BUCKET="bridge4ER",
        SUPABASE_STORAGE_ROOT_PREFIX="bridge4er",
    )
    def test_supabase_listing_falls_back_to_storage_rest_api(self):
        class FakeResponse:
            def __init__(self, payload, status_code=200):
                self._payload = payload
                self.status_code = status_code
                self.content = b"[]"
                self.headers = {}

            def json(self):
                return self._payload

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise RuntimeError(f"status {self.status_code}")

        def fake_post(_url, json=None, **_kwargs):
            prefix = (json or {}).get("prefix")
            payloads = {
                "bridge4er/Civil Engineering/Objective MCQs": [],
                "Civil Engineering/Objective MCQs": [
                    {"name": "Nepal Engineering Council (NEC)", "id": None, "metadata": None},
                ],
                "Civil Engineering/Objective MCQs/Nepal Engineering Council (NEC)": [
                    {
                        "name": "Chapter 1.json",
                        "id": "object-1",
                        "metadata": {"size": 128},
                        "updated_at": "2026-05-18T00:00:00Z",
                    },
                ],
            }
            return FakeResponse(payloads.get(prefix, []))

        with patch("storage.dropbox_service.connection.cursor", side_effect=RuntimeError("no storage schema")), patch(
            "storage.dropbox_service.requests.head",
            return_value=FakeResponse({}, status_code=404),
        ), patch("storage.dropbox_service.requests.post", side_effect=fake_post):
            rows = dropbox_service.list_folder_with_metadata(
                "/bridge4ER/Civil Engineering/Objective MCQs",
                include_dirs=True,
                recursive=True,
            )

        paths = {row["path"] for row in rows}
        self.assertIn("/bridge4ER/Civil Engineering/Objective MCQs/Nepal Engineering Council (NEC)", paths)
        self.assertIn(
            "/bridge4ER/Civil Engineering/Objective MCQs/Nepal Engineering Council (NEC)/Chapter 1.json",
            paths,
        )


class StorageContentSyncTests(TestCase):
    def test_sync_content_preserves_existing_metadata_by_default(self):
        branch = "Civil Engineering"
        content_type = "objective_mcq"
        root = "/bridge4ER/Civil Engineering/Objective MCQs"
        current_file = f"{root}/NEC/Chapter 1.json"
        existing_file = f"{root}/NEC/Admin Edited.json"

        FileMetadata.objects.create(
            name="Admin Edited.json",
            display_name="Admin Edited Display Name",
            dropbox_path=existing_file,
            content_type=content_type,
            branch=branch,
            file_size=100,
            is_visible=True,
        )

        with patch(
            "storage.views.list_folder_with_metadata",
            return_value=[{"name": "Chapter 1.json", "path": current_file, "is_dir": False, "size": 128}],
        ):
            payload = sync_dropbox_content_for_branch(
                branch=branch,
                content_types=[content_type],
                warm_cache=False,
                sync_questions=False,
            )

        self.assertEqual(payload["errors"], [])
        self.assertEqual(payload["synced"][0]["files_deleted"], 0)
        self.assertTrue(FileMetadata.objects.filter(dropbox_path=existing_file).exists())
        self.assertEqual(
            FileMetadata.objects.get(dropbox_path=existing_file).display_name,
            "Admin Edited Display Name",
        )

    def test_sync_content_can_import_question_files(self):
        with patch(
            "storage.views._sync_dropbox_content_type",
            return_value={
                "content_type": "objective_mcq",
                "path": "/bridge4ER/Civil Engineering/Objective MCQs",
                "file_count": 1,
                "folder_count": 1,
                "files_deleted": 0,
                "folders_deleted": 0,
                "cached": True,
                "include_dirs": True,
            },
        ), patch(
            "exams.dropbox_sync.sync_objective_mcqs_from_dropbox",
            return_value={"imported_questions": 3},
        ) as sync_objective:
            payload = sync_dropbox_content_for_branch(
                branch="Civil Engineering",
                content_types=["objective_mcq"],
                warm_cache=True,
                sync_questions=True,
            )

        self.assertEqual(payload["errors"], [])
        self.assertEqual(payload["question_sync"]["objective"]["imported_questions"], 3)
        sync_objective.assert_called_once_with(
            branch="Civil Engineering",
            replace_existing=False,
        )
