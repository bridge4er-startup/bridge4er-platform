import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import FilePreviewModal from "../common/FilePreviewModal";

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

export default function SyllabusSection({ branch = "Civil Engineering", isActive = false }) {
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState(null);

  const closePreview = () => {
    setPreview((current) => {
      if (current?.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  useEffect(() => {
    if (!isActive) return;
    loadFiles();
  }, [branch, isActive]);

  useEffect(() => {
    return () => {
      if (preview?.url && preview.url.startsWith("blob:")) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) return undefined;
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [preview]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await API.get("storage/files/list/", {
        params: {
          content_type: "syllabus",
          branch: branch,
        },
      });
      setFiles(res.data || []);
      setFilteredFiles(res.data || []);
    } catch (error) {
      toast.error("Failed to load syllabus");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredFiles(files);
      return;
    }

    const filtered = files.filter((file) =>
      file.name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredFiles(filtered);
  };

  const handleDownload = async (file) => {
    try {
      const res = await API.get("storage/files/download/", {
        params: { path: file.path },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", file.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to download file");
      console.error(error);
    }
  };

  const handleView = async (file) => {
    try {
      const res = await API.get("storage/files/preview/", {
        params: { path: file.path },
        responseType: "blob",
      });
      const contentType = res?.headers?.["content-type"] || "";
      const previewType = inferPreviewType(contentType, file.name || file.path);
      const blob = new Blob([res.data], { type: contentType || undefined });
      const objectUrl = URL.createObjectURL(blob);
      const nextPreview = {
        ...file,
        type: previewType,
        url: objectUrl,
      };
      setPreview((current) => {
        if (current?.url && current.url.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }
        return nextPreview;
      });
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to view file";
      toast.error(message);
      console.error(error);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const shouldScrollSyllabusList = files.length > 10;

  return (
    <section id="syllabus" className={`section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-book"></i> Syllabus
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>
      <p>Access all course syllabi. You can open and download any syllabus file.</p>

      <div className="search-container">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search syllabus..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <i className="fas fa-search"></i>
        </div>
        {searchQuery && (
          <div className="search-results-info">
            Found {filteredFiles.length} syllabus(es)
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading syllabus...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No syllabus found</h4>
        </div>
      ) : (
        <ul className={`file-list ${shouldScrollSyllabusList ? "file-list-scroll file-list-scroll-large" : ""}`}>
          {filteredFiles.map((file, idx) => (
            <li key={idx} className="file-item">
              <div className="file-info">
                <div className="file-icon">
                  <i className="fas fa-file-pdf"></i>
                </div>
                <div className="file-details">
                  <h4>{file.name}</h4>
                  <p className="file-meta">
                    Size: {formatFileSize(file.size)} | Date: {formatDate(file.modified)}
                  </p>
                </div>
              </div>
              <div className="file-actions">
                <button
                  className="btn btn-secondary btn-soft-blue-action"
                  onClick={() => handleView(file)}
                  title="View file"
                >
                  <i className="fas fa-eye"></i> View
                </button>
                <button
                  className="btn btn-primary btn-soft-blue-action"
                  onClick={() => handleDownload(file)}
                  title="Download file"
                >
                  <i className="fas fa-download"></i> Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FilePreviewModal preview={preview} onClose={closePreview} />
    </section>
  );
}

