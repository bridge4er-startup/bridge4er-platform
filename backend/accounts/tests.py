from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class RegisterViewTests(APITestCase):
    def test_register_returns_tokens_and_user(self):
        payload = {
            "full_name": "Test Student",
            "mobile_number": "9812345678",
            "username": "register_success_user",
            "email": "register_success_user@example.com",
            "field_of_study": "Computer Engineering",
            "password": "secret123",
        }

        response = self.client.post("/api/accounts/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("tokens", response.data)
        self.assertIn("user", response.data)
        self.assertTrue(User.objects.filter(username="register_success_user").exists())


class LoginViewTests(APITestCase):
    def test_login_allows_email_identifier_when_verified(self):
        User.objects.create_user(
            username="email_login_user",
            email="email_login_user@example.com",
            password="secret123",
            full_name="Email Login User",
            mobile_number="9800000011",
            field_of_study="Civil Engineering",
            is_student=True,
            is_email_verified=True,
            is_mobile_verified=False,
        )

        response = self.client.post(
            "/api/accounts/auth/login/",
            {"identifier": "email_login_user@example.com", "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("tokens", response.data)

    def test_login_allows_unverified_user(self):
        User.objects.create_user(
            username="unverified_login_user",
            email="unverified_login_user@example.com",
            password="secret123",
            full_name="Unverified Login User",
            mobile_number="9800000022",
            field_of_study="Civil Engineering",
            is_student=True,
            is_email_verified=False,
            is_mobile_verified=False,
        )

        response = self.client.post(
            "/api/accounts/auth/login/",
            {"identifier": "unverified_login_user", "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("tokens", response.data)
