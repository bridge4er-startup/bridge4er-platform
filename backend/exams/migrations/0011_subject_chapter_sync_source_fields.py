from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exams", "0010_subjectivesubmission_dropbox_paths"),
    ]

    operations = [
        migrations.AddField(
            model_name="subject",
            name="managed_by_sync",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="subject",
            name="source_folder_path",
            field=models.CharField(blank=True, db_index=True, default="", max_length=1000),
        ),
        migrations.AddField(
            model_name="chapter",
            name="managed_by_sync",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="chapter",
            name="source_file_path",
            field=models.CharField(blank=True, db_index=True, default="", max_length=1000),
        ),
    ]
