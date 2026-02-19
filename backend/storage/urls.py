from django.urls import path
from .views import (
    DropboxListView,
    ListFilesView,
    SearchFilesView,
    DownloadFileView,
    PreviewFileView,
    ViewFileView,
    UploadFileView,
    DeleteFileView,
    HomePageMetricsView,
)

urlpatterns = [
    path('homepage/stats/', HomePageMetricsView.as_view()),
    path('files/', DropboxListView.as_view()),
    path('files/list/', ListFilesView.as_view()),
    path('files/search/', SearchFilesView.as_view()),
    path('files/download/', DownloadFileView.as_view()),
    path('files/preview/', PreviewFileView.as_view()),
    path('files/view/', ViewFileView.as_view()),
    path('files/upload/', UploadFileView.as_view()),
    path('files/delete/', DeleteFileView.as_view()),
]
