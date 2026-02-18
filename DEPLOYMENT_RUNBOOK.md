# Bridge4ER Production Deployment Runbook (Render + Vercel)

This runbook matches your selected stack:
- Backend/API: Render (`*.onrender.com`)
- Frontend: Vercel (`*.vercel.app`)
- Real OTP: Twilio Verify
- Real payments: eSewa + Khalti server-side verification

## 1. Repository hygiene and secret safety

1. Use the root `.gitignore` to keep secrets and generated artifacts out of source control.
2. Use `backend/.env.example` and `frontend/.env.example` as templates.
3. Rotate all previously used production-like secrets before go-live.
4. Never commit real payment keys or Twilio credentials.

## 2. Configure production settings

Backend configuration is environment-driven in `backend/bridge4er/settings.py`.

Required environment values:

```env
DEBUG=False
SECRET_KEY=long-random-secret
ALLOWED_HOSTS=your-api.onrender.com
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-app.vercel.app
DATABASE_URL=postgresql://...
FRONTEND_PUBLIC_URL=https://your-app.vercel.app
BACKEND_PUBLIC_URL=https://your-api.onrender.com

SHOW_OTP_IN_RESPONSE=0
ALLOW_INSECURE_PAYMENT_VERIFICATION=0
OTP_PROVIDER=twilio_verify
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...

ESEWA_ENV=sandbox
ESEWA_PRODUCT_CODE=...
ESEWA_SECRET_KEY=...
KHALTI_ENV=sandbox
KHALTI_SECRET_KEY=...
```

## 3. Provision infrastructure

Provision these services first:

1. PostgreSQL database.
2. Render web service for backend.
3. Vercel project for frontend.
4. Use platform free domains first:
   - Backend: `https://<service-name>.onrender.com`
   - Frontend: `https://<project-name>.vercel.app`

## 4. Deploy backend

Use `render.yaml` (Blueprint deploy) or manual Render service config.

Manual command flow (Render shell equivalent):

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py check --deploy
gunicorn bridge4er.wsgi:application --config gunicorn.conf.py
```

After service is up, confirm:
- `https://<service-name>.onrender.com/` returns health JSON.
- OTP endpoint sends SMS from Twilio.

## 5. Deploy frontend

Create Vercel project with root set to `frontend/`.

Set Vercel environment variable:

```env
REACT_APP_API_BASE_URL=https://<service-name>.onrender.com/api/
```

Build flow:

```bash
npm ci
npm run build
```

`frontend/vercel.json` already provides SPA route rewrites.

## 6. Configure DNS and HTTPS

1. For now, use Render/Vercel default HTTPS domains.
2. Later, when you add your domain:
   - Add custom domain in Vercel and Render.
   - Update env vars:
     - `FRONTEND_PUBLIC_URL`
     - `BACKEND_PUBLIC_URL`
     - `ALLOWED_HOSTS`
     - `CORS_ALLOWED_ORIGINS`
     - `CSRF_TRUSTED_ORIGINS`
3. Re-deploy backend/frontend after domain changes.

## 7. Run smoke tests before launch

Run these checks after deployment:

1. Register/login/token refresh flow.
2. OTP request sends actual SMS and registration verifies with entered code.
3. eSewa initiation redirects and callback unlocks paid exam.
4. Khalti initiation redirects and callback unlocks paid exam.
5. `ExamPurchase` row appears only after verified payment callback.
6. Dropbox list/upload/download endpoints.
7. MCQ/subjective exam availability and submission flow.
8. Admin panel uploads/content management.

If all checks pass, announce go-live and start monitoring logs, error rates, and DB health.
