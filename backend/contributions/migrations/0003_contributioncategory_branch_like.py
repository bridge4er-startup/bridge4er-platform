from django.conf import settings
from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ("contributions", "0002_contributioncategory"),
    ]

    operations = [
        migrations.AddField(
            model_name="contributioncategory",
            name="branch",
            field=models.CharField(default="Civil Engineering", max_length=200),
        ),
        migrations.RemoveConstraint(
            model_name="contributioncategory",
            name="unique_contribution_category_name_ci",
        ),
        migrations.AddConstraint(
            model_name="contributioncategory",
            constraint=models.UniqueConstraint(
                Lower("name"), Lower("branch"), name="unique_contribution_category_name_branch_ci"
            ),
        ),
        migrations.CreateModel(
            name="ContributionLike",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "contribution",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="likes",
                        to="contributions.contribution",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="contribution_likes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("contribution", "user")},
            },
        ),
    ]
