from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import ClassroomMessage, EngineeringClassroom

User = get_user_model()


class DiscussionsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="discussion-admin",
            password="secret123",
            email="discussion-admin@example.com",
            mobile_number="9800000000",
            full_name="Discussion Admin",
            is_staff=True,
            is_superuser=True,
        )
        self.student = User.objects.create_user(
            username="discussion-student",
            password="secret123",
            email="discussion-student@example.com",
            mobile_number="9811111111",
            full_name="Discussion Student",
        )

    def test_admin_can_create_classroom(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/discussions/classrooms/",
            {
                "branch": "Civil Engineering",
                "name": "PSC",
                "description": "Public Service discussion",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(EngineeringClassroom.objects.count(), 1)

    def test_student_can_send_message_to_active_classroom(self):
        classroom = EngineeringClassroom.objects.create(
            branch="Civil Engineering",
            name="NEA Entrance",
            slug="nea-entrance",
            is_active=True,
        )
        self.client.force_authenticate(self.student)
        response = self.client.post(
            f"/api/discussions/classrooms/{classroom.id}/messages/",
            {"text": "Hello everyone"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ClassroomMessage.objects.filter(classroom=classroom).count(), 1)

    def test_admin_can_delete_message(self):
        classroom = EngineeringClassroom.objects.create(
            branch="Civil Engineering",
            name="NEA Entrance",
            slug="nea-entrance",
            is_active=True,
        )
        message = ClassroomMessage.objects.create(
            classroom=classroom,
            sender=self.student,
            text="temp message",
            is_visible=True,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.delete(f"/api/discussions/messages/{message.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ClassroomMessage.objects.filter(id=message.id).exists())

