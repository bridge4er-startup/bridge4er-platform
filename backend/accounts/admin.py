from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm
from django.utils.crypto import get_random_string

from .models import User


class CustomUserChangeForm(UserChangeForm):
    new_password = forms.CharField(
        required=False,
        label="Set New Password",
        widget=forms.PasswordInput(render_value=True),
        help_text="Leave blank to keep current password.",
    )
    confirm_new_password = forms.CharField(
        required=False,
        label="Confirm New Password",
        widget=forms.PasswordInput(render_value=True),
    )

    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        password_value = cleaned_data.get("new_password") or ""
        confirm_value = cleaned_data.get("confirm_new_password") or ""
        if password_value or confirm_value:
            if password_value != confirm_value:
                raise forms.ValidationError("New password and confirmation must match.")
            if len(password_value) < 6:
                raise forms.ValidationError("New password must be at least 6 characters long.")
        return cleaned_data

    def save(self, commit=True):
        user = super().save(commit=False)
        new_password = (self.cleaned_data.get("new_password") or "").strip()
        if new_password:
            user.set_password(new_password)
        if commit:
            user.save()
            self.save_m2m()
        return user


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    form = CustomUserChangeForm
    fieldsets = UserAdmin.fieldsets + (
        (
            "Bridge4ER Profile",
            {
                "fields": (
                    "full_name",
                    "mobile_number",
                    "field_of_study",
                    "is_email_verified",
                    "email_verification_token",
                    "email_verification_sent_at",
                    "is_mobile_verified",
                    "is_student",
                )
            },
        ),
        (
            "Password Reset",
            {"fields": ("new_password", "confirm_new_password")},
        ),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Bridge4ER Profile",
            {"fields": ("full_name", "mobile_number", "field_of_study", "is_student")},
        ),
    )
    list_display = (
        "username",
        "email",
        "full_name",
        "mobile_number",
        "field_of_study",
        "is_staff",
        "is_email_verified",
        "is_mobile_verified",
    )
    search_fields = ("username", "email", "full_name", "mobile_number")
    readonly_fields = ("email_verification_sent_at",)
    actions = ("reset_selected_user_passwords",)

    @admin.action(description="Reset selected user passwords (temporary)")
    def reset_selected_user_passwords(self, request, queryset):
        generated = []
        for user in queryset:
            temp_password = get_random_string(10)
            user.set_password(temp_password)
            user.save(update_fields=["password"])
            generated.append(f"{user.username}: {temp_password}")

        if not generated:
            self.message_user(request, "No user selected for password reset.", level=messages.WARNING)
            return

        self.message_user(
            request,
            "Temporary passwords generated. Share securely with users:\n" + " | ".join(generated),
            level=messages.INFO,
        )
