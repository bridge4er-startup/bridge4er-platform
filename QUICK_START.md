# Quick Start Guide - Bridge4ER Implementation

## 🎯 What Has Been Done

All code has been written and files have been updated/created. Here's what you need to do to get it running:

---

## ⚡ QUICK SETUP (15 minutes)

### Step 1: Backend Database Setup
```bash
cd backend

# Create migrations for new models
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser if you haven't already
python manage.py createsuperuser
```

### Step 2: Populate Database with Initial Data (Optional but Recommended)
```bash
python manage.py shell
```

Then in the shell:
```python
from exams.models import Subject, Chapter

# Civil Engineering
civil = Subject.objects.create(name="Structural Analysis", branch="Civil Engineering")
Chapter.objects.create(name="Chapter 1: Introduction", subject=civil, order=1)
Chapter.objects.create(name="Chapter 2: Truss Analysis", subject=civil, order=2)

civil2 = Subject.objects.create(name="Hydraulics", branch="Civil Engineering")
Chapter.objects.create(name="Chapter 1: Fluid Mechanics", subject=civil2, order=1)

# Exit with: exit()
```

### Step 3: Verify Dropbox Folder Structure
Make sure your Dropbox has this structure:
```
/bridge4er/
  └── Civil Engineering/
      ├── Notice/           (for notices)
      ├── Syllabus/         (for syllabus files)
      ├── Old Questions/    (for old exam questions)
      ├── Subjective/       (for subjective materials)
      └── Objective MCQs/
          └── Subjects/
              ├── Structural Analysis/
              └── Hydraulics/
```

### Step 4: Start Backend
```bash
python manage.py runserver
```

### Step 5: Start Frontend
```bash
cd frontend
npm start
```

---

## 📁 FILES TO REVIEW (Most Important)

### Backend
1. `backend/exams/models.py` - New database models
2. `backend/exams/views_mcq.py` - MCQ API endpoints (NEW FILE)
3. `backend/storage/views.py` - File management endpoints
4. `backend/exams/urls.py` - New URL routes

### Frontend
1. `frontend/src/components/sections/MCQSection.js` - Question practice UI
2. `frontend/src/components/sections/SubjectiveSection.js` - PDF library UI
3. `frontend/src/pages/AdminDashboard.js` - Admin panel (MAJOR UPDATE)
4. `frontend/src/services/mcqService.js` - MCQ API calls (NEW FILE)
5. `frontend/src/services/fileService.js` - File API calls (NEW FILE)

---

## ✨ FEATURES YOU NOW HAVE

### 1. Notice/Syllabus/Old Questions (Updated) ✅
```
Users can:
- Search files by name
- View files (opens in new tab)
- Download files to device
- See file size and upload date
- View chronologically (newest first)

Admin can:
- Upload files via Admin Dashboard
- Delete files (manage)
```

### 2. Objective MCQs (Completely New) ✅
```
Users can:
- Select subject
- Select chapter
- Practice questions one-by-one
- Choose from A, B, C, D options
- See correct answer with highlight
- Read explanation
- Navigate previous/next
- See progress bar

Admin can:
- Add questions one-by-one
- Bulk upload from JSON file
```

### 3. Subjective (Library View) ✅
```
Users can:
- Browse materials list
- Search by file name
- Read PDFs in embedded viewer
- See material size and date
- NO download option (read-only)

Admin can:
- Upload PDF files
```

### 4. Admin Dashboard (Completely New) ✅
```
Three tabs:
1. Upload Files - Upload notices, syllabus, questions, PDFs
2. Add MCQs - Add questions one-by-one with explanations
3. Bulk Upload MCQs - Upload questions from JSON file
```

---

## 🧪 TESTING THE FEATURES

### Test 1: Upload a Notice
1. Go to http://localhost:3000/admin (or your admin page)
2. Go to "Upload Files" tab
3. Select "Notice" as content type
4. Select a PDF file
5. Click "Upload File"
6. Go to Notice section on home and see it appear

### Test 2: Practice MCQs
1. Go to Objective MCQs section
2. Click "Start Practice"
3. Select "Structural Analysis"
4. Select "Chapter 1: Introduction"
5. Answer the question
6. See correct answer and explanation

### Test 3: Browse Subjective Materials
1. Go to Engineering Library section
2. Upload a PDF using Admin Dashboard
3. Click "Read" button
4. See PDF viewer open

---

## 🔧 ADMIN DASHBOARD ACCESS

Add this route to your frontend router (if not already there):

**Frontend App Routes** (`frontend/src/App.js`):
```javascript
<Route
  path="/admin"
  element={
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  }
/>
```

Then go to: `http://localhost:3000/admin`

---

## 📊 DATABASE SCHEMA

New tables created:
- `exams_subject` - Subjects (Math, Physics, etc.)
- `exams_chapter` - Chapters within subjects
- `exams_mcqquestion` - Individual MCQ questions
- `exams_questionattempt` - Tracks user answers
- `storage_filemetadata` - Tracks Dropbox files
- `storage_filesynclog` - Syncing history

---

## 🚀 API ENDPOINTS (NEW)

### File Management
```
GET  /api/storage/files/list/           # List files by type
GET  /api/storage/files/search/         # Search files
GET  /api/storage/files/download/       # Download file
GET  /api/storage/files/view/           # Get view link
POST /api/storage/files/upload/         # Upload file (admin)
POST /api/storage/files/delete/         # Delete file (admin)
```

### MCQ Management
```
GET  /api/exams/subjects/                                    # Get all subjects
GET  /api/exams/subjects/<subject>/chapters/                 # Get chapters
GET  /api/exams/subjects/<subject>/chapters/<chapter>/questions/  # Get questions
GET  /api/exams/questions/<id>/                              # Get single question
POST /api/exams/questions/submit/                            # Submit answer
POST /api/exams/questions/create/                            # Add question (admin)
POST /api/exams/questions/bulk-upload/                       # Bulk add (admin)
GET  /api/exams/subjects/<subject>/chapters/<chapter>/progress/  # User progress
```

---

## 📝 EXAMPLE: JSON FOR BULK MCQ UPLOAD

Create a file `questions.json`:
```json
[
  {
    "question_text": "What is the SI unit of force?",
    "option_a": "Newton",
    "option_b": "Joule",
    "option_c": "Pascal",
    "option_d": "Watt",
    "correct_option": "a",
    "explanation": "Newton (N) is defined as kg⋅m/s²"
  },
  {
    "question_text": "What is Young's modulus?",
    "option_a": "Stress ÷ Strain",
    "option_b": "Strain × Stress",
    "option_c": "Force ÷ Area",
    "option_d": "Displacement ÷ Time",
    "correct_option": "a",
    "explanation": "Young's modulus = Stress / Strain"
  }
]
```

Upload via Admin Dashboard → Bulk Upload MCQs tab

---

## ⚠️ IMPORTANT NOTES

1. **Dropbox Auth (Recommended)**: Configure `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET`, then run:
   - `backend\venv\Scripts\python.exe backend\storage\dropbox_oauth_setup.py`
   - This writes `DROPBOX_REFRESH_TOKEN` to `.env` so access token refresh is automatic.
2. **Migrations**: Must run `makemigrations` and `migrate` before using
3. **Admin User**: Must create superuser for admin functions
4. **Permissions**: Only staff users can upload/create content
5. **Folder Structure**: Dropbox folder structure must match exactly
6. **File Names**: Avoid special characters in file names

---

## 🐛 TROUBLESHOOTING

### Problem: "Module not found" error
**Solution**: Run `npm install` or `pip install -r requirements.txt`

### Problem: Database errors
**Solution**: Run `python manage.py migrate`

### Problem: Files not appearing
**Solution**: 
- Run `backend\venv\Scripts\python.exe backend\storage\dropbox_oauth_setup.py` to regenerate `DROPBOX_REFRESH_TOKEN`
- Check Dropbox credentials (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`) are correct
- Check folder path is correct
- Verify Dropbox App permissions

### Problem: Questions not loading
**Solution**:
- Check Subject and Chapter exist in database
- Use Django admin to verify data
- Check user is authenticated

### Problem: Admin upload fails
**Solution**:
- Check user is staff (is_staff=True)
- Check content_type is valid
- Check Dropbox has write permissions

---

## 📚 FULL DOCUMENTATION

For detailed implementation info, see:
- `IMPLEMENTATION_GUIDE.md` - Complete technical guide
- `FILES_UPDATED_AND_CREATED.md` - Detailed file list

---

## ✅ NEXT STEPS

1. ✅ Run migrations
2. ✅ Create initial subjects/chapters
3. ✅ Create admin user
4. ✅ Upload test files to Dropbox
5. ✅ Test each feature
6. ✅ Go live!

---

## 🎉 YOU'RE ALL SET!

Everything is implemented. Just follow these 5 steps and you'll have a fully functional platform!

**Questions?** Check the detailed guides or review the code comments.

**Happy coding!** 🚀
