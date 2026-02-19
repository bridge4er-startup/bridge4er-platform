import React, { useEffect, useMemo, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { useBranch } from "../../context/BranchContext";

const FEATURE_CARDS = [
  {
    title: "Civil Engineering",
    icon: "fas fa-city",
    description:
      "Syllabus, Objective MCQs, Library and demo exam sets free for first enrolled 1000 students.",
    descriptionClass: "",
  },
  {
    title: "Mechanical Engineering",
    icon: "fas fa-gears",
    description: "coming soon......",
    descriptionClass: "field-desc-mechanical",
  },
  {
    title: "Electrical Engineering",
    icon: "fas fa-bolt",
    description: "coming soon......",
    descriptionClass: "field-desc-electrical",
  },
  {
    title: "Electronics Engineering",
    icon: "fas fa-microchip",
    description: "coming soon......",
    descriptionClass: "field-desc-electronics",
  },
  {
    title: "Computer Engineering",
    icon: "fas fa-laptop-code",
    description: "coming soon......",
    descriptionClass: "field-desc-computer",
  },
];

const METRIC_CONFIG = [
  {
    key: "enrolled_students",
    label: "Students Enrolled",
    toneClass: "tone-a",
    icon: "fas fa-user-graduate",
  },
  {
    key: "objective_mcqs_available",
    label: "Objective MCQs",
    toneClass: "tone-b",
    icon: "fas fa-circle-question",
  },
  {
    key: "resource_files_available",
    label: "Library Materials",
    toneClass: "tone-c",
    icon: "fas fa-folder-tree",
  },
  {
    key: "exam_sets_available",
    label: "Exam Sets",
    toneClass: "tone-d",
    icon: "fas fa-file-signature",
  },
];

const NOTICE_PAGE_SIZE = 5;
const NOTICE_NEW_BADGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEPAL_TIMEZONE = "Asia/Kathmandu";

function slugify(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function fileType(path = "") {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".webp")
  ) {
    return "image";
  }
  return "other";
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: NEPAL_TIMEZONE,
  });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: NEPAL_TIMEZONE,
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
}

function formatMetric(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return new Intl.NumberFormat("en-US").format(parsed);
}

export default function HomepageSection({ branch = "Civil Engineering", isActive = false }) {
  const { setBranch } = useBranch();

  const [clock, setClock] = useState(new Date());
  const [metrics, setMetrics] = useState(null);
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [noticePage, setNoticePage] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const load = async () => {
      try {
        setLoading(true);
        const [metricsRes, filesRes] = await Promise.all([
          API.get("storage/homepage/stats/"),
          API.get("storage/files/list/", {
            params: {
              content_type: "notice",
              branch,
            },
          }),
        ]);
        setMetrics(metricsRes.data);
        setFiles(filesRes.data || []);
        setNoticePage(1);
      } catch (_error) {
        toast.error("Failed to load homepage content.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [branch, isActive]);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return files;
    return files.filter((item) => item.name.toLowerCase().includes(query));
  }, [files, searchQuery]);

  const totalNoticePages = Math.max(1, Math.ceil(filteredFiles.length / NOTICE_PAGE_SIZE));

  useEffect(() => {
    setNoticePage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (noticePage > totalNoticePages) {
      setNoticePage(totalNoticePages);
    }
  }, [noticePage, totalNoticePages]);

  const paginatedFiles = useMemo(() => {
    const start = (noticePage - 1) * NOTICE_PAGE_SIZE;
    return filteredFiles.slice(start, start + NOTICE_PAGE_SIZE);
  }, [filteredFiles, noticePage]);

  const motivationalQuote = String(metrics?.motivational_quote || "").trim();
  const motivationalImageUrl = String(metrics?.motivational_image_url || "").trim();

  const shouldShowNewBadge = (file) => {
    const modifiedAt = new Date(file?.modified || "").getTime();
    if (!Number.isFinite(modifiedAt)) return false;
    return Date.now() - modifiedAt < NOTICE_NEW_BADGE_MAX_AGE_MS;
  };

  const openPreview = async (file) => {
    try {
      const res = await API.get("storage/files/view/", { params: { path: file.path } });
      setPreview({
        ...file,
        type: fileType(file.path),
        url: res.data?.link,
      });
    } catch (error) {
      const message = error?.response?.data?.error || "Unable to preview this file.";
      toast.error(message);
    }
  };

  const downloadNotice = async (file) => {
    try {
      const res = await API.get("storage/files/download/", {
        params: { path: file.path },
        responseType: "blob",
      });
      const objectUrl = URL.createObjectURL(new Blob([res.data]));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (_error) {
      toast.error("Unable to download file.");
    }
  };

  const handleFieldClick = (fieldName) => {
    setBranch(fieldName);
    window.location.hash = "homepage";
  };

  return (
    <section id="homepage" className={`section homepage-section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-house"></i> Homepage
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>

      <div className="homepage-grid">
        <div className="homepage-left">
          <div className="home-info-card home-explore-card">
            <h3>Explore By Field</h3>
            <div className="feature-grid field-feature-grid">
              {FEATURE_CARDS.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  className={`feature-card feature-card-action theme-${slugify(card.title)} ${
                    card.title === branch ? "active" : ""
                  }`}
                  onClick={() => handleFieldClick(card.title)}
                  aria-label={`Open ${card.title} homepage`}
                >
                  <i className={card.icon}></i>
                  <h4>{card.title}</h4>
                  <p className={card.descriptionClass}>{card.description}</p>
                  <span className="feature-action-text">
                    {card.title === branch ? "Active Field" : "Open Field Homepage"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="home-info-card metric-spotlight-card">
            <div className="metric-grid artistic-metric-grid metric-spotlight-grid">
              {METRIC_CONFIG.map((metric) => (
                <article key={metric.key} className={`metric-card metric-float metric-spotlight-item ${metric.toneClass}`}>
                  <span className="metric-spotlight-label">
                    <i className={metric.icon}></i> {metric.label}
                  </span>
                  <strong>{formatMetric(metrics?.[metric.key])}</strong>
                </article>
              ))}
            </div>
            {(motivationalQuote || motivationalImageUrl) && (
              <div className="homepage-motivation-card">
                {motivationalImageUrl ? (
                  <img
                    src={motivationalImageUrl}
                    alt="Motivational visual"
                    className="homepage-motivation-image"
                  />
                ) : null}
                {motivationalQuote ? (
                  <p className="homepage-motivation-quote">"{motivationalQuote}"</p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="homepage-right">
          <div className="clock-card">
            <div className="clock-title-row">
              <h3>Today</h3>
              <span className="clock-location">Location: Kathmandu, Nepal</span>
            </div>
            <p>{formatDate(clock)}</p>
            <strong>{formatTime(clock)}</strong>
          </div>

          <div className="home-info-card noticeboard">
            <h3>Noticeboard</h3>
            <div className="search-box">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notices..."
              />
              <i className="fas fa-search"></i>
            </div>
            {loading ? (
              <div className="loading">
                <p>Loading notice files...</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="empty-state">
                <h4>No notice files found.</h4>
              </div>
            ) : (
              <>
                <ul className="file-list compact-list">
                  {paginatedFiles.map((file) => (
                    <li key={file.path} className="file-item">
                      <div className="file-info">
                        <div className="file-icon">
                          <i className="fas fa-file"></i>
                        </div>
                        <div className="file-details">
                          <h4>
                            {shouldShowNewBadge(file) ? <span className="notice-new-badge">New</span> : null}
                            {file.name}
                          </h4>
                          <p>
                            {formatFileSize(file.size)} | {new Date(file.modified).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="file-actions">
                        <button
                          className="btn btn-secondary btn-soft-blue-action noticeboard-action-btn"
                          onClick={() => openPreview(file)}
                          title="View file"
                        >
                          <i className="fas fa-eye"></i> View
                        </button>
                        <button
                          className="btn btn-primary btn-soft-blue-action noticeboard-action-btn"
                          onClick={() => downloadNotice(file)}
                          title="Download file"
                        >
                          <i className="fas fa-download"></i> Download
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {totalNoticePages > 1 ? (
                  <div className="notice-pagination-wrap">
                    <button
                      type="button"
                      className="btn btn-secondary btn-soft-blue-action"
                      disabled={noticePage <= 1}
                      onClick={() => setNoticePage((prev) => Math.max(1, prev - 1))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {noticePage} of {totalNoticePages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-soft-blue-action"
                      disabled={noticePage >= totalNoticePages}
                      onClick={() => setNoticePage((prev) => Math.min(totalNoticePages, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {preview ? (
        <div className="home-preview-panel">
          <div className="home-preview-header">
            <h3>{preview.name}</h3>
            <button className="btn btn-secondary btn-soft-blue-action" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          {preview.type === "pdf" ? (
            <iframe title={preview.name} src={preview.url} className="home-preview-frame"></iframe>
          ) : preview.type === "image" ? (
            <img src={preview.url} alt={preview.name} className="home-preview-image" />
          ) : (
            <p>This file cannot be previewed inline. Use download instead.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
