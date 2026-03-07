from django.contrib.auth.models import AbstractUser
from django.db import models


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
