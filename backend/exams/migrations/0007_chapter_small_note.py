from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exams", "0006_problemreport"),
    ]

    operations = [
        migrations.AddField(
            model_name="chapter",
            name="small_note",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
