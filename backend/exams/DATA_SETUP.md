# Exam Data Setup (Admin-Friendly Formats)

Use these formats instead of JSON for easier manual editing.

## Supported Formats
- `.csv` (recommended)
- `.tsv`
- `.json` (kept for compatibility)
- `.xlsx` / `.xls` (Excel, via `django-import-export`)

## Files Created
- `backend/exams/objective_questions_template.csv`
- `backend/exams/exam_set_mcq_template.csv`
- `backend/exams/exam_set_subjective_template.csv`
- `backend/exams/demo_objective_questions.csv`
- `backend/exams/demo_mcq_set_questions.csv`
- `backend/exams/demo_subjective_set_questions.csv`

## Objective MCQ Bulk Upload (`/api/exams/questions/bulk-upload/`)
Input options:
- `questions_file` (multipart upload)
- `file_path` (backend-local path relative to `backend/`, e.g. `exams/objective_questions_template.csv`)
- `file_path` can also be a Dropbox path under `/bridge4er/...` (example: `/bridge4er/Civil Engineering/Take Exam/Multiple Choice Exam/questions.xlsx`)

Columns:
- `question_header`
- `question_text`
- `question_image_url`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `correct_option` (`a|b|c|d`)
- `explanation`

## Take Exam Set Import (`/api/exams/sets/<set_id>/questions/import/`)
Input options:
- `file` (multipart upload)
- `file_path` (backend-local path relative to `backend/` or Dropbox `/bridge4er/...` path)

### MCQ set columns
- `order`
- `question_header`
- `question_text`
- `question_image_url`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `correct_option`
- `marks`
- `explanation`

Alternative row-structured format (CSV/XLSX) is also supported:
- Row 1: `title, subtitle, date, time, paper, subject, fullmarks, ispaid, price`
- Row 2: optional exam info values (can be skipped)
- Next row: `question, question_image_url, option_a, option_b, option_c, option_d, correct_option, explanation, marks`
- Remaining rows: question data

### Subjective set columns
- `order`
- `question_header`
- `question_text`
- `question_image_url` (optional)
- `marks`

Subjective JSON with `examInfo`, `instructions`, and `sections[].questions[]` is supported.

## Missing Data Defaults
If exam metadata is missing, imports use:
- `title`: `bridge4er test files`
- `subtitle`: `इन्जिनियरिंग सेवा, सिभिल समूह`
- `date`: blank
- `time`: `1 Hour`
- `paper`: blank
- `subject`: `Civil Engineering`
- `fullMarks`: `100`
- `ispaid`: `True`
- `price`: `NPR. 50`
- question `marks`: `1`
- instructions: `सबै प्रश्न अनिवार्य छन्`

## Demo Fallback
If no question set exists for a branch, backend auto-creates demo MCQ and Subjective sets with sample questions.

## Dependency
For admin import/export and Excel support, install:
- `django-import-export`
- `tablib`
- `openpyxl`
- `xlrd`

## Dropbox Path Import Prerequisites
To import using Dropbox `file_path` (starting with `/bridge4er/...`), set valid Dropbox credentials in `backend/.env`:
- `DROPBOX_ACCESS_TOKEN` (or)
- `DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`

Recommended for long-running production:
1. Set `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` in `backend/.env`.
2. Run one-time setup to generate `DROPBOX_REFRESH_TOKEN`:
   - `backend\venv\Scripts\python.exe backend\storage\dropbox_oauth_setup.py`
3. Keep `DROPBOX_REFRESH_TOKEN` in `backend/.env`.
4. `DROPBOX_ACCESS_TOKEN` can remain as fallback but is no longer required for ongoing rotation.

## One-Click Dropbox Sync (Admin)
Endpoint: `POST /api/exams/sync/dropbox/`

Body:
- `branch` (default: `Civil Engineering`)
- `replace_existing` (`true|false`, default `true`)
- `sync_objective` (`true|false`, default `true`)
- `sync_exam_sets` (`true|false`, default `true`)

Expected Dropbox paths for a branch:
- Objective chapters: `/bridge4er/<Branch>/Objective MCQs/Subjects/<Subject>/<ChapterFile>.csv|json|xlsx|xls`
- MCQ exam sets: `/bridge4er/<Branch>/Take Exam/Multiple Choice Exam/<SetFile>.csv|json|xlsx|xls`
- Subjective exam sets: `/bridge4er/<Branch>/Take Exam/Subjective Exam/<SetFile>.csv|json|xlsx|xls`
