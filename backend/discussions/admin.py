from django.contrib import admin

from .models import ClassroomMessage, EngineeringClassroom


@admin.register(EngineeringClassroom)
class EngineeringClassroomAdmin(admin.ModelAdmin):
    list_display = ("name", "branch", "slug", "is_active", "created_at")
    list_filter = ("branch", "is_active")
    search_fields = ("name", "slug", "description")
    ordering = ("branch", "name")


@admin.register(ClassroomMessage)
class ClassroomMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "classroom", "sender", "is_visible", "created_at")
    list_filter = ("is_visible", "classroom__branch")
    search_fields = ("text", "sender__username", "sender__full_name", "classroom__name")
    ordering = ("-id",)

