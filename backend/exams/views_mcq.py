from __future__ import annotations

import hashlib
import json
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Max
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .import_utils import (
    DJANGO_IMPORT_EXPORT_AVAILABLE,
    parse_rows_from_path,
    parse_rows_from_uploaded_file,
)
from .dropbox_sync import auto_sync_dropbox_for_branch
from .models import Chapter, InstitutionFolder, MCQQuestion, Subject
from .path_utils import GENERAL_INSTITUTION, objective_subject_roots, parse_subject_key
from .question_normalizers import normalize_mcq_payload
from .resources import MCQQuestionResource
from .serializers import MCQQuestionPublicSerializer, MCQQuestionSerializer
from storage.dropbox_service import delete_file, list_folder_with_metadata, _is_supabase_provider
from storage.dropbox_backup import sanitize_filename, upload_file_to_dropbox
from storage.models import FileMetadata

if DJANGO_IMPORT_EXPORT_AVAILABLE:
    from tablib import Dataset


DEMO_OBJECTIVE_QUESTIONS = [
    {
        "question_header": "Beam Shear Basics",
        "question_text": "For a simply supported beam carrying a central point load, where is shear force maximum?",
        "option_a": "At mid-span",
        "option_b": "At supports",
        "option_c": "At one-third span",
        "option_d": "Uniform throughout",
        "correct_option": "b",
        "explanation": "Shear force peaks at the supports for this loading condition.",
        "question_image_url": "https://via.placeholder.com/640x280?text=Beam+Shear+Diagram",
    },
    {
        "question_header": "Concrete Mix",
        "question_text": "Which factor most directly increases concrete workability?",
        "option_a": "Higher water-cement ratio",
        "option_b": "Lower fine aggregate",
        "option_c": "Lower curing time",
        "option_d": "Reduced slump",
        "correct_option": "a",
        "explanation": "Increasing water-cement ratio generally improves workability.",
        "question_image_url": "",
    },
    {
        "question_header": "Surveying",
        "question_text": "The reduced level of a point is measured relative to:",
        "option_a": "Magnetic north",
        "option_b": "Benchmark datum",
        "option_c": "Instrument axis",
        "option_d": "Chain line",
        "correct_option": "b",
        "explanation": "Reduced level is referenced from a known benchmark datum.",
        "question_image_url": "",
    },
    {
        "question_header": "Fluid Mechanics",
        "question_text": "In Bernoulli's equation, velocity head is represented by:",
        "option_a": "p/gamma",
        "option_b": "z",
        "option_c": "v^2/2g",
        "option_d": "hf",
        "correct_option": "c",
        "explanation": "Velocity head term is v^2/2g.",
        "question_image_url": "",
    },
    {
        "question_header": "Transportation",
        "question_text": "Which test is commonly used to determine bitumen consistency?",
        "option_a": "Compaction test",
        "option_b": "Penetration test",
        "option_c": "Cube test",
        "option_d": "Sieve analysis",
        "correct_option": "b",
        "explanation": "Penetration test is a standard consistency measure for bitumen.",
        "question_image_url": "",
    },
]


def _auto_sync_cooldown_seconds():
    value = getattr(settings, "DROPBOX_AUTO_SYNC_COOLDOWN_SECONDS", 600)
    try:
        return max(60, int(value))
    except (TypeError, ValueError):
        return 600


AUTO_SYNC_COOLDOWN_SECONDS = _auto_sync_cooldown_seconds()

def _dropbox_auto_sync_enabled():
    return bool(getattr(settings, "DROPBOX_AUTO_SYNC_ENABLED", False))

def _objective_cache_ttl_seconds():
    value = getattr(settings, "OBJECTIVE_LIST_CACHE_TTL_SECONDS", 300)
    try:
        return max(60, int(value))
    except (TypeError, ValueError):
        return 300

OBJECTIVE_LIST_CACHE_TTL_SECONDS = _objective_cache_ttl_seconds()

def _objective_cache_key(prefix, *parts):
    seed = "|".join([str(part or "") for part in parts])
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return f"exams:objective:{prefix}:{digest}"


def _normalize_question_payload(raw):
    """Normalize question keys so imports accept simple CSV/JSON/Excel headers."""
    return normalize_mcq_payload(raw)


def _read_questions_from_file(uploaded_file):
    rows = parse_rows_from_uploaded_file(uploaded_file)
    return [_normalize_question_payload(item) for item in rows]


def _read_questions_from_path(file_path):
    rows = parse_rows_from_path(file_path)
    return [_normalize_question_payload(item) for item in rows]


def _import_questions_with_resource(chapter, normalized_questions):
    resource = MCQQuestionResource()
    dataset = Dataset(
        headers=[
            "id",
            "chapter_id",
            "question_header",
            "question_text",
            "question_image_url",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option",
            "explanation",
        ]
    )
    skipped_rows = 0
    for q_data in normalized_questions:
        if not q_data["question_text"] or q_data["correct_option"] not in {"a", "b", "c", "d"}:
            skipped_rows += 1
            continue
        dataset.append(
            [
                q_data.get("id") or "",
                chapter.id,
                q_data["question_header"],
                q_data["question_text"],
                q_data["question_image_url"],
                q_data["option_a"],
                q_data["option_b"],
                q_data["option_c"],
                q_data["option_d"],
                q_data["correct_option"],
                q_data["explanation"],
            ]
        )

    if len(dataset) == 0:
        return {
            "new": 0,
            "updated": 0,
            "imported": 0,
            "skipped": skipped_rows,
            "error_rows": 0,
        }

    result = resource.import_data(dataset, dry_run=False, raise_errors=False, use_transactions=True)
    totals = getattr(result, "totals", {}) or {}
    new_rows = int(totals.get("new", 0))
    updated_rows = int(totals.get("update", 0))
    error_rows = int(totals.get("error", 0))

    return {
        "new": new_rows,
        "updated": updated_rows,
        "imported": new_rows + updated_rows,
        "skipped": skipped_rows + int(totals.get("skip", 0)),
        "error_rows": error_rows,
    }


def _ensure_demo_questions(chapter):
    if MCQQuestion.objects.filter(chapter=chapter).exists():
        return

    for index, item in enumerate(DEMO_OBJECTIVE_QUESTIONS, start=1):
        MCQQuestion.objects.create(
            chapter=chapter,
            question_header=item["question_header"] or f"Demo Question {index}",
            question_text=item["question_text"],
            option_a=item["option_a"],
            option_b=item["option_b"],
            option_c=item["option_c"],
            option_d=item["option_d"],
            correct_option=item["correct_option"],
            explanation=item["explanation"],
            question_image_url=item["question_image_url"],
        )


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _is_staff_user(user):
    return bool(user and user.is_authenticated and user.is_staff)


def _objective_dropbox_subject_root(branch, subject_name):
    parsed = parse_subject_key(subject_name)
    if parsed.get("institution_path"):
        return f"/bridge4er/{branch}/Objective MCQs/{parsed['institution_path']}/{parsed['subject_name']}"
    return f"/bridge4er/{branch}/Objective MCQs/Subjects/{parsed['subject_name']}"


def _backup_objective_chapter_file(chapter, uploaded_file):
    subject = chapter.subject
    root = _objective_dropbox_subject_root(subject.branch, subject.name)
    extension = Path(str(getattr(uploaded_file, "name", "") or "")).suffix or ".json"
    safe_name = sanitize_filename(chapter.name, fallback=f"Chapter-{chapter.id}")
    file_name = f"{safe_name}{extension}"
    dropbox_path = f"{root}/{file_name}"
    upload_file_to_dropbox(dropbox_path, uploaded_file)
    return dropbox_path


def _maybe_sync_objective_on_read(branch, user, force_refresh=False):
    # Allow auto-sync when using Supabase storage or when Dropbox auto-sync is enabled.
    if not _dropbox_auto_sync_enabled() and not _is_supabase_provider():
        return {"status": "skipped", "reason": "disabled"}
    if not _is_staff_user(user) and not force_refresh:
        return {"status": "skipped", "reason": "non_staff"}
    allowed_force_refresh = bool(force_refresh and _is_staff_user(user))
    cooldown = 5 if allowed_force_refresh else AUTO_SYNC_COOLDOWN_SECONDS
    return auto_sync_dropbox_for_branch(
        branch=branch,
        sync_objective=True,
        sync_exam_sets=False,
        replace_existing=True,
        cooldown_seconds=cooldown,
    )


def _is_not_found_error(exc):
    lowered = str(exc).lower()
    return "not_found" in lowered or "path_lookup/not_found" in lowered


def _objective_subject_root_paths(branch, subject_name):
    return objective_subject_roots(branch, subject_name)


def _normalized_lookup_token(value):
    return " ".join(str(value or "").strip().split()).lower()


def _resolve_subject_record(branch, subject_value):
    token = str(subject_value or "").strip()
    if not token:
        return None

    queryset = Subject.objects.filter(branch=branch)

    if token.isdigit():
        by_id = queryset.filter(id=int(token)).first()
        if by_id:
            return by_id

    by_exact = queryset.filter(name=token).first() or queryset.filter(name__iexact=token).first()
    if by_exact:
        return by_exact

    normalized_token = _normalized_lookup_token(token)
    for row in queryset.values("id", "name"):
        row_name = str(row.get("name") or "")
        if _normalized_lookup_token(row_name) == normalized_token:
            return Subject.objects.filter(id=row["id"]).first()

        parsed = parse_subject_key(row_name)
        if _normalized_LOOKUP_TOKEN(parsed.get("subject_name")) == normalized_token:
            return Subject.objects.filter(id=row["id"]).first()

    return None


def _resolve_chapter_record(subject_obj, chapter_value):
    token = str(chapter_value or "").strip()
    if not token:
        return None

    queryset = Chapter.objects.filter(subject=subject_obj)
    if token.isdigit():
        by_id = queryset.filter(id=int(token)).first()
        if by_id:
            return by_id

    by_exact = queryset.filter(name=token).first() or queryset.filter(name__iexact=token).first()
    if by_exact:
        return by_exact

    normalized_token = _normalized_lookup_token(token)
    for row in queryset.values("id", "name"):
        row_name = str(row.get("name") or "")
        if _normalized_LOOKUP_TOKEN(row_name) == normalized_token:
            return queryset.filter(id=row["id"]).first()

    return None


def _list_matching_chapter_paths(branch, subject_name, chapter_name):
    normalized_chapter = str(chapter_name or "").strip().lower()
    if not normalized_chapter:
        return []

    matches = set()
    for subject_root in _objective_subject_root_paths(branch, subject_name):
        try:
            entries = list_folder_with_metadata(subject_root, include_dirs=True, recursive=True)
        except Exception as exc:
            if _is_not_found_error(exc):
                continue
            raise
        for entry in entries:
            entry_path = str(entry.get("path") or "").strip()
            if not entry_path:
                continue
            entry_name = Path(entry_path).name
            if entry.get("is_dir"):
                if entry_name.strip().lower() == normalized_chapter:
                    matches.add(entry_path)
                continue
            if Path(entry_name).stem.strip().lower() == normalized_chapter:
                matches.add(entry_path)
    return sorted(matches)


def _ensure_institution_folder(branch, scope, folder_key, display_name=""):
    clean_key = str(folder_key or "").strip() or GENERAL_INSTITUTION
    defaults = {"display_name": str(display_name or "").strip()[:255] or clean_key}
    folder, created = InstitutionFolder.objects.get_or_create(
        branch=branch,
        scope=scope,
        folder_key=clean_key,
        defaults=defaults,
    )
    if not created and defaults["display_name"] and not folder.display_name:
        folder.display_name = defaults["display_name"]
        folder.save(update_fields=["display_name", "updated_at"])
    return folder


class SubjectListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branch = request.GET.get("branch", "Civil Engineering")
        force_refresh = _as_bool(request.GET.get("refresh"), False)
        if not _is_staff_user(request.user):
            force_refresh = False

        cache_key = _objective_cache_key("subjects", branch)
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)

        _maybe_sync_objective_on_read(branch=branch, user=request.user, force_refresh=force_refresh)
        folder_rows = (
            InstitutionFolder.objects.filter(
                branch=branch,
                scope=InstitutionFolder.SCOPE_OBJECTIVE,
                is_active=True,
            )
            .order_by("display_order", "folder_key", "id")
            .values("folder_key", "display_name", "display_order")
        )
        folder_map = {
            str(row.get("folder_key") or "").strip().lower(): row
            for row in folder_rows
            if str(row.get("folder_key") or "").strip()
        }

        records = []
        subjects = Subject.objects.filter(branch=branch).order_by("display_order", "name", "id")
        for subject in subjects.values("id", "name", "display_order"):
            meta = parse_subject_key(subject.get("name", ""))
            institution_key = str(meta.get("institution_key") or GENERAL_INSTITUTION).strip() or GENERAL_INSTITUTION
            folder_row = folder_map.get(institution_key.lower())
            institution_display = meta.get("institution_display") or GENERAL_INSTITUTION
            institution_order = 0
            if folder_row:
                institution_display = str(folder_row.get("display_name") or folder_row.get("folder_key") or institution_display)
                institution_order = int(folder_row.get("display_order") or 0)
            records.append(
                {
                    "id": subject.get("id"),
                    "name": subject.get("name"),
                    "display_name": meta.get("subject_name") or subject.get("name"),
                    "display_order": int(subject.get("display_order") or 0),
                    "institution": institution_display,
                    "institution_key": institution_key,
                    "institution_order": institution_order,
                }
            )
        records.sort(
            key=lambda item: (
                int(item.get("institution_order") or 0),
                (item.get("institution") or "").lower(),
                int(item.get("display_order") or 0),
                (item.get("display_name") or "").lower(),
                int(item.get("id") or 0),
            )
        )
        cache.set(cache_key, records, timeout=OBJECTIVE_LIST_CACHE_TTL_SECONDS)
        return Response(records)


class ChapterListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject):
        branch = request.GET.get("branch", "Civil Engineering")
        force_refresh = _as_bool(request.GET.get("refresh"), False)
        if not _is_staff_user(request.user):
            force_refresh = False

        cache_key = _objective_cache_key("chapters", branch, subject)
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)

        _maybe_sync_objective_on_read(branch=branch, user=request.user, force_refresh=force_refresh)
        subject_obj = _resolve_subject_record(branch=branch, subject_value=subject)
        if not subject_obj:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)

        chapters = (
            Chapter.objects.filter(subject=subject_obj)
            .order_by("order", "name", "id")
            .values("id", "name", "small_note", "order")
        )
        payload = list(chapters)
        cache.set(cache_key, payload, timeout=OBJECTIVE_LIST_CACHE_TTL_SECONDS)
        return Response(payload)


class QuestionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject, chapter):
        branch = request.GET.get("branch", "Civil Engineering")
        force_refresh = _as_bool(request.GET.get("refresh"), False)
        if not _is_staff_user(request.user):
            force_refresh = False

        try:
            page = max(1, int(request.GET.get("page", 1)))
        except ValueError:
            page = 1

        try:
            requested_page_size = int(request.GET.get("page_size", 5))
        except ValueError:
            requested_page_size = 5

        page_size = max(5, min(requested_page_size, 50))

        cache_key = _objective_cache_key("questions", branch, subject, chapter, page, page_size)
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)

        _maybe_sync_objective_on_read(branch=branch, user=request.user, force_refresh=force_refresh)

        subject_obj = _resolve_subject_record(branch=branch, subject_value=subject)
        if not subject_obj:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)

        chapter_obj = _resolve_chapter_record(subject_obj=subject_obj, chapter_value=chapter)
        if not chapter_obj:
            return Response({"error": "Chapter not found"}, status=status.HTTP_404_NOT_FOUND)

        _ensure_demo_questions(chapter_obj)
        questions_qs = MCQQuestion.objects.filter(chapter=chapter_obj).order_by("id")

        total = questions_qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        question_items = questions_qs[start:end]
        serializer = MCQQuestionPublicSerializer(question_items, many=True)

        total_pages = (total + page_size - 1) // page_size if total else 1
        payload = {
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "results": serializer.data,
        }
        cache.set(cache_key, payload, timeout=OBJECTIVE_LIST_CACHE_TTL_SECONDS)
        return Response(payload)


class QuestionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, question_id):
        try:
            question = MCQQuestion.objects.get(id=question_id)
            serializer = MCQQuestionPublicSerializer(question)
            return Response(serializer.data)
        except MCQQuestion.DoesNotExist:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, question_id):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        try:
            question = MCQQuestion.objects.get(id=question_id)
        except MCQQuestion.DoesNotExist:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)

        editable_fields = [
            "question_header",
            "question_text",
            "question_image_url",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option",
            "explanation",
        ]
        for field in editable_fields:
            if field not in request.data:
                continue
            value = request.data.get(field)
            if field == "correct_option":
                value = (value or "").lower().strip()
            setattr(question, field, value)
        question.save()
        return Response(MCQQuestionSerializer(question).data)

    def delete(self, request, question_id):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = MCQQuestion.objects.filter(id=question_id).delete()
        if not deleted:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Question deleted successfully"})


class SubmitAnswerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        question_id = request.data.get("question_id")
        selected_option = (request.data.get("selected_option") or "").lower().strip()

        if not question_id or selected_option not in {"a", "b", "c", "d"}:
            return Response(
                {"error": "question_id and valid selected_option (a/b/c/d) required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            question = MCQQuestion.objects.get(id=question_id)
            is_correct = selected_option == question.correct_option.lower()

            return Response(
                {
                    "locked": True,
                    "is_correct": is_correct,
                    "selected_option": selected_option,
                    "correct_option": question.correct_option,
                    "explanation": question.explanation,
                    "saved": False,
                    "options": {
                        "a": question.option_a,
                        "b": question.option_b,
                        "c": question.option_c,
                        "d": question.option_d,
                    },
                }
            )
        except MCQQuestion.DoesNotExist:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)


class CreateQuestionView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        chapter_id = request.data.get("chapter_id")
        if not chapter_id:
            return Response({"error": "chapter_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            chapter = Chapter.objects.get(id=chapter_id)
            question = MCQQuestion.objects.create(
                chapter=chapter,
                question_header=(request.data.get("question_header") or "").strip(),
                question_text=request.data.get("question_text", ""),
                question_image_url=(request.data.get("question_image_url") or "").strip(),
                option_a=request.data.get("option_a", ""),
                option_b=request.data.get("option_b", ""),
                option_c=request.data.get("option_c", ""),
                option_d=request.data.get("option_d", ""),
                correct_option=(request.data.get("correct_option") or "").lower(),
                explanation=request.data.get("explanation", ""),
            )
            serializer = MCQQuestionSerializer(question)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Chapter.DoesNotExist:
            return Response({"error": "Chapter not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class CreateSubjectView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        branch = request.data.get("branch", "Civil Engineering")
        name = request.data.get("name")
        raw_display_order = request.data.get("display_order")
        if not name:
            return Response({"error": "name required"}, status=status.HTTP_400_BAD_REQUEST)

        parsed = parse_subject_key(name)
        institution_key = parsed.get("institution_key") or GENERAL_INSTITUTION
        institution_display = parsed.get("institution_display") or GENERAL_INSTITUTION
        _ensure_institution_folder(
            branch=branch,
            scope=InstitutionFolder.SCOPE_OBJECTIVE,
            folder_key=institution_key,
            display_name=institution_display,
        )

        defaults = {}
        if raw_display_order is not None:
            try:
                defaults["display_order"] = int(raw_display_order)
            except (TypeError, ValueError):
                return Response({"error": "display_order must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        subject, created = Subject.objects.get_or_create(name=name, branch=branch, defaults=defaults)
        if not created and raw_display_order is not None and subject.display_order != defaults["display_order"]:
            subject.display_order = defaults["display_order"]
            subject.save(update_fields=["display_order"])

        return Response(
            {
                "id": subject.id,
                "name": subject.name,
                "branch": subject.branch,
                "display_order": subject.display_order,
            },
            status=status.HTTP_201_CREATED,
        )


class CreateChapterView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        subject_id = request.data.get("subject_id")
