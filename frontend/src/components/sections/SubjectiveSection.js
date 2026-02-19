import React, { useEffect, useMemo, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { getSubjectIcon } from "../../utils/subjectIcons";

function resolveSubjectName(path = "") {
  const segments = path.split("/").filter(Boolean);
  const subjectiveIndex = segments.findIndex((item) => item.toLowerCase() === "subjective");
  if (subjectiveIndex >= 0 && segments[subjectiveIndex + 1]) {
    return segments[subjectiveIndex + 1];
  }
  return "General";
}

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
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
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

export default function SubjectiveSection({ branch = "Civil Engineering", isActive = false }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [viewMode, setViewMode] = useState("subjects");

  const closePreview = () => {
    setPreviewFile((current) => {
      if (current?.previewUrl && current.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  };

  useEffect(() => {
    if (!isActive) return;

    const loadFiles = async () => {
      setLoading(true);
      try {
        const res = await API.get("storage/files/list/", {
          params: {
            content_type: "subjective",
            branch,
          },
        });
        setFiles(res.data || []);
        setSelectedSubject("");
        setViewMode("subjects");
        closePreview();
      } catch (_error) {
        toast.error("Failed to load library materials");
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [branch, isActive]);

  useEffect(() => {
    return () => {
      if (previewFile?.previewUrl && previewFile.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewFile.previewUrl);
      }
    };
  }, [previewFile]);

  useEffect(() => {
    if (!previewFile) return undefined;
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setPreviewFile((current) => {
          if (current?.previewUrl && current.previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(current.previewUrl);
          }
          return null;
        });
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [previewFile]);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return files;
    return files.filter((file) => {
      const subject = resolveSubjectName(file.path || "").toLowerCase();
      return file.name.toLowerCase().includes(query) || subject.includes(query);
    });
  }, [files, searchQuery]);

  const groupedBySubject = useMemo(() => {
    return filteredFiles.reduce((acc, file) => {
      const subjectName = resolveSubjectName(file.path || "");
      if (!acc[subjectName]) {
        acc[subjectName] = [];
      }
      acc[subjectName].push(file);
      return acc;
    }, {});
  }, [filteredFiles]);

  const subjectNames = useMemo(
    () => Object.keys(groupedBySubject).sort((a, b) => a.localeCompare(b)),
    [groupedBySubject]
  );

  const selectedSubjectFiles = useMemo(() => {
    if (!selectedSubject) return [];
    return (groupedBySubject[selectedSubject] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [groupedBySubject, selectedSubject]);

  const handleOpenSubject = (subjectName) => {
    setSelectedSubject(subjectName);
    setViewMode("books");
    closePreview();
  };

  const handleViewPDF = async (file) => {
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
        if (current?.previewUrl && current.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(current.previewUrl);
        }
        return {
          ...file,
          previewUrl,
          previewType,
        };
      });
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to open file";
      toast.error(message);
    }
  };

  const goToSubjects = () => {
    setViewMode("subjects");
    setSelectedSubject("");
    closePreview();
  };

  return (
    <section id="library" className={`section professional-background ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-book-open"></i> Library
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>
      <p>Library shelves are grouped by subject folder. Students can read resources online in read-only mode.</p>

      <div className="search-container">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search subjects or book files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <i className="fas fa-search"></i>
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading library materials...</p>
        </div>
      ) : subjectNames.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No materials found</h4>
        </div>
      ) : null}

      {!loading && subjectNames.length > 0 && viewMode === "subjects" ? (
        <div className="library-bookshelf-grid">
          {subjectNames.map((subject) => (
            <button
              key={subject}
              type="button"
              className="library-subject-folder"
              onClick={() => handleOpenSubject(subject)}
            >
              <div className="library-folder-icon">
                <i className={getSubjectIcon(subject, "fas fa-folder-open")}></i>
              </div>
              <div className="library-folder-info">
                <h3>{subject}</h3>
                <p>{groupedBySubject[subject].length} files available</p>
              </div>
              <span className="library-folder-action">Open Shelf</span>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && viewMode === "books" ? (
        <div className="library-books-view">
          <div className="library-view-toolbar">
            <button className="btn btn-secondary btn-soft-blue-action" onClick={goToSubjects}>
              <i className="fas fa-arrow-left"></i> Back to Subject Folders
            </button>
            <h3>
              <i className="fas fa-layer-group"></i> {selectedSubject} Shelf
            </h3>
          </div>

          {selectedSubjectFiles.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-book-dead"></i>
              <h4>No files found in this subject</h4>
            </div>
          ) : (
            <div className="library-book-list">
              {selectedSubjectFiles.map((file) => (
                <article key={file.path} className="library-book-item">
                  <div className="library-book-icon">
                    <i className={resolveFileIcon(file.name)}></i>
                  </div>
                  <div className="library-book-meta">
                    <h4>{file.name}</h4>
                    <p>
                      {formatFileSize(file.size)} | Updated: {formatDate(file.modified)}
                    </p>
                  </div>
                  <button className="btn btn-primary btn-soft-blue-action" onClick={() => handleViewPDF(file)}>
                    <i className="fas fa-book-reader"></i> Read
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {previewFile ? (
        <div className="payment-overlay" onClick={closePreview}>
          <div className="payment-modal-content file-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="file-preview-modal-header">
              <h3>{previewFile.name}</h3>
              <button className="btn btn-secondary btn-soft-blue-action" onClick={closePreview}>
                Close
              </button>
            </div>
            <div className="file-preview-modal-body">
              {previewFile.previewType === "pdf" ? (
                <iframe src={previewFile.previewUrl} className="file-preview-frame" title="PDF Viewer"></iframe>
              ) : previewFile.previewType === "image" ? (
                <img src={previewFile.previewUrl} alt={previewFile.name} className="file-preview-image" />
              ) : (
                <p>This file cannot be previewed inline. Use supported PDF/image files.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
