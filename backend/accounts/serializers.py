from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import FIELD_OF_STUDY_CHOICES

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


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200)
    mobile_number = serializers.CharField(max_length=20)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    field_of_study = serializers.ChoiceField(choices=[choice[0] for choice in FIELD_OF_STUDY_CHOICES])
    password = serializers.CharField(min_length=6, write_only=True)

    def validate_mobile_number(self, value):
        cleaned = "".join(ch for ch in value if ch.isdigit())
        if len(cleaned) != 10:
            raise serializers.ValidationError("Mobile number must be exactly 10 digits.")
        if User.objects.filter(mobile_number=cleaned).exists():
            raise serializers.ValidationError("This mobile number is already enrolled.")
        return cleaned

    def validate_full_name(self, value):
        normalized = str(value or "").strip()
        parts = [item for item in normalized.split() if item]
        if len(parts) < 2:
            raise serializers.ValidationError("Enter at least two names separated by a space.")
        return normalized

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

    def _resolve_user(self, identifier):
        normalized = (identifier or "").strip()
        if not normalized:
            return None

        base_queryset = User.objects.only("id", "username")

        if "@" in normalized:
            lowered = normalized.lower()
            return (
                base_queryset.filter(email=lowered).first()
                or base_queryset.filter(email__iexact=normalized).first()
            )

        mobile_candidate = "".join(ch for ch in normalized if ch.isdigit())
        if mobile_candidate:
            mobile_user = (
                base_queryset.filter(mobile_number=mobile_candidate).first()
                or base_queryset.filter(mobile_number=normalized).first()
            )
            if mobile_user:
                return mobile_user

        return base_queryset.filter(username__iexact=normalized).first()

    def validate(self, attrs):
        identifier = (attrs.get("identifier") or "").strip()
        password = attrs.get("password") or ""
        user = self._resolve_user(identifier)

        if not user:
            raise serializers.ValidationError("Invalid username/mobile/email or password.")

        authenticated = authenticate(username=user.username, password=password)
        if not authenticated:
            raise serializers.ValidationError("Invalid username/mobile/email or password.")

        attrs["user"] = authenticated
        return attrs


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["full_name", "email", "field_of_study"]
