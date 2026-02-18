from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

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


@admin.register(MobileOTP)
class MobileOTPAdmin(admin.ModelAdmin):
    list_display = ("mobile_number", "purpose", "otp_code", "is_used", "created_at", "expires_at")
    list_filter = ("purpose", "is_used")
    search_fields = ("mobile_number",)
