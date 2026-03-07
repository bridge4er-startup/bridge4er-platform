from rest_framework import serializers

from .path_utils import parse_exam_source_path
from .models import (
    Subject,
    Chapter,
    MCQQuestion,
    QuestionAttempt,
    ExamAttempt,
    ExamSet,
    ExamQuestion,
    SubjectiveSubmission,
    ExamPurchase,
    InstitutionFolder,
    ProblemReport,
)


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'branch', 'display_order']


class ChapterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chapter
        fields = ['id', 'name', 'subject', 'order', 'small_note']


class MCQQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MCQQuestion
        fields = [
            'id',
            'chapter',
            'question_header',
            'question_text',
            'question_image_url',
            'option_a',
            'option_b',
            'option_c',
            'option_d',
            'correct_option',
            'explanation',
            'created_at',
            'updated_at'
        ]


class MCQQuestionPublicSerializer(serializers.ModelSerializer):
    """Serializer without showing correct answer"""
    options = serializers.SerializerMethodField()

    def get_options(self, obj):
        return {
            'a': obj.option_a,
            'b': obj.option_b,
            'c': obj.option_c,
            'd': obj.option_d,
        }

    class Meta:
        model = MCQQuestion
        fields = ['id', 'chapter', 'question_header', 'question_text', 'question_image_url', 'options']


class QuestionAttemptSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source='question.question_text', read_only=True)

    class Meta:
        model = QuestionAttempt
        fields = ['id', 'question', 'question_text', 'selected_option', 'is_correct', 'attempted_at']


class ExamAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamAttempt
        fields = [
            'id',
            'user',
            'exam_set',
            'exam_name',
            'score',
            'total_questions',
            'correct_answers',
            'wrong_answers',
            'unanswered',
            'answers_json',
            'created_at',
        ]


class ExamQuestionSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()

    def get_options(self, obj):
        if obj.exam_set.exam_type != 'mcq':
            return None
        return {
            'a': obj.option_a,
            'b': obj.option_b,
            'c': obj.option_c,
            'd': obj.option_d,
        }

    class Meta:
        model = ExamQuestion
        fields = [
            'id',
            'order',
            'question_header',
            'question_text',
            'question_image_url',
            'options',
            'marks',
            'explanation',
        ]


class ExamSetSerializer(serializers.ModelSerializer):
    is_unlocked = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    total_marks = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    institution = serializers.SerializerMethodField()
    institution_key = serializers.SerializerMethodField()
    institution_order = serializers.SerializerMethodField()
    folder_path = serializers.SerializerMethodField()
    folder_parts = serializers.SerializerMethodField()
    folder_display_parts = serializers.SerializerMethodField()
    topic_path = serializers.SerializerMethodField()
    source_file_name = serializers.SerializerMethodField()

    def _source_meta(self, obj):
        source_path = getattr(obj, "source_file_path", "") or ""
        if not getattr(obj, "managed_by_sync", False) or not source_path.lower().startswith("/bridge4er/"):
            return {
                "relative_parts": [],
                "folder_parts": [],
                "folder_path": "",
                "institution": "General",
                "topic_path": "",
                "source_name": "",
            }
        return parse_exam_source_path(
            source_file_path=source_path,
            branch=getattr(obj, "branch", ""),
            exam_type=getattr(obj, "exam_type", ""),
        )

    def _institution_scope(self, obj):
        if getattr(obj, "exam_type", "") == "subjective":
            return InstitutionFolder.SCOPE_EXAM_SUBJECTIVE
        return InstitutionFolder.SCOPE_EXAM_MCQ

    def _institution_row(self, obj):
        branch = getattr(obj, "branch", "")
        scope = self._institution_scope(obj)
        cache_key = f"{branch}::{scope}"
        if not hasattr(self, "_institution_cache"):
            self._institution_cache = {}
        if cache_key not in self._institution_cache:
            rows = (
                InstitutionFolder.objects.filter(branch=branch, scope=scope, is_active=True)
                .values("folder_key", "display_name", "display_order")
            )
            normalized = {}
            for row in rows:
                folder_key = str(row.get("folder_key") or "").strip()
                if not folder_key:
                    continue
                normalized[folder_key.lower()] = row
            self._institution_cache[cache_key] = normalized

        institution_key = str(self._source_meta(obj).get("institution") or "General").strip()
        return self._institution_cache.get(cache_key, {}).get(institution_key.lower())

    def get_question_count(self, obj):
        return obj.questions.count()

    def get_total_marks(self, obj):
        return int(sum((question.marks or 0) for question in obj.questions.all()))

    def get_is_unlocked(self, obj):
        if obj.is_free:
            return True
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return ExamPurchase.objects.filter(user=request.user, exam_set=obj).exists()

    def get_display_name(self, obj):
        source_name = self._source_meta(obj).get("source_name")
        return source_name or obj.name

    def get_institution(self, obj):
        default_value = self._source_meta(obj).get("institution") or "General"
        row = self._institution_row(obj)
        if not row:
            return default_value
        return str(row.get("display_name") or row.get("folder_key") or default_value)

    def get_institution_key(self, obj):
        return self._source_meta(obj).get("institution") or "General"

    def get_institution_order(self, obj):
        row = self._institution_row(obj)
        if not row:
            return 0
        return int(row.get("display_order") or 0)

    def get_folder_path(self, obj):
        return self._source_meta(obj).get("folder_path")

    def get_folder_parts(self, obj):
        return self._source_meta(obj).get("folder_parts") or []

    def get_folder_display_parts(self, obj):
        parts = list(self._source_meta(obj).get("folder_parts") or [])
        if not parts:
            return parts
        row = self._institution_row(obj)
        if not row:
            return parts
        parts[0] = str(row.get("display_name") or row.get("folder_key") or parts[0])
        return parts

    def get_topic_path(self, obj):
        return self._source_meta(obj).get("topic_path")

    def get_source_file_name(self, obj):
        source_name = self._source_meta(obj).get("source_name")
        return source_name or obj.name

    class Meta:
        model = ExamSet
        fields = [
            'id',
            'name',
            'display_name',
            'branch',
            'exam_type',
            'description',
            'instructions',
            'is_free',
            'fee',
            'duration_seconds',
            'grace_seconds',
            'negative_marking',
            'is_active',
            'question_count',
            'total_marks',
            'is_unlocked',
            'institution',
            'folder_path',
            'folder_parts',
            'topic_path',
            'source_file_path',
            'source_file_name',
            'institution_key',
            'institution_order',
            'folder_display_parts',
            'display_order',
            'created_at',
            'updated_at',
        ]


class ExamSetDetailSerializer(ExamSetSerializer):
    questions = ExamQuestionSerializer(many=True, read_only=True)

    class Meta(ExamSetSerializer.Meta):
        fields = ExamSetSerializer.Meta.fields + ['questions']


class SubjectiveSubmissionSerializer(serializers.ModelSerializer):
    student_username = serializers.CharField(source='user.username', read_only=True)
    student_name = serializers.SerializerMethodField()
    exam_set_name = serializers.CharField(source='exam_set.name', read_only=True)
    file_url = serializers.SerializerMethodField()
    max_marks = serializers.SerializerMethodField()

    def get_student_name(self, obj):
        full_name = getattr(obj.user, 'full_name', '') or ''
        return full_name.strip() or obj.user.username

    def get_file_url(self, obj):
        if obj.answer_pdf:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.answer_pdf.url)
            return obj.answer_pdf.url
        return ''

    def get_max_marks(self, obj):
        if not obj.exam_set_id:
            return None
        return int(sum((question.marks or 0) for question in obj.exam_set.questions.all()))

    class Meta:
        model = SubjectiveSubmission
        fields = [
            'id',
            'student_username',
            'student_name',
            'exam_set',
            'exam_set_name',
            'email',
            'mobile_number',
            'status',
            'score',
            'max_marks',
            'feedback',
            'reviewed_at',
            'submitted_at',
            'file_url',
        ]


class ProblemReportSerializer(serializers.ModelSerializer):
    reporter_name = serializers.SerializerMethodField()
    reporter_username = serializers.CharField(source="reporter.username", read_only=True)

    def get_reporter_name(self, obj):
        user = getattr(obj, "reporter", None)
        if not user:
            return "Anonymous"
        full_name = str(getattr(user, "full_name", "") or "").strip()
        return full_name or user.username

    class Meta:
        model = ProblemReport
        fields = [
            "id",
            "reporter",
            "reporter_name",
            "reporter_username",
            "branch",
            "section",
            "issue_type",
            "question_reference",
            "description",
            "status",
            "admin_note",
            "solved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reporter",
            "status",
            "admin_note",
            "solved_at",
            "created_at",
            "updated_at",
        ]
