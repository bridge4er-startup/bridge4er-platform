from urllib.parse import urlencode

from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import FileMetadata, FileSyncLog, FolderMetadata, PlatformMetrics


def _parent_path(path: str) -> str:
    parts = [segment for segment in str(path or "").split("/") if segment]
    if len(parts) <= 1:
        return ""
    return "/" + "/".join(parts[:-1])


@admin.register(FileMetadata)
class FileMetadataAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "content_type",
        "branch",
        "parent_folder_link",
        "is_visible",
        "file_size",
        "uploaded_at",
    )
    list_filter = ("content_type", "branch", "is_visible")
    search_fields = ("name", "dropbox_path", "branch")
    readonly_fields = ("dropbox_path",)
    actions = ("mark_visible", "mark_hidden")

    @admin.display(description="Parent Folder")
    def parent_folder_link(self, obj):
        parent = _parent_path(getattr(obj, "dropbox_path", ""))
        if not parent:
            return "-"
        url = reverse("admin:storage_foldermetadata_changelist")
        query = urlencode({"dropbox_path__exact": parent})
        return format_html('<a href="{}?{}">{}</a>', url, query, parent)

    @admin.action(description="Show selected files on website")
    def mark_visible(self, request, queryset):
        queryset.update(is_visible=True)

    @admin.action(description="Hide selected files on website")
    def mark_hidden(self, request, queryset):
        queryset.update(is_visible=False)


@admin.register(FolderMetadata)
class FolderMetadataAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "content_type",
        "branch",
        "depth",
        "sort_order",
        "is_visible",
        "dropbox_path",
        "contents_link",
        "modified_at",
    )
    list_filter = ("content_type", "branch", "depth", "is_visible")
    search_fields = ("name", "dropbox_path", "parent_path", "branch")
    list_editable = ("sort_order", "is_visible")
    readonly_fields = ("created_at", "modified_at")
    actions = ("mark_visible", "mark_hidden")
    ordering = ("branch", "content_type", "depth", "sort_order", "name")

    @admin.display(description="Contents")
    def contents_link(self, obj):
        folder_path = str(getattr(obj, "dropbox_path", "") or "").rstrip("/")
        if not folder_path:
            return "-"
        file_url = reverse("admin:storage_filemetadata_changelist")
        subfolder_url = reverse("admin:storage_foldermetadata_changelist")
        files_query = urlencode({"dropbox_path__startswith": f"{folder_path}/"})
        folders_query = urlencode({"parent_path__exact": folder_path})
        return format_html(
            '<a href="{}?{}">Files</a> | <a href="{}?{}">Subfolders</a>',
            file_url,
            files_query,
            subfolder_url,
            folders_query,
        )

    @admin.action(description="Show selected folders on website")
    def mark_visible(self, request, queryset):
        queryset.update(is_visible=True)

    @admin.action(description="Hide selected folders from website")
    def mark_hidden(self, request, queryset):
        queryset.update(is_visible=False)


@admin.register(FileSyncLog)
class FileSyncLogAdmin(admin.ModelAdmin):
    list_display = ("id", "branch", "sync_count", "last_synced")
    search_fields = ("branch",)


@admin.register(PlatformMetrics)
class PlatformMetricsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "enrolled_students",
        "objective_mcqs_available",
        "resource_files_available",
        "exam_sets_available",
        "updated_at",
    )
