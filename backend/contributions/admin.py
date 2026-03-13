from django.contrib import admin

from .models import Contribution, ContributionComment, ContributionUnlock


@admin.register(Contribution)
class ContributionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "user",
        "status",
        "category",
        "branch",
        "submitted_at",
        "reviewed_at",
    )
    list_filter = ("status", "category", "branch", "submitted_at")
    search_fields = ("title", "user__username", "user__full_name")
    list_editable = ("status", "category")


@admin.register(ContributionComment)
class ContributionCommentAdmin(admin.ModelAdmin):
    list_display = ("id", "contribution", "user", "created_at")
    search_fields = ("user__username", "contribution__title")


@admin.register(ContributionUnlock)
class ContributionUnlockAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "exam_set", "created_at")
    search_fields = ("user__username", "exam_set__name")
