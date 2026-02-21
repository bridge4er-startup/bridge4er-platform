from datetime import timedelta
import importlib.util
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv
from django.db.backends.signals import connection_created

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    raw = os.getenv(name, default)
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_int(name, default=0, minimum=None):
    raw = os.getenv(name)
    if raw is None:
        value = default
    else:
        try:
            value = int(raw.strip())
        except ValueError:
            value = default
    if minimum is not None:
        value = max(minimum, value)
    return value


def build_database_config():
    database_url = os.getenv("DATABASE_URL", "").strip()
    default_sqlite_path = BASE_DIR.parent / "db.sqlite3"
    if not database_url:
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": default_sqlite_path,
        }

    parsed = urlparse(database_url)
    scheme = parsed.scheme.lower()

    if scheme in {"postgres", "postgresql", "pgsql"}:
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": unquote(parsed.path.lstrip("/")),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "",
            "PORT": str(parsed.port or ""),
            "CONN_MAX_AGE": int(os.getenv("CONN_MAX_AGE", "60")),
        }

    if scheme in {"sqlite", "sqlite3"}:
        db_path = unquote(parsed.path or "")
        if not db_path or db_path == "/":
            db_name = default_sqlite_path
        else:
            db_name = Path(db_path)
            if not db_name.is_absolute():
                db_name = (BASE_DIR / db_name).resolve()
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": db_name,
        }

    raise RuntimeError(f"Unsupported DATABASE_URL scheme: {scheme}")


DEBUG = env_bool("DEBUG", False)

_DEFAULT_SECRET_KEY = "bridge4er-platform-dev-secret-key-0123456789"
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = _DEFAULT_SECRET_KEY
    else:
        raise RuntimeError("SECRET_KEY is required when DEBUG is False.")
elif len(SECRET_KEY) < 32 and not DEBUG:
    raise RuntimeError("SECRET_KEY must be at least 32 characters in production.")
elif len(SECRET_KEY) < 32:
    SECRET_KEY = (f"{SECRET_KEY}{_DEFAULT_SECRET_KEY}")[:64]

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
if DEBUG and not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
if not DEBUG and not ALLOWED_HOSTS:
    raise RuntimeError("ALLOWED_HOSTS is required when DEBUG is False.")

# Dropbox
DROPBOX_ACCESS_TOKEN = os.getenv("DROPBOX_ACCESS_TOKEN")
DROPBOX_REFRESH_TOKEN = os.getenv("DROPBOX_REFRESH_TOKEN", "")
DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET", "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
    "exams",
    "payments",
    "storage",
]

if importlib.util.find_spec("import_export"):
    INSTALLED_APPS.append("import_export")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", not CORS_ALLOWED_ORIGINS)
else:
    CORS_ALLOW_ALL_ORIGINS = False

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

ROOT_URLCONF = "bridge4er.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "bridge4er.wsgi.application"

DATABASES = {"default": build_database_config()}


def _configure_sqlite_connection(sender, connection, **kwargs):
    if connection.vendor != "sqlite":
        return
    cursor = connection.cursor()
    # Keep journal file persistent so SQLite does not need delete permissions.
    cursor.execute("PRAGMA journal_mode=PERSIST;")
    cursor.execute("PRAGMA synchronous=NORMAL;")


connection_created.connect(_configure_sqlite_connection)

if DEBUG:
    AUTH_PASSWORD_VALIDATORS = []
else:
    AUTH_PASSWORD_VALIDATORS = [
        {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
        {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
        {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
        {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    ]

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "SIGNING_KEY": SECRET_KEY,
}

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", str(BASE_DIR / "media")))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Security headers and HTTPS behavior
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = env_bool("USE_X_FORWARDED_HOST", True)
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", not DEBUG)
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", not DEBUG)
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000" if not DEBUG else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = env_bool("SECURE_CONTENT_TYPE_NOSNIFF", True)
SECURE_REFERRER_POLICY = os.getenv("SECURE_REFERRER_POLICY", "same-origin")
X_FRAME_OPTIONS = os.getenv("X_FRAME_OPTIONS", "DENY")

# App behavior toggles
SHOW_OTP_IN_RESPONSE = env_bool("SHOW_OTP_IN_RESPONSE", DEBUG)
ALLOW_INSECURE_PAYMENT_VERIFICATION = env_bool("ALLOW_INSECURE_PAYMENT_VERIFICATION", DEBUG)
ENABLE_DEMO_EXAM_SETS = env_bool("ENABLE_DEMO_EXAM_SETS", DEBUG)
DROPBOX_AUTO_SYNC_COOLDOWN_SECONDS = env_int("DROPBOX_AUTO_SYNC_COOLDOWN_SECONDS", 600, minimum=60)
DROPBOX_LIST_CACHE_TTL_SECONDS = env_int("DROPBOX_LIST_CACHE_TTL_SECONDS", 300, minimum=30)
DROPBOX_LIST_CACHE_STALE_TTL_SECONDS = env_int(
    "DROPBOX_LIST_CACHE_STALE_TTL_SECONDS",
    1800,
    minimum=DROPBOX_LIST_CACHE_TTL_SECONDS,
)

# Public URLs used in payment callbacks
FRONTEND_PUBLIC_URL = os.getenv("FRONTEND_PUBLIC_URL", "http://localhost:3000").rstrip("/")
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/")
PAYMENT_RESULT_PATH = os.getenv("PAYMENT_RESULT_PATH", "/payment/result")

# OTP provider configuration
OTP_PROVIDER = os.getenv("OTP_PROVIDER", "local").strip().lower()
OTP_DEFAULT_COUNTRY_CODE = os.getenv("OTP_DEFAULT_COUNTRY_CODE", "+977").strip() or "+977"
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SERVICE_SID = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")
TWILIO_VERIFY_CHANNEL = os.getenv("TWILIO_VERIFY_CHANNEL", "sms").strip().lower()

# Payment gateway configuration
ESEWA_ENV = os.getenv("ESEWA_ENV", "sandbox").strip().lower()
ESEWA_PRODUCT_CODE = os.getenv("ESEWA_PRODUCT_CODE", os.getenv("ESEWA_MERCHANT_ID", "")).strip()
ESEWA_SECRET_KEY = os.getenv("ESEWA_SECRET_KEY", "")

KHALTI_ENV = os.getenv("KHALTI_ENV", "sandbox").strip().lower()
KHALTI_SECRET_KEY = os.getenv("KHALTI_SECRET_KEY", "")

# Optional email settings for subjective submission alerts
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@bridge4er.local")
ADMIN_ALERT_EMAIL = os.getenv("ADMIN_ALERT_EMAIL", "")
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
