from __future__ import annotations

from decimal import Decimal, InvalidOperation
import json

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .import_utils import (
    DJANGO_IMPORT_EXPORT_AVAILABLE,
    parse_rows_from_path,
    parse_rows_from_uploaded_file,
)
from .exam_file_metadata import build_exam_set_update_payload, extract_exam_rows_and_metadata
from .dropbox_sync import auto_sync_dropbox_for_branch
from .models import (
    ExamAttempt,
    ExamPurchase,
    ExamQuestion,
    ExamSet,
    QuestionAttempt,
    SubjectiveSubmission,
)
from .question_normalizers import normalize_exam_question_payload
from .resources import ExamQuestionResource
from .serializers import ExamQuestionSerializer, ExamSetSerializer, SubjectiveSubmissionSerializer

if DJANGO_IMPORT_EXPORT_AVAILABLE:
    from tablib import Dataset


DEMO_MCQ_QUESTIONS = [
    {
        "order": 1,
        "question_header": "Strength of Materials",
        "question_text": "The SI unit of stress is:",
        "option_a": "N",
        "option_b": "Pa",
        "option_c": "J",
        "option_d": "W",
        "correct_option": "b",
        "explanation": "Stress = Force/Area, so SI unit is Pascal.",
        "question_image_url": "",
    },
    {
        "order": 2,
        "question_header": "Structural Analysis",
        "question_text": "For a simply supported beam, the bending moment at supports is:",
        "option_a": "Maximum positive",
        "option_b": "Maximum negative",
        "option_c": "Zero",
        "option_d": "Infinite",
        "correct_option": "c",
        "explanation": "Support moments are zero for a simply supported beam.",
        "question_image_url": "",
    },
    {
        "order": 3,
        "question_header": "Hydraulics",
        "question_text": "Flow in a pipe is laminar when Reynolds number is roughly:",
        "option_a": "< 2000",
        "option_b": "> 4000",
        "option_c": "2000-4000 only",
        "option_d": "Always turbulent",
        "correct_option": "a",
        "explanation": "Laminar flow generally occurs at Reynolds number below 2000.",
        "question_image_url": "",
    },
    {
        "order": 4,
        "question_header": "Transportation",
        "question_text": "A common test for aggregate toughness is:",
        "option_a": "Abrasion test",
        "option_b": "Impact test",
        "option_c": "Slump test",
        "option_d": "Vicat test",
        "correct_option": "b",
        "explanation": "Aggregate impact test indicates toughness.",
        "question_image_url": "",
    },
    {
        "order": 5,
        "question_header": "RCC",
        "question_text": "Minimum cover in RCC helps primarily to:",
        "option_a": "Increase weight",
        "option_b": "Reduce workability",
        "option_c": "Protect reinforcement",
        "option_d": "Reduce strength",
        "correct_option": "c",
        "explanation": "Concrete cover protects steel from corrosion and fire.",
        "question_image_url": "",
    },
]

DEMO_SUBJECTIVE_QUESTIONS = [
    {
        "order": 1,
        "question_header": "Design Question",
        "question_text": "Design a singly reinforced concrete beam for a given loading case and explain assumptions.",
        "marks": 20,
    },
    {
        "order": 2,
        "question_header": "Analysis Question",
        "question_text": "Explain the method of virtual work with one practical example from structural engineering.",
        "marks": 15,
    },
    {
        "order": 3,
        "question_header": "Theory Question",
        "question_text": "Discuss the causes of settlement in foundations and preventive measures.",
        "marks": 15,
    },
]


def _ensure_demo_exam_sets(branch: str, exam_type: str | None = None):
    def _create_mcq_sets():
        if ExamSet.objects.filter(branch=branch, exam_type="mcq").exists():
            return

        free_set = ExamSet.objects.create(
            name="MCQ Demo Free Set",
            branch=branch,
            exam_type="mcq",
            description="Free demo MCQ set for quick practice.",
            instructions="Answer all questions carefully. Once submitted, review is available instantly.",
            is_free=True,
            fee=Decimal("0"),
            duration_seconds=1800,
            grace_seconds=60,
            negative_marking=Decimal("0.25"),
            is_active=True,
            managed_by_sync=False,
        )
        paid_set = ExamSet.objects.create(
            name="MCQ Premium Mock Set",
            branch=branch,
            exam_type="mcq",
            description="Premium full-length MCQ mock with timer and negative marking.",
            instructions="Read each question carefully. Timer can go negative for a short grace period.",
            is_free=False,
            fee=Decimal("199.00"),
            duration_seconds=2700,
            grace_seconds=120,
            negative_marking=Decimal("0.25"),
            is_active=True,
            managed_by_sync=False,
        )

        for target_set in (free_set, paid_set):
            for q in DEMO_MCQ_QUESTIONS:
                ExamQuestion.objects.create(
                    exam_set=target_set,
                    order=q["order"],
                    question_header=q["question_header"],
                    question_text=q["question_text"],
                    question_image_url=q["question_image_url"],
                    option_a=q["option_a"],
                    option_b=q["option_b"],
                    option_c=q["option_c"],
                    option_d=q["option_d"],
                    correct_option=q["correct_option"],
                    explanation=q["explanation"],
                    marks=1,
                )

    def _create_subjective_sets():
        if ExamSet.objects.filter(branch=branch, exam_type="subjective").exists():
            return

        free_set = ExamSet.objects.create(
            name="Subjective Demo Free Set",
            branch=branch,
            exam_type="subjective",
            description="Free subjective practice set with PDF submission.",
            instructions="Upload a single PDF containing all answers. Include clear page numbers.",
            is_free=True,
            fee=Decimal("0"),
            duration_seconds=10800,
            grace_seconds=120,
            negative_marking=Decimal("0"),
            is_active=True,
            managed_by_sync=False,
        )
        paid_set = ExamSet.objects.create(
            name="Subjective Premium Review Set",
            branch=branch,
            exam_type="subjective",
            description="Paid subjective set with manual review and scoring.",
            instructions="Upload PDF answer sheet with your mobile number and email for score reporting.",
            is_free=False,
            fee=Decimal("299.00"),
            duration_seconds=10800,
            grace_seconds=300,
            negative_marking=Decimal("0"),
            is_active=True,
            managed_by_sync=False,
        )

        for target_set in (free_set, paid_set):
            for q in DEMO_SUBJECTIVE_QUESTIONS:
                ExamQuestion.objects.create(
                    exam_set=target_set,
                    order=q["order"],
                    question_header=q["question_header"],
                    question_text=q["question_text"],
                    marks=q["marks"],
                )

    if exam_type in (None, "mcq"):
        _create_mcq_sets()
    if exam_type in (None, "subjective"):
        _create_subjective_sets()


def _maybe_seed_demo_exam_sets(branch: str, exam_type: str | None = None):
    if not getattr(settings, "ENABLE_DEMO_EXAM_SETS", settings.DEBUG):
        return
    _ensure_demo_exam_sets(branch, exam_type)


def _is_unlocked_for_user(exam_set: ExamSet, user) -> bool:
    if exam_set.is_free:
        return True
    if not user or not user.is_authenticated:
        return False
    return ExamPurchase.objects.filter(user=user, exam_set=exam_set).exists()


def _notify_subjective_submission(submission: SubjectiveSubmission):
    admin_email = getattr(settings, "ADMIN_ALERT_EMAIL", "") or getattr(settings, "DEFAULT_FROM_EMAIL", "")
    if not admin_email:
        return
    subject = f"Bridge4ER Subjective Submission: {submission.exam_set.name if submission.exam_set else 'Unknown Set'}"
    message = (
        f"Student: {submission.user.username}\n"
        f"Full Name: {getattr(submission.user, 'full_name', '')}\n"
        f"Email: {submission.email or submission.user.email}\n"
        f"Mobile: {submission.mobile_number}\n"
        f"Exam Set: {submission.exam_set.name if submission.exam_set else 'N/A'}\n"
        f"Submitted At: {submission.submitted_at}\n"
    )
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@bridge4er.local"),
            recipient_list=[admin_email],
            fail_silently=True,
        )
    except Exception:
        # Email alert is optional and must not block exam submission.
        pass


def _parse_exam_from_legacy_path(path: str):
    parts = [p for p in (path or "").split("/") if p]
    branch = parts[1] if len(parts) >= 2 else "Civil Engineering"
    set_name = parts[-1] if parts else ""
    return branch, set_name


def _duration_to_label(duration_seconds: int) -> str:
    seconds = int(duration_seconds or 0)
    if seconds <= 0:
        return "1 Hour"
    if seconds % 3600 == 0:
        hours = seconds // 3600
        return f"{hours} Hour" if hours == 1 else f"{hours} Hours"
    if seconds % 60 == 0:
        return f"{seconds // 60} Minutes"
    return f"{seconds} Seconds"


def _legacy_mcq_payload(exam_set: ExamSet):
    total_marks = int(sum((question.marks or 0) for question in exam_set.questions.all()))
    questions = []
    for q in exam_set.questions.all():
        questions.append(
            {
                "id": str(q.id),
                "questionHeader": q.question_header,
                "question": q.question_text,
                "questionImageUrl": q.question_image_url,
                "options": [q.option_a, q.option_b, q.option_c, q.option_d],
                "correctAnswer": q.correct_option,
                "explanation": q.explanation,
            }
        )
    return {
        "examInfo": {
            "title": exam_set.name,
            "subtitle": exam_set.branch,
            "date": " ",
            "time": _duration_to_label(exam_set.duration_seconds),
            "paper": " ",
            "subject": exam_set.branch,
            "fullMarks": str(total_marks or 100),
            "ispaid": "False" if exam_set.is_free else "True",
            "price": f"NPR. {exam_set.fee}",
            "duration": exam_set.duration_seconds,
            "graceSeconds": exam_set.grace_seconds,
            "negativeMarking": float(exam_set.negative_marking),
            "instructions": exam_set.instructions,
            "description": exam_set.description,
            "examSetId": exam_set.id,
        },
        "questions": questions,
    }


def _legacy_subjective_payload(exam_set: ExamSet):
    total_marks = int(sum((question.marks or 0) for question in exam_set.questions.all()))
    questions = []
    for q in exam_set.questions.all():
        questions.append(
            {
                "id": q.id,
                "header": q.question_header,
                "question": q.question_text,
                "marks": q.marks,
            }
        )
    return {
        "examInfo": {
            "title": exam_set.name,
            "subtitle": exam_set.description.splitlines()[0] if exam_set.description else exam_set.branch,
            "date": " ",
            "time": _duration_to_label(exam_set.duration_seconds),
            "paper": " ",
            "subject": exam_set.branch,
            "fullMarks": str(total_marks or 100),
            "ispaid": "False" if exam_set.is_free else "True",
            "price": f"NPR. {exam_set.fee}",
            "duration": exam_set.duration_seconds,
            "graceSeconds": exam_set.grace_seconds,
            "instructions": exam_set.instructions,
            "description": exam_set.description,
            "examSetId": exam_set.id,
        },
        "questions": questions,
    }


def _normalize_exam_question_payload(raw, exam_type):
    return normalize_exam_question_payload(raw, exam_type)


def _read_exam_questions_file(uploaded_file, exam_type):
    rows = parse_rows_from_uploaded_file(uploaded_file)
    raw_rows, exam_info, instructions = extract_exam_rows_and_metadata(rows)
    normalized_rows = [_normalize_exam_question_payload(item, exam_type) for item in raw_rows]
    return normalized_rows, exam_info, instructions


def _read_exam_questions_path(file_path, exam_type):
    rows = parse_rows_from_path(file_path)
    raw_rows, exam_info, instructions = extract_exam_rows_and_metadata(rows)
    normalized_rows = [_normalize_exam_question_payload(item, exam_type) for item in raw_rows]
    return normalized_rows, exam_info, instructions


def _import_exam_questions_with_resource(exam_set, normalized_rows):
    resource = ExamQuestionResource()
    dataset = Dataset(
        headers=[
            "id",
            "exam_set_id",
            "order",
            "question_header",
            "question_text",
            "question_image_url",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option",
            "explanation",
            "marks",
        ]
    )
    skipped_rows = 0
    for row in normalized_rows:
        if not row["question_text"]:
            skipped_rows += 1
            continue
        if exam_set.exam_type == "mcq" and row.get("correct_option") not in {"a", "b", "c", "d"}:
            skipped_rows += 1
            continue

        dataset.append(
            [
                row.get("id") or "",
                exam_set.id,
                max(1, row["order"]),
                row["question_header"],
                row["question_text"],
                row["question_image_url"],
                row.get("option_a", ""),
                row.get("option_b", ""),
                row.get("option_c", ""),
                row.get("option_d", ""),
                row.get("correct_option") or None,
                row["explanation"],
                max(1, row["marks"]),
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


class ExamSetListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branch = request.GET.get("branch", "Civil Engineering")
        exam_type = request.GET.get("exam_type")
        if exam_type and exam_type not in {"mcq", "subjective"}:
            return Response({"error": "Invalid exam_type"}, status=status.HTTP_400_BAD_REQUEST)

        auto_sync_dropbox_for_branch(
            branch=branch,
            sync_objective=False,
            sync_exam_sets=True,
            replace_existing=True,
            cooldown_seconds=60,
        )
        _maybe_seed_demo_exam_sets(branch, exam_type)

        queryset = ExamSet.objects.filter(branch=branch, is_active=True)
        if exam_type:
            queryset = queryset.filter(exam_type=exam_type)

        serializer = ExamSetSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)


class CreateExamSetView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        exam_type = request.data.get("exam_type")
        if exam_type not in {"mcq", "subjective"}:
            return Response({"error": "exam_type must be mcq or subjective"}, status=status.HTTP_400_BAD_REQUEST)

        default_payload = build_exam_set_update_payload(
            exam_type=exam_type,
            fallback_name=request.data.get("name", ""),
            exam_info=request.data,
            instructions=request.data.get("instructions"),
        )

        explicit_ispaid = request.data.get("ispaid")
        if explicit_ispaid is not None:
            is_free = str(explicit_ispaid).lower() not in {"1", "true", "yes"}
        else:
            is_free = str(request.data.get("is_free", str(default_payload["is_free"]))).lower() in {"1", "true", "yes"}

        fee_default = default_payload.get("fee", Decimal("50"))
        try:
            fee = Decimal(str(request.data.get("fee", request.data.get("price", fee_default))))
        except Exception:
            fee = Decimal(str(fee_default))

        exam_set = ExamSet.objects.create(
            name=(request.data.get("name", default_payload["name"]) or "").strip() or default_payload["name"],
            branch=request.data.get("branch", "Civil Engineering"),
            exam_type=exam_type,
            description=request.data.get("description", default_payload["description"]),
            instructions=request.data.get("instructions", default_payload["instructions"]),
            is_free=is_free,
            fee=Decimal("0") if is_free else fee,
            duration_seconds=int(request.data.get("duration_seconds", default_payload["duration_seconds"])),
            grace_seconds=int(request.data.get("grace_seconds", default_payload["grace_seconds"])),
            negative_marking=Decimal(str(request.data.get("negative_marking", default_payload["negative_marking"]))),
            is_active=True,
            managed_by_sync=False,
        )

        serializer = ExamSetSerializer(exam_set, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ExamSetImportQuestionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, set_id):
        uploaded_file = request.FILES.get("file")
        file_path = request.data.get("file_path")
        replace_existing = str(request.data.get("replace_existing", "true")).lower() in {"1", "true", "yes"}
        if not uploaded_file and not file_path:
            return Response({"error": "file or file_path is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exam_set = ExamSet.objects.get(id=set_id)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            if uploaded_file:
                rows, exam_info, instructions = _read_exam_questions_file(uploaded_file, exam_set.exam_type)
            else:
                rows, exam_info, instructions = _read_exam_questions_path(file_path, exam_set.exam_type)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            set_updates = build_exam_set_update_payload(
                exam_type=exam_set.exam_type,
                fallback_name=exam_set.name,
                exam_info=exam_info,
                instructions=instructions,
            )
            desired_name = set_updates.get("name") or exam_set.name
            update_fields = []
            for field_name, field_value in set_updates.items():
                if field_name == "name":
                    continue
                setattr(exam_set, field_name, field_value)
                update_fields.append(field_name)

            has_name_conflict = (
                ExamSet.objects.filter(
                    name=desired_name,
                    branch=exam_set.branch,
                    exam_type=exam_set.exam_type,
                )
                .exclude(id=exam_set.id)
                .exists()
            )
            if desired_name and not has_name_conflict and exam_set.name != desired_name:
                exam_set.name = desired_name
                update_fields.append("name")

            if update_fields:
                exam_set.save(update_fields=sorted(set(update_fields)))

            if replace_existing:
                exam_set.questions.all().delete()

            if DJANGO_IMPORT_EXPORT_AVAILABLE and ExamQuestionResource is not None:
                summary = _import_exam_questions_with_resource(exam_set, rows)
                return Response(
                    {
                        "message": f"Imported {summary['imported']} questions",
                        "exam_set_id": exam_set.id,
                        "summary": summary,
                    }
                )

            created = 0
            for row in rows:
                if not row["question_text"]:
                    continue
                if exam_set.exam_type == "mcq" and row.get("correct_option") not in {"a", "b", "c", "d"}:
                    continue

                ExamQuestion.objects.create(
                    exam_set=exam_set,
                    order=max(1, row["order"]),
                    question_header=row["question_header"],
                    question_text=row["question_text"],
                    question_image_url=row["question_image_url"],
                    option_a=row.get("option_a", ""),
                    option_b=row.get("option_b", ""),
                    option_c=row.get("option_c", ""),
                    option_d=row.get("option_d", ""),
                    correct_option=row.get("correct_option") or None,
                    explanation=row["explanation"],
                    marks=max(1, row["marks"]),
                )
                created += 1

        return Response({"message": f"Imported {created} questions", "exam_set_id": exam_set.id})


class ExamSetDetailAdminView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request, set_id):
        try:
            exam_set = ExamSet.objects.get(id=set_id)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ExamSetSerializer(exam_set, context={"request": request})
        payload = serializer.data
        payload["questions"] = ExamQuestionSerializer(exam_set.questions.all(), many=True).data
        return Response(payload)

    def patch(self, request, set_id):
        try:
            exam_set = ExamSet.objects.get(id=set_id)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)

        editable_fields = {
            "name",
            "description",
            "instructions",
            "is_free",
            "fee",
            "duration_seconds",
            "grace_seconds",
            "negative_marking",
            "is_active",
            "branch",
        }
        updates = {}
        for field in editable_fields:
            if field in request.data:
                updates[field] = request.data.get(field)

        if "is_free" in updates:
            updates["is_free"] = str(updates["is_free"]).lower() in {"1", "true", "yes"}
        if "duration_seconds" in updates:
            updates["duration_seconds"] = int(updates["duration_seconds"])
        if "grace_seconds" in updates:
            updates["grace_seconds"] = int(updates["grace_seconds"])
        if "negative_marking" in updates:
            updates["negative_marking"] = Decimal(str(updates["negative_marking"]))
        if "fee" in updates:
            updates["fee"] = Decimal(str(updates["fee"]))
        if updates.get("is_free") is True:
            updates["fee"] = Decimal("0")

        for key, value in updates.items():
            setattr(exam_set, key, value)
        exam_set.save()

        serializer = ExamSetSerializer(exam_set, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, set_id):
        deleted, _ = ExamSet.objects.filter(id=set_id).delete()
        if not deleted:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Exam set deleted successfully."})


class ExamSetQuestionAdminView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, set_id):
        try:
            exam_set = ExamSet.objects.get(id=set_id)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)

        question_text = (request.data.get("question_text") or "").strip()
        if not question_text:
            return Response({"error": "question_text is required"}, status=status.HTTP_400_BAD_REQUEST)

        question = ExamQuestion.objects.create(
            exam_set=exam_set,
            order=int(request.data.get("order", exam_set.questions.count() + 1)),
            question_header=request.data.get("question_header", ""),
            question_text=question_text,
            question_image_url=request.data.get("question_image_url", ""),
            option_a=request.data.get("option_a", ""),
            option_b=request.data.get("option_b", ""),
            option_c=request.data.get("option_c", ""),
            option_d=request.data.get("option_d", ""),
            correct_option=(request.data.get("correct_option") or "").lower() or None,
            explanation=request.data.get("explanation", ""),
            marks=max(1, int(request.data.get("marks", 1))),
        )
        return Response(ExamQuestionSerializer(question).data, status=status.HTTP_201_CREATED)


class ExamSetQuestionDetailAdminView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def patch(self, request, question_id):
        try:
            question = ExamQuestion.objects.get(id=question_id)
        except ExamQuestion.DoesNotExist:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)

        editable_fields = [
            "order",
            "question_header",
            "question_text",
            "question_image_url",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option",
            "explanation",
            "marks",
        ]
        for field in editable_fields:
            if field not in request.data:
                continue
            value = request.data.get(field)
            if field == "order":
                value = int(value)
            elif field == "marks":
                value = max(1, int(value))
            elif field == "correct_option":
                value = (value or "").lower().strip() or None
            setattr(question, field, value)
        question.save()
        return Response(ExamQuestionSerializer(question).data)

    def delete(self, request, question_id):
        deleted, _ = ExamQuestion.objects.filter(id=question_id).delete()
        if not deleted:
            return Response({"error": "Question not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"message": "Question deleted successfully."})


class StartExamSetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, set_id):
        try:
            exam_set = ExamSet.objects.get(id=set_id, is_active=True)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _is_unlocked_for_user(exam_set, request.user):
            return Response(
                {"error": "Payment required to unlock this set"},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

        questions = []
        for q in exam_set.questions.all():
            item = {
                "id": q.id,
                "order": q.order,
                "question_header": q.question_header,
                "question_text": q.question_text,
                "question_image_url": q.question_image_url,
                "marks": q.marks,
            }
            if exam_set.exam_type == "mcq":
                item["options"] = {
                    "a": q.option_a,
                    "b": q.option_b,
                    "c": q.option_c,
                    "d": q.option_d,
                }
            questions.append(item)

        return Response(
            {
                "id": exam_set.id,
                "name": exam_set.name,
                "branch": exam_set.branch,
                "exam_type": exam_set.exam_type,
                "description": exam_set.description,
                "instructions": exam_set.instructions,
                "duration_seconds": exam_set.duration_seconds,
                "grace_seconds": exam_set.grace_seconds,
                "negative_marking": float(exam_set.negative_marking),
                "is_free": exam_set.is_free,
                "fee": float(exam_set.fee),
                "questions": questions,
            }
        )


class SubmitExamSetView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, set_id):
        try:
            exam_set = ExamSet.objects.get(id=set_id, is_active=True)
        except ExamSet.DoesNotExist:
            return Response({"error": "Exam set not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _is_unlocked_for_user(exam_set, request.user):
            return Response({"error": "Payment required to unlock this set"}, status=status.HTTP_402_PAYMENT_REQUIRED)

        if exam_set.exam_type != "mcq":
            return Response({"error": "Submit endpoint is only for MCQ exam sets"}, status=status.HTTP_400_BAD_REQUEST)

        answers = request.data.get("answers") or {}
        if not isinstance(answers, dict):
            return Response({"error": "answers must be an object"}, status=status.HTTP_400_BAD_REQUEST)

        total_questions = exam_set.questions.count()
        correct = 0
        wrong = 0
        unanswered = 0
        score = Decimal("0")
        negative = Decimal(str(exam_set.negative_marking))
        review = []

        for q in exam_set.questions.all():
            selected = answers.get(str(q.id))
            if selected is None:
                selected = answers.get(q.id)
            selected = (selected or "").lower().strip()

            if selected not in {"a", "b", "c", "d"}:
                unanswered += 1
                review.append(
                    {
                        "question_id": q.id,
                        "question_header": q.question_header,
                        "question_text": q.question_text,
                        "selected_option": None,
                        "correct_option": q.correct_option,
                        "is_correct": False,
                        "explanation": q.explanation,
                    }
                )
                continue

            if selected == (q.correct_option or "").lower():
                correct += 1
                score += Decimal(str(q.marks))
                is_correct = True
            else:
                wrong += 1
                score -= negative
                is_correct = False

            review.append(
                {
                    "question_id": q.id,
                    "question_header": q.question_header,
                    "question_text": q.question_text,
                    "selected_option": selected,
                    "correct_option": q.correct_option,
                    "is_correct": is_correct,
                    "explanation": q.explanation,
                }
            )

        attempt_id = None
        submitted_at = timezone.now()
        if request.user and request.user.is_authenticated:
            attempt = ExamAttempt.objects.create(
                user=request.user,
                exam_set=exam_set,
                exam_name=exam_set.name,
                score=float(round(score, 2)),
                total_questions=total_questions,
                correct_answers=correct,
                wrong_answers=wrong,
                unanswered=unanswered,
                answers_json=answers,
            )
            attempt_id = attempt.id
            submitted_at = attempt.created_at

        leaderboard_rows = (
            ExamAttempt.objects.filter(exam_set=exam_set)
            .select_related("user")
            .order_by("-score", "created_at")[:10]
        )
        leaderboard = [
            {
                "rank": idx + 1,
                "student_name": row.user.full_name or row.user.username,
                "score": row.score,
                "submitted_at": row.created_at,
            }
            for idx, row in enumerate(leaderboard_rows)
        ]

        return Response(
            {
                "attempt_id": attempt_id,
                "exam_set_id": exam_set.id,
                "score": float(round(score, 2)),
                "total_questions": total_questions,
                "correct_answers": correct,
                "wrong_answers": wrong,
                "unanswered": unanswered,
                "review": review,
                "submitted_at": submitted_at,
                "leaderboard": leaderboard,
            }
        )


class LoadMCQExam(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        path = request.GET.get("path", "")
        branch, set_name = _parse_exam_from_legacy_path(path)
        _maybe_seed_demo_exam_sets(branch, "mcq")

        exam_set = ExamSet.objects.filter(branch=branch, exam_type="mcq", name=set_name, is_active=True).first()
        if not exam_set:
            exam_set = ExamSet.objects.filter(branch=branch, exam_type="mcq", is_active=True).first()
        if not exam_set:
            return Response({"error": "No MCQ set available"}, status=status.HTTP_404_NOT_FOUND)
        if not _is_unlocked_for_user(exam_set, request.user):
            return Response({"error": "Payment required to unlock this set"}, status=status.HTTP_402_PAYMENT_REQUIRED)
        return Response(_legacy_mcq_payload(exam_set))


class SubmitMCQExam(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        answers = request.data.get("answers") or {}
        correct_answers = request.data.get("correct_answers") or {}
        negative = Decimal(str(request.data.get("negative_marking", "0.25")))

        score = Decimal("0")
        for qid, selected in answers.items():
            if selected == correct_answers.get(qid):
                score += Decimal("1")
            else:
                score -= negative

        ExamAttempt.objects.create(
            user=request.user,
            exam_name=request.data.get("exam_name", "Legacy MCQ Exam"),
            score=float(round(score, 2)),
        )
        return Response({"score": float(round(score, 2))})


class LoadSubjectiveExam(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        path = request.GET.get("path", "")
        branch, set_name = _parse_exam_from_legacy_path(path)
        _maybe_seed_demo_exam_sets(branch, "subjective")

        exam_set = ExamSet.objects.filter(
            branch=branch,
            exam_type="subjective",
            name=set_name,
            is_active=True,
        ).first()
        if not exam_set:
            exam_set = ExamSet.objects.filter(branch=branch, exam_type="subjective", is_active=True).first()
        if not exam_set:
            return Response({"error": "No subjective set available"}, status=status.HTTP_404_NOT_FOUND)
        if not _is_unlocked_for_user(exam_set, request.user):
            return Response({"error": "Payment required to unlock this set"}, status=status.HTTP_402_PAYMENT_REQUIRED)
        return Response(_legacy_subjective_payload(exam_set))


class LoadExam(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        path = request.GET.get("path", "")
        if "subjective" in (path or "").lower():
            return LoadSubjectiveExam().get(request)
        return LoadMCQExam().get(request)


class SubmitExam(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        exam_set_id = request.data.get("exam_set_id")
        exam_set = None
        if exam_set_id:
            exam_set = ExamSet.objects.filter(id=exam_set_id).first()

        attempt = ExamAttempt.objects.create(
            user=request.user,
            exam_set=exam_set,
            exam_name=request.data.get("exam_name", "Exam"),
            score=request.data.get("score", 0),
            total_questions=request.data.get("total_questions", 0),
            correct_answers=request.data.get("correct_answers", 0),
            wrong_answers=request.data.get("wrong_answers", 0),
            unanswered=request.data.get("unanswered", 0),
            answers_json=request.data.get("answers", {}) or {},
        )
        return Response({"status": "Saved", "attempt_id": attempt.id})


class UploadSubjective(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "file is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.name.lower().endswith(".pdf"):
            return Response({"error": "Only PDF files are allowed"}, status=status.HTTP_400_BAD_REQUEST)

        branch = request.data.get("branch", "Civil Engineering")
        set_name = request.data.get("exam", "")
        email = request.data.get("email", "")
        mobile = request.data.get("mobile_number") or request.data.get("mobile") or ""

        _maybe_seed_demo_exam_sets(branch, "subjective")
        exam_set = ExamSet.objects.filter(branch=branch, exam_type="subjective", name=set_name, is_active=True).first()
        if not exam_set:
            exam_set = ExamSet.objects.filter(branch=branch, exam_type="subjective", is_active=True).first()
        if exam_set and not _is_unlocked_for_user(exam_set, request.user):
            return Response({"error": "Payment required to unlock this set"}, status=status.HTTP_402_PAYMENT_REQUIRED)

        submission = SubjectiveSubmission.objects.create(
            user=request.user,
            exam_set=exam_set,
            answer_pdf=file_obj,
            email=email,
            mobile_number=mobile,
            file_path=f"legacy:{file_obj.name}",
            status="pending",
        )
        _notify_subjective_submission(submission)
        return Response({"message": "Uploaded", "submission_id": submission.id})


class SubmitSubjective(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return UploadSubjective().post(request)


class SubjectiveSubmissionCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)
        queryset = SubjectiveSubmission.objects.select_related("user", "exam_set").order_by("-submitted_at")
        status_filter = request.query_params.get("status")
        if status_filter in {"pending", "reviewed", "rejected"}:
            queryset = queryset.filter(status=status_filter)
        serializer = SubjectiveSubmissionSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        file_obj = request.FILES.get("file")
        exam_set_id = request.data.get("exam_set_id")
        email = request.data.get("email", "")
        mobile = request.data.get("mobile_number") or request.data.get("mobile") or ""

        if not file_obj or not exam_set_id:
            return Response({"error": "exam_set_id and file are required"}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.name.lower().endswith(".pdf"):
            return Response({"error": "Only PDF files are allowed"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exam_set = ExamSet.objects.get(id=exam_set_id, exam_type="subjective")
        except ExamSet.DoesNotExist:
            return Response({"error": "Subjective exam set not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _is_unlocked_for_user(exam_set, request.user):
            return Response({"error": "Payment required to unlock this set"}, status=status.HTTP_402_PAYMENT_REQUIRED)

        submission = SubjectiveSubmission.objects.create(
            user=request.user,
            exam_set=exam_set,
            answer_pdf=file_obj,
            email=email,
            mobile_number=mobile,
            file_path=f"api:{file_obj.name}",
            status="pending",
        )
        _notify_subjective_submission(submission)
        serializer = SubjectiveSubmissionSerializer(submission, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MySubjectiveSubmissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = SubjectiveSubmission.objects.filter(user=request.user).select_related("exam_set")
        serializer = SubjectiveSubmissionSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)


class ReviewSubjectiveSubmissionView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, submission_id):
        try:
            submission = SubjectiveSubmission.objects.get(id=submission_id)
        except SubjectiveSubmission.DoesNotExist:
            return Response({"error": "Submission not found"}, status=status.HTTP_404_NOT_FOUND)

        status_value = request.data.get("status", "pending")
        if status_value not in {"reviewed", "rejected", "pending"}:
            return Response({"error": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)

        score_input = request.data.get("score", request.data.get("marks"))
        score_value = None
        if score_input not in (None, ""):
            try:
                score_decimal = Decimal(str(score_input))
            except (InvalidOperation, TypeError, ValueError):
                return Response({"error": "Score must be a valid number"}, status=status.HTTP_400_BAD_REQUEST)
            if score_decimal < 0:
                return Response({"error": "Score cannot be negative"}, status=status.HTTP_400_BAD_REQUEST)
            score_value = float(round(score_decimal, 2))

        if score_value is not None:
            # Marks imply reviewed status.
            status_value = "reviewed"

        if status_value == "reviewed" and score_value is None:
            return Response({"error": "Score is required when status is reviewed"}, status=status.HTTP_400_BAD_REQUEST)

        if score_value is not None and submission.exam_set_id:
            max_marks = int(sum((question.marks or 0) for question in submission.exam_set.questions.all()))
            if max_marks > 0 and score_value > max_marks:
                return Response(
                    {"error": f"Score cannot exceed total marks ({max_marks})"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        feedback_value = str(request.data.get("feedback", "")).strip()

        if status_value == "pending":
            score_value = None

        submission.status = status_value
        submission.score = score_value
        submission.feedback = feedback_value
        submission.reviewed_at = None if status_value == "pending" else timezone.now()
        submission.save(update_fields=["status", "score", "feedback", "reviewed_at"])
        serializer = SubjectiveSubmissionSerializer(submission, context={"request": request})
        return Response(serializer.data)


class UserAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        attempts = ExamAttempt.objects.filter(user=request.user)
        purchases = ExamPurchase.objects.filter(user=request.user)
        subjective_submissions = SubjectiveSubmission.objects.filter(user=request.user)
        question_attempts = QuestionAttempt.objects.filter(user=request.user)

        summary = {
            "total_attempts": attempts.count(),
            "average_score": float(attempts.aggregate(avg=Avg("score"))["avg"] or 0),
            "best_score": float(attempts.order_by("-score").values_list("score", flat=True).first() or 0),
            "total_purchased_sets": purchases.count(),
            "subjective_submissions": subjective_submissions.count(),
            "reviewed_subjective_submissions": subjective_submissions.filter(status="reviewed").count(),
        }

        total_q_attempts = question_attempts.count()
        correct_q_attempts = question_attempts.filter(is_correct=True).count()
        summary["objective_accuracy_percent"] = round(
            (correct_q_attempts / total_q_attempts * 100) if total_q_attempts else 0,
            2,
        )

        history = [
            {
                "id": row["id"],
                "exam_name": row["exam_name"],
                "score": row["score"],
                "created_at": row["created_at"],
            }
            for row in attempts.values("id", "exam_name", "score", "created_at")[:10]
        ]

        gateway_breakdown = list(
            purchases.values("payment_gateway")
            .annotate(total=Count("id"))
            .order_by("-total")
        )

        subjective_status = list(
            subjective_submissions.values("status")
            .annotate(total=Count("id"))
            .order_by("-total")
        )

        trend_rows = list(
            attempts.order_by("created_at").values("created_at", "score")[:20]
        )
        score_trend = [
            {
                "label": row["created_at"].strftime("%d %b"),
                "score": float(row["score"]),
            }
            for row in trend_rows
        ]

        profile = {
            "full_name": getattr(request.user, "full_name", "") or request.user.username,
            "mobile_number": getattr(request.user, "mobile_number", ""),
            "username": request.user.username,
            "email": request.user.email,
            "field_of_study": getattr(request.user, "field_of_study", ""),
            "date_joined": request.user.date_joined,
        }

        return Response(
            {
                "profile": profile,
                "summary": summary,
                "recent_attempts": history,
                "score_trend": score_trend,
                "payment_gateway_breakdown": gateway_breakdown,
                "subjective_status_breakdown": subjective_status,
            }
        )
