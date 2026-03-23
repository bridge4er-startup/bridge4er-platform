from pathlib import Path

from storage.dropbox_service import create_folder, download_file, upload_file

ALLOWED_ROOT = "/bridge4er/"


def normalize_dropbox_path(path: str) -> str:
    if not isinstance(path, str):
        return ""
    value = path.strip()
    if not value:
        return ""
    parts = [segment for segment in value.split("/") if segment]
    if not parts:
        return ""
    return "/" + "/".join(parts)


def sanitize_filename(name: str, fallback: str = "file") -> str:
    base = Path(str(name or "")).name.strip()
    if not base:
        base = fallback
    return base.replace("/", "-").replace("\\", "-")


def ensure_dropbox_folder(path: str) -> str:
    normalized = normalize_dropbox_path(path)
    if not normalized:
        return ""
    parts = [segment for segment in normalized.split("/") if segment]
    running = ""
    for segment in parts:
        running = f"{running}/{segment}" if running else f"/{segment}"
        if running.lower() == "/bridge4er":
            continue
        create_folder(running)
    return normalized


def upload_file_to_dropbox(path: str, file_obj):
    normalized = normalize_dropbox_path(path)
    if not normalized:
        raise ValueError("Invalid Dropbox path")
    ensure_dropbox_folder(str(Path(normalized).parent))
    if hasattr(file_obj, "seek"):
        try:
            file_obj.seek(0)
        except Exception:
            pass
    return upload_file(normalized, file_obj)


def download_file_from_dropbox(path: str) -> bytes:
    normalized = normalize_dropbox_path(path)
    if not normalized:
        raise ValueError("Invalid Dropbox path")
    return download_file(normalized)
