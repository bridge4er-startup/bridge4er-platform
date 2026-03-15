from django.contrib import admin

from .models import Contribution, ContributionComment, ContributionUnlock, ContributionCategory, ContributionLike


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


@admin.register(ContributionCategory)
class ContributionCategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "branch", "is_active", "display_order", "created_at")
    list_filter = ("is_active", "branch")
    search_fields = ("name", "branch")
    list_editable = ("is_active", "display_order")


@admin.register(ContributionLike)
class ContributionLikeAdmin(admin.ModelAdmin):
    list_display = ("id", "contribution", "user", "created_at")
    search_fields = ("user__username", "contribution__title")
