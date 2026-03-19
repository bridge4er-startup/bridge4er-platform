# Bridge4ER Platform - Software Requirements Specification (SRS)

## Document Control
- Version: 1.0
- Date: 2026-03-19
- Status: Draft
- Source: Current repository state in this workspace

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for the Bridge4ER web platform. It is intended for product owners, developers, QA, and operations teams to align on expected behavior.

### 1.2 Scope
Bridge4ER is a student-focused exam preparation platform for engineering branches. It provides public notices, authenticated access to syllabus and past questions, objective MCQ practice, a read-only subjective library, a paid/free exam hall with timed exams, contributions and referrals, analytics, and an admin dashboard for content and review workflows.

### 1.3 Definitions and Acronyms
- SRS: Software Requirements Specification
- MCQ: Multiple Choice Question
- JWT: JSON Web Token
- DRF: Django REST Framework
- Exam Set: A timed exam package (MCQ or Subjective) with questions and rules
- Objective MCQ Practice: Untimed MCQ practice by subject and chapter
- Subjective Library: Read-only repository of PDF materials
- Branch: Field of study (Civil, Mechanical, Electrical, Electronics, Computer)

### 1.4 References
- `QUICK_START.md`
- `IMPLEMENTATION_GUIDE.md`
- `FILES_UPDATED_AND_CREATED.md`
- `DEPLOYMENT_RUNBOOK.md`

## 2. Overall Description

### 2.1 Product Perspective
Bridge4ER is a web SPA with a React frontend and a Django REST API backend. The backend stores user, exam, contribution, and transaction data in a relational database. File content is stored in Dropbox and accessed via the backend. Payments are handled by external gateways and synchronized with local purchase records.

### 2.2 Product Functions (Summary)
- User registration, login, and profile management
- Public homepage with metrics and notices
- Authenticated access to syllabus, old questions, and subjective library
- Objective MCQ practice by institution, subject, and chapter
- Exam hall for timed MCQ and subjective sets (free and paid)
- Online payments to unlock paid exam sets
- Contributions with comments, likes, moderation, and reward unlocks
- Referrals with reward unlocks
- Subjective submission and review workflow
- Admin dashboard for content, exams, contributions, metrics, and reports

### 2.3 User Classes and Characteristics
- Guest: Unauthenticated user with access to public notices and homepage content
- Student: Authenticated user who can access all study content, take exams, submit subjective answers, and contribute notes
- Admin: Staff user with access to moderation, content management, and system configuration

### 2.4 Operating Environment
- Frontend: React 18 SPA in modern browsers
- Backend: Django 4.2 with DRF and JWT auth
- Database: SQLite by default, PostgreSQL supported via `DATABASE_URL`
- File storage: Dropbox API
- Payments: eSewa and Khalti gateways

### 2.5 Design and Implementation Constraints
- Dropbox content must live under `/bridge4er/` with branch-specific folders
- Branch list is fixed to predefined engineering fields
- JWT is used for API authentication
- Paid exam access requires successful payment or reward unlock
- Subjective submissions must be PDF and limited in size
- Contributions are limited by file type and size and require admin approval
- Public access is limited to Notice content only

### 2.6 Assumptions and Dependencies
- Dropbox credentials and refresh token are configured in backend `.env`
- Payment gateway credentials are configured for eSewa and Khalti
- SMTP is configured for admin notifications (optional)
- External services (Dropbox, payment gateways, Open-Meteo, MyPatro) are reachable
- Users allow browser geolocation for weather display (optional)

## 3. External Interface Requirements

### 3.1 User Interface
Primary routes and views:
- `/`: Homepage with notices, metrics, and section navigation
- `/#syllabus`, `/#old-questions`, `/#objective-mcqs`, `/#library`, `/#exam-hall`, `/#contributions`
- `/login`, `/register`
- `/profile`: Student analytics and contribution/referral tools
- `/admin/dashboard`: Admin console
- `/exam/mcq/:branch/:setId`
- `/exam/subjective/:branch/:setId`
- `/payment/result`

### 3.2 API Interfaces
All APIs are REST JSON under `/api/` with JWT authentication for protected endpoints. See Appendix A for endpoint summary.

### 3.3 External Services
- Dropbox API for file storage, listing, search, and sharing
- eSewa and Khalti payment gateways
- SMTP email for subjective submission alerts
- Open-Meteo and geocoding APIs for weather display
- MyPatro script for Nepali date display

## 4. System Features (Functional Requirements)

1. FR-1 User Registration and Authentication  
The system shall allow students to register with full name, email, mobile number, username, password, and field of study. The system shall allow login using username, email, or mobile number and issue JWT access and refresh tokens.

2. FR-2 User Profile and Branch Selection  
The system shall provide a profile endpoint to view and update profile data. The system shall lock branch selection to the authenticated user's field of study when applicable.

3. FR-3 Homepage Metrics and Noticeboard  
The system shall display platform metrics and a noticeboard list. Notices shall be searchable, viewable, and downloadable and may be accessed without authentication.

4. FR-4 Syllabus and Old Questions  
The system shall allow authenticated users to list, search, view, and download syllabus and old question files with metadata.

5. FR-5 Subjective Library  
The system shall allow authenticated users to browse subjective materials by folder and read files in an inline viewer without download.

6. FR-6 Objective MCQ Practice  
The system shall allow authenticated users to browse objective questions by institution, subject, and chapter with pagination. The system shall provide immediate feedback and explanations for submitted answers.

7. FR-7 Exam Hall Catalog  
The system shall list exam sets by branch and type (MCQ or Subjective) with duration, marks, price, and unlock status. The system shall group exam sets by folder and institution when metadata is available.

8. FR-8 Payments and Unlocking  
The system shall initiate payments through eSewa or Khalti for locked exam sets and unlock access on successful verification. The system shall show a payment result page with status and references.

9. FR-9 Timed MCQ Exams  
The system shall start MCQ exams with a timer, negative marking rules, and question navigation. The system shall auto-submit after a grace period, calculate score, store attempts, and return a leaderboard and answer review.

10. FR-10 Timed Subjective Exams  
The system shall display subjective questions with a timer and allow a single PDF submission per exam unless the previous submission is rejected. The system shall require email and mobile to match profile data and store submission status for review.

11. FR-11 Contributions  
The system shall allow students to upload contributions (PDF/JPG/PNG) for admin review, browse approved contributions by category, and add one comment and one like per contribution.

12. FR-12 Reward Unlocks  
The system shall allow unlocking paid exam sets using rewards earned from approved contributions or matched referrals.

13. FR-13 Problem Reports  
The system shall allow students to report issues and allow admins to mark reports as solved or delete them.

14. FR-14 Analytics  
The system shall provide a student analytics view with attempts, averages, purchases, subjective submission status, and contribution and referral summaries.

15. FR-15 Admin Console  
The system shall provide admin workflows for file uploads, metadata updates, Dropbox sync, MCQ bank management, exam set creation and import, subjective review and scoring, contribution moderation, homepage metrics, and hero image updates.

16. FR-16 Health Endpoint  
The system shall expose a basic health endpoint returning status for availability checks.

## 5. Data Requirements

### 5.1 Data Model Summary
- User: username, full_name, email, mobile_number, field_of_study, is_staff
- Subject, Chapter, MCQQuestion: objective practice hierarchy and questions
- ExamSet, ExamQuestion: timed exam definitions and items
- ExamAttempt: stored MCQ attempt summary and answers
- ExamPurchase: unlock record for paid exam sets
- SubjectiveSubmission: PDF submission, status, score, feedback, reviewed file
- PaymentTransaction: gateway reference and verification status
- Contribution, ContributionCategory, ContributionComment, ContributionLike, ContributionUnlock
- ReferralInvite, ReferralUnlock
- FileMetadata, FolderMetadata, FileSyncLog, PlatformMetrics
- ProblemReport
- InstitutionFolder: folder grouping for objective and exam sets

### 5.2 Relationships (Summary)
Chapters belong to Subjects. Objective MCQ questions belong to Chapters. Exam questions belong to Exam Sets. Exam Attempts and Purchases belong to Users. Subjective Submissions belong to Users and Exam Sets. Contributions and related comments/likes belong to Users. Referral and contribution unlocks attach to Users and Exam Sets.

## 6. Non-Functional Requirements

1. NFR-1 Security  
APIs shall require JWT authentication for protected routes. Admin functions shall require staff privileges. File access shall be restricted to authenticated users except for public notices. Production configuration shall enforce HTTPS and secure cookies.

2. NFR-2 Performance  
The system shall cache Dropbox file listings and support pagination for question lists to reduce latency and API calls.

3. NFR-3 Reliability  
The system shall store metadata locally to allow fallback listing when Dropbox calls fail. Payment verification shall persist transactions and unlocks.

4. NFR-4 Usability  
The UI shall be responsive and provide immediate feedback (loading states, toasts, and validation messages).

5. NFR-5 Maintainability  
The backend shall be organized into modular Django apps and the frontend shall use service modules for API access.

## 7. Constraints and Limits

- Contribution uploads: PDF/JPG/PNG only, maximum 2 MB
- Subjective submissions: PDF only, maximum 10 MB
- MCQ practice page size: minimum 5, maximum 50
- Exam set imports support CSV, TSV, JSON, XLSX, and XLS
- Paid exam access requires profile email and mobile number to match payment payload
- Dropbox content must remain under `/bridge4er/` with the expected folder structure

## 8. Open Questions and TBD

- Final SLA and availability targets
- Content moderation policy and turnaround time for subjective review
- Data retention and privacy policy for user submissions and transactions
- Accessibility and localization requirements beyond current implementation

## Appendix A: API Endpoint Summary

- Accounts: `POST /api/accounts/auth/register/`, `POST /api/accounts/auth/login/`, `POST /api/accounts/auth/token/refresh/`, `GET/PATCH /api/accounts/auth/me/`, `POST /api/accounts/referrals/`, `POST /api/accounts/referrals/unlock/`
- Exams (objective practice): `GET /api/exams/subjects/`, `GET /api/exams/subjects/<subject>/chapters/`, `GET /api/exams/subjects/<subject>/chapters/<chapter>/questions/`, `POST /api/exams/questions/submit/`
- Exams (exam sets): `GET /api/exams/sets/`, `GET /api/exams/sets/<id>/start/`, `POST /api/exams/sets/<id>/submit/`, `POST /api/exams/sets/create/`, `POST /api/exams/sets/<id>/questions/import/`
- Exams (subjective submissions): `POST /api/exams/subjective/submissions/`, `GET /api/exams/subjective/submissions/my/`, `GET /api/exams/subjective/submissions/`
- Storage: `GET /api/storage/files/list/`, `GET /api/storage/files/search/`, `GET /api/storage/files/view/`, `GET /api/storage/files/preview/`, `GET /api/storage/files/download/`, `POST /api/storage/files/upload/`, `POST /api/storage/files/delete/`, `POST /api/storage/files/metadata/`, `POST /api/storage/files/visibility/`, `POST /api/storage/files/rename/`, `POST /api/storage/files/create-folder/`, `POST /api/storage/files/sync/`
- Payments: `POST /api/payments/esewa/initiate/`, `GET /api/payments/esewa/callback/`, `POST /api/payments/khalti/initiate/`, `GET /api/payments/khalti/callback/`, `GET /api/payments/status/`
- Contributions: `GET /api/contributions/categories/`, `GET /api/contributions/list/`, `GET /api/contributions/me/`, `POST /api/contributions/upload/`, `POST /api/contributions/<id>/comment/`, `POST /api/contributions/<id>/like/`, `POST /api/contributions/unlock/`
- Admin moderation: `GET /api/contributions/admin/list/`, `PATCH /api/contributions/admin/<id>/`, `GET /api/exams/problem-reports/`, `POST /api/exams/problem-reports/<id>/`
