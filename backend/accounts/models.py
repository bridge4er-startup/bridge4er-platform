from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


FIELD_OF_STUDY_CHOICES = [
    ("Civil Engineering", "Civil Engineering"),
    ("Mechanical Engineering", "Mechanical Engineering"),
    ("Electrical Engineering", "Electrical Engineering"),
    ("Electronics Engineering", "Electronics Engineering"),
    ("Computer Engineering", "Computer Engineering"),
]


class User(AbstractUser):
    is_student = models.BooleanField(default=True)
    full_name = models.CharField(max_length=200, blank=True, default="")
    mobile_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    field_of_study = models.CharField(
        max_length=80,
        choices=FIELD_OF_STUDY_CHOICES,
        default="Civil Engineering",
    )
    is_mobile_verified = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.full_name:
            composed = f"{self.first_name} {self.last_name}".strip()
            self.full_name = composed
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        return self.full_name or self.username


def normalize_referral_name(value):
    return " ".join(str(value or "").strip().lower().split())


def normalize_referral_mobile(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if digits.startswith("977") and len(digits) > 10:
        return digits[-10:]
    return digits


class ReferralInvite(models.Model):
    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referrals_sent",
    )
    friend_name = models.CharField(max_length=200)
    friend_mobile = models.CharField(max_length=20)
    friend_name_normalized = models.CharField(max_length=200, db_index=True)
    friend_mobile_normalized = models.CharField(max_length=20, db_index=True)
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="referrals_received",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pending"),
            ("matched", "Matched"),
        ],
        default="pending",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    matched_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("referrer", "friend_mobile_normalized")
        indexes = [
            models.Index(fields=["friend_mobile_normalized"]),
            models.Index(fields=["friend_name_normalized"]),
        ]

    def save(self, *args, **kwargs):
        self.friend_name_normalized = normalize_referral_name(self.friend_name)
        self.friend_mobile_normalized = normalize_referral_mobile(self.friend_mobile)
        super().save(*args, **kwargs)

    def mark_matched(self, referred_user):
        self.referred_user = referred_user
        self.status = "matched"
        self.matched_at = timezone.now()
        self.save(update_fields=["referred_user", "status", "matched_at"])

    def __str__(self):
        return f"{self.referrer_id} -> {self.friend_name} ({self.friend_mobile})"


class ReferralUnlock(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_unlocks",
    )
    exam_set = models.ForeignKey("exams.ExamSet", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("user", "exam_set")

    def __str__(self):
        return f"{self.user_id} unlock {self.exam_set_id}"
