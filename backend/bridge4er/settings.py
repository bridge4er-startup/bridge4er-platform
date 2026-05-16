from datetime import timedelta
import importlib.util
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv
from corsheaders.defaults import default_headers
from django.db.backends.signals import connection_created

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _clean_env_value(raw):
    if raw is None:
        return None
    value = str(raw).replace("\ufeff", "")
    value = value.replace("\\r", "").replace("\\n", "")
    value = value.replace("\r", "").replace("\n", "")
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1].strip()
    return value


def env_text(name, default=""):
    raw = os.getenv(name)
    if raw is None:
        return default
    cleaned = _clean_env_value(raw)
    if cleaned is None:
        return default
    return cleaned


def env_bool(name, default=False):
    raw = env_text(name, None)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    raw = env_text(name, default)
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_int(name, default=0, minimum=None):
    raw = env_text(name, None)
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
    database_url = env_text("DATABASE_URL", "").strip()
    default_sqlite_path = BASE_DIR.parent / "db.sqlite3"
    if not database_url:
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": default_sqlite_path,
        }

    parsed = urlparse(database_url)
    scheme = parsed.scheme.lower()

    if scheme in {"postgres", "postgresql", "pgsql"}:
        conn_max_age = env_int("CONN_MAX_AGE", 0, minimum=0)
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": unquote(parsed.path.lstrip("/")),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "",
            "PORT": str(parsed.port or ""),
            "CONN_MAX_AGE": conn_max_age,
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
SECRET_KEY = env_text("SECRET_KEY", "")
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
DROPBOX_ACCESS_TOKEN = env_text("DROPBOX_ACCESS_TOKEN", "")
DROPBOX_REFRESH_TOKEN = env_text("DROPBOX_REFRESH_TOKEN", "")
DROPBOX_APP_KEY = env_text("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = env_text("DROPBOX_APP_SECRET", "")

# Storage provider
STORAGE_PROVIDER = (env_text("STORAGE_PROVIDER", "dropbox") or "dropbox").strip().lower() or "dropbox"
SUPABASE_URL = (env_text("SUPABASE_URL", "") or "").strip().rstrip("/")
SUPABASE_STORAGE_BUCKET = (env_text("SUPABASE_STORAGE_BUCKET", "bridge4ER") or "bridge4ER").strip() or "bridge4ER"
SUPABASE_STORAGE_ROOT_PREFIX = (
    (env_text("SUPABASE_STORAGE_ROOT_PREFIX", "bridge4er") or "bridge4er").strip() or "bridge4er"
)
SUPABASE_STORAGE_PUBLIC = env_bool("SUPABASE_STORAGE_PUBLIC", False)
SUPABASE_SERVICE_ROLE_KEY = (env_text("SUPABASE_SERVICE_ROLE_KEY", "") or "").strip()
SUPABASE_SIGNED_URL_TTL_SECONDS = env_int("SUPABASE_SIGNED_URL_TTL_SECONDS", 3600, minimum=60)
SUPABASE_REQUEST_TIMEOUT_SECONDS = env_int("SUPABASE_REQUEST_TIMEOUT_SECONDS", 45, minimum=5)

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
    "contributions",
    "discussions",
]

if importlib.util.find_spec("import_export"):
    INSTALLED_APPS.append("import_export")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.gzip.GZipMiddleware",
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
CORS_ALLOW_HEADERS = list(default_headers) + ["cache-control", "pragma"]

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

# Cache (shared across gunicorn workers when using Redis/file-based cache)
CACHE_BACKEND = env_text("CACHE_BACKEND", "").strip()
CACHE_LOCATION = env_text("CACHE_LOCATION", "").strip()
CACHE_KEY_PREFIX = env_text("CACHE_KEY_PREFIX", "bridge4er")
REDIS_URL = env_text("REDIS_URL", "").strip()

if not CACHE_BACKEND:
    if REDIS_URL:
        CACHE_BACKEND = "django_redis.cache.RedisCache"
    else:
        CACHE_BACKEND = "django.core.cache.backends.filebased.FileBasedCache"

if not CACHE_LOCATION:
    if CACHE_BACKEND == "django_redis.cache.RedisCache" and REDIS_URL:
        CACHE_LOCATION = REDIS_URL
    else:
        CACHE_LOCATION = str(BASE_DIR / "cache")

CACHES = {
    "default": {
        "BACKEND": CACHE_BACKEND,
        "LOCATION": CACHE_LOCATION,
        "KEY_PREFIX": CACHE_KEY_PREFIX,
    }
}
if CACHE_BACKEND == "django_redis.cache.RedisCache":
    CACHES["default"]["OPTIONS"] = {
        "CLIENT_CLASS": "django_redis.client.DefaultClient",
        "IGNORE_EXCEPTIONS": True,
    }
elif CACHE_BACKEND.endswith("FileBasedCache"):
    try:
        Path(CACHE_LOCATION).mkdir(parents=True, exist_ok=True)
    except Exception:
        # Avoid crashing startup if the cache directory cannot be created.
        pass

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

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kathmandu"
USE_I18N = True
USE_TZ = True

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
SECURE_HSTS_SECONDS = int(env_text("SECURE_HSTS_SECONDS", "31536000" if not DEBUG else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = env_bool("SECURE_CONTENT_TYPE_NOSNIFF", True)
SECURE_REFERRER_POLICY = env_text("SECURE_REFERRER_POLICY", "same-origin")
X_FRAME_OPTIONS = env_text("X_FRAME_OPTIONS", "DENY")

# App behavior toggles
ALLOW_INSECURE_PAYMENT_VERIFICATION = env_bool("ALLOW_INSECURE_PAYMENT_VERIFICATION", DEBUG)
ENABLE_DEMO_EXAM_SETS = env_bool("ENABLE_DEMO_EXAM_SETS", DEBUG)
DROPBOX_AUTO_SYNC_ENABLED = env_bool("DROPBOX_AUTO_SYNC_ENABLED", False)
DROPBOX_AUTO_SYNC_COOLDOWN_SECONDS = env_int("DROPBOX_AUTO_SYNC_COOLDOWN_SECONDS", 600, minimum=60)
DROPBOX_LIST_CACHE_TTL_SECONDS = env_int("DROPBOX_LIST_CACHE_TTL_SECONDS", 3600, minimum=60)
DROPBOX_LIST_CACHE_STALE_TTL_SECONDS = env_int(
    "DROPBOX_LIST_CACHE_STALE_TTL_SECONDS",
    86400,
    minimum=DROPBOX_LIST_CACHE_TTL_SECONDS,
)
DROPBOX_ALLOW_PUBLIC_LISTING = env_bool("DROPBOX_ALLOW_PUBLIC_LISTING", False)
DROPBOX_OBJECTIVE_COUNT_CACHE_TTL_SECONDS = env_int(
    "DROPBOX_OBJECTIVE_COUNT_CACHE_TTL_SECONDS",
    1800,
    minimum=60,
)
DROPBOX_OBJECTIVE_COUNT_CACHE_STALE_TTL_SECONDS = env_int(
    "DROPBOX_OBJECTIVE_COUNT_CACHE_STALE_TTL_SECONDS",
    7200,
    minimum=DROPBOX_OBJECTIVE_COUNT_CACHE_TTL_SECONDS,
)

# Public URLs used in API responses
FRONTEND_PUBLIC_URL = env_text("FRONTEND_PUBLIC_URL", "http://localhost:3000").rstrip("/")
BACKEND_PUBLIC_URL = env_text("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/")

# Email settings for notifications
DEFAULT_FROM_EMAIL = env_text("DEFAULT_FROM_EMAIL", "bridge4er@gmail.com")
ADMIN_ALERT_EMAIL = env_text("ADMIN_ALERT_EMAIL", "")
EMAIL_HOST_PASSWORD = (
    env_text("EMAIL_HOST_PASSWORD", "").strip()
    or env_text("GMAIL_APP_PASSWORD", "").strip()
    or env_text("GOOGLE_APP_PASSWORD", "").strip()
)
EMAIL_BACKEND = env_text(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = env_text("EMAIL_HOST", "smtp.gmail.com").strip()
EMAIL_PORT = env_int("EMAIL_PORT", 587, minimum=1)
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = env_text("EMAIL_HOST_USER", DEFAULT_FROM_EMAIL).strip()
EMAIL_TIMEOUT_SECONDS = env_int("EMAIL_TIMEOUT_SECONDS", 8, minimum=1)
