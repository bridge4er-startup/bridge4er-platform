from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_email_verification_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="email_verification_sent_at",
        ),
        migrations.RemoveField(
            model_name="user",
            name="email_verification_token",
        ),
        migrations.RemoveField(
            model_name="user",
            name="is_email_verified",
        ),
    ]
