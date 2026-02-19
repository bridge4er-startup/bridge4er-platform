from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("exams", "0005_examset_managed_by_sync_examset_source_file_path"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProblemReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("branch", models.CharField(default="Civil Engineering", max_length=200)),
                ("section", models.CharField(blank=True, default="", max_length=120)),
                (
                    "issue_type",
                    models.CharField(
                        choices=[
                            ("question_error", "Question Error"),
                            ("answer_error", "Answer Error"),
                            ("technical_bug", "Technical Bug"),
                            ("other", "Other"),
                        ],
                        default="other",
                        max_length=40,
                    ),
                ),
                ("question_reference", models.CharField(blank=True, default="", max_length=500)),
                ("description", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("solved", "Solved")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("admin_note", models.TextField(blank=True, default="")),
                ("solved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "reporter",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="problem_reports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
