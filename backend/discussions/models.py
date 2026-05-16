from django.conf import settings
from django.db import models
from django.utils.text import slugify


def _clean_branch(value):
    cleaned = str(value or "").strip()
    return cleaned or "Civil Engineering"


class EngineeringClassroom(models.Model):
    branch = models.CharField(max_length=200, db_index=True)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, db_index=True)
    description = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_classrooms",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("branch", "slug")
        ordering = ["branch", "name", "id"]

    def save(self, *args, **kwargs):
        self.branch = _clean_branch(self.branch)
        self.name = str(self.name or "").strip()
        if not self.slug:
            self.slug = slugify(self.name)[:140]
        self.slug = str(self.slug or "").strip()[:140]
        if not self.slug:
            self.slug = "classroom"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.branch} | {self.name}"


class ClassroomMessage(models.Model):
    classroom = models.ForeignKey(
        EngineeringClassroom,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="classroom_messages",
    )
    text = models.TextField(max_length=1000)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.text = str(self.text or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.classroom_id} | {self.sender_id} | {self.id}"

