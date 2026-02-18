import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from exams.models import ExamAttempt

from .models import MobileOTP
from .otp_service import OTPServiceError, send_otp, verify_otp
from .serializers import (
    LoginSerializer,
    OTPRequestSerializer,
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


class RequestOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mobile_number = serializer.validated_data["mobile_number"]
        purpose = serializer.validated_data["purpose"]

        if purpose == "register" and User.objects.filter(mobile_number=mobile_number).exists():
            return Response(
                {"error": "This mobile number is already enrolled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider = (settings.OTP_PROVIDER or "local").lower()
        otp_code = f"{random.randint(100000, 999999)}"
        expires_at = timezone.now() + timedelta(minutes=10)

        MobileOTP.objects.filter(
            mobile_number=mobile_number,
            purpose=purpose,
            is_used=False,
        ).update(is_used=True, verified_at=timezone.now())

        provider_meta = {"provider": provider}
        if provider == "local":
            delivery_code = otp_code
        else:
            delivery_code = "REMOTE"
            try:
                provider_meta = send_otp(mobile_number)
            except OTPServiceError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        MobileOTP.objects.create(
            mobile_number=mobile_number,
            otp_code=delivery_code,
            purpose=purpose,
            expires_at=expires_at,
        )

        payload = {
            "message": "OTP sent successfully.",
            "expires_in_seconds": 600,
            "provider": provider_meta.get("provider", provider),
        }
        if settings.SHOW_OTP_IN_RESPONSE and provider == "local":
            payload["otp_debug"] = otp_code
        return Response(payload)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        otp = (
            MobileOTP.objects.filter(
                mobile_number=data["mobile_number"],
                purpose="register",
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )
        if not otp:
            return Response({"error": "OTP not found. Request OTP first."}, status=status.HTTP_400_BAD_REQUEST)
        if otp.is_expired():
            return Response({"error": "OTP expired. Request a new OTP."}, status=status.HTTP_400_BAD_REQUEST)

        provider = (settings.OTP_PROVIDER or "local").lower()
        if provider == "local":
            if otp.otp_code != data["otp_code"].strip():
                return Response({"error": "Invalid OTP code."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                approved = verify_otp(data["mobile_number"], data["otp_code"])
            except OTPServiceError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            if not approved:
                return Response({"error": "Invalid OTP code."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = User.objects.create_user(
                username=data["username"],
                email=data["email"],
                password=data["password"],
                full_name=data["full_name"].strip(),
                mobile_number=data["mobile_number"],
                field_of_study=data["field_of_study"],
                is_student=True,
                is_mobile_verified=True,
            )
            otp.mark_used()

        tokens = _build_tokens_for_user(user)
        return Response(
            {
                "message": "Registration successful.",
                "tokens": tokens,
                "user": UserSerializer(user).data,
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
