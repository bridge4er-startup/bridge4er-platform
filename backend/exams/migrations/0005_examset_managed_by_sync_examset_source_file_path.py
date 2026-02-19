from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exams", "0004_alter_examattempt_options_alter_exampurchase_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="examset",
            name="managed_by_sync",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="examset",
            name="source_file_path",
            field=models.CharField(blank=True, db_index=True, default="", max_length=1000),
        ),
    ]

