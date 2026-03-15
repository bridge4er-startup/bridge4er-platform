from django.urls import reverse
from rest_framework import serializers

from .models import Contribution, ContributionComment


class ContributionCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_username = serializers.CharField(source="user.username", read_only=True)

    def get_user_name(self, obj):
        full_name = str(getattr(obj.user, "full_name", "") or "").strip()
        return full_name or obj.user.username

    class Meta:
        model = ContributionComment
        fields = ["id", "user_name", "user_username", "text", "created_at"]


class ContributionPublicSerializer(serializers.ModelSerializer):
    contributor_name = serializers.SerializerMethodField()
    contributor_username = serializers.CharField(source="user.username", read_only=True)
    file_url = serializers.SerializerMethodField()
    star_count = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    has_liked = serializers.SerializerMethodField()
    comments = ContributionCommentSerializer(many=True, read_only=True)

    def get_contributor_name(self, obj):
        full_name = str(getattr(obj.user, "full_name", "") or "").strip()
        return full_name or obj.user.username

    def get_file_url(self, obj):
        request = self.context.get("request")
        url_path = reverse("contribution-file", kwargs={"contribution_id": obj.id})
        if request:
            return request.build_absolute_uri(url_path)
        return url_path

    def get_star_count(self, obj):
        star_map = self.context.get("star_map") or {}
        if obj.user_id in star_map:
            return int(star_map.get(obj.user_id) or 0)
        return 0

    def get_likes_count(self, obj):
        like_map = self.context.get("like_map") or {}
        return int(like_map.get(obj.id) or 0)

    def get_has_liked(self, obj):
        liked_set = self.context.get("liked_set") or set()
        return obj.id in liked_set

    class Meta:
        model = Contribution
        fields = [
            "id",
            "title",
            "description",
            "file_name",
            "category",
            "branch",
            "submitted_at",
            "contributor_name",
            "contributor_username",
            "file_url",
            "star_count",
            "likes_count",
            "has_liked",
            "comments",
        ]


class ContributionOwnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contribution
        fields = [
            "id",
            "title",
            "description",
            "file_name",
            "category",
            "status",
            "branch",
            "submitted_at",
            "reviewed_at",
        ]


class ContributionAdminSerializer(serializers.ModelSerializer):
    contributor_name = serializers.SerializerMethodField()
    contributor_username = serializers.CharField(source="user.username", read_only=True)
    file_url = serializers.SerializerMethodField()
    star_count = serializers.SerializerMethodField()
    comments = ContributionCommentSerializer(many=True, read_only=True)

    def get_contributor_name(self, obj):
        full_name = str(getattr(obj.user, "full_name", "") or "").strip()
        return full_name or obj.user.username

    def get_file_url(self, obj):
        request = self.context.get("request")
        url_path = reverse("contribution-file", kwargs={"contribution_id": obj.id})
        if request:
            return request.build_absolute_uri(url_path)
        return url_path

    def get_star_count(self, obj):
        star_map = self.context.get("star_map") or {}
        if obj.user_id in star_map:
            return int(star_map.get(obj.user_id) or 0)
        return 0

    class Meta:
        model = Contribution
        fields = [
            "id",
            "title",
            "description",
            "file_name",
            "category",
            "status",
            "branch",
            "admin_note",
            "submitted_at",
            "reviewed_at",
            "contributor_name",
            "contributor_username",
            "file_url",
            "star_count",
            "comments",
        ]
