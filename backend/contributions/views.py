import mimetypes

from django.db.models import Count
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from exams.models import ExamPurchase, ExamSet
from .models import (
    Contribution,
    ContributionComment,
    ContributionUnlock,
    ContributionCategory,
    ContributionLike,
    CONTRIBUTION_CATEGORY_CHOICES,
)
from .serializers import (
    ContributionAdminSerializer,
    ContributionOwnerSerializer,
    ContributionPublicSerializer,
    ContributionCommentSerializer,
)

MAX_FILE_BYTES = 2 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}


def _normalize_branch(value):
    normalized = str(value or "").strip()
    return normalized or "Civil Engineering"


def _build_star_map(user_ids):
    if not user_ids:
        return {}
    rows = (
        Contribution.objects.filter(user_id__in=user_ids, status="approved")
        .values("user_id")
        .annotate(total=Count("id"))
    )
    return {row["user_id"]: int(row.get("total") or 0) for row in rows}


def _build_like_map(contribution_ids):
    if not contribution_ids:
        return {}
    rows = (
        ContributionLike.objects.filter(contribution_id__in=contribution_ids)
        .values("contribution_id")
        .annotate(total=Count("id"))
    )
    return {row["contribution_id"]: int(row.get("total") or 0) for row in rows}


def _build_liked_set(contribution_ids, user):
    if not contribution_ids or not user or not user.is_authenticated:
        return set()
    return set(
        ContributionLike.objects.filter(user=user, contribution_id__in=contribution_ids).values_list(
            "contribution_id", flat=True
        )
    )


def _list_contribution_categories(branch):
    normalized_branch = _normalize_branch(branch)
    base_qs = ContributionCategory.objects.all()
    if not base_qs.exists():
        return [label for label, _ in CONTRIBUTION_CATEGORY_CHOICES]
    return list(
        base_qs.filter(is_active=True, branch__iexact=normalized_branch)
        .order_by("display_order", "name", "id")
        .values_list("name", flat=True)
    )


class ContributionCategoriesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        branch = request.query_params.get("branch")
        return Response({"categories": _list_contribution_categories(branch)})


class ContributionCategoryAdminView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        name = str(request.data.get("name") or "").strip()
        branch = _normalize_branch(request.data.get("branch"))
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 50:
            return Response({"error": "name is too long"}, status=status.HTTP_400_BAD_REQUEST)

        existing = ContributionCategory.objects.filter(name__iexact=name, branch__iexact=branch).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.save(update_fields=["is_active", "updated_at"])
            return Response(
                {
                    "message": "Category already exists",
                    "category": {"id": existing.id, "name": existing.name, "branch": existing.branch},
                },
                status=status.HTTP_200_OK,
            )

        category = ContributionCategory.objects.create(name=name, branch=branch)
        return Response(
            {
                "message": "Category created",
                "category": {"id": category.id, "name": category.name, "branch": category.branch},
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request):
        category_id = request.data.get("id") or request.query_params.get("id")
        name = request.data.get("name") or request.query_params.get("name")
        branch = _normalize_branch(request.data.get("branch") or request.query_params.get("branch"))

        queryset = ContributionCategory.objects.all()
        if category_id:
            queryset = queryset.filter(id=category_id)
        elif name:
            queryset = queryset.filter(name__iexact=str(name).strip(), branch__iexact=branch)
        else:
            return Response({"error": "id or name is required"}, status=status.HTTP_400_BAD_REQUEST)

        category = queryset.first()
        if not category:
            return Response({"error": "Category not found"}, status=status.HTTP_404_NOT_FOUND)
        if category.is_active:
            category.is_active = False
            category.save(update_fields=["is_active", "updated_at"])
        return Response({"message": "Category deleted"}, status=status.HTTP_200_OK)


class ContributionListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        category = str(request.query_params.get("category", "") or "").strip()
        branch = str(request.query_params.get("branch", "") or "").strip()
        queryset = Contribution.objects.filter(status="approved").select_related("user").prefetch_related("comments__user")
        if category:
            queryset = queryset.filter(category__iexact=category)
        if branch:
            queryset = queryset.filter(branch__iexact=branch)

        contribution_ids = list(queryset.values_list("id", flat=True))
        user_ids = list(queryset.values_list("user_id", flat=True).distinct())
        star_map = _build_star_map(user_ids)
        like_map = _build_like_map(contribution_ids)
        liked_set = _build_liked_set(contribution_ids, request.user)
        serializer = ContributionPublicSerializer(
            queryset,
            many=True,
            context={
                "request": request,
                "star_map": star_map,
                "like_map": like_map,
                "liked_set": liked_set,
            },
        )
        return Response(serializer.data)


class ContributionFileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, contribution_id):
        try:
            contribution = Contribution.objects.select_related("user").get(id=contribution_id)
        except Contribution.DoesNotExist:
            return Response({"error": "Contribution not found"}, status=status.HTTP_404_NOT_FOUND)

        is_owner = bool(request.user and request.user.is_authenticated and contribution.user_id == request.user.id)
        is_admin = bool(request.user and request.user.is_authenticated and request.user.is_staff)
        if contribution.status != "approved" and not (is_owner or is_admin):
            return Response({"error": "Not allowed to access this file"}, status=status.HTTP_403_FORBIDDEN)

        if not contribution.file:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        download_requested = str(request.query_params.get("download", "")).strip().lower() in {"1", "true", "yes"}
        filename = str(contribution.file.name or f"contribution-{contribution.id}").split("/")[-1]
        try:
            file_handle = contribution.file.open("rb")
        except FileNotFoundError:
            return Response({"error": "File not found on server"}, status=status.HTTP_404_NOT_FOUND)

        guessed_type, _ = mimetypes.guess_type(filename)
        response = FileResponse(file_handle, content_type=guessed_type or "application/octet-stream")
        content_disposition = "attachment" if download_requested else "inline"
        response["Content-Disposition"] = f'{content_disposition}; filename="{filename}"'
        response["Cache-Control"] = "private, max-age=300"
        return response


class ContributionUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        title = str(request.data.get("title") or "").strip()
        description = str(request.data.get("description") or "").strip()
        file_obj = request.FILES.get("file")
        if not title or not file_obj:
            return Response({"error": "title and file are required"}, status=status.HTTP_400_BAD_REQUEST)

        if file_obj.size and file_obj.size > MAX_FILE_BYTES:
            return Response({"error": "File must be under 2MB"}, status=status.HTTP_400_BAD_REQUEST)

        filename = str(file_obj.name or "").lower()
        extension = f".{filename.split('.')[-1]}" if "." in filename else ""
        if extension not in ALLOWED_EXTENSIONS:
            return Response({"error": "Only PDF, JPG, or PNG files are allowed"}, status=status.HTTP_400_BAD_REQUEST)

        pending_count = Contribution.objects.filter(user=request.user, status="pending").count()
        if pending_count >= 3:
            return Response({"error": "You already have 3 pending contributions"}, status=status.HTTP_400_BAD_REQUEST)

        branch = str(getattr(request.user, "field_of_study", "") or "Civil Engineering").strip()
        contribution = Contribution.objects.create(
            user=request.user,
            title=title,
            description=description,
            file=file_obj,
            file_name=file_obj.name,
            branch=branch,
            status="pending",
        )
        serializer = ContributionOwnerSerializer(contribution)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ContributionMyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Contribution.objects.filter(user=request.user).order_by("-submitted_at")
        serializer = ContributionOwnerSerializer(queryset, many=True)
        return Response(serializer.data)


class ContributionCommentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, contribution_id):
        try:
            contribution = Contribution.objects.get(id=contribution_id, status="approved")
        except Contribution.DoesNotExist:
            return Response({"error": "Contribution not found"}, status=status.HTTP_404_NOT_FOUND)

        text = str(request.data.get("text") or "").strip()
        if not text:
            return Response({"error": "text is required"}, status=status.HTTP_400_BAD_REQUEST)
        text = " ".join(text.split())[:160]

        if ContributionComment.objects.filter(contribution=contribution, user=request.user).exists():
            return Response({"error": "You already commented on this file"}, status=status.HTTP_400_BAD_REQUEST)

        comment = ContributionComment.objects.create(
            contribution=contribution,
            user=request.user,
            text=text,
        )
        serializer = ContributionCommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ContributionCommentDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def delete(self, request, comment_id):
        deleted, _ = ContributionComment.objects.filter(id=comment_id).delete()
        if not deleted:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Comment deleted"}, status=status.HTTP_200_OK)


class ContributionLikeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, contribution_id):
        try:
            contribution = Contribution.objects.get(id=contribution_id, status="approved")
        except Contribution.DoesNotExist:
            return Response({"error": "Contribution not found"}, status=status.HTTP_404_NOT_FOUND)

        if contribution.user_id == request.user.id:
            return Response({"error": "You cannot like your own contribution"}, status=status.HTTP_400_BAD_REQUEST)

        like, created = ContributionLike.objects.get_or_create(contribution=contribution, user=request.user)
        if not created:
            return Response({"error": "You already liked this contribution"}, status=status.HTTP_400_BAD_REQUEST)

        likes_count = ContributionLike.objects.filter(contribution=contribution).count()
        return Response({"message": "Liked", "likes_count": likes_count}, status=status.HTTP_201_CREATED)


class ContributionAdminListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        status_filter = str(request.query_params.get("status", "all") or "").strip().lower()
        category = str(request.query_params.get("category", "") or "").strip()
        branch = str(request.query_params.get("branch", "") or "").strip()

        queryset = Contribution.objects.select_related("user").prefetch_related("comments__user").order_by("-submitted_at")
        if status_filter in {"pending", "approved", "rejected"}:
            queryset = queryset.filter(status=status_filter)
        if category:
            queryset = queryset.filter(category__iexact=category)
        if branch:
            queryset = queryset.filter(branch__iexact=branch)

        user_ids = list(queryset.values_list("user_id", flat=True).distinct())
        star_map = _build_star_map(user_ids)
        serializer = ContributionAdminSerializer(
            queryset,
            many=True,
            context={"request": request, "star_map": star_map},
        )
        return Response(serializer.data)


class ContributionAdminDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def patch(self, request, contribution_id):
        try:
            contribution = Contribution.objects.get(id=contribution_id)
        except Contribution.DoesNotExist:
            return Response({"error": "Contribution not found"}, status=status.HTTP_404_NOT_FOUND)

        status_value = request.data.get("status")
        category_value = request.data.get("category")
        admin_note = request.data.get("admin_note")

        update_fields = []
        if status_value in {"pending", "approved", "rejected"}:
            contribution.status = status_value
            contribution.reviewed_at = None if status_value == "pending" else timezone.now()
            update_fields.extend(["status", "reviewed_at"])
        if category_value is not None:
            contribution.category = str(category_value or "").strip()
            update_fields.append("category")
        if admin_note is not None:
            contribution.admin_note = str(admin_note or "").strip()
            update_fields.append("admin_note")

        if update_fields:
            contribution.save(update_fields=sorted(set(update_fields + ["updated_at"])))

        serializer = ContributionAdminSerializer(
            contribution,
            context={"request": request, "star_map": _build_star_map([contribution.user_id])},
        )
        return Response(serializer.data)

    def delete(self, request, contribution_id):
        deleted, _ = Contribution.objects.filter(id=contribution_id).delete()
        if not deleted:
            return Response({"error": "Contribution not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Contribution deleted"}, status=status.HTTP_200_OK)


class ContributionUnlockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        exam_set_id = request.data.get("exam_set_id")
        exam_set_name = request.data.get("exam_set_name")
        exam_set = None

        if exam_set_id not in (None, ""):
            try:
                exam_set = ExamSet.objects.get(id=exam_set_id)
            except ExamSet.DoesNotExist:
                return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)
        elif exam_set_name is not None:
            normalized_name = str(exam_set_name or "").strip()
            if not normalized_name:
                return Response({"error": "exam_set_name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            exam_set_qs = ExamSet.objects.filter(name__iexact=normalized_name)
            user_branch = str(getattr(request.user, "field_of_study", "") or "").strip()
            if user_branch:
                exam_set_qs = exam_set_qs.filter(branch__iexact=user_branch)
            match_count = exam_set_qs.count()
            if match_count == 0:
                return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)
            if match_count > 1:
                return Response(
                    {"error": "Multiple exam sets found for that name. Use exam_set_id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            exam_set = exam_set_qs.first()
        else:
            return Response(
                {"error": "exam_set_name or exam_set_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if exam_set.is_free or float(exam_set.fee or 0) <= 0:
            return Response({"error": "Exam set is already free"}, status=status.HTTP_400_BAD_REQUEST)

        if ExamPurchase.objects.filter(user=request.user, exam_set=exam_set).exists():
            return Response({"error": "Exam set already unlocked"}, status=status.HTTP_400_BAD_REQUEST)

        approved_count = Contribution.objects.filter(user=request.user, status="approved").count()
        earned_unlocks = approved_count // 5
        redeemed_unlocks = ContributionUnlock.objects.filter(user=request.user).count()
        available = earned_unlocks - redeemed_unlocks
        if available <= 0:
            return Response({"error": "No unlocks available"}, status=status.HTTP_400_BAD_REQUEST)

        ExamPurchase.objects.create(
            user=request.user,
            exam_set=exam_set,
            exam_type=exam_set.exam_type,
            set_name=exam_set.name,
            payment_gateway="contribution",
            transaction_id=f"contrib-{request.user.id}-{exam_set.id}",
            amount=0,
        )
        ContributionUnlock.objects.create(user=request.user, exam_set=exam_set)

        updated_available = (approved_count // 5) - ContributionUnlock.objects.filter(user=request.user).count()
        return Response({"message": "Exam set unlocked", "available_unlocks": max(updated_available, 0)})
