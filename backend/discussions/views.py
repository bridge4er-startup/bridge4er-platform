from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ClassroomMessage, EngineeringClassroom
from .serializers import ClassroomMessageSerializer, EngineeringClassroomSerializer


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _clean_branch(value):
    cleaned = str(value or "").strip()
    return cleaned or "Civil Engineering"


def _classroom_queryset(branch, is_staff=False):
    qs = EngineeringClassroom.objects.filter(branch=_clean_branch(branch))
    if not is_staff:
        qs = qs.filter(is_active=True)
    return qs.order_by("name", "id")


class ClassroomListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branch = request.query_params.get("branch", "Civil Engineering")
        rows = _classroom_queryset(branch=branch, is_staff=bool(request.user.is_staff))
        serializer = EngineeringClassroomSerializer(rows, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        branch = _clean_branch(request.data.get("branch", "Civil Engineering"))
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        description = str(request.data.get("description") or "").strip()
        custom_slug = str(request.data.get("slug") or "").strip()
        slug = slugify(custom_slug or name)[:140]
        if not slug:
            return Response({"error": "Unable to generate classroom slug"}, status=status.HTTP_400_BAD_REQUEST)

        classroom, created = EngineeringClassroom.objects.get_or_create(
            branch=branch,
            slug=slug,
            defaults={
                "name": name[:120],
                "description": description[:255],
                "created_by": request.user,
                "is_active": True,
            },
        )
        if not created:
            return Response(
                {"error": "A classroom with this name already exists for this branch."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = EngineeringClassroomSerializer(classroom)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ClassroomDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, classroom_id):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        try:
            classroom = EngineeringClassroom.objects.get(id=classroom_id)
        except EngineeringClassroom.DoesNotExist:
            return Response({"error": "Classroom not found"}, status=status.HTTP_404_NOT_FOUND)

        updated_fields = []
        if "name" in request.data:
            name = str(request.data.get("name") or "").strip()
            if not name:
                return Response({"error": "name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            classroom.name = name[:120]
            updated_fields.append("name")
        if "description" in request.data:
            classroom.description = str(request.data.get("description") or "").strip()[:255]
            updated_fields.append("description")
        if "is_active" in request.data:
            classroom.is_active = _as_bool(request.data.get("is_active"), True)
            updated_fields.append("is_active")
        if "branch" in request.data:
            classroom.branch = _clean_branch(request.data.get("branch"))
            updated_fields.append("branch")

        if not updated_fields:
            return Response(
                {"error": "Provide at least one field to update"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        classroom.save(update_fields=sorted(set(updated_fields + ["updated_at"])))
        return Response(EngineeringClassroomSerializer(classroom).data)

    def delete(self, request, classroom_id):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = EngineeringClassroom.objects.filter(id=classroom_id).delete()
        if not deleted:
            return Response({"error": "Classroom not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Classroom deleted"}, status=status.HTTP_200_OK)


class ClassroomMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, classroom_id):
        try:
            classroom = EngineeringClassroom.objects.get(id=classroom_id)
        except EngineeringClassroom.DoesNotExist:
            return Response({"error": "Classroom not found"}, status=status.HTTP_404_NOT_FOUND)

        if not classroom.is_active and not request.user.is_staff:
            return Response({"error": "Classroom is inactive"}, status=status.HTTP_404_NOT_FOUND)

        try:
            since_id = int(request.query_params.get("since_id", 0))
        except (TypeError, ValueError):
            since_id = 0
        try:
            limit = int(request.query_params.get("limit", 80))
        except (TypeError, ValueError):
            limit = 80
        limit = max(1, min(limit, 200))

        messages_qs = ClassroomMessage.objects.filter(classroom=classroom).select_related("sender")
        if not request.user.is_staff:
            messages_qs = messages_qs.filter(is_visible=True)
        if since_id > 0:
            messages_qs = messages_qs.filter(id__gt=since_id)

        rows = list(messages_qs.order_by("-id")[:limit])
        rows.reverse()
        serializer = ClassroomMessageSerializer(rows, many=True)
        return Response(
            {
                "classroom": EngineeringClassroomSerializer(classroom).data,
                "messages": serializer.data,
                "last_message_id": rows[-1].id if rows else since_id,
            }
        )

    def post(self, request, classroom_id):
        try:
            classroom = EngineeringClassroom.objects.get(id=classroom_id, is_active=True)
        except EngineeringClassroom.DoesNotExist:
            return Response({"error": "Classroom not found"}, status=status.HTTP_404_NOT_FOUND)

        raw_text = str(request.data.get("text") or "").strip()
        if not raw_text:
            return Response({"error": "text is required"}, status=status.HTTP_400_BAD_REQUEST)
        text = " ".join(raw_text.split())
        if len(text) > 1000:
            return Response({"error": "Message is too long"}, status=status.HTTP_400_BAD_REQUEST)

        message = ClassroomMessage.objects.create(
            classroom=classroom,
            sender=request.user,
            text=text,
            is_visible=True,
        )
        return Response(ClassroomMessageSerializer(message).data, status=status.HTTP_201_CREATED)


class ClassroomMessageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, message_id):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        try:
            message = ClassroomMessage.objects.select_related("sender", "classroom").get(id=message_id)
        except ClassroomMessage.DoesNotExist:
            return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)

        updated_fields = []
        if "is_visible" in request.data:
            message.is_visible = _as_bool(request.data.get("is_visible"), True)
            updated_fields.append("is_visible")
        if "text" in request.data:
            next_text = " ".join(str(request.data.get("text") or "").split())
            if not next_text:
                return Response({"error": "text cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            if len(next_text) > 1000:
                return Response({"error": "Message is too long"}, status=status.HTTP_400_BAD_REQUEST)
            message.text = next_text
            updated_fields.append("text")

        if not updated_fields:
            return Response(
                {"error": "Provide at least one field to update"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        message.save(update_fields=sorted(set(updated_fields + ["updated_at"])))
        return Response(ClassroomMessageSerializer(message).data, status=status.HTTP_200_OK)

    def delete(self, request, message_id):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = ClassroomMessage.objects.filter(id=message_id).delete()
        if not deleted:
            return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Message deleted"}, status=status.HTTP_200_OK)
