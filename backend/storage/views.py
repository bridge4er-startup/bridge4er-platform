import mimetypes

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework import status
from django.contrib.auth import get_user_model
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
from storage.models import FileMetadata, PlatformMetrics

CONTENT_TYPE_FOLDERS = {
    "notice": "Notice",
    "syllabus": "Syllabus",
    "old_question": "Old Questions",
    "subjective": "Subjective",
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


def _is_safe_path(path):
    return isinstance(path, str) and path.lower().startswith(ALLOWED_ROOT)


def _normalize_branch(branch):
    value = (branch or "Civil Engineering").strip()
    return value or "Civil Engineering"


def _resolve_content_path(content_type, branch):
    folder = CONTENT_TYPE_FOLDERS.get(content_type)
    if not folder:
        return None
    return f"/bridge4er/{_normalize_branch(branch)}/{folder}"


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
    parts = [segment for segment in (path or "").split("/") if segment]
    if len(parts) >= 2 and parts[0].lower() == "bridge4er":
        return _normalize_branch(parts[1])
    return "Civil Engineering"


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


def _infer_content_type_from_path(path):
    lowered = str(path or "").lower()
    markers = {
        "notice": "/notice/",
        "syllabus": "/syllabus/",
        "old_question": "/old questions/",
        "subjective": "/subjective/",
        "take_exam_mcq": "/take exam/multiple choice exam/",
        "take_exam_subjective": "/take exam/subjective exam/",
    }
    for content_type, marker in markers.items():
        if marker in lowered:
            return content_type
    return "notice"


def _ensure_metadata_entry(path, content_type=None, branch=None, size=None):
    if not _is_safe_path(path):
        return None
    metadata_obj, _ = FileMetadata.objects.get_or_create(
        dropbox_path=path,
        defaults={
            "name": str(path).split("/")[-1] or "file",
            "content_type": content_type or _infer_content_type_from_path(path),
            "branch": branch or _extract_branch_from_path(path),
            "file_size": int(size or 0),
            "is_visible": True,
        },
    )
    return metadata_obj


def _sync_metadata_from_listing(files, content_type, branch):
    for item in files:
        file_path = item.get("path")
        if not file_path:
            continue
        _ensure_metadata_entry(
            path=file_path,
            content_type=content_type,
            branch=branch,
            size=item.get("size"),
        )
        FileMetadata.objects.filter(dropbox_path=file_path).update(
            name=item.get("name") or (file_path.split("/")[-1] or "file"),
            content_type=content_type,
            branch=branch,
            file_size=int(item.get("size") or 0),
        )


def _visibility_map_for_paths(paths):
    if not paths:
        return {}
    rows = FileMetadata.objects.filter(dropbox_path__in=paths).values("dropbox_path", "is_visible")
    return {row["dropbox_path"]: bool(row["is_visible"]) for row in rows}


def _filter_files_by_visibility(files, include_hidden=False):
    paths = [item.get("path") for item in files if item.get("path")]
    visibility = _visibility_map_for_paths(paths)
    result = []
    for item in files:
        path = item.get("path")
        is_visible = visibility.get(path, True)
        enriched = {**item, "is_visible": is_visible}
        if include_hidden or is_visible:
            result.append(enriched)
    return result


def _is_visible_path(path):
    row = FileMetadata.objects.filter(dropbox_path=path).values("is_visible").first()
    if row is None:
        return True
    return bool(row["is_visible"])


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
        if not (request.user and request.user.is_authenticated and request.user.is_staff):
            include_hidden = False

        try:
            if not _can_access_content_type(request.user, content_type):
                return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

            path = _resolve_content_path(content_type, branch)
            if not path:
                return Response({"error": "Invalid content type"}, status=status.HTTP_400_BAD_REQUEST)

            files = list_folder_with_metadata(path, include_dirs=False, recursive=True)
            _sync_metadata_from_listing(files, content_type=content_type, branch=branch)
            visible_files = _filter_files_by_visibility(files, include_hidden=include_hidden)
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
            visible_results = _filter_files_by_visibility(results, include_hidden=include_hidden)
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

            path = f"{folder}/{file.name}"
            metadata = upload_file(path, file)

            # Save metadata to database
            defaults = {
                'name': file.name,
                'content_type': content_type,
                'branch': branch,
                'file_size': metadata['size'],
            }
            if requested_visibility is not None:
                defaults["is_visible"] = _as_bool(requested_visibility, True)

            file_meta, _ = FileMetadata.objects.update_or_create(
                dropbox_path=path,
                defaults=defaults
            )

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
        if not _is_safe_path(path):
            return Response({"error": "Invalid path"}, status=status.HTTP_400_BAD_REQUEST)

        if "is_visible" not in request.data:
            return Response({"error": "is_visible is required"}, status=status.HTTP_400_BAD_REQUEST)

        is_visible = _as_bool(request.data.get("is_visible"), True)
        branch = _extract_branch_from_path(path)
        content_type = _infer_content_type_from_path(path)

        meta = _ensure_metadata_entry(path=path, content_type=content_type, branch=branch)
        if meta is None:
            return Response({"error": "Unable to manage file metadata"}, status=status.HTTP_400_BAD_REQUEST)

        file_size = meta.file_size
        try:
            remote = get_file_metadata(path)
            if remote and remote.get("size") is not None:
                file_size = int(remote.get("size") or 0)
        except Exception:
            # Keep metadata update non-blocking even if live metadata lookup fails.
            pass

        meta.name = str(path).split("/")[-1] or meta.name
        meta.content_type = content_type
        meta.branch = branch
        meta.file_size = file_size
        meta.is_visible = is_visible
        meta.save(update_fields=["name", "content_type", "branch", "file_size", "is_visible", "modified_at"])

        payload = {
            "message": "Visibility updated",
            "path": path,
            "is_visible": is_visible,
        }

        if _is_exam_set_path(path):
            updated_count = ExamSet.objects.filter(source_file_path=path).update(is_active=is_visible)
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
            delete_file(path)
            FileMetadata.objects.filter(dropbox_path=path).delete()
            payload = {"message": "File deleted successfully"}
            if _is_exam_set_path(path):
                payload["exam_sets_sync"] = _sync_exam_sets_for_branch(_extract_branch_from_path(path))
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

