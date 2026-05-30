# Admin Storage Workflow

Use the admin dashboard to publish files from Supabase Storage and import question sets into Django.

## Where Data Goes

- PDFs, images, and other resource files are stored in the Supabase bucket `bridge4ER`.
- File and folder visibility, display names, sort order, and website indexing are stored in Django tables.
- Question files (`.json`, `.csv`, `.tsv`, `.xlsx`, `.xls`) are stored in Supabase and imported into Django question tables when they are under Objective MCQs or Exam Hall paths.

## Upload From Admin Panel

1. Open `/admin/dashboard` and use **Upload Files**.
2. Choose the branch and content type.
3. Leave **Upload Folder Path** empty to use the default folder, or paste one of the paths below.
4. Select the file and click **Upload File**.

If the uploaded file is a question file under Objective MCQs or Exam Hall, the backend uploads it to Supabase and immediately imports the questions into Django.

## Sync Files Already In Supabase

1. Put files in Supabase Storage bucket `bridge4ER`.
2. Use paths that start with `/bridge4ER/...` in the admin UI. The backend maps that to the configured Supabase storage root.
3. In **Manage Files and Folders**, click **Sync Selected Type** to sync a whole content type, or enter a specific file/folder path and click **Sync Folder Path**.

## Recommended Paths

```text
/bridge4ER/Civil Engineering/Notice/<file.pdf-or-image>
/bridge4ER/Civil Engineering/Syllabus/<file.pdf>
/bridge4ER/Civil Engineering/Old Questions/<file.pdf>
/bridge4ER/Civil Engineering/Subjective/<Institution>/<Subject>/<file.pdf>
/bridge4ER/Civil Engineering/Objective MCQs/<Institution>/<Subject>/<Chapter>.json
/bridge4ER/Civil Engineering/Take Exam/Multiple Choice Exam/<Institution>/<Set>.json
/bridge4ER/Civil Engineering/Take Exam/Subjective Exam/<Institution>/<Set>.json
```

Replace `Civil Engineering` with another supported branch name when needed.

## JSON Question Files

Objective MCQ JSON needs at least:

```json
[
  {
    "question_text": "The SI unit of stress is:",
    "option_a": "N",
    "option_b": "Pa",
    "option_c": "J",
    "option_d": "W",
    "correct_option": "b",
    "explanation": "Stress = Force/Area."
  }
]
```

Exam Hall JSON can use the same row format, and may include `examInfo`, `instructions`, or `sections`.
