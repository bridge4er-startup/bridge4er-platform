import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import TimedLoadingState from "../common/TimedLoadingState";
import { contributionService } from "../../services/contributionService";

const DEFAULT_CATEGORIES = ["PSC", "NEC", "MSC", "GK/IQ", "NTC", "Other"];

const normalizeCategories = (values) => {
  const normalized = (values || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return normalized.length ? normalized : DEFAULT_CATEGORIES;
};

export default function ContributionsSection({ branch = "Civil Engineering", isActive = false }) {
  const { isAuthenticated } = useAuth();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [savingCommentId, setSavingCommentId] = useState(null);

  const loadCategories = async () => {
    try {
      const data = await contributionService.listCategories();
      const resolved = normalizeCategories(data?.categories || data || []);
      setCategories(resolved);
      if (!resolved.includes(selectedCategory)) {
        setSelectedCategory(resolved[0]);
      }
    } catch (_error) {
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const loadContributions = async (category = selectedCategory) => {
    setLoading(true);
    try {
      const data = await contributionService.listContributions(category, branch);
      setContributions(Array.isArray(data) ? data : data?.results || []);
    } catch (_error) {
      toast.error("Failed to load contributions.");
      setContributions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadCategories().catch(() => {});
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    loadContributions().catch(() => {});
  }, [branch, selectedCategory, isActive]);

  const activeContributions = useMemo(() => contributions || [], [contributions]);

  const openFile = (item, download = false) => {
    const url = String(item?.file_url || item?.download_url || "").trim();
    if (!url) {
      toast.error("File unavailable.");
      return;
    }
    const targetUrl = download ? (url.includes("?") ? `${url}&download=1` : `${url}?download=1`) : url;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const submitComment = async (item) => {
    const raw = String(commentDrafts[item.id] || "").trim();
    if (!raw) {
      toast.error("Enter a comment first.");
      return;
    }
    const cleaned = raw.replace(/\s+/g, " ").slice(0, 160);
    setSavingCommentId(item.id);
    try {
      await contributionService.addComment(item.id, cleaned);
      toast.success("Comment added.");
      setCommentDrafts((prev) => ({ ...prev, [item.id]: "" }));
      await loadContributions();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to add comment.");
    } finally {
      setSavingCommentId(null);
    }
  };

  return (
    <section id="contributions" className={`section contributions-section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-hand-holding-heart"></i> Contributions
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>
      <p>Community-shared notes approved by admins. Read, download, and add one short comment per file.</p>

      <div className="contribution-category-row">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`contribution-chip ${selectedCategory === category ? "active" : ""}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {loading ? (
        <TimedLoadingState baseMessage="Loading contributions..." />
      ) : activeContributions.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No contributions found</h4>
        </div>
      ) : (
        <div className="contribution-message-list">
          {activeContributions.map((item) => (
            <article key={item.id} className="contribution-message">
              <div className="contribution-message-head">
                <div>
                  <h4>{item.title || item.file_name || "Shared Notes"}</h4>
                  <p className="contribution-meta">
                    {item.contributor_name || item.contributor_username || "Contributor"}
                    <span className="contribution-star">
                      <i className="fas fa-star"></i> Power +{item.star_count || 0}
                    </span>
                  </p>
                </div>
                <div className="contribution-actions">
                  <button className="btn btn-secondary btn-soft-blue-action" onClick={() => openFile(item, false)}>
                    Read
                  </button>
                  <button className="btn btn-primary btn-soft-blue-action" onClick={() => openFile(item, true)}>
                    Download
                  </button>
                </div>
              </div>

              {item.description ? <p className="contribution-description">{item.description}</p> : null}

              {Array.isArray(item.comments) && item.comments.length > 0 ? (
                <div className="contribution-comments">
                  {item.comments.map((comment) => (
                    <div key={comment.id || `${item.id}-${comment.user_name}`} className="contribution-comment">
                      <strong>{comment.user_name || comment.user_username || "User"}:</strong> {comment.text}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="contribution-no-comments">No comments yet.</p>
              )}

              {isAuthenticated ? (
                <div className="contribution-comment-form">
                  <input
                    type="text"
                    placeholder="Add one-line comment..."
                    value={commentDrafts[item.id] || ""}
                    onChange={(e) =>
                      setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  />
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={savingCommentId === item.id}
                    onClick={() => submitComment(item)}
                  >
                    {savingCommentId === item.id ? "Saving..." : "Send"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
