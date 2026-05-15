# Bridge4ER New Stack Deployment Guide

This project is now updated for a manual QR approval payment flow:

- eSewa/Khalti checkout routes are disabled.
- Students submit payment request with transaction reference.
- Admin approves/rejects requests from Admin Dashboard.
- Approved requests unlock exam sets permanently via `ExamPurchase`.

## 1) Final Target Architecture

- Frontend: React app (`frontend`) on Vercel.
- Backend API: Django app (`backend`) with PostgreSQL.
- Database: Supabase Postgres via `DATABASE_URL`.
- Domain: GoDaddy domain proxied through Cloudflare.

## 1.1) Fresh Vercel Projects Created

These new projects were created under your Vercel scope:

- `bridge4er-new-frontend`
- `bridge4er-new-backend`

## 2) Supabase Setup

1. Create a new Supabase project.
2. Copy the Postgres connection string from Supabase.
3. Set it as backend env var:
   - `DATABASE_URL=<supabase-postgres-connection-string>`

## 3) Backend Environment Variables

Set these in backend deployment environment:

- `DEBUG=False`
- `SECRET_KEY=<long-random-secret>`
- `ALLOWED_HOSTS=api.your-domain.com`
- `CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com`
- `CSRF_TRUSTED_ORIGINS=https://your-domain.com,https://www.your-domain.com`
- `DATABASE_URL=<supabase-postgres-connection-string>`
- `FRONTEND_PUBLIC_URL=https://your-domain.com`
- `BACKEND_PUBLIC_URL=https://api.your-domain.com`
- Optional email vars if needed:
  - `DEFAULT_FROM_EMAIL`
  - `EMAIL_HOST`
  - `EMAIL_PORT`
  - `EMAIL_USE_TLS`
  - `EMAIL_HOST_USER`
  - `EMAIL_HOST_PASSWORD`

## 4) Backend Migration Commands

Run once after backend deployment:

```bash
python manage.py migrate
python manage.py ensure_admin
```

If `ensure_admin` is used, set:

- `DJANGO_SUPERUSER_USERNAME`
- `DJANGO_SUPERUSER_EMAIL`
- `DJANGO_SUPERUSER_PASSWORD`

## 5) Frontend Environment Variables

Set on Vercel frontend project:

- `REACT_APP_API_BASE_URL=https://api.your-domain.com/api/`

Then deploy frontend and verify:

- Login/Register works
- Exam listing works
- Locked set -> QR modal opens
- Request submit creates pending request
- Admin approves request
- Set becomes unlocked

## 6) Cloudflare + Domain

1. Point domain nameservers from GoDaddy to Cloudflare.
2. Create DNS records:
   - `A/AAAA` or `CNAME` for frontend host (`@` / `www`) to Vercel target.
   - `CNAME` for `api` to backend host.
3. Enable Full (strict) SSL in Cloudflare.
4. Keep proxy enabled for frontend and API unless debugging.

## 7) Payment Operations (Admin)

In Admin Dashboard -> `Payment Ops`:

1. Fill QR config fields (`title`, account details, `qr_image_url`, instructions).
2. Save config.
3. Open payment queue and filter `Pending Approval`.
4. Approve or reject requests with optional admin note.

## 8) Post-Deploy Checks

- `GET /` on backend returns health JSON.
- `GET /api/payments/config/` returns active QR config.
- `POST /api/payments/requests/` works for authenticated student.
- `POST /api/payments/requests/<reference>/review/` works for admin.
- `GET /api/exams/sets/` shows unlocked set after approval.
