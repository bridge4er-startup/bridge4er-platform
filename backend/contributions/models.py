from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


CONTRIBUTION_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
]

CONTRIBUTION_CATEGORY_CHOICES = [
    ("PSC", "PSC"),
    ("NEC", "NEC"),
    ("MSC", "MSC"),
    ("GK/IQ", "GK/IQ"),
    ("NTC", "NTC"),
    ("NEA", "NEA"),
    ("Other", "Other"),
]


class ContributionCategory(models.Model):
    name = models.CharField(max_length=50)
    branch = models.CharField(max_length=200, default="Civil Engineering")
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                Lower("branch"),
                name="unique_contribution_category_name_branch_ci",
            ),
        ]

    def __str__(self):
        return self.name


class Contribution(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contributions",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    file = models.FileField(upload_to="contributions/%Y/%m/%d/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    category = models.CharField(max_length=50, blank=True, default="")
    status = models.CharField(max_length=20, choices=CONTRIBUTION_STATUS_CHOICES, default="pending")
    branch = models.CharField(max_length=200, default="Civil Engineering")
    admin_note = models.TextField(blank=True, default="")
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.title} ({self.user})"

    def save(self, *args, **kwargs):
        if not self.file_name and self.file:
            self.file_name = str(self.file.name).split("/")[-1]
        super().save(*args, **kwargs)


class ContributionComment(models.Model):
    contribution = models.ForeignKey(
        Contribution,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contribution_comments",
    )
    text = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        unique_together = ("contribution", "user")

    def __str__(self):
        return f"{self.user} -> {self.contribution_id}"


class ContributionLike(models.Model):
    contribution = models.ForeignKey(
        Contribution,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contribution_likes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("contribution", "user")

    def __str__(self):
        return f"{self.user} liked {self.contribution_id}"

class ContributionUnlock(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contribution_unlocks",
    )
    exam_set = models.ForeignKey("exams.ExamSet", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("user", "exam_set")
