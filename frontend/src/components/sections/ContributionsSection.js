import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import TimedLoadingState from "../common/TimedLoadingState";
import { contributionService } from "../../services/contributionService";
import API from "../../services/api";
import { formatNepalDateTime } from "../../utils/dateTime";
import FilePreviewModal from "../common/FilePreviewModal";

const CATEGORY_OPTIONS = ["PSC", "NEC", "MSC", "GK/IQ", "NTC", "NEA", "Other"];
const PAGE_SIZE = 20;

const normalizeCategories = (values) => {
  const normalized = (values || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : CATEGORY_OPTIONS;
};

const CATEGORY_ICONS = {
  PSC: "fas fa-landmark",
  NEC: "fas fa-certificate",
  MSC: "fas fa-graduation-cap",
  "GK/IQ": "fas fa-brain",
  NTC: "fas fa-satellite-dish",
  NEA: "fas fa-bolt",
};

function inferPreviewType(contentType = "", filename = "") {
  const normalized = String(contentType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();
  if (normalized.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (
    normalized.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some(
      (ext) => lowerName.endsWith(ext)
    )
  ) {
    return "image";
  }
  return "other";
}

export default function ContributionsSection({ branch = "Civil Engineering", isActive = false }) {
  const { isAuthenticated, user } = useAuth();
  const [categories, setCategories] = useState(CATEGORY_OPTIONS);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [savingCommentId, setSavingCommentId] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [likingContributionId, setLikingContributionId] = useState(null);

  const loadCategories = async (activeBranch = branch) => {
    try {
      const data = await contributionService.listCategories(activeBranch);
      const resolved = normalizeCategories(data?.categories || data || []);
      setCategories(resolved);
      if (selectedCategory && !resolved.includes(selectedCategory)) {
        setSelectedCategory("");
      }
    } catch (_error) {
      setCategories(CATEGORY_OPTIONS);
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
    loadCategories(branch).catch(() => {});
  }, [isActive, branch]);

  useEffect(() => {
    if (!isActive) return;
    if (!selectedCategory) {
      setContributions([]);
      setLoading(false);
      return;
    }
    loadContributions(selectedCategory).catch(() => {});
  }, [branch, selectedCategory, isActive]);

  useEffect(() => {
    if (!isActive) return;
    setExpandedComments({});
    setCurrentPage(1);
  }, [selectedCategory, branch, isActive]);

  useEffect(() => {
    return () => {
      if (previewFile?.url && previewFile.url.startsWith("blob:")) {
        URL.revokeObjectURL(previewFile.url);
      }
    };
  }, [previewFile]);

  const activeContributions = useMemo(() => contributions || [], [contributions]);

  const orderedContributions = useMemo(() => {
    const rows = [...activeContributions];
    return rows.sort((a, b) => {
      const aTime = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bTime = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [activeContributions]);

  const totalPages = Math.max(1, Math.ceil(orderedContributions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedContributions = orderedContributions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const resolveStarTone = (count) => {
    const value = Number(count || 0);
    if (value > 15) return "yellow";
    if (value >= 5) return "green";
    if (value > 0) return "blue";
    return "muted";
  };

  const closePreview = () => {
    setPreviewFile((current) => {
      if (current?.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  const openPreview = async (item) => {
    const url = String(item?.file_url || "").trim();
    if (!url) {
      toast.error("File unavailable.");
      return;
    }
    try {
      const response = await API.get(url, { responseType: "blob" });
      const contentType = String(response?.headers?.["content-type"] || "");
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType || undefined });
      const objectUrl = URL.createObjectURL(blob);
      const filename = item?.file_name || item?.title || "Contribution";
      const previewType = inferPreviewType(contentType, filename);
      setPreviewFile((current) => {
        if (current?.url && current.url.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }
        return {
          name: filename,
          url: objectUrl,
          type: previewType,
        };
      });
    } catch (_error) {
      toast.error("Unable to open file.");
    }
  };

  const downloadFile = async (item) => {
    const url = String(item?.file_url || "").trim();
    if (!url) {
      toast.error("File unavailable.");
      return;
    }
    try {
      const downloadUrl = url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
      const response = await API.get(downloadUrl, { responseType: "blob" });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = item?.file_name || item?.title || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (_error) {
      toast.error("Unable to download file.");
    }
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

  const likeContribution = async (item) => {
    if (!isAuthenticated) {
      toast.error("Please log in to like a contribution.");
      return;
    }
    if (item?.has_liked || likingContributionId === item.id) {
      return;
    }
    setLikingContributionId(item.id);
    try {
      const data = await contributionService.likeContribution(item.id);
      const nextCount =
        data?.likes_count != null ? Number(data.likes_count) : Number(item?.likes_count || 0) + 1;
      setContributions((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                has_liked: true,
                likes_count: nextCount,
              }
            : entry
        )
      );
      toast.success("Thanks for the support!");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to like this contribution.");
    } finally {
      setLikingContributionId(null);
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
      <p>Community-shared notes approved by admins. Read, download, and you can add one short comment per file.</p>

      {!selectedCategory ? (
        <div className="contribution-folder-grid">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`contribution-folder-card ${selectedCategory === category ? "active" : ""}`}
              onClick={() => setSelectedCategory(category)}
            >
              <div className="contribution-folder-icon">
                <i className={CATEGORY_ICONS[category] || "fas fa-folder"}></i>
              </div>
              <div className="contribution-folder-label">{category}</div>
              <span className="contribution-folder-meta">Open Folder</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="contribution-category-header">
          <div className="contribution-category-title">
            <i className={CATEGORY_ICONS[selectedCategory] || "fas fa-folder-open"}></i>
            <span>{selectedCategory}</span>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => setSelectedCategory("")}>
            Back to Categories
          </button>
        </div>
      )}

      {!selectedCategory ? (
        null
      ) : loading ? (
        <TimedLoadingState baseMessage="Loading contributions..." />
      ) : orderedContributions.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No contributions found</h4>
        </div>
      ) : (
        <>
        <div className="contribution-message-list">
          {paginatedContributions.map((item) => {
            const starCount = Number(item.star_count || 0);
            const starTone = resolveStarTone(starCount);
            const contributorLabel = item.contributor_name || item.contributor_username || "Contributor";
            const userName = String(user?.full_name || "").trim().toLowerCase();
            const userUsername = String(user?.username || "").trim().toLowerCase();
            const hasUserComment = Array.isArray(item.comments)
              ? item.comments.some((comment) => {
                  const commentName = String(comment.user_name || "").trim().toLowerCase();
                  const commentUsername = String(comment.user_username || "").trim().toLowerCase();
                  return (
                    (userUsername && commentUsername === userUsername) ||
                    (userName && commentName === userName)
                  );
                })
              : false;
            const comments = Array.isArray(item.comments) ? item.comments : [];
            const isCommentsExpanded = Boolean(expandedComments[item.id]);
            const visibleComments = isCommentsExpanded ? comments : comments.slice(0, 3);
            const hasExtraComments = comments.length > 3;
            const likesCount = Number(item.likes_count || 0);
            const hasLiked = Boolean(item.has_liked);
            const isLiking = likingContributionId === item.id;

            return (
              <article key={item.id} className="contribution-message">
                <div className="contribution-message-head">
                  <div className="contribution-title-row">
                    <h4>
                      <button
                        type="button"
                        className="contribution-title-btn"
                        onClick={() => openPreview(item)}
                        aria-label={`Read ${item.title || item.file_name || "Shared Notes"}`}
                        title="Read"
                      >
                        {item.title || item.file_name || "Shared Notes"}
                      </button>
                    </h4>
                    <div className="contribution-actions">
                      <button
                        className="contribution-icon-btn"
                        onClick={() => openPreview(item)}
                        aria-label="Read"
                        title="Read"
                      >
                        <i className="fas fa-book-open"></i>
                      </button>
                      <button
                        className="contribution-icon-btn"
                        onClick={() => downloadFile(item)}
                        aria-label="Download"
                        title="Download"
                      >
                        <i className="fas fa-arrow-down"></i>
                      </button>
                    </div>
                  </div>
                  <div className="contribution-meta-row">
                    <div className="contribution-meta">
                      <span className="contribution-user">{contributorLabel}</span>
                      <span
                        className="contribution-star-wrap"
                        aria-label={`Star rating ${starCount}`}
                        title={`Star rating ${starCount}`}
                      >
                        <span className={`contribution-star tone-${starTone}`} aria-hidden="true">
                          <i className="fas fa-star"></i>
                        </span>
                        <span className={`contribution-star-count tone-${starTone}`}>{starCount}</span>
                      </span>
                    </div>
                    <div className="contribution-meta-right">
                      {hasExtraComments ? (
                        <button
                          type="button"
                          className="contribution-see-more"
                          onClick={() =>
                            setExpandedComments((prev) => ({ ...prev, [item.id]: !isCommentsExpanded }))
                          }
                        >
                          {isCommentsExpanded ? "See less" : "See more"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`contribution-like-btn ${hasLiked ? "liked" : ""}`}
                        onClick={() => likeContribution(item)}
                        disabled={!isAuthenticated || hasLiked || isLiking}
                        aria-pressed={hasLiked}
                        title={hasLiked ? "Liked" : "Give a like"}
                      >
                        <i className="fas fa-heart"></i>
                      </button>
                      <span className="contribution-like-count">{likesCount}</span>
                    </div>
                  </div>
                </div>

                {item.description ? <p className="contribution-description">{item.description}</p> : null}

                {comments.length > 0 ? (
                  <div className="contribution-comments">
                    {visibleComments.map((comment) => (
                      <div key={comment.id || `${item.id}-${comment.user_name}`} className="contribution-comment">
                        <div className="contribution-comment-line">
                          <strong>{comment.user_name || comment.user_username || "User"}</strong>
                          <span className="contribution-comment-text">: {comment.text}</span>
                          {comment.created_at ? (
                            <span className="contribution-comment-time">
                              ({formatNepalDateTime(comment.created_at)})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="contribution-no-comments">No comments yet.</p>
                )}

                {isAuthenticated ? (
                  hasUserComment ? (
                    <p className="contribution-comment-note">You have already commented on this file.</p>
                  ) : (
                    <div className="contribution-comment-form">
                      <input
                        type="text"
                        placeholder="Add a comment (one per user)"
                        value={commentDrafts[item.id] || ""}
                        onChange={(e) =>
                          setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      />
                      <button
                        className="btn btn-secondary contribution-send-btn"
                        type="button"
                        disabled={savingCommentId === item.id}
                        onClick={() => submitComment(item)}
                      >
                        {savingCommentId === item.id ? "Saving..." : "Send"}
                      </button>
                    </div>
                  )
                ) : null}
              </article>
            );
          })}
        </div>
        {orderedContributions.length > PAGE_SIZE ? (
          <div className="contribution-pagination">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
            >
              Next
            </button>
          </div>
        ) : null}
        </>
      )}

      <FilePreviewModal preview={previewFile} onClose={closePreview} />
    </section>
  );
}
