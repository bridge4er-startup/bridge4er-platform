from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ProblemReport
from .serializers import ProblemReportSerializer


class ProblemReportListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)

        status_filter = str(request.query_params.get("status") or "").strip().lower()
        queryset = ProblemReport.objects.select_related("reporter")
        if status_filter in {"pending", "solved"}:
            queryset = queryset.filter(status=status_filter)
        serializer = ProblemReportSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        description = str(request.data.get("description") or "").strip()
        if not description:
            return Response({"error": "description is required"}, status=status.HTTP_400_BAD_REQUEST)

        issue_type = str(request.data.get("issue_type") or "other").strip().lower()
        if issue_type not in {"question_error", "answer_error", "technical_bug", "other"}:
            issue_type = "other"

        report = ProblemReport.objects.create(
            reporter=request.user,
            branch=str(request.data.get("branch") or "Civil Engineering").strip() or "Civil Engineering",
            section=str(request.data.get("section") or "").strip(),
            issue_type=issue_type,
            question_reference=str(request.data.get("question_reference") or "").strip(),
            description=description,
        )
        serializer = ProblemReportSerializer(report, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProblemReportAdminDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, report_id):
        try:
            report = ProblemReport.objects.get(id=report_id)
        except ProblemReport.DoesNotExist:
            return Response({"error": "Report not found"}, status=status.HTTP_404_NOT_FOUND)

        next_status = str(request.data.get("status") or report.status).strip().lower()
        if next_status not in {"pending", "solved"}:
            return Response({"error": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)

        report.status = next_status
        report.admin_note = str(request.data.get("admin_note") or report.admin_note or "").strip()
        report.solved_at = timezone.now() if next_status == "solved" else None
        report.save(update_fields=["status", "admin_note", "solved_at", "updated_at"])
        serializer = ProblemReportSerializer(report, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, report_id):
        try:
            report = ProblemReport.objects.get(id=report_id)
        except ProblemReport.DoesNotExist:
            return Response({"error": "Report not found"}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
