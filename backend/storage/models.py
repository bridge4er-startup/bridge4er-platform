from django.db import models


CONTENT_TYPE_CHOICES = [
    ("notice", "Notice"),
    ("syllabus", "Syllabus"),
    ("old_question", "Old Question"),
    ("subjective", "Subjective"),
    ("objective_mcq", "Objective MCQ"),
    ("take_exam_mcq", "Take Exam MCQ"),
    ("take_exam_subjective", "Take Exam Subjective"),
]


class FileMetadata(models.Model):
    name = models.CharField(max_length=500)
    dropbox_path = models.CharField(max_length=1000, unique=True)
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPE_CHOICES)
    branch = models.CharField(max_length=200)
    file_size = models.BigIntegerField()  # in bytes
    is_visible = models.BooleanField(default=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"{self.name} ({self.content_type})"


class FolderMetadata(models.Model):
    name = models.CharField(max_length=500)
    dropbox_path = models.CharField(max_length=1000, unique=True, db_index=True)
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPE_CHOICES)
    branch = models.CharField(max_length=200)
    parent_path = models.CharField(max_length=1000, blank=True, default="", db_index=True)
    depth = models.PositiveIntegerField(default=0)
    sort_order = models.IntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["branch", "content_type", "depth", "sort_order", "name"]
        indexes = [
            models.Index(fields=["branch", "content_type", "is_visible"]),
            models.Index(fields=["branch", "content_type", "parent_path", "sort_order"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.content_type})"


class FileSyncLog(models.Model):
    branch = models.CharField(max_length=200)
    last_synced = models.DateTimeField(auto_now=True)
    sync_count = models.IntegerField(default=0)
    
    class Meta:
        unique_together = ('branch',)


class PlatformMetrics(models.Model):
    """Admin-overridable homepage counters."""

    enrolled_students = models.PositiveIntegerField(null=True, blank=True)
    objective_mcqs_available = models.PositiveIntegerField(null=True, blank=True)
    resource_files_available = models.PositiveIntegerField(null=True, blank=True)
    exam_sets_available = models.PositiveIntegerField(null=True, blank=True)
    motivational_quote = models.TextField(blank=True, default="")
    motivational_image_url = models.CharField(max_length=1000, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Platform Metrics ({self.id})"
