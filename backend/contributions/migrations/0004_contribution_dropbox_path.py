from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contributions", "0003_contributioncategory_branch_like"),
    ]

    operations = [
        migrations.AddField(
            model_name="contribution",
            name="dropbox_path",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
    ]
