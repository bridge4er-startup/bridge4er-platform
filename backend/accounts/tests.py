from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .views import _send_verification_email

User = get_user_model()


class RegisterViewTests(APITestCase):
    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_register_falls_back_to_direct_login_when_email_send_fails(self):
        payload = {
            "full_name": "Test Student",
            "mobile_number": "9812345678",
            "username": "register_email_failure",
            "email": "register_email_failure@example.com",
            "field_of_study": "Computer Engineering",
            "password": "secret123",
        }

        with patch("accounts.views._send_verification_email", side_effect=TimeoutError("smtp timeout")):
            response = self.client.post("/api/accounts/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data.get("verification_required"))
        self.assertFalse(response.data.get("verification_email_sent"))
        self.assertIn("smtp timeout", response.data.get("verification_email_error", ""))
        self.assertTrue(User.objects.filter(username="register_email_failure").exists())
        login_response = self.client.post(
            "/api/accounts/auth/login/",
            {"identifier": "register_email_failure", "password": "secret123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)


class VerificationEmailTests(APITestCase):
    @override_settings(EMAIL_TIMEOUT_SECONDS=7)
    def test_send_verification_email_uses_configured_timeout(self):
        user = User.objects.create_user(
            username="email_timeout_user",
            email="email_timeout_user@example.com",
            password="secret123",
            full_name="Timeout User",
            mobile_number="9800000000",
            field_of_study="Civil Engineering",
            is_student=True,
            is_email_verified=False,
            is_mobile_verified=False,
        )

        with patch("accounts.views.get_connection") as mocked_get_connection, patch("accounts.views.send_mail") as mocked_send_mail:
            mocked_connection = object()
            mocked_get_connection.return_value = mocked_connection

            _send_verification_email(user)

            mocked_get_connection.assert_called_once_with(fail_silently=False, timeout=7)
            mocked_send_mail.assert_called_once()
            self.assertIs(mocked_send_mail.call_args.kwargs.get("connection"), mocked_connection)


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

    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_login_blocks_unverified_user_when_required(self):
        User.objects.create_user(
            username="email_block_user",
            email="email_block_user@example.com",
            password="secret123",
            full_name="Email Block User",
            mobile_number="9800000022",
            field_of_study="Civil Engineering",
            is_student=True,
            is_email_verified=False,
            is_mobile_verified=False,
        )

        response = self.client.post(
            "/api/accounts/auth/login/",
            {"identifier": "email_block_user", "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Please verify your email before logging in.", str(response.data))
