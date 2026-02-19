from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
import re

from django.conf import settings
import requests

try:
    from import_export.formats import base_formats

    DJANGO_IMPORT_EXPORT_AVAILABLE = True
except ImportError:
    base_formats = None
    DJANGO_IMPORT_EXPORT_AVAILABLE = False


SUPPORTED_IMPORT_EXTENSIONS = (".csv", ".tsv", ".json", ".xlsx", ".xls")
_TEXT_EXTENSIONS = {".csv", ".tsv", ".json"}
DROPBOX_ALLOWED_ROOT = "/bridge4er/"
DROPBOX_SHARED_HOSTS = {"dropbox.com", "www.dropbox.com", "dl.dropboxusercontent.com"}
_FORMAT_CLASS_BY_EXTENSION = {
    ".csv": "CSV",
    ".tsv": "TSV",
    ".json": "JSON",
    ".xlsx": "XLSX",
    ".xls": "XLS",
}


def _as_instruction_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except (TypeError, ValueError):
            pass
        return [line.strip() for line in raw.splitlines() if line.strip()]
    return []


def _append_embedded_exam_metadata(
    normalized_rows: list[dict[str, str]],
    exam_info: dict[str, Any] | None,
    instructions: list[str] | None,
) -> list[dict[str, str]]:
    if not normalized_rows:
        return normalized_rows

    if exam_info:
        normalized_rows[0]["__exam_info__"] = json.dumps(_normalize_row(exam_info), ensure_ascii=False)
    if instructions:
        normalized_rows[0]["__instructions__"] = json.dumps(instructions, ensure_ascii=False)
    return normalized_rows


def _parse_json_rows(raw_bytes: bytes) -> list[dict[str, str]]:
    text = raw_bytes.decode("utf-8-sig")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON file: {exc}") from exc

    rows: list[Any]
    exam_info: dict[str, Any] = {}
    instructions: list[str] = []
    if isinstance(parsed, list):
        rows = parsed
    elif isinstance(parsed, dict):
        if isinstance(parsed.get("examInfo"), dict):
            exam_info = parsed.get("examInfo") or {}
        instructions = _as_instruction_list(parsed.get("instructions"))

        rows = []
        sections = parsed.get("sections")
        if isinstance(sections, list):
            order_counter = 1
            for section in sections:
                if not isinstance(section, dict):
                    continue
                section_title = str(section.get("title") or "").strip()
                section_label = str(section.get("section") or "").strip()
                section_questions = section.get("questions")
                if not isinstance(section_questions, list):
                    continue
                for item in section_questions:
                    if not isinstance(item, dict):
                        continue
                    row = dict(item)
                    if not row.get("question_header"):
                        if section_title:
                            row["question_header"] = section_title
                        elif section_label:
                            row["question_header"] = f"Section {section_label}"
                    if not row.get("order"):
                        row["order"] = order_counter
                    rows.append(row)
                    order_counter += 1

        if not rows:
            for key in (
                "questions",
                "items",
                "data",
                "rows",
                "records",
                "mcqs",
                "objective_questions",
                "exam_questions",
                "subjective_questions",
            ):
                value = parsed.get(key)
                if isinstance(value, list):
                    rows = value
                    break

        if not rows:
            lowered_keys = {str(k).strip().lower() for k in parsed.keys()}
            question_markers = {
                "question",
                "question_text",
                "questionheader",
                "options",
                "option_a",
                "option_b",
                "option_c",
                "option_d",
                "marks",
            }
            if lowered_keys & question_markers:
                rows = [parsed]
            else:
                dict_values = [value for value in parsed.values() if isinstance(value, dict)]
                if dict_values and len(dict_values) >= max(1, len(parsed) // 2):
                    rows = dict_values
    else:
        raise ValueError("JSON file must contain an array or object with question rows")

    normalized_rows = [_normalize_row(item) for item in rows if isinstance(item, dict)]
    return _append_embedded_exam_metadata(normalized_rows, exam_info, instructions)


def resolve_project_file_path(file_path: str) -> Path:
    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("file_path is required")

    candidate = Path(file_path.strip()).expanduser()
    if not candidate.is_absolute():
        candidate = Path(settings.BASE_DIR) / candidate

    candidate = candidate.resolve()
    base_dir = Path(settings.BASE_DIR).resolve()
    if candidate != base_dir and base_dir not in candidate.parents:
        raise ValueError("file_path must be inside the backend project directory")
    if not candidate.exists() or not candidate.is_file():
        raise ValueError(f"file not found at path: {candidate}")

    return candidate


def _normalize_row(row: dict[str, Any]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in row.items():
        if key is None:
            continue
        norm_key = str(key).strip()
        if not norm_key:
            continue
        if value is None:
            normalized[norm_key] = ""
        elif isinstance(value, str):
            normalized[norm_key] = value.strip()
        else:
            normalized[norm_key] = str(value).strip()
    return normalized


def _parse_with_import_export(filename: str, raw_bytes: bytes) -> list[dict[str, str]]:
    extension = Path(filename).suffix.lower()
    if extension == ".json":
        return _parse_json_rows(raw_bytes)

    format_name = _FORMAT_CLASS_BY_EXTENSION.get(extension)
    if not format_name:
        raise ValueError(
            f"Unsupported file format '{extension}'. "
            f"Allowed: {', '.join(SUPPORTED_IMPORT_EXTENSIONS)}"
        )

    if not DJANGO_IMPORT_EXPORT_AVAILABLE or base_formats is None:
        raise ValueError(
            "django-import-export is required for this import. "
            "Install: pip install django-import-export tablib openpyxl xlrd"
        )

    format_cls = getattr(base_formats, format_name, None)
    if format_cls is None:
        raise ValueError(f"File format '{extension}' is not enabled in django-import-export")

    payload: Any = raw_bytes
    if extension in _TEXT_EXTENSIONS:
        payload = raw_bytes.decode("utf-8-sig")

    dataset = format_cls().create_dataset(payload)
    if not dataset.headers:
        return []

    return [_normalize_row(row) for row in dataset.dict]


def _parse_without_import_export(filename: str, raw_bytes: bytes) -> list[dict[str, str]]:
    extension = Path(filename).suffix.lower()
    if extension in {".xlsx", ".xls"}:
        raise ValueError(
            "Excel import requires django-import-export dependencies. "
            "Install: pip install django-import-export tablib openpyxl xlrd"
        )

    if extension == ".json":
        return _parse_json_rows(raw_bytes)

    text = raw_bytes.decode("utf-8-sig")

    if extension in {".csv", ".tsv"}:
        delimiter = "\t" if extension == ".tsv" else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        return [_normalize_row(row) for row in reader]

    raise ValueError(
        f"Unsupported file format '{extension}'. "
        f"Allowed: {', '.join(SUPPORTED_IMPORT_EXTENSIONS)}"
    )


def parse_rows_from_uploaded_file(uploaded_file) -> list[dict[str, str]]:
    filename = (uploaded_file.name or "").strip()
    if not filename:
        raise ValueError("Uploaded file must have a name")
    raw_bytes = uploaded_file.read()
    if DJANGO_IMPORT_EXPORT_AVAILABLE:
        return _parse_with_import_export(filename, raw_bytes)
    return _parse_without_import_export(filename, raw_bytes)


def _is_dropbox_path(file_path: str) -> bool:
    return isinstance(file_path, str) and file_path.strip().lower().startswith(DROPBOX_ALLOWED_ROOT)


def _is_dropbox_shared_url(file_path: str) -> bool:
    if not isinstance(file_path, str):
        return False
    candidate = file_path.strip()
    if not candidate.lower().startswith(("http://", "https://")):
        return False
    try:
        parsed = urlparse(candidate)
    except Exception:
        return False
    return parsed.netloc.lower() in DROPBOX_SHARED_HOSTS


def _to_direct_dropbox_url(shared_url: str) -> str:
    parsed = urlparse(shared_url.strip())
    host = parsed.netloc.lower()
    query_items = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_items["dl"] = "1"
    if host == "dl.dropboxusercontent.com":
        query_items.pop("raw", None)
        return urlunparse(
            (
                parsed.scheme or "https",
                parsed.netloc,
                parsed.path,
                parsed.params,
                urlencode(query_items),
                parsed.fragment,
            )
        )
    return urlunparse(
        (
            parsed.scheme or "https",
            "www.dropbox.com",
            parsed.path,
            parsed.params,
            urlencode(query_items),
            parsed.fragment,
        )
    )


def _filename_from_response(url: str, response: requests.Response) -> str:
    content_disposition = str(response.headers.get("Content-Disposition") or "")
    match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^\";]+)"?', content_disposition)
    if match:
        candidate = str(match.group(1)).strip().strip('"')
        if candidate:
            return candidate
    parsed = urlparse(url)
    return Path(parsed.path).name or "questions.csv"


def parse_rows_from_dropbox_shared_url(shared_url: str) -> list[dict[str, str]]:
    if not _is_dropbox_shared_url(shared_url):
        raise ValueError("Only Dropbox links are allowed")

    direct_url = _to_direct_dropbox_url(shared_url)
    try:
        response = requests.get(direct_url, timeout=60)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Failed to download Dropbox link: {exc}") from exc

    filename = _filename_from_response(shared_url, response)
    raw_bytes = response.content
    if DJANGO_IMPORT_EXPORT_AVAILABLE:
        return _parse_with_import_export(filename, raw_bytes)
    return _parse_without_import_export(filename, raw_bytes)


def parse_rows_from_dropbox_path(dropbox_path: str) -> list[dict[str, str]]:
    if not _is_dropbox_path(dropbox_path):
        raise ValueError(f"dropbox path must start with {DROPBOX_ALLOWED_ROOT}")

    from storage.dropbox_service import download_file

    cleaned_path = dropbox_path.strip()
    raw_bytes = download_file(cleaned_path)
    filename = Path(cleaned_path).name
    if not filename:
        raise ValueError("Invalid Dropbox file path")
    if DJANGO_IMPORT_EXPORT_AVAILABLE:
        return _parse_with_import_export(filename, raw_bytes)
    return _parse_without_import_export(filename, raw_bytes)


def parse_rows_from_path(file_path: str) -> list[dict[str, str]]:
    if _is_dropbox_path(file_path):
        return parse_rows_from_dropbox_path(file_path)
    if _is_dropbox_shared_url(file_path):
        return parse_rows_from_dropbox_shared_url(file_path)

    resolved = resolve_project_file_path(file_path)
    raw_bytes = resolved.read_bytes()
    if DJANGO_IMPORT_EXPORT_AVAILABLE:
        return _parse_with_import_export(resolved.name, raw_bytes)
    return _parse_without_import_export(resolved.name, raw_bytes)
