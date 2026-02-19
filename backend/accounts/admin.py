from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.utils.crypto import get_random_string

from .models import MobileOTP, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Bridge4ER Profile",
            {
                "fields": (
                    "full_name",
                    "mobile_number",
                    "field_of_study",
                    "is_mobile_verified",
                    "is_student",
                )
            },
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
        "is_mobile_verified",
    )
    search_fields = ("username", "email", "full_name", "mobile_number")
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


@admin.register(MobileOTP)
class MobileOTPAdmin(admin.ModelAdmin):
    list_display = ("mobile_number", "purpose", "otp_code", "is_used", "created_at", "expires_at")
    list_filter = ("purpose", "is_used")
    search_fields = ("mobile_number",)
