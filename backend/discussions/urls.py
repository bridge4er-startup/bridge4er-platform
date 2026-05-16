from django.urls import path

from .views import (
    ClassroomDetailView,
    ClassroomListCreateView,
    ClassroomMessageDetailView,
    ClassroomMessageListCreateView,
)

urlpatterns = [
    path("classrooms/", ClassroomListCreateView.as_view()),
    path("classrooms/<int:classroom_id>/", ClassroomDetailView.as_view()),
    path("classrooms/<int:classroom_id>/messages/", ClassroomMessageListCreateView.as_view()),
    path("messages/<int:message_id>/", ClassroomMessageDetailView.as_view()),
]

