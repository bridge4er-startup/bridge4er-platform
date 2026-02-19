import os
import threading

import dropbox
import requests
from django.conf import settings

_use_env_proxy = str(os.getenv("DROPBOX_USE_ENV_PROXY", "0")).lower() in {"1", "true", "yes"}
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


def _list_folder_entries(path, recursive=False):
    result = _execute_with_auth_retry(
        lambda client: client.files_list_folder(path, recursive=recursive)
    )
    entries = list(result.entries)
    while result.has_more:
        cursor = result.cursor
        result = _execute_with_auth_retry(
            lambda client, next_cursor=cursor: client.files_list_folder_continue(next_cursor)
        )
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


def list_folder(path):
    """List all files and folders in a Dropbox path"""
    try:
        entries_data = _list_folder_entries(path)
        entries = []
        for entry in entries_data:
            entries.append({
                "name": entry.name,
                "path": _entry_path(entry),
                "is_dir": isinstance(entry, dropbox.files.FolderMetadata),
            })
        return entries
    except Exception as e:
        return []


def list_folder_with_metadata(path, include_dirs=True, recursive=False):
    """List files with metadata like size, date, etc."""
    try:
        entries_data = _list_folder_entries(path, recursive=recursive)
        entries = []
        for entry in entries_data:
            if isinstance(entry, dropbox.files.FileMetadata):
                entries.append({
                    "name": entry.name,
                    "path": _entry_path(entry),
                    "size": entry.size,
                    "modified": entry.server_modified.isoformat(),
                    "is_dir": False,
                })
            elif include_dirs:
                entries.append({
                    "name": entry.name,
                    "path": _entry_path(entry),
                    "is_dir": True,
                })
        # Sort by modified date, newest first
        entries.sort(key=lambda x: x.get('modified', ''), reverse=True)
        return entries
    except Exception as e:
        return []

def download_file(path):
    """Download a file from Dropbox"""
    try:
        _metadata, res = _execute_with_auth_retry(lambda client: client.files_download(path))
        return res.content
    except Exception as e:
        raise Exception(f"Error downloading file: {str(e)}")

def get_file_metadata(path):
    """Get metadata for a specific file"""
    try:
        metadata = _execute_with_auth_retry(lambda client: client.files_get_metadata(path))
        if isinstance(metadata, dropbox.files.FileMetadata):
            return {
                "name": metadata.name,
                "path": metadata.path_display or metadata.path_lower,
                "size": metadata.size,
                "modified": metadata.server_modified.isoformat(),
            }
        return None
    except Exception as e:
        raise Exception(f"Error getting metadata: {str(e)}")

def upload_file(path, file):
    """Upload a file to Dropbox"""
    try:
        _execute_with_auth_retry(
            lambda client: client.files_upload(
                file.read(),
                path,
                mode=dropbox.files.WriteMode.overwrite,
            )
        )
        return get_file_metadata(path)
    except Exception as e:
        raise Exception(f"Error uploading file: {str(e)}")

def delete_file(path):
    """Delete a file from Dropbox"""
    try:
        _execute_with_auth_retry(lambda client: client.files_delete_v2(path))
        return True
    except Exception as e:
        raise Exception(f"Error deleting file: {str(e)}")

def search_files(path, query):
    """Search for files in a Dropbox path"""
    try:
        results = _execute_with_auth_retry(
            lambda client: client.files_search_v2(
                query,
                options=dropbox.files.SearchOptions(path=path),
            )
        )
        matches = list(results.matches)

        while getattr(results, "has_more", False):
            cursor = results.cursor
            results = _execute_with_auth_retry(
                lambda client, next_cursor=cursor: client.files_search_continue_v2(next_cursor)
            )
            matches.extend(results.matches)

        entries = []
        for match in matches:
            entry = match.metadata.metadata
            if isinstance(entry, dropbox.files.FileMetadata):
                entries.append({
                    "name": entry.name,
                    "path": _entry_path(entry),
                    "size": entry.size,
                    "modified": entry.server_modified.isoformat(),
                })
        return entries
    except Exception as e:
        return []

def get_shareable_link(path):
    """Get a shareable link for a file"""
    try:
        link = _execute_with_auth_retry(
            lambda client: client.sharing_create_shared_link_with_settings(path)
        )
        return _as_preview_link(link.url)
    except dropbox.exceptions.ApiError as e:
        if e.error.is_shared_link_already_exists():
            # If link already exists, get it
            links = _execute_with_auth_retry(
                lambda client: client.sharing_list_shared_links(path=path)
            )
            if links.links:
                return _as_preview_link(links.links[0].url)
        # Fallback for apps without sharing scopes. Temporary links work for inline read-only previews.
        try:
            temporary_link = _execute_with_auth_retry(
                lambda client: client.files_get_temporary_link(path)
            )
            return temporary_link.link
        except Exception as fallback_error:
            raise Exception(f"Error creating link: {str(e)}; fallback failed: {str(fallback_error)}")
    except Exception as e:
        try:
            temporary_link = _execute_with_auth_retry(
                lambda client: client.files_get_temporary_link(path)
            )
            return temporary_link.link
        except Exception:
            raise Exception(f"Error creating link: {str(e)}")

def create_folder(path):
    """Create a folder in Dropbox"""
    try:
        _execute_with_auth_retry(lambda client: client.files_create_folder_v2(path))
        return True
    except Exception as e:
        return False
