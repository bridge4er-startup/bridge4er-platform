from rest_framework import serializers
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
    ProblemReport,
)


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'branch']


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

    class Meta:
        model = ExamSet
        fields = [
            'id',
            'name',
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
