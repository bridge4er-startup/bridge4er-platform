import hashlib
import mimetypes
import time

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponse
from django.db.models import Q

from exams.models import ExamSet, MCQQuestion
from storage.dropbox_service import (
    download_file,
    upload_file,
    list_folder_with_metadata,
    search_files,
    delete_file,
    get_shareable_link,
    get_file_metadata,
)
from storage.models import FileMetadata, FolderMetadata, PlatformMetrics

CONTENT_TYPE_FOLDERS = {
    "notice": "Notice",
    "syllabus": "Syllabus",
    "old_question": "Old Questions",
    "subjective": "Subjective",
    "objective_mcq": "Objective MCQs",
    "take_exam_mcq": "Take Exam/Multiple Choice Exam",
    "take_exam_subjective": "Take Exam/Subjective Exam",
}

PUBLIC_CONTENT_TYPES = {
    "notice",
}
PUBLIC_PATH_MARKERS = (
    "/notice/",
)
ALLOWED_ROOT = "/bridge4er/"
FILE_LIST_CACHE_KEY_PREFIX = "storage:file-list:v1"


def _as_positive_int(value, default, minimum=1):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, parsed)


FILE_LIST_CACHE_TTL_SECONDS = _as_positive_int(
    getattr(settings, "DROPBOX_LIST_CACHE_TTL_SECONDS", 300),
    300,
    minimum=30,
)
FILE_LIST_CACHE_STALE_TTL_SECONDS = _as_positive_int(
    getattr(settings, "DROPBOX_LIST_CACHE_STALE_TTL_SECONDS", 1800),
    1800,
    minimum=FILE_LIST_CACHE_TTL_SECONDS,
)


def _is_safe_path(path):
    normalized = _normalize_dropbox_path(path)
    return bool(normalized) and normalized.lower().startswith(ALLOWED_ROOT)


def _normalize_branch(branch):
    value = (branch or "Civil Engineering").strip()
    return value or "Civil Engineering"


def _resolve_content_path(content_type, branch):
    folder = CONTENT_TYPE_FOLDERS.get(content_type)
    if not folder:
        return None
    return f"/bridge4er/{_normalize_branch(branch)}/{folder}"


def _normalize_dropbox_path(path):
    if not isinstance(path, str):
        return ""
    value = path.strip()
    if not value:
        return ""
    parts = [segment for segment in value.split("/") if segment]
    if not parts:
        return "/"
    return "/" + "/".join(parts)


def _path_parts(path):
    return [segment for segment in _normalize_dropbox_path(path).split("/") if segment]


def _content_root_parts(content_type, branch):
    root = _resolve_content_path(content_type, branch) or ""
    return _path_parts(root)


def _relative_parts_from_content_root(path, content_type, branch):
    parts = _path_parts(path)
    root_parts = _content_root_parts(content_type, branch)
    if len(parts) >= len(root_parts) and [p.lower() for p in parts[: len(root_parts)]] == [p.lower() for p in root_parts]:
        return parts[len(root_parts) :]
    return []


def _parent_dropbox_path(path):
    parts = _path_parts(path)
    if len(parts) <= 1:
        return ""
    return "/" + "/".join(parts[:-1])


def _folder_depth(path, content_type, branch):
    relative_parts = _relative_parts_from_content_root(path, content_type, branch)
    return max(0, len(relative_parts))


def _list_cache_token_key(content_type, branch):
    return f"{FILE_LIST_CACHE_KEY_PREFIX}:token:{content_type}:{str(branch).lower()}"


def _list_cache_token(content_type, branch):
    token_key = _list_cache_token_key(content_type, branch)
    token = cache.get(token_key)
    if token is None:
        token = "0"
        cache.set(token_key, token, timeout=None)
    return str(token)


def _list_cache_keys(content_type, branch, include_dirs):
    normalized_branch = _normalize_branch(branch).lower()
    token = _list_cache_token(content_type, normalized_branch)
    seed = f"{content_type}|{normalized_branch}|{int(bool(include_dirs))}|{token}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    payload_key = f"{FILE_LIST_CACHE_KEY_PREFIX}:payload:{digest}"
    stale_key = f"{payload_key}:stale"
    return payload_key, stale_key


def _invalidate_list_cache(content_type, branch):
    if not content_type or not branch:
        return
    token_key = _list_cache_token_key(content_type, _normalize_branch(branch))
    cache.set(token_key, str(time.time_ns()), timeout=None)


def _can_access_content_type(user, content_type):
    if content_type in PUBLIC_CONTENT_TYPES:
        return True
    return user and user.is_authenticated


def _can_access_path(user, path):
    if not _is_safe_path(path):
        return False
    is_admin = bool(user and user.is_authenticated and user.is_staff)
    if not is_admin and not _is_visible_path(path):
        return False
    lowered = path.lower()
    if any(marker in lowered for marker in PUBLIC_PATH_MARKERS):
        return True
    return user and user.is_authenticated


def _is_subjective_path(path):
    return "/subjective/" in (path or "").lower()


def _is_exam_set_path(path):
    lowered = (path or "").lower()
    return "/take exam/multiple choice exam/" in lowered or "/take exam/subjective exam/" in lowered


def _extract_branch_from_path(path):
    parts = _path_parts(path)
    if len(parts) >= 2 and parts[0].lower() == "bridge4er":
        return _normalize_branch(parts[1])
    return "Civil Engineering"


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


def _infer_content_type_from_path(path):
    lowered = _normalize_dropbox_path(path).lower()
    lowered_with_trailing = lowered if lowered.endswith("/") else f"{lowered}/"
    markers = {
        "notice": "/notice/",
        "syllabus": "/syllabus/",
        "old_question": "/old questions/",
        "subjective": "/subjective/",
        "objective_mcq": "/objective mcqs/",
        "take_exam_mcq": "/take exam/multiple choice exam/",
        "take_exam_subjective": "/take exam/subjective exam/",
    }
    for content_type, marker in markers.items():
        if marker in lowered_with_trailing:
            return content_type
    return "notice"


def _invalidate_list_cache_for_path(path):
    if not path:
        return
    _invalidate_list_cache(
        content_type=_infer_content_type_from_path(path),
        branch=_extract_branch_from_path(path),
    )


def _ensure_metadata_entry(path, content_type=None, branch=None, size=None):
    normalized_path = _normalize_dropbox_path(path)
    if not _is_safe_path(normalized_path):
        return None
    resolved_content_type = content_type or _infer_content_type_from_path(normalized_path)
    resolved_branch = branch or _extract_branch_from_path(normalized_path)
    metadata_obj, _ = FileMetadata.objects.get_or_create(
        dropbox_path=normalized_path,
        defaults={
            "name": str(normalized_path).split("/")[-1] or "file",
            "content_type": resolved_content_type,
            "branch": resolved_branch,
            "file_size": int(size or 0),
            "is_visible": True,
        },
    )
    return metadata_obj


def _ensure_folder_metadata_entry(path, content_type=None, branch=None):
    normalized_path = _normalize_dropbox_path(path)
    if not _is_safe_path(normalized_path):
        return None
    resolved_content_type = content_type or _infer_content_type_from_path(normalized_path)
    resolved_branch = branch or _extract_branch_from_path(normalized_path)
    folder_obj, _ = FolderMetadata.objects.get_or_create(
        dropbox_path=normalized_path,
        defaults={
            "name": str(normalized_path).split("/")[-1] or "folder",
            "content_type": resolved_content_type,
            "branch": resolved_branch,
            "parent_path": _parent_dropbox_path(normalized_path),
            "depth": _folder_depth(normalized_path, resolved_content_type, resolved_branch),
            "sort_order": 0,
            "is_visible": True,
        },
    )
    return folder_obj


def _sync_metadata_from_listing(files, content_type, branch):
    resolved_content_type = content_type or ""
    resolved_branch = _normalize_branch(branch)
    root_path = _normalize_dropbox_path(_resolve_content_path(resolved_content_type, resolved_branch) or "")
    for item in files:
        item_path = _normalize_dropbox_path(item.get("path"))
        if not item_path:
            continue

        if item.get("is_dir"):
            _ensure_folder_metadata_entry(
                path=item_path,
                content_type=resolved_content_type,
                branch=resolved_branch,
            )
            FolderMetadata.objects.filter(dropbox_path=item_path).update(
                name=item.get("name") or (item_path.split("/")[-1] or "folder"),
                content_type=resolved_content_type,
                branch=resolved_branch,
                parent_path=_parent_dropbox_path(item_path),
                depth=_folder_depth(item_path, resolved_content_type, resolved_branch),
            )
            continue

        _ensure_metadata_entry(
            path=item_path,
            content_type=resolved_content_type,
            branch=resolved_branch,
            size=item.get("size"),
        )
        FileMetadata.objects.filter(dropbox_path=item_path).update(
            name=item.get("name") or (item_path.split("/")[-1] or "file"),
            content_type=resolved_content_type,
            branch=resolved_branch,
            file_size=int(item.get("size") or 0),
        )

        parent_path = _parent_dropbox_path(item_path)
        while parent_path and root_path and (
            parent_path == root_path or parent_path.startswith(f"{root_path}/")
        ):
            _ensure_folder_metadata_entry(
                path=parent_path,
                content_type=resolved_content_type,
                branch=resolved_branch,
            )
            FolderMetadata.objects.filter(dropbox_path=parent_path).update(
                name=parent_path.split("/")[-1] or "folder",
                content_type=resolved_content_type,
                branch=resolved_branch,
                parent_path=_parent_dropbox_path(parent_path),
                depth=_folder_depth(parent_path, resolved_content_type, resolved_branch),
            )
            if parent_path == root_path:
                break
            parent_path = _parent_dropbox_path(parent_path)


def _visibility_map_for_paths(paths):
    normalized_paths = []
    for path in paths:
        normalized = _normalize_dropbox_path(path)
        if normalized:
            normalized_paths.append(normalized)
    if not normalized_paths:
        return {}
    rows = FileMetadata.objects.filter(dropbox_path__in=normalized_paths).values("dropbox_path", "is_visible")
    return {row["dropbox_path"]: bool(row["is_visible"]) for row in rows}


def _folder_visibility_map_for_paths(paths):
    normalized_paths = []
    for path in paths:
        normalized = _normalize_dropbox_path(path)
        if normalized:
            normalized_paths.append(normalized)
    if not normalized_paths:
        return {}
    rows = FolderMetadata.objects.filter(dropbox_path__in=normalized_paths).values("dropbox_path", "is_visible")
    return {row["dropbox_path"]: bool(row["is_visible"]) for row in rows}


def _hidden_folder_prefixes(content_type, branch):
    rows = FolderMetadata.objects.filter(
        content_type=content_type,
        branch=_normalize_branch(branch),
        is_visible=False,
    ).values_list("dropbox_path", flat=True)
    prefixes = []
    for path in rows:
        normalized = _normalize_dropbox_path(path)
        if normalized:
            prefixes.append(normalized.lower())
    return prefixes


def _is_under_hidden_folder(path, hidden_prefixes):
    normalized_path = _normalize_dropbox_path(path).lower()
    if not normalized_path:
        return False
    for prefix in hidden_prefixes:
        if normalized_path == prefix or normalized_path.startswith(f"{prefix}/"):
            return True
    return False


def _relative_folder_chain(path, content_type, branch, include_self):
    relative_parts = _relative_parts_from_content_root(path, content_type, branch)
    if not relative_parts:
        return []
    root = _normalize_dropbox_path(_resolve_content_path(content_type, branch) or "")
    running = root.rstrip("/")
    chain = []
    for segment in relative_parts:
        running = f"{running}/{segment}" if running else f"/{segment}"
        chain.append(running)
    if include_self:
        return chain
    return chain[:-1]


def _sort_files_by_admin_order(files, content_type, branch):
    if not files:
        return []

    resolved_content_type = content_type or ""
    resolved_branch = _normalize_branch(branch)
    folder_rows = FolderMetadata.objects.filter(
        content_type=resolved_content_type,
        branch=resolved_branch,
    ).values("dropbox_path", "sort_order")
    folder_order_map = {
        _normalize_dropbox_path(row["dropbox_path"]): int(row.get("sort_order") or 0)
        for row in folder_rows
    }

    def _sort_key(item):
        path = _normalize_dropbox_path(item.get("path"))
        is_dir = bool(item.get("is_dir"))
        chain = _relative_folder_chain(path, resolved_content_type, resolved_branch, include_self=is_dir)
        chain_key = []
        for chain_path in chain:
            name = chain_path.split("/")[-1].lower()
            chain_key.append((folder_order_map.get(chain_path, 0), name))
        self_order = folder_order_map.get(path, 0) if is_dir else 0
        name_value = item.get("name") or (path.split("/")[-1] if path else "")
        name_key = str(name_value).lower()
        return (chain_key, 0 if is_dir else 1, self_order, name_key)

    return sorted(files, key=_sort_key)


def _filter_files_by_visibility(files, content_type, branch, include_hidden=False):
    paths = [_normalize_dropbox_path(item.get("path")) for item in files if item.get("path")]
    visibility = _visibility_map_for_paths(paths)
    folder_visibility = _folder_visibility_map_for_paths(paths)
    hidden_folder_prefixes = _hidden_folder_prefixes(content_type=content_type, branch=branch)
    result = []
    for item in files:
        path = _normalize_dropbox_path(item.get("path"))
        if not path:
            continue
        if item.get("is_dir"):
            item_visible = folder_visibility.get(path, True)
        else:
            item_visible = visibility.get(path, True)
        is_visible = item_visible and not _is_under_hidden_folder(path, hidden_folder_prefixes)
        enriched = {**item, "path": path, "is_visible": is_visible}
        if include_hidden or is_visible:
            result.append(enriched)
    return result


def _is_visible_path(path):
    normalized_path = _normalize_dropbox_path(path)
    if not normalized_path:
        return True
    branch = _extract_branch_from_path(normalized_path)
    content_type = _infer_content_type_from_path(normalized_path)

    folder_row = FolderMetadata.objects.filter(dropbox_path=normalized_path).values("is_visible").first()
    if folder_row is not None and not bool(folder_row["is_visible"]):
        return False

    hidden_prefixes = _hidden_folder_prefixes(content_type=content_type, branch=branch)
    if _is_under_hidden_folder(normalized_path, hidden_prefixes):
        return False

    file_row = FileMetadata.objects.filter(dropbox_path=normalized_path).values("is_visible").first()
    if file_row is None:
        return True
    return bool(file_row["is_visible"])


def _sync_exam_sets_for_branch(branch):
    from exams.dropbox_sync import sync_exam_sets_from_dropbox

    return sync_exam_sets_from_dropbox(branch=branch, replace_existing=True)


def _guess_content_type(path):
    guessed, _ = mimetypes.guess_type(path or "")
    return guessed or "application/octet-stream"


def _effective_metrics_row():
    metrics = PlatformMetrics.objects.order_by("id").first()
    if metrics:
        return metrics
    return PlatformMetrics.objects.create()


def _computed_platform_metrics():
    User = get_user_model()
    library_material_count = FileMetadata.objects.filter(content_type="subjective", is_visible=True).filter(
        Q(name__iendswith=".pdf")
        | Q(name__iendswith=".png")
        | Q(name__iendswith=".jpg")
        | Q(name__iendswith=".jpeg")
        | Q(name__iendswith=".gif")
        | Q(name__iendswith=".webp")
    ).count()
    return {
        "enrolled_students": User.objects.filter(is_staff=False).count(),
        "objective_mcqs_available": MCQQuestion.objects.count(),
        "resource_files_available": library_material_count,
        "exam_sets_available": ExamSet.objects.filter(is_active=True).count(),
    }

class DropboxListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        path = request.GET.get("path", "")
        try:
            if path and not _is_safe_path(path):
                return Response({"error": "Invalid path"}, status=status.HTTP_400_BAD_REQUEST)
            files = list_folder_with_metadata(path)
            return Response(files)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ListFilesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        """Get files by content type and branch"""
        content_type = request.GET.get("content_type")  # notice, syllabus, old_question, subjective
        branch = _normalize_branch(request.GET.get("branch", "Civil Engineering"))
        include_hidden = _as_bool(request.GET.get("include_hidden"), False)
        include_dirs = _as_bool(request.GET.get("include_dirs"), False)
        refresh = _as_bool(request.GET.get("refresh"), False)
        if not (request.user and request.user.is_authenticated and request.user.is_staff):
            include_hidden = False

        try:
            if not _can_access_content_type(request.user, content_type):
                return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

            path = _resolve_content_path(content_type, branch)
            if not path:
                return Response({"error": "Invalid content type"}, status=status.HTTP_400_BAD_REQUEST)

            cache_key, stale_key = _list_cache_keys(content_type, branch, include_dirs)
            files = None if refresh else cache.get(cache_key)

            if files is None:
                try:
                    files = list_folder_with_metadata(path, include_dirs=include_dirs, recursive=True)
                    _sync_metadata_from_listing(files, content_type=content_type, branch=branch)
                    cache.set(cache_key, files, timeout=FILE_LIST_CACHE_TTL_SECONDS)
                    cache.set(stale_key, files, timeout=FILE_LIST_CACHE_STALE_TTL_SECONDS)
                except Exception:
                    stale_files = cache.get(stale_key)
                    if stale_files is None:
                        raise
                    files = stale_files

            ordered_files = _sort_files_by_admin_order(files, content_type=content_type, branch=branch)
            visible_files = _filter_files_by_visibility(
                ordered_files,
                content_type=content_type,
                branch=branch,
                include_hidden=include_hidden,
            )
            return Response(visible_files)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SearchFilesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        """Search files by name"""
        query = request.GET.get("q")
        branch = _normalize_branch(request.GET.get("branch", "Civil Engineering"))
        content_type = request.GET.get("content_type")
        include_hidden = _as_bool(request.GET.get("include_hidden"), False)
        if not (request.user and request.user.is_authenticated and request.user.is_staff):
            include_hidden = False

        if not query:
            return Response({"error": "Query required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if not _can_access_content_type(request.user, content_type):
                return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

            path = _resolve_content_path(content_type, branch)
            if not path:
                return Response({"error": "Invalid content type"}, status=status.HTTP_400_BAD_REQUEST)

            results = search_files(path, query)
            _sync_metadata_from_listing(results, content_type=content_type, branch=branch)
            ordered_results = _sort_files_by_admin_order(results, content_type=content_type, branch=branch)
            visible_results = _filter_files_by_visibility(
                ordered_results,
                content_type=content_type,
                branch=branch,
                include_hidden=include_hidden,
            )
            return Response(visible_results)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DownloadFileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        """Download a file from Dropbox"""
        path = request.GET.get("path")
        
        if not path:
            return Response({"error": "Path required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            if not _can_access_path(request.user, path):
                return Response({"error": "Authentication required or invalid path"}, status=status.HTTP_401_UNAUTHORIZED)
            if _is_subjective_path(path) and not (request.user and request.user.is_staff):
                return Response({"error": "Download is disabled for library files."}, status=status.HTTP_403_FORBIDDEN)

            file_content = download_file(path)
            filename = path.split('/')[-1]

            response = HttpResponse(file_content, content_type='application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ViewFileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        """Get shareable link to view file"""
        path = request.GET.get("path")
        
        if not path:
            return Response({"error": "Path required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            if not _can_access_path(request.user, path):
                return Response({"error": "Authentication required or invalid path"}, status=status.HTTP_401_UNAUTHORIZED)
            link = get_shareable_link(path)
            return Response({"link": link})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PreviewFileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        """Preview file inline without forcing browser download."""
        path = request.GET.get("path")

        if not path:
            return Response({"error": "Path required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if not _can_access_path(request.user, path):
                return Response({"error": "Authentication required or invalid path"}, status=status.HTTP_401_UNAUTHORIZED)

            file_content = download_file(path)
            filename = path.split("/")[-1] or "preview"
            content_type = _guess_content_type(filename)

            response = HttpResponse(file_content, content_type=content_type)
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            response["Cache-Control"] = "private, max-age=300"
            return response
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class UploadFileView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        """Upload a file to Dropbox"""
        file = request.FILES.get('file')
        content_type = request.data.get('content_type')
        branch = _normalize_branch(request.data.get('branch', 'Civil Engineering'))
        requested_visibility = request.data.get("is_visible")

        if not file or not content_type:
            return Response(
                {"error": "File and content_type required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            folder = _resolve_content_path(content_type, branch)
            if not folder:
                return Response(
                    {"error": "Invalid content type"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            path = _normalize_dropbox_path(f"{folder}/{file.name}")
            metadata = upload_file(path, file)
            metadata_size = int((metadata or {}).get("size") or 0)

            # Save metadata to database
            defaults = {
                'name': file.name,
                'content_type': content_type,
                'branch': branch,
                'file_size': metadata_size,
            }
            if requested_visibility is not None:
                defaults["is_visible"] = _as_bool(requested_visibility, True)

            file_meta, _ = FileMetadata.objects.update_or_create(
                dropbox_path=path,
                defaults=defaults
            )
            _ensure_folder_metadata_entry(
                path=folder,
                content_type=content_type,
                branch=branch,
            )
            _invalidate_list_cache(content_type=content_type, branch=branch)

            payload = {
                "message": "File uploaded successfully",
                "metadata": metadata,
                "is_visible": file_meta.is_visible,
            }

            if _is_exam_set_path(path):
                try:
                    payload["exam_sets_sync"] = _sync_exam_sets_for_branch(branch)
                except Exception as sync_error:
                    payload["exam_sets_sync_error"] = str(sync_error)

            return Response(payload)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FileVisibilityView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        path = request.data.get("path")
        if not path:
            return Response({"error": "Path required"}, status=status.HTTP_400_BAD_REQUEST)
        normalized_path = _normalize_dropbox_path(path)
        if not _is_safe_path(normalized_path):
            return Response({"error": "Invalid path"}, status=status.HTTP_400_BAD_REQUEST)

        if "is_visible" not in request.data:
            return Response({"error": "is_visible is required"}, status=status.HTTP_400_BAD_REQUEST)

        is_dir = _as_bool(request.data.get("is_dir"), False)
        is_visible = _as_bool(request.data.get("is_visible"), True)
        branch = _extract_branch_from_path(normalized_path)
        content_type = _infer_content_type_from_path(normalized_path)

        if is_dir:
            folder_meta = _ensure_folder_metadata_entry(
                path=normalized_path,
                content_type=content_type,
                branch=branch,
            )
            if folder_meta is None:
                return Response({"error": "Unable to manage folder metadata"}, status=status.HTTP_400_BAD_REQUEST)

            folder_meta.name = str(normalized_path).split("/")[-1] or folder_meta.name
            folder_meta.content_type = content_type
            folder_meta.branch = branch
            folder_meta.parent_path = _parent_dropbox_path(normalized_path)
            folder_meta.depth = _folder_depth(normalized_path, content_type, branch)
            folder_meta.is_visible = is_visible
            folder_meta.save(
                update_fields=[
                    "name",
                    "content_type",
                    "branch",
                    "parent_path",
                    "depth",
                    "is_visible",
                    "modified_at",
                ]
            )
        else:
            meta = _ensure_metadata_entry(path=normalized_path, content_type=content_type, branch=branch)
            if meta is None:
                return Response({"error": "Unable to manage file metadata"}, status=status.HTTP_400_BAD_REQUEST)

            file_size = meta.file_size
            try:
                remote = get_file_metadata(normalized_path)
                if remote and remote.get("size") is not None:
                    file_size = int(remote.get("size") or 0)
            except Exception:
                # Keep metadata update non-blocking even if live metadata lookup fails.
                pass

            meta.name = str(normalized_path).split("/")[-1] or meta.name
            meta.content_type = content_type
            meta.branch = branch
            meta.file_size = file_size
            meta.is_visible = is_visible
            meta.save(update_fields=["name", "content_type", "branch", "file_size", "is_visible", "modified_at"])
        _invalidate_list_cache(content_type=content_type, branch=branch)

        payload = {
            "message": "Visibility updated",
            "path": normalized_path,
            "is_dir": is_dir,
            "is_visible": is_visible,
        }

        if _is_exam_set_path(normalized_path):
            if is_dir:
                updated_count = ExamSet.objects.filter(
                    source_file_path__startswith=f"{normalized_path}/"
                ).update(is_active=is_visible)
            else:
                updated_count = ExamSet.objects.filter(source_file_path=normalized_path).update(is_active=is_visible)
            payload["exam_sets_updated"] = updated_count
            if is_visible and updated_count == 0:
                try:
                    payload["exam_sets_sync"] = _sync_exam_sets_for_branch(branch)
                except Exception as sync_error:
                    payload["exam_sets_sync_error"] = str(sync_error)

        return Response(payload, status=status.HTTP_200_OK)


class DeleteFileView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        """Delete a file from Dropbox"""
        path = request.data.get('path')
        
        if not path:
            return Response({"error": "Path required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            normalized_path = _normalize_dropbox_path(path)
            delete_file(normalized_path)
            FileMetadata.objects.filter(
                Q(dropbox_path=normalized_path) | Q(dropbox_path__startswith=f"{normalized_path}/")
            ).delete()
            FolderMetadata.objects.filter(
                Q(dropbox_path=normalized_path) | Q(dropbox_path__startswith=f"{normalized_path}/")
            ).delete()
            _invalidate_list_cache_for_path(normalized_path)
            payload = {"message": "File deleted successfully"}
            if _is_exam_set_path(normalized_path):
                payload["exam_sets_sync"] = _sync_exam_sets_for_branch(_extract_branch_from_path(normalized_path))
            return Response(payload)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class HomePageMetricsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        row = _effective_metrics_row()
        computed = _computed_platform_metrics()
        data = {
            "enrolled_students": row.enrolled_students if row.enrolled_students is not None else computed["enrolled_students"],
            "objective_mcqs_available": row.objective_mcqs_available
            if row.objective_mcqs_available is not None
            else computed["objective_mcqs_available"],
            "resource_files_available": row.resource_files_available
            if row.resource_files_available is not None
            else computed["resource_files_available"],
            "exam_sets_available": row.exam_sets_available if row.exam_sets_available is not None else computed["exam_sets_available"],
            "motivational_quote": row.motivational_quote or "",
            "motivational_image_url": row.motivational_image_url or "",
            "updated_at": row.updated_at,
        }
        return Response(data)

    def post(self, request):
        if not request.user.is_authenticated or not request.user.is_staff:
            return Response({"error": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        row = _effective_metrics_row()
        fields = [
            "enrolled_students",
            "objective_mcqs_available",
            "resource_files_available",
            "exam_sets_available",
        ]
        text_fields = [
            "motivational_quote",
            "motivational_image_url",
        ]
        dirty = []
        for field in fields:
            if field not in request.data:
                continue
            value = request.data.get(field)
            if value in (None, "", "auto"):
                setattr(row, field, None)
                dirty.append(field)
                continue
            try:
                cleaned = int(value)
            except (TypeError, ValueError):
                return Response({"error": f"{field} must be a number."}, status=status.HTTP_400_BAD_REQUEST)
            if cleaned < 0:
                return Response({"error": f"{field} cannot be negative."}, status=status.HTTP_400_BAD_REQUEST)
            setattr(row, field, cleaned)
            dirty.append(field)

        for field in text_fields:
            if field not in request.data:
                continue
            setattr(row, field, str(request.data.get(field) or "").strip())
            dirty.append(field)

        if dirty:
            row.save(update_fields=dirty + ["updated_at"])

        return self.get(request)

