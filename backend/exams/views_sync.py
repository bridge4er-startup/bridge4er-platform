from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .dropbox_sync import sync_exam_sets_from_dropbox, sync_objective_mcqs_from_dropbox


def _as_bool(value, default=True):
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


class SyncDropboxQuestionBankView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        branch = (request.data.get("branch") or "Civil Engineering").strip() or "Civil Engineering"
        replace_existing = _as_bool(request.data.get("replace_existing"), True)
        sync_objective = _as_bool(request.data.get("sync_objective"), True)
        sync_exam_sets = _as_bool(request.data.get("sync_exam_sets"), True)

        if not sync_objective and not sync_exam_sets:
            return Response(
                {"error": "At least one of sync_objective or sync_exam_sets must be true"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = {
            "branch": branch,
            "replace_existing": replace_existing,
            "errors": [],
        }
        if sync_objective:
            try:
                with transaction.atomic():
                    payload["objective"] = sync_objective_mcqs_from_dropbox(
                        branch=branch,
                        replace_existing=replace_existing,
                    )
            except Exception as exc:
                payload["errors"].append({"scope": "objective", "error": str(exc)})

        if sync_exam_sets:
            try:
                with transaction.atomic():
                    payload["exam_sets"] = sync_exam_sets_from_dropbox(
                        branch=branch,
                        replace_existing=replace_existing,
                    )
            except Exception as exc:
                payload["errors"].append({"scope": "exam_sets", "error": str(exc)})

        if payload["errors"] and "objective" not in payload and "exam_sets" not in payload:
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)
