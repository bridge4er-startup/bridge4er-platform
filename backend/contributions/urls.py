from django.urls import path

from .views import (
    ContributionAdminDetailView,
    ContributionAdminListView,
    ContributionCategoriesView,
    ContributionCategoryAdminView,
    ContributionCommentDeleteView,
    ContributionCommentView,
    ContributionFileView,
    ContributionListView,
    ContributionMyListView,
    ContributionUnlockView,
    ContributionUploadView,
)

urlpatterns = [
    path("categories/", ContributionCategoriesView.as_view()),
    path("categories/admin/", ContributionCategoryAdminView.as_view()),
    path("list/", ContributionListView.as_view()),
    path("me/", ContributionMyListView.as_view()),
    path("upload/", ContributionUploadView.as_view()),
    path("<int:contribution_id>/file/", ContributionFileView.as_view(), name="contribution-file"),
    path("<int:contribution_id>/comment/", ContributionCommentView.as_view()),
    path("comments/<int:comment_id>/", ContributionCommentDeleteView.as_view()),
    path("admin/list/", ContributionAdminListView.as_view()),
    path("admin/<int:contribution_id>/", ContributionAdminDetailView.as_view()),
    path("unlock/", ContributionUnlockView.as_view()),
]
