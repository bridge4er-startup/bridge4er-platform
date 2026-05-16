import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import API, { cachedGet, peekCachedGet } from "../../services/api";
import toast from "react-hot-toast";
import { getInstitutionIcon, getSubjectIcon } from "../../utils/subjectIcons";
import FilePreviewModal from "../common/FilePreviewModal";
import TimedLoadingState from "../common/TimedLoadingState";
import { formatNepalDate } from "../../utils/dateTime";
import { onContentSyncEvent } from "../../services/contentSyncService";

function resolveFileIcon(name = "") {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "fas fa-file-pdf";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "fas fa-file-word";
  if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) return "fas fa-file-powerpoint";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv")) return "fas fa-file-excel";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")) {
    return "fas fa-file-image";
  }
  return "fas fa-file-lines";
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(isoString) {
  if (!isoString) return "Unknown";
  return formatNepalDate(isoString, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function inferPreviewType(contentType = "", filename = "") {
  const normalized = String(contentType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();

  if (normalized.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (
    normalized.startsWith("image/") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".gif") ||
    lowerName.endsWith(".webp")
  ) {
    return "image";
  }
  return "other";
}

function getRelativeLibraryParts(path = "") {
  const segments = String(path || "").split("/").filter(Boolean);
  const libraryIndex = segments.findIndex((segment) => segment.toLowerCase() === "subjective");
  if (libraryIndex >= 0) {
    return segments.slice(libraryIndex + 1);
  }
  return segments;
}

function startsWithParts(parts = [], prefix = []) {
  if (prefix.length > parts.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (parts[index] !== prefix[index]) return false;
  }
  return true;
}

export default function SubjectiveSection({ branch = "Civil Engineering", isActive = false }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [currentFolderParts, setCurrentFolderParts] = useState([]);
  const [openingPath, setOpeningPath] = useState("");
  const deferredQuery = useDeferredValue(searchQuery);

  const closePreview = () => {
    setPreviewFile((current) => {
      if (current?.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  useEffect(() => {
    if (!isActive) return;
    const params = {
      content_type: "subjective",
      branch,
      include_dirs: true,
      prefer_metadata: true,
      metadata_only: true,
    };
    const cached = peekCachedGet("storage/files/list/", {
      params,
      persistCache: true,
      allowStale: true,
    });
    if (Array.isArray(cached?.data)) {
      setEntries(cached.data || []);
      setCurrentFolderParts([]);
      setLoading(false);
      closePreview();
      loadFiles({ silent: true }).catch(() => {});
      return;
    }
    loadFiles();
  }, [branch, isActive]);

  useEffect(() => {
    if (!isActive) return () => {};
    return onContentSyncEvent((event) => {
      if (event?.branch && String(event.branch).trim() !== String(branch || "").trim()) {
        return;
      }
      loadFiles({ forceRefresh: true }).catch(() => {});
    });
  }, [branch, isActive]);

  useEffect(() => {
    return () => {
      if (previewFile?.url && previewFile.url.startsWith("blob:")) {
        URL.revokeObjectURL(previewFile.url);
      }
    };
  }, [previewFile]);

  const loadFiles = async ({ forceRefresh = false, silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await cachedGet("storage/files/list/", {
        params: {
          content_type: "subjective",
          branch,
          include_dirs: true,
          refresh: !!forceRefresh,
          prefer_metadata: true,
          metadata_only: !forceRefresh,
        },
        forceRefresh: !!forceRefresh,
        persistCache: true,
      });
      setEntries(res.data || []);
      setCurrentFolderParts([]);
      closePreview();
    } catch (_error) {
      toast.error("Failed to load library materials");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!previewFile) return undefined;
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [previewFile]);

  const fileItems = useMemo(
    () =>
      (entries || [])
        .filter((entry) => !entry?.is_dir)
        .map((file) => {
          const relativeParts = getRelativeLibraryParts(file.path || "");
          const folderParts = relativeParts.length > 1 ? relativeParts.slice(0, -1) : [];
          const filename = relativeParts.length > 0 ? relativeParts[relativeParts.length - 1] : file.name;
          const displayName = file.display_name || filename;
          return {
            ...file,
            __folderParts: folderParts,
            __filename: filename,
            __displayName: displayName,
            __iconUrl: file.icon_url || "",
            __sortOrder: Number(file.sort_order || 0),
            __searchPath: `${folderParts.join(" / ")} ${displayName}`.toLowerCase(),
          };
        }),
    [entries]
  );

  const directoryItems = useMemo(
    () =>
      (entries || [])
        .filter((entry) => !!entry?.is_dir)
        .map((dir) => {
          const relativeParts = getRelativeLibraryParts(dir.path || "");
          const displayName = dir.display_name || (relativeParts[relativeParts.length - 1] || dir.name);
          return {
            ...dir,
            __parts: relativeParts,
            __displayName: displayName,
            __iconUrl: dir.icon_url || "",
            __sortOrder: Number(dir.sort_order || 0),
            __searchPath: `${relativeParts.join(" / ")} ${displayName}`.toLowerCase(),
          };
        }),
    [entries]
  );

  const query = deferredQuery.trim().toLowerCase();
  const filteredFileItems = useMemo(() => {
    if (!query) return fileItems;
    return fileItems.filter((file) => file.__searchPath.includes(query));
  }, [fileItems, query]);

  const filteredDirectoryItems = useMemo(() => {
    if (!query) return directoryItems;
    return directoryItems.filter((dir) => dir.__searchPath.includes(query));
  }, [directoryItems, query]);

  const folderView = useMemo(() => {
    const folderMap = new Map();
    const folderMetaByKey = new Map();
    const directFiles = [];

    filteredDirectoryItems.forEach((dir) => {
      const key = dir.__parts.join("/");
      if (!key) return;
      folderMetaByKey.set(key, {
        display_name: dir.__displayName,
        icon_url: dir.__iconUrl,
        sort_order: dir.__sortOrder,
      });
    });

    filteredDirectoryItems.forEach((dir) => {
      if (!startsWithParts(dir.__parts, currentFolderParts)) {
        return;
      }
      const remainder = dir.__parts.slice(currentFolderParts.length);
      if (remainder.length === 0) {
        return;
      }
      const folderName = remainder[0];
      const folderKey = [...currentFolderParts, folderName].join("/");
      if (!folderMap.has(folderKey)) {
        const meta = folderMetaByKey.get(folderKey) || {};
        folderMap.set(folderKey, {
          key: folderKey,
          name: folderName,
          display_name: meta.display_name || folderName,
          icon_url: meta.icon_url || "",
          sort_order: Number(meta.sort_order || 0),
          parts: [...currentFolderParts, folderName],
          fileCount: 0,
        });
      }
      const existing = folderMap.get(folderKey);
      existing.fileCount += 1;
    });

    filteredFileItems.forEach((file) => {
      if (!startsWithParts(file.__folderParts, currentFolderParts)) {
        return;
      }

      const remainder = file.__folderParts.slice(currentFolderParts.length);
      if (remainder.length > 0) {
        const folderName = remainder[0];
        const folderKey = [...currentFolderParts, folderName].join("/");
      if (!folderMap.has(folderKey)) {
        const meta = folderMetaByKey.get(folderKey) || {};
        folderMap.set(folderKey, {
          key: folderKey,
          name: folderName,
          display_name: meta.display_name || folderName,
          icon_url: meta.icon_url || "",
          sort_order: Number(meta.sort_order || 0),
          parts: [...currentFolderParts, folderName],
          fileCount: 0,
        });
      }
        const existing = folderMap.get(folderKey);
        existing.fileCount += 1;
        return;
      }

      directFiles.push(file);
    });

    const folders = [...folderMap.values()].sort((a, b) => {
      const aOrder = Number(a.sort_order || 0);
      const bOrder = Number(b.sort_order || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.display_name || a.name || "").localeCompare(String(b.display_name || b.name || ""));
    });

    directFiles.sort((a, b) => {
      const aOrder = Number(a.__sortOrder || 0);
      const bOrder = Number(b.__sortOrder || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.__displayName || a.__filename || "").localeCompare(String(b.__displayName || b.__filename || ""));
    });

    return {
      folders,
      files: directFiles,
    };
  }, [filteredDirectoryItems, filteredFileItems, currentFolderParts]);

  const breadcrumbParts = ["Library", ...currentFolderParts];

  const handleOpenFolder = (parts) => {
    setCurrentFolderParts(parts);
    closePreview();
  };

  const handleViewPDF = async (file) => {
    if (openingPath === file.path) return;
    setOpeningPath(file.path);
    try {
      const res = await API.get("storage/files/preview/", {
        params: { path: file.path },
        responseType: "blob",
      });

      const contentType = String(res?.headers?.["content-type"] || "").toLowerCase();
      const previewType = inferPreviewType(contentType, file.name || file.path);
      const blob = new Blob([res.data], { type: contentType || undefined });
      const previewUrl = URL.createObjectURL(blob);

      setPreviewFile((current) => {
        if (current?.url && current.url.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }
        return {
          name: file.name,
          url: previewUrl,
          type: previewType,
        };
      });
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to open file";
      toast.error(message);
    } finally {
      setOpeningPath((current) => (current === file.path ? "" : current));
    }
  };

  const isAtRoot = currentFolderParts.length === 0;

  return (
    <section id="library" className={`section professional-background ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-book-open"></i> Library
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>
      <p>Library shelves are grouped by institution and subject folders. Open any folder to browse files.</p>

      <div className="search-container">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search folder names or files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <i className="fas fa-search"></i>
        </div>
      </div>

      {!loading ? (
        <div className="library-breadcrumbs">
          {breadcrumbParts.map((crumb, index) => {
            const isLast = index === breadcrumbParts.length - 1;
            const targetParts = currentFolderParts.slice(0, Math.max(0, index));
            return (
              <button
                key={`${crumb}-${index}`}
                type="button"
                className={`library-breadcrumb-btn ${isLast ? "active" : ""}`}
                onClick={() => handleOpenFolder(targetParts)}
                disabled={isLast}
              >
                {crumb}
              </button>
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <TimedLoadingState baseMessage="Loading library materials..." />
      ) : folderView.folders.length === 0 && folderView.files.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No materials found</h4>
        </div>
      ) : (
        <>
          {folderView.folders.length > 0 ? (
            <div className="library-bookshelf-grid">
              {folderView.folders.map((folder) => (
                <button
                  key={folder.key}
                  type="button"
                  className="library-subject-folder"
                  onClick={() => handleOpenFolder(folder.parts)}
                >
                  <div className="library-folder-icon">
                    {folder.icon_url ? (
                      <img src={folder.icon_url} alt="" className="library-folder-icon-img" />
                    ) : (
                      <i
                        className={
                          isAtRoot
                            ? getInstitutionIcon(folder.name, "fas fa-building-columns")
                            : getSubjectIcon(folder.name, "fas fa-folder-open")
                        }
                      ></i>
                    )}
                  </div>
                  <div className="library-folder-info">
                    <h3>{folder.display_name || folder.name}</h3>
                    <p>{folder.fileCount} files available</p>
                  </div>
                  <span className="library-folder-action">Open Folder</span>
                </button>
              ))}
            </div>
          ) : null}

          {folderView.files.length > 0 ? (
            <div className="library-books-view">
              <div className="library-view-toolbar">
                <h3>
                  <i className="fas fa-layer-group"></i> Files in {currentFolderParts[currentFolderParts.length - 1] || "Library"}
                </h3>
              </div>

              <div className="library-book-list">
                {folderView.files.map((file) => {
                  const isOpening = openingPath === file.path;
                  return (
                  <article key={file.path} className="library-book-item">
                    <div className="library-book-icon">
                      {file.__iconUrl ? (
                        <img src={file.__iconUrl} alt="" className="library-file-icon-img" />
                      ) : (
                        <i className={resolveFileIcon(file.__filename || file.name)}></i>
                      )}
                    </div>
                    <div className="library-book-meta">
                      <h4>{file.__displayName || file.__filename || file.name}</h4>
                      <p>
                        {formatFileSize(file.size)} | Updated: {formatDate(file.modified)}
                      </p>
                    </div>
                    <button
                      className="btn btn-primary btn-soft-blue-action"
                      onClick={() => handleViewPDF(file)}
                      disabled={isOpening}
                    >
                      {isOpening ? (
                        <>
                          Opening ...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-book-reader"></i> Read
                        </>
                      )}
                    </button>
                  </article>
                );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}

      <FilePreviewModal preview={previewFile} onClose={closePreview} />
    </section>
  );
}

