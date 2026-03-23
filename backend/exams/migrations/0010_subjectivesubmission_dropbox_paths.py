from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0009_examset_total_marks_override_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="subjectivesubmission",
            name="dropbox_answer_path",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AddField(
            model_name="subjectivesubmission",
            name="dropbox_reviewed_path",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
    ]
