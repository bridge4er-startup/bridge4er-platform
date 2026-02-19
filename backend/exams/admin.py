from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from .import_utils import DJANGO_IMPORT_EXPORT_AVAILABLE
from .models import (
    Chapter,
    ExamAttempt,
    ExamPurchase,
    ExamQuestion,
    ExamSet,
    MCQQuestion,
    ProblemReport,
    QuestionAttempt,
    Subject,
    SubjectiveSubmission,
)
from .resources import ExamQuestionResource, MCQQuestionResource

if DJANGO_IMPORT_EXPORT_AVAILABLE:
    from import_export.admin import ImportExportModelAdmin
else:
    ImportExportModelAdmin = admin.ModelAdmin


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "branch", "created_at")
    list_filter = ("branch",)
    search_fields = ("name", "branch")


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "order")
    list_filter = ("subject__branch",)
    search_fields = ("name", "subject__name")


@admin.register(MCQQuestion)
class MCQQuestionAdmin(ImportExportModelAdmin):
    list_display = ("id", "chapter", "question_header", "correct_option", "created_at")
    list_filter = ("chapter__subject__branch", "chapter__subject__name")
    search_fields = ("question_header", "question_text")
    if DJANGO_IMPORT_EXPORT_AVAILABLE and MCQQuestionResource is not None:
        resource_class = MCQQuestionResource


class ExamQuestionInline(admin.TabularInline):
    model = ExamQuestion
    extra = 1


@admin.register(ExamSet)
class ExamSetAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "branch", "exam_type", "is_free", "fee", "duration_seconds", "is_active")
    list_filter = ("branch", "exam_type", "is_free", "is_active")
    search_fields = ("name", "branch")
    inlines = [ExamQuestionInline]


@admin.register(ExamQuestion)
class ExamQuestionAdmin(ImportExportModelAdmin):
    list_display = ("id", "exam_set", "order", "question_header", "marks")
    list_filter = ("exam_set__branch", "exam_set__exam_type")
    search_fields = ("question_header", "question_text", "exam_set__name")
    if DJANGO_IMPORT_EXPORT_AVAILABLE and ExamQuestionResource is not None:
        resource_class = ExamQuestionResource


@admin.register(ExamPurchase)
class ExamPurchaseAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "exam_type", "set_name", "payment_gateway", "amount", "purchased_at")
    list_filter = ("payment_gateway", "exam_type")
    search_fields = ("user__username", "set_name")


@admin.register(ExamAttempt)
class ExamAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "exam_name", "score", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__username", "exam_name")


@admin.register(QuestionAttempt)
class QuestionAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "question", "selected_option", "is_correct", "attempted_at")
    list_filter = ("is_correct", "attempted_at")
    search_fields = ("user__username", "question__question_text")


@admin.register(SubjectiveSubmission)
class SubjectiveSubmissionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student_identity",
        "exam_set",
        "email",
        "mobile_number",
        "status",
        "score",
        "submitted_at",
        "reviewed_at",
    )
    list_filter = ("status", "exam_set__branch", "submitted_at", "reviewed_at")
    search_fields = ("user__username", "email", "mobile_number", "exam_set__name")
    readonly_fields = ("submitted_at", "reviewed_at", "answer_sheet_link")
    fieldsets = (
        (
            "Submission Details",
            {
                "fields": (
                    "user",
                    "exam_set",
                    "email",
                    "mobile_number",
                    "answer_sheet_link",
                    "submitted_at",
                )
            },
        ),
        (
            "Evaluation (Admin)",
            {"fields": ("status", "score", "feedback", "reviewed_at")},
        ),
    )

    @admin.display(description="Student")
    def student_identity(self, obj):
        full_name = (getattr(obj.user, "full_name", "") or "").strip()
        if full_name:
            return f"{full_name} ({obj.user.username})"
        return obj.user.username

    @admin.display(description="Answer PDF")
    def answer_sheet_link(self, obj):
        if obj.answer_pdf:
            return format_html(
                '<a href="{}" target="_blank" rel="noopener noreferrer">Open submitted PDF</a>',
                obj.answer_pdf.url,
            )
        return "No file uploaded"

    def save_model(self, request, obj, form, change):
        if obj.status in {"reviewed", "rejected"} and not obj.reviewed_at:
            obj.reviewed_at = timezone.now()
        if obj.status == "pending":
            obj.reviewed_at = None
            obj.score = None
        super().save_model(request, obj, form, change)


@admin.register(ProblemReport)
class ProblemReportAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reporter",
        "branch",
        "section",
        "issue_type",
        "status",
        "created_at",
        "solved_at",
    )
    list_filter = ("status", "issue_type", "branch", "created_at")
    search_fields = ("description", "question_reference", "reporter__username", "admin_note")
    readonly_fields = ("created_at", "updated_at", "solved_at")
    actions = ("mark_as_solved", "mark_as_pending")

    @admin.action(description="Mark selected reports as solved")
    def mark_as_solved(self, request, queryset):
        now = timezone.now()
        queryset.update(status="solved", solved_at=now)

    @admin.action(description="Mark selected reports as pending")
    def mark_as_pending(self, request, queryset):
        queryset.update(status="pending", solved_at=None)
