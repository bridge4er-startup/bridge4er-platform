from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from exams.models import ExamAttempt, ExamPurchase, ExamSet

from .serializers import (
    LoginSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .models import ReferralInvite, ReferralUnlock, normalize_referral_mobile, normalize_referral_name

User = get_user_model()


def _build_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


def _match_referral_for_user(user):
    normalized_mobile = normalize_referral_mobile(getattr(user, "mobile_number", ""))
    normalized_name = normalize_referral_name(getattr(user, "full_name", "") or user.username)
    if not normalized_mobile or not normalized_name:
        return None
    referral = (
        ReferralInvite.objects
        .filter(
            friend_mobile_normalized=normalized_mobile,
            friend_name_normalized=normalized_name,
            status="pending",
            referred_user__isnull=True,
        )
        .order_by("created_at")
        .first()
    )
    if referral:
        referral.mark_matched(user)
    return referral


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

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

        _match_referral_for_user(user)

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


class ReferralInviteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_name = str(request.data.get("friend_name") or "").strip()
        friend_mobile = str(request.data.get("friend_mobile") or "").strip()

        if not friend_name or not friend_mobile:
            return Response({"error": "Friend name and mobile are required."}, status=status.HTTP_400_BAD_REQUEST)

        normalized_name = normalize_referral_name(friend_name)
        name_parts = [part for part in normalized_name.split() if part]
        if len(name_parts) < 2:
            return Response({"error": "Enter full name (first and last name)."}, status=status.HTTP_400_BAD_REQUEST)

        normalized_mobile = normalize_referral_mobile(friend_mobile)
        if len(normalized_mobile) != 10:
            return Response({"error": "Mobile number must be exactly 10 digits."}, status=status.HTTP_400_BAD_REQUEST)

        user_mobile = normalize_referral_mobile(getattr(request.user, "mobile_number", ""))
        if user_mobile and normalized_mobile == user_mobile:
            return Response({"error": "You cannot refer your own mobile number."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(mobile_number=normalized_mobile).exists():
            return Response({"error": "This mobile number is already registered."}, status=status.HTTP_400_BAD_REQUEST)

        if ReferralInvite.objects.filter(referrer=request.user, friend_mobile_normalized=normalized_mobile).exists():
            return Response({"error": "You already referred this friend."}, status=status.HTTP_400_BAD_REQUEST)

        referral = ReferralInvite.objects.create(
            referrer=request.user,
            friend_name=friend_name,
            friend_mobile=normalized_mobile,
        )

        return Response(
            {
                "message": "Referral saved.",
                "referral": {
                    "id": referral.id,
                    "friend_name": referral.friend_name,
                    "friend_mobile": referral.friend_mobile,
                    "status": referral.status,
                    "created_at": timezone.localtime(referral.created_at).isoformat(),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class ReferralUnlockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        exam_set_id = request.data.get("exam_set_id")
        if not exam_set_id:
            return Response({"error": "exam_set_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exam_set = ExamSet.objects.get(id=exam_set_id)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)

        if exam_set.is_free or float(exam_set.fee or 0) <= 0:
            return Response({"error": "Exam set is already free"}, status=status.HTTP_400_BAD_REQUEST)

        if ExamPurchase.objects.filter(user=request.user, exam_set=exam_set).exists():
            return Response({"error": "Exam set already unlocked"}, status=status.HTTP_400_BAD_REQUEST)

        matched_count = ReferralInvite.objects.filter(referrer=request.user, status="matched").count()
        earned_unlocks = matched_count // 2
        redeemed_unlocks = ReferralUnlock.objects.filter(user=request.user).count()
        available = earned_unlocks - redeemed_unlocks
        if available <= 0:
            return Response({"error": "No referral unlocks available"}, status=status.HTTP_400_BAD_REQUEST)

        ExamPurchase.objects.create(
            user=request.user,
            exam_set=exam_set,
            exam_type=exam_set.exam_type,
            set_name=exam_set.name,
            payment_gateway="referral",
            transaction_id=f"ref-{request.user.id}-{exam_set.id}",
            amount=0,
        )
        ReferralUnlock.objects.create(user=request.user, exam_set=exam_set)

        updated_available = (matched_count // 2) - ReferralUnlock.objects.filter(user=request.user).count()
        return Response(
            {
                "message": "Exam set unlocked",
                "available_unlocks": max(updated_available, 0),
            },
            status=status.HTTP_200_OK,
        )
