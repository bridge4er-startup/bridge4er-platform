from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import serializers

from .models import FIELD_OF_STUDY_CHOICES, MobileOTP

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "full_name",
            "mobile_number",
            "username",
            "email",
            "field_of_study",
            "is_mobile_verified",
            "is_staff",
            "date_joined",
        ]


class OTPRequestSerializer(serializers.Serializer):
    mobile_number = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(choices=["register", "login"], default="register")

    def validate_mobile_number(self, value):
        cleaned = "".join(ch for ch in value if ch.isdigit())
        if len(cleaned) < 7 or len(cleaned) > 15:
            raise serializers.ValidationError("Enter a valid mobile number.")
        return cleaned


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200)
    mobile_number = serializers.CharField(max_length=20)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    field_of_study = serializers.ChoiceField(choices=[choice[0] for choice in FIELD_OF_STUDY_CHOICES])
    password = serializers.CharField(min_length=6, write_only=True)
    otp_code = serializers.CharField(max_length=6)

    def validate_mobile_number(self, value):
        cleaned = "".join(ch for ch in value if ch.isdigit())
        if len(cleaned) < 7 or len(cleaned) > 15:
            raise serializers.ValidationError("Enter a valid mobile number.")
        if User.objects.filter(mobile_number=cleaned).exists():
            raise serializers.ValidationError("This mobile number is already enrolled.")
        return cleaned

    def validate_username(self, value):
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError("This username is already in use.")
        return normalized

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("This email is already in use.")
        return normalized


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = (attrs.get("identifier") or "").strip()
        password = attrs.get("password") or ""
        mobile_candidate = "".join(ch for ch in identifier if ch.isdigit())

        user = User.objects.filter(
            Q(username__iexact=identifier) | Q(mobile_number=identifier) | Q(mobile_number=mobile_candidate)
        ).first()

        if not user:
            raise serializers.ValidationError("Invalid username/mobile or password.")

        authenticated = authenticate(username=user.username, password=password)
        if not authenticated:
            raise serializers.ValidationError("Invalid username/mobile or password.")

        attrs["user"] = authenticated
        return attrs


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "email", "field_of_study"]
