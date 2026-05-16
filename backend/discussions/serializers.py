from rest_framework import serializers

from .models import ClassroomMessage, EngineeringClassroom


class EngineeringClassroomSerializer(serializers.ModelSerializer):
    class Meta:
        model = EngineeringClassroom
        fields = [
            "id",
            "branch",
            "name",
            "slug",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ClassroomMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    sender_name = serializers.SerializerMethodField()
    is_admin_sender = serializers.SerializerMethodField()

    def get_sender_name(self, obj):
        full_name = str(getattr(obj.sender, "full_name", "") or "").strip()
        return full_name or obj.sender.username

    def get_is_admin_sender(self, obj):
        return bool(getattr(obj.sender, "is_staff", False))

    class Meta:
        model = ClassroomMessage
        fields = [
            "id",
            "classroom",
            "sender",
            "sender_username",
            "sender_name",
            "is_admin_sender",
            "text",
            "is_visible",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "sender",
            "sender_username",
            "sender_name",
            "is_admin_sender",
            "created_at",
            "updated_at",
        ]

