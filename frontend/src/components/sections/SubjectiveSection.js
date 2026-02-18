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

export default function SubjectiveSection({ branch = "Civil Engineering", isActive = false }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [viewMode, setViewMode] = useState("subjects");

  useEffect(() => {
    if (!isActive) return;
    loadFiles();
  }, [branch, isActive]);

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
      setSelectedFile(null);
    } catch (_error) {
      toast.error("Failed to load library materials");
    } finally {
      setLoading(false);
    }
  };

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
  };

  const handleViewPDF = async (file) => {
    try {
      const res = await API.get("storage/files/view/", {
        params: { path: file.path },
      });
      setSelectedFile({
        ...file,
        viewLink: res.data.link,
      });
      setViewMode("viewer");
    } catch (_error) {
      toast.error("Failed to open file");
    }
  };

  const getEmbeddedViewLink = (link) => {
    if (!link) return "";
    try {
      const url = new URL(link);
      url.searchParams.set("dl", "0");
      url.searchParams.set("embedded", "true");
      return url.toString();
    } catch (_error) {
      return link;
    }
  };

  const goToSubjects = () => {
    setViewMode("subjects");
    setSelectedSubject("");
    setSelectedFile(null);
  };

  const goToBooks = () => {
    setViewMode("books");
    setSelectedFile(null);
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

      {!loading && viewMode === "viewer" ? (
        <div className="library-viewer-wrap">
          <div className="pdf-viewer-header">
            <button className="btn btn-secondary btn-soft-blue-action" onClick={goToBooks}>
              <i className="fas fa-arrow-left"></i> Back to Shelf
            </button>
            <h3 style={{ margin: "0 auto", flex: 1, textAlign: "center" }}>{selectedFile?.name}</h3>
            <div style={{ width: "80px" }}></div>
          </div>

          <div className="pdf-viewer-container">
            <iframe
              src={getEmbeddedViewLink(selectedFile?.viewLink)}
              style={{ width: "100%", height: "640px", border: "none", borderRadius: "8px" }}
              title="PDF Viewer"
            ></iframe>
            <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "#666" }}>
              Read-only mode: download is disabled for this library section.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
