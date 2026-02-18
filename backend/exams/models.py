from django.db import models
from django.conf import settings
from django.utils import timezone

class Subject(models.Model):
    name = models.CharField(max_length=200)
    branch = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('name', 'branch')

    def __str__(self):
        return f"{self.branch} - {self.name}"


class Chapter(models.Model):
    name = models.CharField(max_length=200)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='chapters')
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.subject.name} - {self.name}"


class MCQQuestion(models.Model):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='questions')
    question_header = models.CharField(max_length=255, blank=True)
    question_text = models.TextField()
    question_image_url = models.URLField(blank=True)
    option_a = models.CharField(max_length=500)
    option_b = models.CharField(max_length=500)
    option_c = models.CharField(max_length=500)
    option_d = models.CharField(max_length=500)
    correct_option = models.CharField(max_length=1, choices=[('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')])
    explanation = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.question_text[:50]


class ExamSet(models.Model):
    EXAM_TYPE_CHOICES = [
        ('mcq', 'Multiple Choice'),
        ('subjective', 'Subjective'),
    ]

    name = models.CharField(max_length=200)
    branch = models.CharField(max_length=200, default='Civil Engineering')
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPE_CHOICES)
    description = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    is_free = models.BooleanField(default=True)
    fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_seconds = models.PositiveIntegerField(default=1800)
    grace_seconds = models.PositiveIntegerField(default=60)
    negative_marking = models.DecimalField(max_digits=4, decimal_places=2, default=0.25)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('name', 'branch', 'exam_type')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.branch} | {self.get_exam_type_display()} | {self.name}"


class ExamQuestion(models.Model):
    exam_set = models.ForeignKey(ExamSet, on_delete=models.CASCADE, related_name='questions')
    order = models.PositiveIntegerField(default=1)
    question_header = models.CharField(max_length=255, blank=True)
    question_text = models.TextField()
    question_image_url = models.URLField(blank=True)
    option_a = models.CharField(max_length=500, blank=True)
    option_b = models.CharField(max_length=500, blank=True)
    option_c = models.CharField(max_length=500, blank=True)
    option_d = models.CharField(max_length=500, blank=True)
    correct_option = models.CharField(
        max_length=1,
        choices=[('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')],
        blank=True,
        null=True,
    )
    explanation = models.TextField(blank=True)
    marks = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.exam_set.name} Q{self.order}"


class ExamPurchase(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    exam_set = models.ForeignKey(ExamSet, on_delete=models.CASCADE, related_name='purchases', null=True, blank=True)
    exam_type = models.CharField(max_length=50)
    set_name = models.CharField(max_length=50)
    payment_gateway = models.CharField(max_length=20, blank=True)
    transaction_id = models.CharField(max_length=120, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    purchased_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-purchased_at']

    def __str__(self):
        return f"{self.user} | {self.exam_type} | {self.set_name}"


class ExamAttempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    exam_set = models.ForeignKey(ExamSet, on_delete=models.SET_NULL, null=True, blank=True, related_name='attempts')
    exam_name = models.CharField(max_length=200)
    score = models.FloatField()
    total_questions = models.PositiveIntegerField(default=0)
    correct_answers = models.PositiveIntegerField(default=0)
    wrong_answers = models.PositiveIntegerField(default=0)
    unanswered = models.PositiveIntegerField(default=0)
    answers_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user} | {self.exam_name} | {self.score}"


class QuestionAttempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(MCQQuestion, on_delete=models.CASCADE)
    selected_option = models.CharField(max_length=1)
    is_correct = models.BooleanField()
    attempted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'question')


class SubjectiveSubmission(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    exam_set = models.ForeignKey(ExamSet, on_delete=models.SET_NULL, null=True, blank=True, related_name='subjective_submissions')
    file_path = models.CharField(max_length=500, blank=True)
    answer_pdf = models.FileField(upload_to='subjective_submissions/%Y/%m/%d/', null=True, blank=True)
    email = models.EmailField(blank=True)
    mobile_number = models.CharField(max_length=20, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending Review'),
            ('reviewed', 'Reviewed'),
            ('rejected', 'Rejected'),
        ],
        default='pending'
    )
    score = models.FloatField(null=True, blank=True)
    feedback = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']

    def mark_reviewed(self, score, feedback=''):
        self.status = 'reviewed'
        self.score = score
        self.feedback = feedback
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'score', 'feedback', 'reviewed_at'])
