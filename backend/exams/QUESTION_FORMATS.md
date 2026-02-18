# Question File Formats (CSV + JSON)

This file documents the formats currently accepted by the website backend for importing question data.

## Scope
1. Objective MCQs (chapter question bank)
2. Exam Hall sets
   - Multiple Choice Exam Sets
   - Subjective Exam Sets

## Supported file types
- `.csv`
- `.tsv`
- `.json`
- `.xlsx`, `.xls` (when `django-import-export` dependencies are installed)

---

## 1) Objective MCQs (Question Bank)

### API endpoint
- `POST /api/exams/questions/bulk-upload/`

### Request inputs
- `chapter_id` (required)
- one of:
  - `questions_file` (multipart file upload), or
  - `file_path` (backend path like `exams/objective_questions_template.csv`, or Dropbox path under `/bridge4er/...`), or
  - `questions` (JSON array)

### CSV columns
Recommended headers:
- `question_header`
- `question_text` (or `question`)
- `question_image_url`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `correct_option`
- `explanation`

#### Minimum required for import
- `question_text` (or `question`)
- `option_a`, `option_b`, `option_c`, `option_d`
- `correct_option` (must resolve to `a|b|c|d`)

### JSON formats

#### A) Array of rows (recommended)
```json
[
  {
    "question_header": "Strength of Materials",
    "question_text": "The SI unit of stress is:",
    "option_a": "N",
    "option_b": "Pa",
    "option_c": "J",
    "option_d": "W",
    "correct_option": "b",
    "explanation": "Stress = Force/Area, so SI unit is Pascal.",
    "question_image_url": ""
  }
]
```

#### B) Object wrapper (also supported)
Any of these keys can hold the row array:
- `questions`, `items`, `data`, `rows`, `records`, `mcqs`, `objective_questions`

Example:
```json
{
  "questions": [
    {
      "question": "Flow in a pipe is laminar when Reynolds number is roughly:",
      "option_a": "< 2000",
      "option_b": "> 4000",
      "option_c": "2000-4000 only",
      "option_d": "Always turbulent",
      "correct_option": "a"
    }
  ]
}
```

### `correct_option` accepted values
The backend can resolve:
- letters: `a`, `b`, `c`, `d`
- indices: `1..4` (also `0..3`)
- strings like `Option A`
- exact answer text matching one option

---

## 2) Exam Hall Sets (MCQ + Subjective)

### API endpoint
- `POST /api/exams/sets/<set_id>/questions/import/`

### Request inputs
- one of:
  - `file` (multipart upload), or
  - `file_path` (backend path / Dropbox path)
- optional:
  - `replace_existing` (`true|false`, default `true`)

---

## 2A) Exam Hall - Multiple Choice Exam Set

### CSV format (normalized columns)
Headers:
- `order`
- `question_header`
- `question_text` (or `question`)
- `question_image_url`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `correct_option`
- `marks`
- `explanation`

#### Minimum required for row import
- `question_text` (or `question`)
- `correct_option` (must resolve to `a|b|c|d`)
- options `a..d`
- `marks` is optional (defaults to `1` if missing/invalid)

### CSV format (row-structured exam file)
Also supported:
1. Row 1: exam info headers  
   `title, subtitle, date, time, paper, subject, fullmarks, ispaid, price`
2. Row 2: exam info values
3. Row 3: question headers  
   `question, question_image_url, option_a, option_b, option_c, option_d, correct_option, explanation, marks`
4. Next rows: question values

### JSON format

#### A) Array of question rows
```json
[
  {
    "order": 1,
    "question_header": "Transportation",
    "question_text": "A common test for aggregate toughness is:",
    "option_a": "Abrasion test",
    "option_b": "Impact test",
    "option_c": "Slump test",
    "option_d": "Vicat test",
    "correct_option": "b",
    "explanation": "Aggregate impact test indicates toughness.",
    "marks": 1
  }
]
```

#### B) Structured object with metadata/instructions/sections
```json
{
  "examInfo": {
    "title": "Sample MCQ Set",
    "subtitle": "Engineering Service",
    "date": "2082-10-12",
    "time": "1 Hour",
    "paper": "First",
    "subject": "Civil Engineering",
    "fullMarks": "100",
    "ispaid": "True",
    "price": "NPR. 150"
  },
  "instructions": [
    "Answer all questions.",
    "No negative marking in demo."
  ],
  "sections": [
    {
      "title": "Section A",
      "questions": [
        {
          "order": 1,
          "question_text": "The SI unit of stress is:",
          "option_a": "N",
          "option_b": "Pa",
          "option_c": "J",
          "option_d": "W",
          "correct_option": "b",
          "marks": 1
        }
      ]
    }
  ]
}
```

---

## 2B) Exam Hall - Subjective Exam Set

### CSV format (normalized columns)
Headers:
- `order`
- `question_header`
- `question_text` (or `question`)
- `question_image_url` (optional)
- `marks`

#### Minimum required
- `question_text` (or `question`)
- `marks` optional, defaults to `1` if missing/invalid

### CSV format (row-structured exam file)
Also supported:
1. Row 1: exam info headers  
   `title, subtitle, date, time, paper, subject, fullmarks, ispaid, price`
2. Row 2: exam info values
3. Row 3: question headers  
   `question, question_image_url, marks`
4. Next rows: question values

### JSON format

#### A) Array of question rows
```json
[
  {
    "order": 1,
    "question_header": "Design Question",
    "question_text": "Design a singly reinforced concrete beam for a given loading case.",
    "question_image_url": "",
    "marks": 20
  }
]
```

#### B) Structured object with exam metadata/instructions/sections
```json
{
  "examInfo": {
    "title": "Sample Subjective Set",
    "time": "3 Hours",
    "subject": "Civil Engineering",
    "fullMarks": "100"
  },
  "instructions": [
    "Answer all questions.",
    "Upload clearly scanned PDF."
  ],
  "sections": [
    {
      "title": "Section A",
      "questions": [
        {
          "order": 1,
          "question_text": "Explain standard penetration test.",
          "marks": 8
        }
      ]
    }
  ]
}
```

---

## Notes
- Use UTF-8 for CSV/JSON files.
- `question_text` and `question` are both accepted aliases.
- Exam info keys support variants like `fullmarks`, `full_marks`, `fullmark`.
- If exam info/instructions are missing, backend defaults are used.
