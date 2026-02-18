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


class MobileOTP(models.Model):
    PURPOSE_CHOICES = [
        ("register", "Register"),
        ("login", "Login"),
    ]

    mobile_number = models.CharField(max_length=20)
    otp_code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default="register")
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["mobile_number", "purpose"]),
            models.Index(fields=["expires_at"]),
        ]
        ordering = ["-created_at"]

    def mark_used(self):
        self.is_used = True
        self.verified_at = timezone.now()
        self.save(update_fields=["is_used", "verified_at"])

    def is_expired(self):
        return timezone.now() > self.expires_at
