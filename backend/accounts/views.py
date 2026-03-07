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
            )

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
