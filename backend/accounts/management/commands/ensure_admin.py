import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import FIELD_OF_STUDY_CHOICES


def _normalize_email(value):
    return str(value or "").strip().lower()


def _normalize_full_name(value):
    return str(value or "").strip()


def _normalize_mobile(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 10:
        return digits
    if digits.startswith("977") and len(digits) > 10:
        return digits[-10:]
    return ""


def _normalize_field_of_study(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    allowed = {choice[0] for choice in FIELD_OF_STUDY_CHOICES}
    if raw in allowed:
        return raw
    for option in allowed:
        if option.lower() == raw.lower():
            return option
    return ""


class Command(BaseCommand):
    help = "Ensure a superuser exists using DJANGO_SUPERUSER_* environment variables."

    def handle(self, *args, **options):
        username = str(os.getenv("DJANGO_SUPERUSER_USERNAME", "")).strip()
        email = _normalize_email(os.getenv("DJANGO_SUPERUSER_EMAIL", ""))
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
        full_name = _normalize_full_name(os.getenv("DJANGO_SUPERUSER_FULL_NAME", ""))
        mobile_number = _normalize_mobile(os.getenv("DJANGO_SUPERUSER_MOBILE", ""))
        field_of_study = _normalize_field_of_study(os.getenv("DJANGO_SUPERUSER_FIELD_OF_STUDY", ""))

        if not username:
            self.stdout.write("ensure_admin: DJANGO_SUPERUSER_USERNAME not set; skipping.")
            return

        User = get_user_model()

        user = User.objects.filter(username__iexact=username).first()
        if not user and email:
            user = User.objects.filter(email__iexact=email).first()

        with transaction.atomic():
            if not user:
                if not email or not password:
                    self.stderr.write(
                        "ensure_admin: missing DJANGO_SUPERUSER_EMAIL or DJANGO_SUPERUSER_PASSWORD; "
                        "cannot create user."
                    )
                    return
                extra_fields = {"is_student": False}
                if full_name:
                    extra_fields["full_name"] = full_name
                if field_of_study:
                    extra_fields["field_of_study"] = field_of_study
                if mobile_number:
                    if User.objects.filter(mobile_number=mobile_number).exists():
                        self.stderr.write("ensure_admin: mobile number already in use; skipping mobile.")
                    else:
                        extra_fields["mobile_number"] = mobile_number

                User.objects.create_superuser(
                    username=username,
                    email=email,
                    password=password,
                    **extra_fields,
                )
                self.stdout.write("ensure_admin: created superuser.")
                return

            updated_fields = set()

            if not user.is_staff:
                user.is_staff = True
                updated_fields.add("is_staff")
            if not user.is_superuser:
                user.is_superuser = True
                updated_fields.add("is_superuser")
            if username and user.username != username:
                username_in_use = User.objects.filter(username=username).exclude(pk=user.pk).exists()
                if username_in_use:
                    self.stderr.write("ensure_admin: requested username already in use; keeping existing username.")
                else:
                    user.username = username
                    updated_fields.add("username")
            if user.is_student:
                user.is_student = False
                updated_fields.add("is_student")
            if email and user.email != email:
                user.email = email
                updated_fields.add("email")
            if full_name and user.full_name != full_name:
                user.full_name = full_name
                updated_fields.add("full_name")
            if field_of_study and user.field_of_study != field_of_study:
                user.field_of_study = field_of_study
                updated_fields.add("field_of_study")
            if mobile_number and user.mobile_number != mobile_number:
                in_use = User.objects.filter(mobile_number=mobile_number).exclude(pk=user.pk).exists()
                if in_use:
                    self.stderr.write("ensure_admin: mobile number already in use; skipping mobile.")
                else:
                    user.mobile_number = mobile_number
                    updated_fields.add("mobile_number")
            if password:
                user.set_password(password)
                updated_fields.add("password")

            if updated_fields:
                user.save(update_fields=sorted(updated_fields))
                self.stdout.write("ensure_admin: updated superuser.")
            else:
                self.stdout.write("ensure_admin: already up to date.")
