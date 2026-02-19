from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storage", "0003_platformmetrics_motivation_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="filemetadata",
            name="is_visible",
            field=models.BooleanField(default=True),
        ),
    ]
