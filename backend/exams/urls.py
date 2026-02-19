from django.urls import path
from .views import (
    CreateExamSetView,
    ExamSetImportQuestionsView,
    ExamSetDetailAdminView,
    ExamSetQuestionAdminView,
    ExamSetQuestionDetailAdminView,
    ExamSetListView,
    LoadExam,
    SubmitExam,
    LoadMCQExam,
    SubmitMCQExam,
    LoadSubjectiveExam,
    MySubjectiveSubmissionsView,
    ReviewSubjectiveSubmissionView,
    StartExamSetView,
    SubmitExamSetView,
    SubmitSubjective,
    SubjectiveSubmissionCreateView,
    SyncDropboxQuestionBankView,
    UploadSubjective,
    UserAnalyticsView,
    ProblemReportListCreateView,
    ProblemReportAdminDetailView,
)
from .views_mcq import (
    SubjectListView,
    ChapterListView,
    QuestionListView,
    QuestionDetailView,
    SubmitAnswerView,
    CreateQuestionView,
    CreateSubjectView,
    CreateChapterView,
    BulkUploadQuestionsView,
    UserProgressView,
)

urlpatterns = [
    # Legacy endpoints
    path('load/', LoadExam.as_view()),
    path('submit/', SubmitExam.as_view()),
    path('mcq/load/', LoadMCQExam.as_view()),
    path('mcq/submit/', SubmitMCQExam.as_view()),
    path('subjective/load/', LoadSubjectiveExam.as_view()),
    path('subjective/submit/', SubmitSubjective.as_view()),
    path('subjective/upload/', UploadSubjective.as_view()),
    path('subjective/submissions/', SubjectiveSubmissionCreateView.as_view()),
    path('subjective/submissions/my/', MySubjectiveSubmissionsView.as_view()),
    path('subjective/submissions/<int:submission_id>/review/', ReviewSubjectiveSubmissionView.as_view()),
    
    # New MCQ endpoints
    path('subjects/', SubjectListView.as_view()),
    path('subjects/<str:subject>/chapters/', ChapterListView.as_view()),
    path('subjects/<str:subject>/chapters/<str:chapter>/questions/', QuestionListView.as_view()),
    path('questions/<int:question_id>/', QuestionDetailView.as_view()),
    path('questions/submit/', SubmitAnswerView.as_view()),
    
    # Admin endpoints
    path('subjects/create/', CreateSubjectView.as_view()),
    path('chapters/create/', CreateChapterView.as_view()),
    path('questions/create/', CreateQuestionView.as_view()),
    path('questions/bulk-upload/', BulkUploadQuestionsView.as_view()),
    path('sync/dropbox/', SyncDropboxQuestionBankView.as_view()),
    
    # Progress
    path('subjects/<str:subject>/chapters/<str:chapter>/progress/', UserProgressView.as_view()),

    # Exam set endpoints (free/paid/time-configurable)
    path('sets/', ExamSetListView.as_view()),
    path('sets/create/', CreateExamSetView.as_view()),
    path('sets/<int:set_id>/', ExamSetDetailAdminView.as_view()),
    path('sets/<int:set_id>/questions/import/', ExamSetImportQuestionsView.as_view()),
    path('sets/<int:set_id>/questions/', ExamSetQuestionAdminView.as_view()),
    path('sets/questions/<int:question_id>/', ExamSetQuestionDetailAdminView.as_view()),
    path('sets/<int:set_id>/start/', StartExamSetView.as_view()),
    path('sets/<int:set_id>/submit/', SubmitExamSetView.as_view()),

    # User analytics/profile
    path('profile/analytics/', UserAnalyticsView.as_view()),

    # Report issues
    path('problem-reports/', ProblemReportListCreateView.as_view()),
    path('problem-reports/<int:report_id>/', ProblemReportAdminDetailView.as_view()),
]
