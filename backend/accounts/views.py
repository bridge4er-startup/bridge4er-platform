import secrets
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Avg
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from exams.models import ExamAttempt

from .serializers import (
    LoginSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


def _build_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


def _generate_email_verification_token():
    return secrets.token_urlsafe(48)


def _verification_link(token):
    frontend_base = str(getattr(settings, "FRONTEND_PUBLIC_URL", "") or "").rstrip("/")
    if frontend_base:
        return f"{frontend_base}/verify-email?token={quote(token)}"
    backend_base = str(getattr(settings, "BACKEND_PUBLIC_URL", "") or "").rstrip("/")
    return f"{backend_base}/api/accounts/auth/email/verify/?token={quote(token)}"


def _send_verification_email(user):
    token = _generate_email_verification_token()
    user.email_verification_token = token
    user.email_verification_sent_at = timezone.now()
    user.is_email_verified = False
    user.save(update_fields=["email_verification_token", "email_verification_sent_at", "is_email_verified"])

    verify_url = _verification_link(token)
    send_mail(
        subject="Bridge4ER Email Verification",
        message=(
            f"Hi {user.full_name or user.username},\n\n"
            "Please verify your Bridge4ER email by opening the link below:\n"
            f"{verify_url}\n\n"
            "If you did not create this account, please ignore this email."
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "bridge4er@gmail.com"),
        recipient_list=[user.email],
        fail_silently=False,
    )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                username=data["username"],
                email=data["email"],
                password=data["password"],
                full_name=data["full_name"].strip(),
                mobile_number=data["mobile_number"],
                field_of_study=data["field_of_study"],
                is_student=True,
                is_mobile_verified=False,
                is_email_verified=False,
            )

        email_sent = True
        email_error = ""
        try:
            _send_verification_email(user)
        except Exception as exc:
            email_sent = False
            email_error = str(exc)

        return Response(
            {
                "message": "Registration successful. Please verify your email before login.",
                "verification_required": True,
                "verification_email_sent": email_sent,
                "verification_email_error": email_error,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        tokens = _build_tokens_for_user(user)
        return Response(
            {
                "message": "Login successful.",
                "tokens": tokens,
                "user": UserSerializer(user).data,
            }
        )


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_data = UserSerializer(request.user).data
        attempts = ExamAttempt.objects.filter(user=request.user)
        total_attempts = attempts.count()
        avg = float(attempts.aggregate(avg_score=Avg("score"))["avg_score"] or 0.0)
        user_data["total_attempts"] = total_attempts
        user_data["average_score"] = round(avg, 2)
        return Response(user_data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(instance=request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = str(request.query_params.get("token") or "").strip()
        if not token:
            return Response({"error": "Verification token is required."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email_verification_token=token).first()
        if not user:
            return Response({"error": "Invalid or expired verification token."}, status=status.HTTP_400_BAD_REQUEST)

        user.is_email_verified = True
        user.email_verification_token = ""
        user.save(update_fields=["is_email_verified", "email_verification_token"])
        return Response({"message": "Email verified successfully."}, status=status.HTTP_200_OK)


class ResendEmailVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        identifier = str(request.data.get("identifier") or "").strip()
        if not identifier:
            return Response({"error": "identifier is required."}, status=status.HTTP_400_BAD_REQUEST)

        mobile_candidate = "".join(ch for ch in identifier if ch.isdigit())
        user = (
            User.objects.filter(email__iexact=identifier).first()
            or User.objects.filter(username__iexact=identifier).first()
            or User.objects.filter(mobile_number=identifier).first()
            or User.objects.filter(mobile_number=mobile_candidate).first()
        )
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if bool(getattr(user, "is_email_verified", False)):
            return Response({"message": "Email is already verified."}, status=status.HTTP_200_OK)

        try:
            _send_verification_email(user)
        except Exception as exc:
            return Response({"error": f"Failed to send verification email: {exc}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({"message": "Verification email sent."}, status=status.HTTP_200_OK)
