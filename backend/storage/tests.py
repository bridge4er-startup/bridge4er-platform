from django.test import TestCase

from storage.models import FolderMetadata
from storage.views import (
    _filter_files_by_visibility,
    _sort_files_by_admin_order,
    _sync_metadata_from_listing,
)


class FolderMetadataSyncTests(TestCase):
    def test_sync_listing_creates_nested_folder_metadata(self):
        branch = "Civil Engineering"
        content_type = "objective_mcq"
        institution_path = "/bridge4er/Civil Engineering/Objective MCQs/Public Service Commission (PSC)"
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
        hidden_folder = "/bridge4er/Civil Engineering/Objective MCQs/PSC Civil Sub-Engineer"
        hidden_file = f"{hidden_folder}/Coming Soon Stay Tuned/Coming Soon.json"

        FolderMetadata.objects.create(
            name="PSC Civil Sub-Engineer",
            dropbox_path=hidden_folder,
            content_type=content_type,
            branch=branch,
            parent_path="/bridge4er/Civil Engineering/Objective MCQs",
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
        root = "/bridge4er/Civil Engineering/Objective MCQs"
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
