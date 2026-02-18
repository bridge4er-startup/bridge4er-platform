import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";

export default function NoticeSection({ branch = "Civil Engineering", isActive = false }) {
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isActive) return;
    loadFiles();
  }, [branch, isActive]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await API.get("storage/files/list/", {
        params: {
          content_type: "notice",
          branch: branch,
        },
      });
      setFiles(res.data || []);
      setFilteredFiles(res.data || []);
    } catch (error) {
      toast.error("Failed to load notices");
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
      const res = await API.get("storage/files/view/", {
        params: { path: file.path },
      });
      window.open(res.data.link, "_blank");
    } catch (error) {
      toast.error("Failed to view file");
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

  const shouldScrollNoticeList = files.length > 5;

  return (
    <section id="notice" className={`section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-bullhorn"></i> Notice Board
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>
      <p>All notices are displayed in chronological order (newest first).</p>

      <div className="search-container">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search notices..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <i className="fas fa-search"></i>
        </div>
        {searchQuery && (
          <div className="search-results-info">
            Found {filteredFiles.length} notice(s)
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading notices...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No notices found</h4>
        </div>
      ) : (
        <ul className={`file-list ${shouldScrollNoticeList ? "file-list-scroll file-list-scroll-notice" : ""}`}>
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
    </section>
  );
}
