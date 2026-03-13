from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_remove_user_email_verification_fields"),
        ("exams", "0009_examset_total_marks_override_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReferralInvite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("friend_name", models.CharField(max_length=200)),
                ("friend_mobile", models.CharField(max_length=20)),
                ("friend_name_normalized", models.CharField(db_index=True, max_length=200)),
                ("friend_mobile_normalized", models.CharField(db_index=True, max_length=20)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("matched", "Matched")], default="pending", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("matched_at", models.DateTimeField(blank=True, null=True)),
                (
                    "referrer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="referrals_sent",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "referred_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="referrals_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("referrer", "friend_mobile_normalized")},
                "indexes": [
                    models.Index(fields=["friend_mobile_normalized"], name="accounts_ref_friend_mobile_norm"),
                    models.Index(fields=["friend_name_normalized"], name="accounts_ref_friend_name_norm"),
                ],
            },
        ),
        migrations.CreateModel(
            name="ReferralUnlock",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "exam_set",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="exams.examset"),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="referral_unlocks",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("user", "exam_set")},
            },
        ),
    ]
