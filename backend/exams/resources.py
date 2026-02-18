from __future__ import annotations

from .import_utils import DJANGO_IMPORT_EXPORT_AVAILABLE

if DJANGO_IMPORT_EXPORT_AVAILABLE:
    from import_export import fields, resources
    from import_export.widgets import ForeignKeyWidget

    from .models import Chapter, ExamQuestion, ExamSet, MCQQuestion

    class MCQQuestionResource(resources.ModelResource):
        chapter = fields.Field(
            column_name="chapter_id",
            attribute="chapter",
            widget=ForeignKeyWidget(Chapter, "id"),
        )

        class Meta:
            model = MCQQuestion
            import_id_fields = ("id",)
            fields = (
                "id",
                "chapter",
                "question_header",
                "question_text",
                "question_image_url",
                "option_a",
                "option_b",
                "option_c",
                "option_d",
                "correct_option",
                "explanation",
                "created_at",
                "updated_at",
            )
            export_order = (
                "id",
                "chapter",
                "question_header",
                "question_text",
                "question_image_url",
                "option_a",
                "option_b",
                "option_c",
                "option_d",
                "correct_option",
                "explanation",
                "created_at",
                "updated_at",
            )
            skip_unchanged = True
            report_skipped = True

    class ExamQuestionResource(resources.ModelResource):
        exam_set = fields.Field(
            column_name="exam_set_id",
            attribute="exam_set",
            widget=ForeignKeyWidget(ExamSet, "id"),
        )

        class Meta:
            model = ExamQuestion
            import_id_fields = ("id",)
            fields = (
                "id",
                "exam_set",
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
            )
            export_order = (
                "id",
                "exam_set",
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
            )
            skip_unchanged = True
            report_skipped = True
else:
    MCQQuestionResource = None
    ExamQuestionResource = None
