from django.contrib import admin

from .models import FileMetadata, FileSyncLog, PlatformMetrics


@admin.register(FileMetadata)
class FileMetadataAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "content_type", "branch", "file_size", "uploaded_at")
    list_filter = ("content_type", "branch")
    search_fields = ("name", "dropbox_path", "branch")


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
