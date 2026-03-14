from django.db import migrations, models
from django.db.models.functions import Lower


DEFAULT_CATEGORIES = ["PSC", "NEC", "MSC", "GK/IQ", "NTC", "NEA", "Other"]


def seed_default_categories(apps, schema_editor):
    ContributionCategory = apps.get_model("contributions", "ContributionCategory")
    if ContributionCategory.objects.exists():
        return
    for index, name in enumerate(DEFAULT_CATEGORIES):
        ContributionCategory.objects.create(name=name, display_order=index)


def remove_seeded_categories(apps, schema_editor):
    ContributionCategory = apps.get_model("contributions", "ContributionCategory")
    ContributionCategory.objects.filter(name__in=DEFAULT_CATEGORIES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("contributions", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ContributionCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=50)),
                ("is_active", models.BooleanField(default=True)),
                ("display_order", models.IntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["display_order", "name", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="contributioncategory",
            constraint=models.UniqueConstraint(Lower("name"), name="unique_contribution_category_name_ci"),
        ),
        migrations.RunPython(seed_default_categories, remove_seeded_categories),
    ]
