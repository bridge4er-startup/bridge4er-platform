import os
import threading
from urllib.parse import quote

import dropbox
import requests
from django.conf import settings
from django.db import connection

_DROPBOX_PROVIDER = "dropbox"
_SUPABASE_PROVIDER = "supabase"
_DEFAULT_APP_ROOT = "bridge4ER"
_SUPABASE_BUCKET_PUBLIC_CACHE_SECONDS = 300


def _storage_provider():
    configured = str(getattr(settings, "STORAGE_PROVIDER", _DROPBOX_PROVIDER) or _DROPBOX_PROVIDER).strip().lower()
    if configured in {_DROPBOX_PROVIDER, _SUPABASE_PROVIDER}:
        return configured
    return _DROPBOX_PROVIDER


def _is_supabase_provider():
    return _storage_provider() == _SUPABASE_PROVIDER


def _normalize_path(path):
    if not isinstance(path, str):
        return ""
    value = path.strip().replace("\\", "/")
    if not value:
        return ""
    parts = [segment for segment in value.split("/") if segment]
    if not parts:
        return "/"
    return "/" + "/".join(parts)


def _path_segments(path):
    return [segment for segment in _normalize_path(path).split("/") if segment]


def _storage_root_segment():
    configured = str(getattr(settings, "SUPABASE_STORAGE_ROOT_PREFIX", _DEFAULT_APP_ROOT) or _DEFAULT_APP_ROOT).strip()
    if configured.lower() == _DEFAULT_APP_ROOT.lower():
        return _DEFAULT_APP_ROOT
    return configured or _DEFAULT_APP_ROOT


def _supabase_bucket():
    configured = str(getattr(settings, "SUPABASE_STORAGE_BUCKET", "bridge4ER") or "bridge4ER").strip()
    return configured or "bridge4ER"


def _supabase_url():
    value = str(getattr(settings, "SUPABASE_URL", "") or "").strip().rstrip("/")
    return value


def _supabase_service_role_key():
    return str(getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "") or "").strip()


def _supabase_signed_ttl_seconds():
    value = getattr(settings, "SUPABASE_SIGNED_URL_TTL_SECONDS", 3600)
    try:
        return max(60, int(value))
    except (TypeError, ValueError):
        return 3600


def _supabase_timeout_seconds():
    value = getattr(settings, "SUPABASE_REQUEST_TIMEOUT_SECONDS", 45)
    try:
        return max(5, int(value))
    except (TypeError, ValueError):
        return 45


def _supabase_list_api_limit():
    return 1000


def _normalize_key(key):
    return str(key or "").strip().replace("\\", "/").strip("/")


def _is_rooted_key(key):
    normalized = _normalize_key(key)
    if not normalized:
        return False
    root = _storage_root_segment().strip("/").lower()
    if not root:
        return False
    lowered = normalized.lower()
    return lowered == root or lowered.startswith(f"{root}/")


def _supabase_candidate_keys_from_app_path(path):
    normalized = _normalize_path(path)
    if normalized in {"", "/"}:
        return []

    segments = _path_segments(normalized)
    if not segments:
        return []

    root_segment = _storage_root_segment().strip("/")
    root_lower = root_segment.lower()
    root_aliases = []
    for alias in (root_segment, "bridge4ER", "bridge4er"):
        cleaned_alias = _normalize_key(alias)
        if cleaned_alias and cleaned_alias not in root_aliases:
            root_aliases.append(cleaned_alias)
    joined = "/".join(segments)
    candidates = [joined]

    if root_segment:
        if segments[0].lower() == root_lower:
            trimmed = "/".join(segments[1:])
            if trimmed:
                candidates.append(trimmed)
                for alias in root_aliases:
                    alias_key = f"{alias}/{trimmed}"
                    if alias_key not in candidates:
                        candidates.append(alias_key)
        else:
            for alias in root_aliases:
                candidates.append(f"{alias}/{joined}")

    deduped = []
    seen = set()
    for candidate in candidates:
        normalized_candidate = _normalize_key(candidate)
        if not normalized_candidate or normalized_candidate in seen:
            continue
        deduped.append(normalized_candidate)
        seen.add(normalized_candidate)
    return deduped


def _supabase_key_from_app_path(path):
    candidates = _supabase_candidate_keys_from_app_path(path)
    return candidates[0] if candidates else ""


def _app_path_from_supabase_key(key):
    normalized = _normalize_key(key)
    root_segment = _storage_root_segment().strip("/")
    if not normalized:
        return f"/{_DEFAULT_APP_ROOT}"
    if _is_rooted_key(normalized):
        segments = [segment for segment in normalized.split("/") if segment]
        if not segments:
            return f"/{_DEFAULT_APP_ROOT}"
        return "/" + "/".join([_DEFAULT_APP_ROOT, *segments[1:]])
    return f"/{_DEFAULT_APP_ROOT}/{normalized}"


def _supabase_headers(require_service_key=False, content_type=None):
    headers = {}
    service_key = _supabase_service_role_key()
    if require_service_key and not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for private storage operations.")
    if service_key:
        headers["Authorization"] = f"Bearer {service_key}"
        headers["apikey"] = service_key
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _supabase_object_public_url(key):
    supabase_url = _supabase_url()
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is required for Supabase storage.")
    bucket = quote(_supabase_bucket(), safe="")
    encoded_key = quote(str(key or "").strip(), safe="/")
    return f"{supabase_url}/storage/v1/object/public/{bucket}/{encoded_key}"


_supabase_bucket_public_lock = threading.Lock()
_supabase_bucket_public_cached_value = None
_supabase_bucket_public_checked_at = 0.0


def _supabase_bucket_is_public():
    if bool(getattr(settings, "SUPABASE_STORAGE_PUBLIC", False)):
        return True

    global _supabase_bucket_public_cached_value, _supabase_bucket_public_checked_at
    with _supabase_bucket_public_lock:
        import time

        current_time = time.time()
        if (
            _supabase_bucket_public_cached_value is not None
            and current_time - float(_supabase_bucket_public_checked_at) < _SUPABASE_BUCKET_PUBLIC_CACHE_SECONDS
        ):
            return bool(_supabase_bucket_public_cached_value)

        value = False
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT public FROM storage.buckets WHERE id = %s", [_supabase_bucket()])
                row = cursor.fetchone()
                value = bool(row[0]) if row else False
        except Exception:
            value = False

        _supabase_bucket_public_cached_value = bool(value)
        _supabase_bucket_public_checked_at = current_time
        return bool(value)


def _coerce_size(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _supabase_object_row_from_api_head(key):
    normalized_key = _normalize_key(key)
    if not normalized_key or not _supabase_url():
        return None
    endpoint = f"{_supabase_url()}/storage/v1/object/{quote(_supabase_bucket(), safe='')}/{quote(normalized_key, safe='/')}"
    try:
        response = requests.head(
            endpoint,
            headers=_supabase_headers(require_service_key=True),
            timeout=_supabase_timeout_seconds(),
        )
    except Exception:
        return None
    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        return None
    return {
        "key": normalized_key,
        "size": _coerce_size(response.headers.get("Content-Length")),
        "modified": response.headers.get("Last-Modified", ""),
    }


def _supabase_list_api_page(prefix_key="", offset=0):
    if not _supabase_url():
        raise RuntimeError("SUPABASE_URL is required for Supabase storage.")
    endpoint = f"{_supabase_url()}/storage/v1/object/list/{quote(_supabase_bucket(), safe='')}"
    payload = {
        "prefix": _normalize_key(prefix_key),
        "limit": _supabase_list_api_limit(),
        "offset": max(0, int(offset or 0)),
        "sortBy": {"column": "name", "order": "asc"},
    }
    response = requests.post(
        endpoint,
        json=payload,
        headers=_supabase_headers(require_service_key=True, content_type="application/json"),
        timeout=_supabase_timeout_seconds(),
    )
    response.raise_for_status()
    data = response.json() if response.content else []
    if not isinstance(data, list):
        return []
    return data


def _supabase_item_is_file(item):
    if not isinstance(item, dict):
        return False
    if item.get("id"):
        return True
    metadata = item.get("metadata")
    return isinstance(metadata, dict) and bool(metadata)


def _supabase_item_size(item):
    metadata = item.get("metadata") if isinstance(item, dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    for key in ("size", "contentLength", "content_length", "Content-Length"):
        if key in metadata:
            return _coerce_size(metadata.get(key))
    return 0


def _supabase_item_modified(item):
    if not isinstance(item, dict):
        return ""
    return (
        str(item.get("updated_at") or "").strip()
        or str(item.get("created_at") or "").strip()
        or str(item.get("last_accessed_at") or "").strip()
    )


def _supabase_query_object_rows_via_api(prefix_key=""):
    normalized_prefix = _normalize_key(prefix_key)
    rows = []
    exact_row = _supabase_object_row_from_api_head(normalized_prefix) if normalized_prefix else None
    if exact_row:
        rows.append(exact_row)

    def collect(prefix):
        offset = 0
        while True:
            items = _supabase_list_api_page(prefix, offset=offset)
            if not items:
                break
            for item in items:
                name = str((item or {}).get("name") or "").strip().strip("/")
                if not name:
                    continue
                key = f"{_normalize_key(prefix)}/{name}".strip("/") if prefix else name
                if _supabase_item_is_file(item):
                    rows.append(
                        {
                            "key": _normalize_key(key),
                            "size": _supabase_item_size(item),
                            "modified": _supabase_item_modified(item),
                        }
                    )
                    continue
                collect(key)
            if len(items) < _supabase_list_api_limit():
                break
            offset += _supabase_list_api_limit()

    collect(normalized_prefix)
    return _dedupe_rows_by_key(rows)


def _supabase_query_object_rows(prefix_key=""):
    normalized_prefix = _normalize_key(prefix_key)
    try:
        with connection.cursor() as cursor:
            if normalized_prefix:
                like_value = f"{normalized_prefix}/%"
                cursor.execute(
                    """
                    SELECT name, metadata->>'size' AS size_text, updated_at
                    FROM storage.objects
                    WHERE bucket_id = %s
                      AND (LOWER(name) = %s OR LOWER(name) LIKE %s)
                    ORDER BY name ASC
                    """,
                    [_supabase_bucket(), normalized_prefix.lower(), like_value.lower()],
                )
            else:
                cursor.execute(
                    """
                    SELECT name, metadata->>'size' AS size_text, updated_at
                    FROM storage.objects
                    WHERE bucket_id = %s
                    ORDER BY name ASC
                    """,
                    [_supabase_bucket()],
                )
            rows = cursor.fetchall()

        normalized_rows = []
        for row in rows:
            key = str(row[0] or "").strip()
            if not key:
                continue
            modified_value = row[2].isoformat() if row[2] else ""
            normalized_rows.append(
                {
                    "key": key,
                    "size": _coerce_size(row[1]),
                    "modified": modified_value,
                }
            )
        return normalized_rows
    except Exception:
        return _supabase_query_object_rows_via_api(normalized_prefix)


def _dedupe_rows_by_key(rows):
    deduped = {}
    for row in rows:
        key = _normalize_key((row or {}).get("key"))
        if not key:
            continue
        deduped[key] = {
            **(row or {}),
            "key": key,
        }
    return list(deduped.values())


def _relative_for_prefix(key, prefix):
    normalized_key = _normalize_key(key)
    normalized_prefix = _normalize_key(prefix)
    if normalized_prefix:
        if normalized_key == normalized_prefix:
            return ""
        if normalized_key.startswith(f"{normalized_prefix}/"):
            return normalized_key[len(normalized_prefix) + 1 :]
        return None
    return normalized_key


def _matching_destination_key(source_key, destination_candidates):
    normalized_source = _normalize_key(source_key)
    normalized_candidates = [_normalize_key(item) for item in destination_candidates if _normalize_key(item)]
    if not normalized_source or not normalized_candidates:
        return ""
    source_rooted = _is_rooted_key(normalized_source)
    for candidate in normalized_candidates:
        if _is_rooted_key(candidate) == source_rooted:
            return candidate
    return normalized_candidates[0]


def _first_existing_key(candidates):
    normalized_candidates = [_normalize_key(item) for item in candidates if _normalize_key(item)]
    if not normalized_candidates:
        return ""
    try:
        with connection.cursor() as cursor:
            for candidate in normalized_candidates:
                cursor.execute(
                    """
                    SELECT 1
                    FROM storage.objects
                    WHERE bucket_id = %s AND LOWER(name) = %s
                    LIMIT 1
                    """,
                    [_supabase_bucket(), candidate.lower()],
                )
                if cursor.fetchone():
                    return candidate
            for candidate in normalized_candidates:
                like_value = f"{candidate}/%"
                cursor.execute(
                    """
                    SELECT 1
                    FROM storage.objects
                    WHERE bucket_id = %s AND LOWER(name) LIKE %s
                    LIMIT 1
                    """,
                    [_supabase_bucket(), like_value.lower()],
                )
                if cursor.fetchone():
                    return candidate
    except Exception:
        for candidate in normalized_candidates:
            rows = _supabase_query_object_rows(candidate)
            candidate_lower = candidate.lower()
            if any(
                str(row.get("key") or "").lower() == candidate_lower
                or str(row.get("key") or "").lower().startswith(f"{candidate_lower}/")
                for row in rows
            ):
                return candidate
    return ""


def _supabase_list_folder_with_metadata(path, include_dirs=True, recursive=False):
    prefix_candidates = _supabase_candidate_keys_from_app_path(path)
    if prefix_candidates:
        rows = []
        for prefix_key in prefix_candidates:
            rows.extend(_supabase_query_object_rows(prefix_key=prefix_key))
        rows = _dedupe_rows_by_key(rows)
    else:
        rows = _supabase_query_object_rows(prefix_key="")
    entries = []
    dir_seen = set()

    def add_dir(dir_key):
        normalized_dir = str(dir_key or "").strip("/")
        if not normalized_dir or normalized_dir in dir_seen:
            return
        dir_seen.add(normalized_dir)
        entries.append(
            {
                "name": normalized_dir.split("/")[-1],
                "path": _app_path_from_supabase_key(normalized_dir),
                "is_dir": True,
            }
        )

    for row in rows:
        key = _normalize_key(row.get("key"))
        if not key:
            continue

        matched_prefix = ""
        relative = None
        if prefix_candidates:
            for prefix_candidate in prefix_candidates:
                candidate_relative = _relative_for_prefix(key, prefix_candidate)
                if candidate_relative is None:
                    continue
                matched_prefix = _normalize_key(prefix_candidate)
                relative = candidate_relative
                break
            if relative is None:
                continue
        else:
            relative = key

        if relative == "":
            entries.append(
                {
                    "name": key.split("/")[-1],
                    "path": _app_path_from_supabase_key(key),
                    "size": int(row["size"]),
                    "modified": row["modified"],
                    "is_dir": False,
                }
            )
            continue

        segments = [segment for segment in relative.split("/") if segment]
        if not segments:
            continue

        if not recursive and len(segments) > 1:
            if include_dirs:
                first_level = segments[0]
                dir_key = f"{matched_prefix}/{first_level}" if matched_prefix else first_level
                add_dir(dir_key)
            continue

        if include_dirs and recursive and len(segments) > 1:
            for depth in range(1, len(segments)):
                sub_path = "/".join(segments[:depth])
                dir_key = f"{matched_prefix}/{sub_path}" if matched_prefix else sub_path
                add_dir(dir_key)

        entries.append(
            {
                "name": key.split("/")[-1],
                "path": _app_path_from_supabase_key(key),
                "size": int(row["size"]),
                "modified": row["modified"],
                "is_dir": False,
            }
        )

    entries.sort(key=lambda item: str(item.get("modified") or ""), reverse=True)
    return entries


def _supabase_create_signed_url(key, expires_in=None):
    supabase_url = _supabase_url()
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is required for Supabase storage.")
    service_key = _supabase_service_role_key()
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for private storage links.")
    ttl = _supabase_signed_ttl_seconds() if expires_in is None else max(60, int(expires_in))
    bucket = quote(_supabase_bucket(), safe="")
    endpoint = f"{supabase_url}/storage/v1/object/sign/{bucket}/{quote(str(key or '').strip(), safe='/')}"
    response = requests.post(
        endpoint,
        json={"expiresIn": ttl},
        headers=_supabase_headers(require_service_key=True, content_type="application/json"),
        timeout=_supabase_timeout_seconds(),
    )
    response.raise_for_status()
    payload = response.json() if response.content else {}
    signed_path = payload.get("signedURL") or payload.get("signedUrl") or ""
    if not signed_path:
        raise RuntimeError("Supabase signed URL response did not contain a URL.")
    if signed_path.startswith("http://") or signed_path.startswith("https://"):
        return signed_path
    if signed_path.startswith("/"):
        return f"{supabase_url}/storage/v1{signed_path}"
    return f"{supabase_url}/storage/v1/{signed_path}"


def _supabase_download_file(path):
    candidate_keys = _supabase_candidate_keys_from_app_path(path)
    if not candidate_keys:
        raise RuntimeError("Invalid storage path.")

    timeout = _supabase_timeout_seconds()
    last_error = None
    if _supabase_bucket_is_public():
        for key in candidate_keys:
            try:
                url = _supabase_object_public_url(key)
                response = requests.get(url, timeout=timeout)
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                return response.content
            except Exception as exc:
                last_error = exc
                continue
    else:
        for key in candidate_keys:
            try:
                signed_url = _supabase_create_signed_url(key, expires_in=120)
                response = requests.get(signed_url, timeout=timeout)
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                return response.content
            except Exception as exc:
                last_error = exc
                continue

    if last_error:
        raise last_error
    raise RuntimeError("File not found in Supabase storage.")


def _supabase_get_file_metadata(path):
    candidate_keys = _supabase_candidate_keys_from_app_path(path)
    if not candidate_keys:
        return None
    try:
        with connection.cursor() as cursor:
            for key in candidate_keys:
                cursor.execute(
                    """
                    SELECT name, metadata->>'size' AS size_text, updated_at
                    FROM storage.objects
                    WHERE bucket_id = %s AND LOWER(name) = %s
                    LIMIT 1
                    """,
                    [_supabase_bucket(), key.lower()],
                )
                row = cursor.fetchone()
                if not row:
                    continue
                return {
                    "name": str(row[0]).split("/")[-1],
                    "path": _app_path_from_supabase_key(row[0]),
                    "size": _coerce_size(row[1]),
                    "modified": row[2].isoformat() if row[2] else "",
                }
    except Exception:
        for key in candidate_keys:
            row = _supabase_object_row_from_api_head(key)
            if not row:
                continue
            return {
                "name": str(row["key"]).split("/")[-1],
                "path": _app_path_from_supabase_key(row["key"]),
                "size": _coerce_size(row.get("size")),
                "modified": row.get("modified") or "",
            }
    return None


def _supabase_search_files(path, query):
    cleaned_query = str(query or "").strip().lower()
    if not cleaned_query:
        return []
    prefix_candidates = _supabase_candidate_keys_from_app_path(path)

    rows = []
    try:
        with connection.cursor() as cursor:
            if prefix_candidates:
                for prefix in prefix_candidates:
                    like_prefix = f"{prefix}/%"
                    cursor.execute(
                        """
                        SELECT name, metadata->>'size' AS size_text, updated_at
                        FROM storage.objects
                        WHERE bucket_id = %s
                          AND (name = %s OR name LIKE %s)
                          AND LOWER(name) LIKE %s
                        ORDER BY updated_at DESC NULLS LAST
                        """,
                        [_supabase_bucket(), prefix, like_prefix, f"%{cleaned_query}%"],
                    )
                    rows.extend(cursor.fetchall())
            else:
                cursor.execute(
                    """
                    SELECT name, metadata->>'size' AS size_text, updated_at
                    FROM storage.objects
                    WHERE bucket_id = %s
                      AND LOWER(name) LIKE %s
                    ORDER BY updated_at DESC NULLS LAST
                    """,
                    [_supabase_bucket(), f"%{cleaned_query}%"],
                )
                rows = cursor.fetchall()
    except Exception:
        object_rows = []
        if prefix_candidates:
            for prefix in prefix_candidates:
                object_rows.extend(_supabase_query_object_rows(prefix))
        else:
            object_rows = _supabase_query_object_rows("")
        entries = []
        for row in _dedupe_rows_by_key(object_rows):
            key = _normalize_key(row.get("key"))
            if not key or cleaned_query not in key.lower():
                continue
            entries.append(
                {
                    "name": key.split("/")[-1],
                    "path": _app_path_from_supabase_key(key),
                    "size": _coerce_size(row.get("size")),
                    "modified": row.get("modified") or "",
                }
            )
        entries.sort(key=lambda item: str(item.get("modified") or ""), reverse=True)
        return entries

    deduped_rows = {}
    for row in rows:
        key = _normalize_key(row[0] if row else "")
        if not key:
            continue
        deduped_rows[key] = row

    entries = []
    for key, row in deduped_rows.items():
        entries.append(
            {
                "name": key.split("/")[-1],
                "path": _app_path_from_supabase_key(row[0]),
                "size": _coerce_size(row[1]),
                "modified": row[2].isoformat() if row[2] else "",
            }
        )
    entries.sort(key=lambda item: str(item.get("modified") or ""), reverse=True)
    return entries


def _supabase_upload_file(path, file_obj):
    candidate_keys = _supabase_candidate_keys_from_app_path(path)
    key = candidate_keys[0] if candidate_keys else ""
    if not key:
        raise RuntimeError("Invalid upload path.")
    if not _supabase_url():
        raise RuntimeError("SUPABASE_URL is required for Supabase storage.")
    if not _supabase_service_role_key():
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for uploads to a private bucket.")

    if hasattr(file_obj, "seek"):
        try:
            file_obj.seek(0)
        except Exception:
            pass
    payload = file_obj.read()
    if payload is None:
        payload = b""

    endpoint = f"{_supabase_url()}/storage/v1/object/{quote(_supabase_bucket(), safe='')}/{quote(key, safe='/')}"
    headers = _supabase_headers(require_service_key=True)
    headers["x-upsert"] = "true"
    content_type = getattr(file_obj, "content_type", None) or "application/octet-stream"
    headers["Content-Type"] = content_type

    response = requests.post(endpoint, data=payload, headers=headers, timeout=_supabase_timeout_seconds())
    response.raise_for_status()
    metadata = _supabase_get_file_metadata(path)
    return metadata


def _supabase_delete_object_key(object_key):
    endpoint = (
        f"{_supabase_url()}/storage/v1/object/{quote(_supabase_bucket(), safe='')}/{quote(object_key, safe='/')}"
    )
    response = requests.delete(
        endpoint,
        headers=_supabase_headers(require_service_key=True),
        timeout=_supabase_timeout_seconds(),
    )
    if response.status_code in {200, 202, 204, 404}:
        return True
    response.raise_for_status()
    return True


def _supabase_delete_file(path):
    prefix_candidates = _supabase_candidate_keys_from_app_path(path)
    if not prefix_candidates:
        raise RuntimeError("Invalid delete path.")
    if not _supabase_service_role_key():
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for delete operations.")

    # Delete one file, or all files under a prefix when the path is a folder.
    candidate_keys = set()
    for prefix_key in prefix_candidates:
        rows = _supabase_query_object_rows(prefix_key=prefix_key)
        for row in rows:
            normalized_key = _normalize_key(row.get("key"))
            if normalized_key:
                candidate_keys.add(normalized_key)
        normalized_prefix = _normalize_key(prefix_key)
        if normalized_prefix:
            candidate_keys.add(normalized_prefix)
    candidate_keys = sorted(candidate_keys)

    deleted_any = False
    for item_key in candidate_keys:
        try:
            _supabase_delete_object_key(item_key)
            deleted_any = True
        except Exception:
            continue
    return deleted_any


def _supabase_move_object_key(source_key, destination_key):
    endpoint = f"{_supabase_url()}/storage/v1/object/move"
    payload = {
        "bucketId": _supabase_bucket(),
        "sourceKey": source_key,
        "destinationKey": destination_key,
    }
    response = requests.post(
        endpoint,
        json=payload,
        headers=_supabase_headers(require_service_key=True, content_type="application/json"),
        timeout=_supabase_timeout_seconds(),
    )
    response.raise_for_status()
    return True


def _supabase_move_path(from_path, to_path):
    from_candidates = _supabase_candidate_keys_from_app_path(from_path)
    to_candidates = _supabase_candidate_keys_from_app_path(to_path)
    if not from_candidates or not to_candidates:
        raise RuntimeError("Both source and destination paths are required.")
    if not _supabase_service_role_key():
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for move operations.")

    from_key = _first_existing_key(from_candidates) or _normalize_key(from_candidates[0])
    rows = _supabase_query_object_rows(prefix_key=from_key)
    destination_root = _matching_destination_key(from_key, to_candidates)

    if rows and destination_root:
        for row in rows:
            source_key = _normalize_key(row.get("key"))
            if not source_key:
                continue
            if source_key == from_key:
                destination_key = destination_root
            elif source_key.startswith(f"{from_key}/"):
                suffix = source_key[len(from_key) + 1 :]
                destination_key = f"{destination_root}/{suffix}" if suffix else destination_root
            else:
                continue
            _supabase_move_object_key(source_key, destination_key)
        return True

    last_error = None
    for source_key in from_candidates:
        normalized_source = _normalize_key(source_key)
        destination_key = _matching_destination_key(normalized_source, to_candidates)
        if not normalized_source or not destination_key:
            continue
        try:
            _supabase_move_object_key(normalized_source, destination_key)
            return True
        except Exception as exc:
            last_error = exc
            continue

    if last_error:
        raise last_error
    raise RuntimeError("Unable to move source path in Supabase storage.")


def _supabase_get_shareable_link(path):
    candidate_keys = _supabase_candidate_keys_from_app_path(path)
    key = _first_existing_key(candidate_keys) or (candidate_keys[0] if candidate_keys else "")
    if not key:
        raise RuntimeError("Invalid storage path.")
    if _supabase_bucket_is_public():
        return _supabase_object_public_url(key)
    return _supabase_create_signed_url(key)


# -----------------------------
# Dropbox implementation
# -----------------------------

_use_env_proxy_raw = str(os.getenv("DROPBOX_USE_ENV_PROXY", "0") or "0")
_use_env_proxy = (
    _use_env_proxy_raw.replace("\\r", "").replace("\\n", "").replace("\r", "").replace("\n", "").strip().lower()
    in {"1", "true", "yes"}
)
_session = requests.Session()
if not _use_env_proxy:
    # Ignore broken machine-level proxy variables unless explicitly enabled.
    _session.trust_env = False

_dbx_lock = threading.Lock()
_dbx_client = None


def _has_refresh_credentials():
    return bool(settings.DROPBOX_REFRESH_TOKEN and settings.DROPBOX_APP_KEY and settings.DROPBOX_APP_SECRET)


def _build_dropbox_client():
    dropbox_kwargs = {"session": _session}
    if _has_refresh_credentials():
        dropbox_kwargs.update(
            {
                "oauth2_refresh_token": settings.DROPBOX_REFRESH_TOKEN,
                "app_key": settings.DROPBOX_APP_KEY,
                "app_secret": settings.DROPBOX_APP_SECRET,
            }
        )
        if settings.DROPBOX_ACCESS_TOKEN:
            dropbox_kwargs["oauth2_access_token"] = settings.DROPBOX_ACCESS_TOKEN
    elif settings.DROPBOX_ACCESS_TOKEN:
        dropbox_kwargs["oauth2_access_token"] = settings.DROPBOX_ACCESS_TOKEN
    else:
        raise RuntimeError(
            "Dropbox credentials are missing. Set DROPBOX_REFRESH_TOKEN+DROPBOX_APP_KEY+DROPBOX_APP_SECRET "
            "or set DROPBOX_ACCESS_TOKEN."
        )
    return dropbox.Dropbox(**dropbox_kwargs)


def _get_dropbox_client(force_rebuild=False):
    global _dbx_client
    with _dbx_lock:
        if force_rebuild or _dbx_client is None:
            _dbx_client = _build_dropbox_client()
        return _dbx_client


def _execute_with_auth_retry(operation):
    try:
        client = _get_dropbox_client()
        return operation(client)
    except dropbox.exceptions.AuthError:
        if not _has_refresh_credentials():
            raise
        # Rebuild client and retry once when refresh credentials are configured.
        client = _get_dropbox_client(force_rebuild=True)
        return operation(client)


def _entry_path(entry):
    # Prefer display path to preserve original casing and special characters.
    return entry.path_display or entry.path_lower


def _dropbox_list_folder_entries(path, recursive=False):
    result = _execute_with_auth_retry(lambda client: client.files_list_folder(path, recursive=recursive))
    entries = list(result.entries)
    while result.has_more:
        cursor = result.cursor
        result = _execute_with_auth_retry(lambda client, next_cursor=cursor: client.files_list_folder_continue(next_cursor))
        entries.extend(result.entries)
    return entries


def _as_preview_link(url):
    if not url:
        return url
    if "?dl=1" in url:
        return url.replace("?dl=1", "?dl=0")
    if "dl=0" in url:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}dl=0"


def _dropbox_list_folder(path):
    entries_data = _dropbox_list_folder_entries(path)
    entries = []
    for entry in entries_data:
        entries.append(
            {
                "name": entry.name,
                "path": _entry_path(entry),
                "is_dir": isinstance(entry, dropbox.files.FolderMetadata),
            }
        )
    return entries


def _dropbox_list_folder_with_metadata(path, include_dirs=True, recursive=False):
    entries_data = _dropbox_list_folder_entries(path, recursive=recursive)
    entries = []
    for entry in entries_data:
        if isinstance(entry, dropbox.files.FileMetadata):
            entries.append(
                {
                    "name": entry.name,
                    "path": _entry_path(entry),
                    "size": entry.size,
                    "modified": entry.server_modified.isoformat(),
                    "is_dir": False,
                }
            )
        elif include_dirs:
            entries.append(
                {
                    "name": entry.name,
                    "path": _entry_path(entry),
                    "is_dir": True,
                }
            )
    if include_dirs and recursive:
        try:
            top_entries = _dropbox_list_folder_entries(path, recursive=False)
            existing_paths = {item.get("path") for item in entries if item.get("path")}
            for entry in top_entries:
                if isinstance(entry, dropbox.files.FolderMetadata):
                    entry_path = _entry_path(entry)
                    if entry_path and entry_path not in existing_paths:
                        entries.append(
                            {
                                "name": entry.name,
                                "path": entry_path,
                                "is_dir": True,
                            }
                        )
                        existing_paths.add(entry_path)
        except Exception:
            pass
    entries.sort(key=lambda item: item.get("modified", ""), reverse=True)
    return entries


def _dropbox_download_file(path):
    _metadata, res = _execute_with_auth_retry(lambda client: client.files_download(path))
    return res.content


def _dropbox_get_file_metadata(path):
    metadata = _execute_with_auth_retry(lambda client: client.files_get_metadata(path))
    if isinstance(metadata, dropbox.files.FileMetadata):
        return {
            "name": metadata.name,
            "path": metadata.path_display or metadata.path_lower,
            "size": metadata.size,
            "modified": metadata.server_modified.isoformat(),
        }
    return None


def _dropbox_upload_file(path, file_obj):
    _execute_with_auth_retry(
        lambda client: client.files_upload(
            file_obj.read(),
            path,
            mode=dropbox.files.WriteMode.overwrite,
        )
    )
    return _dropbox_get_file_metadata(path)


def _dropbox_delete_file(path):
    _execute_with_auth_retry(lambda client: client.files_delete_v2(path))
    return True


def _dropbox_search_files(path, query):
    results = _execute_with_auth_retry(
        lambda client: client.files_search_v2(
            query,
            options=dropbox.files.SearchOptions(path=path),
        )
    )
    matches = list(results.matches)

    while getattr(results, "has_more", False):
        cursor = results.cursor
        results = _execute_with_auth_retry(lambda client, next_cursor=cursor: client.files_search_continue_v2(next_cursor))
        matches.extend(results.matches)

    entries = []
    for match in matches:
        entry = match.metadata.metadata
        if isinstance(entry, dropbox.files.FileMetadata):
            entries.append(
                {
                    "name": entry.name,
                    "path": _entry_path(entry),
                    "size": entry.size,
                    "modified": entry.server_modified.isoformat(),
                }
            )
    return entries


def _dropbox_get_shareable_link(path):
    try:
        link = _execute_with_auth_retry(lambda client: client.sharing_create_shared_link_with_settings(path))
        return _as_preview_link(link.url)
    except dropbox.exceptions.ApiError as exc:
        if exc.error.is_shared_link_already_exists():
            links = _execute_with_auth_retry(lambda client: client.sharing_list_shared_links(path=path))
            if links.links:
                return _as_preview_link(links.links[0].url)
        try:
            temporary_link = _execute_with_auth_retry(lambda client: client.files_get_temporary_link(path))
            return temporary_link.link
        except Exception as fallback_error:
            raise Exception(f"Error creating link: {str(exc)}; fallback failed: {str(fallback_error)}")
    except Exception as exc:
        try:
            temporary_link = _execute_with_auth_retry(lambda client: client.files_get_temporary_link(path))
            return temporary_link.link
        except Exception:
            raise Exception(f"Error creating link: {str(exc)}")


def _dropbox_create_folder(path):
    try:
        _execute_with_auth_retry(lambda client: client.files_create_folder_v2(path))
        return True
    except Exception:
        return False


def _dropbox_move_path(from_path, to_path):
    _execute_with_auth_retry(
        lambda client: client.files_move_v2(
            from_path,
            to_path,
            allow_ownership_transfer=True,
            autorename=False,
        )
    )
    return True


def list_folder(path):
    """List all files and folders in the configured storage provider."""
    try:
        if _is_supabase_provider():
            return _supabase_list_folder_with_metadata(path, include_dirs=True, recursive=False)
        return _dropbox_list_folder(path)
    except Exception as exc:
        raise Exception(f"Error listing folder: {str(exc)}")


def list_folder_with_metadata(path, include_dirs=True, recursive=False):
    """List files with metadata like size and date."""
    try:
        if _is_supabase_provider():
            return _supabase_list_folder_with_metadata(path, include_dirs=include_dirs, recursive=recursive)
        return _dropbox_list_folder_with_metadata(path, include_dirs=include_dirs, recursive=recursive)
    except Exception as exc:
        raise Exception(f"Error listing folder metadata: {str(exc)}")


def download_file(path):
    """Download a file from the configured storage provider."""
    try:
        if _is_supabase_provider():
            return _supabase_download_file(path)
        return _dropbox_download_file(path)
    except Exception as exc:
        raise Exception(f"Error downloading file: {str(exc)}")


def get_file_metadata(path):
    """Get metadata for a specific file."""
    try:
        if _is_supabase_provider():
            return _supabase_get_file_metadata(path)
        return _dropbox_get_file_metadata(path)
    except Exception as exc:
        raise Exception(f"Error getting metadata: {str(exc)}")


def upload_file(path, file_obj):
    """Upload a file to the configured storage provider."""
    try:
        if _is_supabase_provider():
            return _supabase_upload_file(path, file_obj)
        return _dropbox_upload_file(path, file_obj)
    except Exception as exc:
        raise Exception(f"Error uploading file: {str(exc)}")


def delete_file(path):
    """Delete a file from the configured storage provider."""
    try:
        if _is_supabase_provider():
            return _supabase_delete_file(path)
        return _dropbox_delete_file(path)
    except Exception as exc:
        raise Exception(f"Error deleting file: {str(exc)}")


def search_files(path, query):
    """Search for files in a storage path."""
    try:
        if _is_supabase_provider():
            return _supabase_search_files(path, query)
        return _dropbox_search_files(path, query)
    except Exception as exc:
        raise Exception(f"Error searching files: {str(exc)}")


def get_shareable_link(path):
    """Get a shareable preview link for a file."""
    try:
        if _is_supabase_provider():
            return _supabase_get_shareable_link(path)
        return _dropbox_get_shareable_link(path)
    except Exception as exc:
        raise Exception(f"Error creating link: {str(exc)}")


def create_folder(path):
    """Create a folder in the configured storage provider."""
    try:
        if _is_supabase_provider():
            # Supabase folders are implicit; no-op is enough unless uploads are performed.
            return True
        return _dropbox_create_folder(path)
    except Exception:
        return False


def move_path(from_path, to_path):
    """Move or rename a file/folder in the configured storage provider."""
    try:
        if _is_supabase_provider():
            return _supabase_move_path(from_path, to_path)
        return _dropbox_move_path(from_path, to_path)
    except Exception as exc:
        raise Exception(f"Error moving path: {str(exc)}")
