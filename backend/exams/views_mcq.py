from __future__ import annotations

import json

from django.db import transaction
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
from .models import Chapter, MCQQuestion, QuestionAttempt, Subject
from .question_normalizers import normalize_mcq_payload
from .resources import MCQQuestionResource
from .serializers import MCQQuestionPublicSerializer, MCQQuestionSerializer

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


class SubjectListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branch = request.GET.get("branch", "Civil Engineering")
        auto_sync_dropbox_for_branch(
            branch=branch,
            sync_objective=True,
            sync_exam_sets=False,
            replace_existing=True,
            cooldown_seconds=60,
        )
        subjects = Subject.objects.filter(branch=branch).values("id", "name")
        return Response(list(subjects))


class ChapterListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject):
        branch = request.GET.get("branch", "Civil Engineering")
        auto_sync_dropbox_for_branch(
            branch=branch,
            sync_objective=True,
            sync_exam_sets=False,
            replace_existing=True,
            cooldown_seconds=60,
        )
        try:
            subject_obj = Subject.objects.get(name=subject, branch=branch)
            chapters = Chapter.objects.filter(subject=subject_obj).values("id", "name")
            return Response(list(chapters))
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)


class QuestionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject, chapter):
        branch = request.GET.get("branch", "Civil Engineering")
        auto_sync_dropbox_for_branch(
            branch=branch,
            sync_objective=True,
            sync_exam_sets=False,
            replace_existing=True,
            cooldown_seconds=60,
        )

        try:
            page = max(1, int(request.GET.get("page", 1)))
        except ValueError:
            page = 1

        try:
            requested_page_size = int(request.GET.get("page_size", 5))
        except ValueError:
            requested_page_size = 5

        page_size = max(5, min(requested_page_size, 50))

        try:
            subject_obj = Subject.objects.get(name=subject, branch=branch)
            chapter_obj = Chapter.objects.get(name=chapter, subject=subject_obj)

            _ensure_demo_questions(chapter_obj)
            questions_qs = MCQQuestion.objects.filter(chapter=chapter_obj).order_by("id")

            total = questions_qs.count()
            start = (page - 1) * page_size
            end = start + page_size
            question_items = questions_qs[start:end]
            serializer = MCQQuestionPublicSerializer(question_items, many=True)

            total_pages = (total + page_size - 1) // page_size if total else 1
            return Response(
                {
                    "count": total,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": total_pages,
                    "results": serializer.data,
                }
            )
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)
        except Chapter.DoesNotExist:
            return Response({"error": "Chapter not found"}, status=status.HTTP_404_NOT_FOUND)


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

            if request.user and request.user.is_authenticated:
                QuestionAttempt.objects.update_or_create(
                    user=request.user,
                    question=question,
                    defaults={
                        "selected_option": selected_option,
                        "is_correct": is_correct,
                    },
                )

            return Response(
                {
                    "locked": True,
                    "is_correct": is_correct,
                    "selected_option": selected_option,
                    "correct_option": question.correct_option,
                    "explanation": question.explanation,
                    "saved": bool(request.user and request.user.is_authenticated),
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
        if not name:
            return Response({"error": "name required"}, status=status.HTTP_400_BAD_REQUEST)

        subject, _ = Subject.objects.get_or_create(name=name, branch=branch)
        return Response(
            {"id": subject.id, "name": subject.name, "branch": subject.branch},
            status=status.HTTP_201_CREATED,
        )


class CreateChapterView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        subject_id = request.data.get("subject_id")
        name = request.data.get("name")
        order = request.data.get("order", 0)

        if not subject_id or not name:
            return Response(
                {"error": "subject_id and name required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            subject = Subject.objects.get(id=subject_id)
            chapter = Chapter.objects.create(subject=subject, name=name, order=order)
            return Response({"id": chapter.id, "name": chapter.name}, status=status.HTTP_201_CREATED)
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)


class BulkUploadQuestionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        chapter_id = request.data.get("chapter_id")
        upload_file = request.FILES.get("questions_file")
        file_path = request.data.get("file_path")
        questions_data = request.data.get("questions")

        if not chapter_id:
            return Response({"error": "chapter_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            chapter = Chapter.objects.get(id=chapter_id)

            if upload_file:
                normalized_questions = _read_questions_from_file(upload_file)
            elif file_path:
                normalized_questions = _read_questions_from_path(file_path)
            else:
                if isinstance(questions_data, str):
                    questions_data = json.loads(questions_data)
                if not isinstance(questions_data, list):
                    return Response(
                        {"error": "Provide questions_file, file_path, or a questions list"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                normalized_questions = [_normalize_question_payload(item) for item in questions_data]

            if DJANGO_IMPORT_EXPORT_AVAILABLE and MCQQuestionResource is not None:
                summary = _import_questions_with_resource(chapter, normalized_questions)
                return Response(
                    {
                        "message": f"Imported {summary['imported']} questions",
                        "summary": summary,
                    },
                    status=status.HTTP_201_CREATED,
                )

            created_questions = []
            with transaction.atomic():
                for q_data in normalized_questions:
                    if not q_data["question_text"] or q_data["correct_option"] not in {"a", "b", "c", "d"}:
                        continue

                    question = MCQQuestion.objects.create(
                        chapter=chapter,
                        question_header=q_data["question_header"],
                        question_text=q_data["question_text"],
                        question_image_url=q_data["question_image_url"],
                        option_a=q_data["option_a"],
                        option_b=q_data["option_b"],
                        option_c=q_data["option_c"],
                        option_d=q_data["option_d"],
                        correct_option=q_data["correct_option"],
                        explanation=q_data["explanation"],
                    )
                    created_questions.append(MCQQuestionSerializer(question).data)

            return Response(
                {
                    "message": f"Created {len(created_questions)} questions",
                    "questions": created_questions,
                },
                status=status.HTTP_201_CREATED,
            )
        except Chapter.DoesNotExist:
            return Response({"error": "Chapter not found"}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class UserProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject, chapter):
        branch = request.GET.get("branch", "Civil Engineering")

        try:
            subject_obj = Subject.objects.get(name=subject, branch=branch)
            chapter_obj = Chapter.objects.get(name=chapter, subject=subject_obj)

            total_questions = MCQQuestion.objects.filter(chapter=chapter_obj).count()
            correct_answers = QuestionAttempt.objects.filter(
                user=request.user,
                question__chapter=chapter_obj,
                is_correct=True,
            ).count()

            return Response(
                {
                    "total_questions": total_questions,
                    "correct_answers": correct_answers,
                    "percentage": (correct_answers / total_questions * 100) if total_questions > 0 else 0,
                }
            )
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)
        except Chapter.DoesNotExist:
            return Response({"error": "Chapter not found"}, status=status.HTTP_404_NOT_FOUND)
