import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getUserAnalytics } from "../services/examService";
import API from "../services/api";
import toast from "react-hot-toast";
import { formatNepalDateTime } from "../utils/dateTime";
import { contributionService } from "../services/contributionService";
import { referralService } from "../services/referralService";
import FilePreviewModal from "../components/common/FilePreviewModal";

function formatSubmissionStatus(value = "") {
  const normalized = String(value || "pending");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

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

function ScoreTrendChart({ data = [] }) {
  const width = 640;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 56, left: 56 };

  const maxScore = useMemo(() => {
    if (!data.length) return 1;
    return Math.max(...data.map((item) => Number(item.score || 0)), 1);
  }, [data]);

  const xForIndex = (index) => {
    if (data.length <= 1) {
      return (padding.left + width - padding.right) / 2;
    }
    return padding.left + (index * (width - padding.left - padding.right)) / (data.length - 1);
  };

  const yForScore = (value) => {
    const normalized = Number(value || 0);
    const usableHeight = height - padding.top - padding.bottom;
    return height - padding.bottom - ((normalized / maxScore) * usableHeight);
  };

  const yTicks = useMemo(() => {
    const fractions = [1, 0.75, 0.5, 0.25, 0];
    return fractions.map((fraction) => Number((maxScore * fraction).toFixed(2)));
  }, [maxScore]);

  const xTicks = useMemo(() => {
    if (!data.length) return [];
    if (data.length === 1) {
      return [{ index: 0, label: data[0].label || "Attempt 1" }];
    }
    const candidates = [0, Math.floor((data.length - 1) / 2), data.length - 1];
    const seen = new Set();
    return candidates
      .map((index) => ({ index, label: data[index]?.label || `Attempt ${index + 1}` }))
      .filter((tick) => {
        const key = `${tick.index}:${tick.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [data]);

  const points = useMemo(() => {
    if (!data.length) return "";
    return data
      .map((item, index) => {
        const x = xForIndex(index);
        const y = yForScore(item.score);
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, maxScore]);

  if (!data.length) {
    return <p>No score trend data yet.</p>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="profile-trend-svg" role="img" aria-label="Score trend chart">
      <defs>
        <linearGradient id="scoreLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="transparent" />
      {yTicks.map((tick) => (
        <line
          key={`grid-${tick}`}
          x1={padding.left}
          y1={yForScore(tick)}
          x2={width - padding.right}
          y2={yForScore(tick)}
          stroke="#e2e8f0"
          strokeDasharray="4 4"
        />
      ))}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="#94a3b8"
        strokeWidth="1.2"
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="#94a3b8"
        strokeWidth="1.2"
      />
      {yTicks.map((tick) => (
        <text
          key={`ytick-${tick}`}
          x={padding.left - 10}
          y={yForScore(tick) + 4}
          textAnchor="end"
          fill="#475569"
          fontSize="11"
        >
          {Number.isInteger(tick) ? String(tick) : tick.toFixed(2)}
        </text>
      ))}
      {xTicks.map((tick) => (
        <text
          key={`xtick-${tick.index}`}
          x={xForIndex(tick.index)}
          y={height - padding.bottom + 18}
          textAnchor="middle"
          fill="#475569"
          fontSize="11"
        >
          {tick.label}
        </text>
      ))}
      <polyline fill="none" stroke="url(#scoreLine)" strokeWidth="4" points={points} />
      {data.map((item, index) => (
        <circle
          key={`point-${index}`}
          cx={xForIndex(index)}
          cy={yForScore(item.score)}
          r="4"
          fill="#0ea5e9"
          stroke="#ffffff"
          strokeWidth="2"
        />
      ))}
      <text x={width / 2} y={height - 10} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="700">
        Attempt Timeline
      </text>
      <text
        x="16"
        y={height / 2}
        transform={`rotate(-90 16 ${height / 2})`}
        textAnchor="middle"
        fill="#0f172a"
        fontSize="12"
        fontWeight="700"
      >
        Score
      </text>
    </svg>
  );
}

export default function ProfileAnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myContributions, setMyContributions] = useState([]);
  const [loadingContributions, setLoadingContributions] = useState(false);
  const [uploadingContribution, setUploadingContribution] = useState(false);
  const [contributionForm, setContributionForm] = useState({
    title: "",
    description: "",
    file: null,
  });
  const [unlockExamSetName, setUnlockExamSetName] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [referralForm, setReferralForm] = useState({ name: "", mobile: "" });
  const [submittingReferral, setSubmittingReferral] = useState(false);
  const [referralUnlockName, setReferralUnlockName] = useState("");
  const [unlockingReferral, setUnlockingReferral] = useState(false);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState(null);
  const [showAllAttempts, setShowAllAttempts] = useState(false);
  const [showAllContributions, setShowAllContributions] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getUserAnalytics();
        setAnalytics(data);
      } catch (_error) {
        toast.error("Failed to load profile analytics");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const closePreview = () => {
    setPreviewFile((current) => {
      if (current?.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  useEffect(() => {
    return () => {
      if (previewFile?.url && previewFile.url.startsWith("blob:")) {
        URL.revokeObjectURL(previewFile.url);
      }
    };
  }, [previewFile]);

  const openPreview = async (fileUrl, nameFallback) => {
    const safeUrl = String(fileUrl || "").trim();
    if (!safeUrl) return;
    try {
      const response = await API.get(safeUrl, { responseType: "blob" });
      const contentType = String(response?.headers?.["content-type"] || "");
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType || undefined });
      const objectUrl = URL.createObjectURL(blob);
      const previewType = inferPreviewType(contentType, nameFallback || safeUrl);
      setPreviewFile((current) => {
        if (current?.url && current.url.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }
        return {
          name: nameFallback || "File Preview",
          url: objectUrl,
          type: previewType,
        };
      });
    } catch (_error) {
      toast.error("Unable to open file.");
    }
  };

  const downloadFile = async (fileUrl, nameFallback) => {
    const safeUrl = String(fileUrl || "").trim();
    if (!safeUrl) return;
    try {
      const downloadUrl = safeUrl.includes("?") ? `${safeUrl}&download=1` : `${safeUrl}?download=1`;
      const response = await API.get(downloadUrl, { responseType: "blob" });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = nameFallback || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (_error) {
      toast.error("Unable to download file.");
    }
  };

  const loadMyContributions = async () => {
    setLoadingContributions(true);
    try {
      const data = await contributionService.listMyContributions();
      setMyContributions(Array.isArray(data) ? data : data?.results || []);
    } catch (_error) {
      toast.error("Failed to load contributions.");
    } finally {
      setLoadingContributions(false);
    }
  };

  const refreshAnalytics = async () => {
    try {
      const data = await getUserAnalytics();
      setAnalytics(data);
    } catch (_error) {
      // Keep existing analytics if refresh fails.
    }
  };

  useEffect(() => {
    loadMyContributions().catch(() => {});
  }, []);

  const updateContributionForm = (field, value) => {
    setContributionForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitContribution = async () => {
    const title = String(contributionForm.title || "").trim();
    const description = String(contributionForm.description || "").trim();
    const file = contributionForm.file;
    if (!title || !file) {
      toast.error("Please provide a name and file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File must be under 2MB.");
      return;
    }
    const allowed = [".pdf", ".png", ".jpg", ".jpeg"];
    const lower = String(file.name || "").toLowerCase();
    if (!allowed.some((ext) => lower.endsWith(ext))) {
      toast.error("Only PDF, JPG, or PNG files are allowed.");
      return;
    }
    setUploadingContribution(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("file", file);
      await contributionService.uploadContribution(formData);
      toast.success("Contribution submitted for review.");
      setContributionForm({ title: "", description: "", file: null });
      await loadMyContributions();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to upload contribution.");
    } finally {
      setUploadingContribution(false);
    }
  };

  const claimUnlock = async () => {
    const examSetName = String(unlockExamSetName || "").trim();
    if (!examSetName) {
      toast.error("Enter an exam set name.");
      return;
    }
    try {
      await contributionService.claimUnlock(examSetName);
      toast.success("Exam set unlocked.");
      setUnlockExamSetName("");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to unlock exam set.");
    }
  };

  const submitReferral = async () => {
    const friendName = String(referralForm.name || "").trim();
    const friendMobile = String(referralForm.mobile || "").trim();
    if (!friendName || !friendMobile) {
      toast.error("Enter both name and mobile number.");
      return;
    }
    setSubmittingReferral(true);
    try {
      await referralService.submitReferral({
        friend_name: friendName,
        friend_mobile: friendMobile,
      });
      toast.success("Referral submitted.");
      setReferralForm({ name: "", mobile: "" });
      await refreshAnalytics();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to submit referral.");
    } finally {
      setSubmittingReferral(false);
    }
  };

  const claimReferralUnlock = async () => {
    const examSetName = String(referralUnlockName || "").trim();
    if (!examSetName) {
      toast.error("Enter an exam set name.");
      return;
    }
    setUnlockingReferral(true);
    try {
      const result = await referralService.claimUnlock(examSetName);
      toast.success(result?.message || "Exam set unlocked.");
      setReferralUnlockName("");
      await refreshAnalytics();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to unlock exam set.");
    } finally {
      setUnlockingReferral(false);
    }
  };

  const toggleSubjectiveDetails = (submissionId) => {
    setExpandedSubmissionId((current) => (current === submissionId ? null : submissionId));
  };

  if (loading) {
    return <div style={{ padding: 20 }}>Loading analytics...</div>;
  }

  if (!analytics) {
    return <div style={{ padding: 20 }}>No analytics available.</div>;
  }

  const profile = analytics.profile || {};
  const summary = analytics.summary || {};
  const recentAttempts = analytics.recent_attempts || [];
  const visibleAttempts = showAllAttempts ? recentAttempts : recentAttempts.slice(0, 5);
  const paymentBreakdown = analytics.payment_gateway_breakdown || [];
  const subjectiveBreakdown = analytics.subjective_status_breakdown || [];
  const subjectiveSubmissions = analytics.subjective_submissions || [];
  const contributionSummary = analytics.contribution_summary || {};
  const availableUnlocks =
    Number(contributionSummary.available_unlocks ?? summary.contribution_unlocks_available ?? 0) || 0;
  const referralSummary = analytics.referral_summary || {};
  const availableReferralUnlocks =
    Number(referralSummary.available_unlocks ?? summary.referral_unlocks_available ?? 0) || 0;
  const visibleContributions = showAllContributions ? myContributions : myContributions.slice(0, 5);

  return (
    <div className="container profile-analytics-page" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <section className="profile-hero-card">
        <button
          type="button"
          className="btn btn-primary btn-soft-blue-action profile-referral-cta"
          onClick={() => setReferralModalOpen(true)}
        >
          Refer to Friends
        </button>
        <div className="profile-hero-head">
          <div className="profile-avatar-large">{String(profile.full_name || profile.username || "S").slice(0, 1).toUpperCase()}</div>
          <div>
            <h2>Student Profile</h2>
            <p>{profile.full_name || profile.username}</p>
          </div>
        </div>
        <div className="profile-hero-meta">
          <span><strong>Username:</strong> {profile.username || "-"}</span>
          <span><strong>Mobile:</strong> {profile.mobile_number || "-"}</span>
          <span><strong>Email:</strong> {profile.email || "-"}</span>
          <span><strong>Field:</strong> {profile.field_of_study || "-"}</span>
        </div>
        <div className="profile-hero-actions">
          <Link className="btn btn-secondary btn-soft-blue-action profile-home-btn" to="/">Back to Home</Link>
        </div>
      </section>

      <section className="profile-analytics-grid">
        <div className="profile-analytics-main">
          <section className="profile-stat-grid">
            <article className="profile-stat-card stat-blue">
              <span>Exams Appeared</span>
              <strong>{summary.total_attempts || 0}</strong>
            </article>
            <article className="profile-stat-card stat-green">
              <span>Average Score</span>
              <strong>{Number(summary.average_score || 0).toFixed(2)}</strong>
            </article>
            <article className="profile-stat-card stat-teal">
              <span>Best Score</span>
              <strong>{Number(summary.best_score || 0).toFixed(2)}</strong>
            </article>
            <article className="profile-stat-card stat-orange">
              <span>MCQs Accuracy on Practice Sessions</span>
              <strong>{summary.objective_accuracy_percent || 0}%</strong>
            </article>
          </section>

          <section className="profile-visual-grid">
            <div className="profile-chart-card profile-chart-card-modern">
              <h3>Score Trend</h3>
              <ScoreTrendChart data={analytics.score_trend || []} />
            </div>

            <div className="profile-breakdown-card">
              <h3>Activity Breakdown</h3>
              <div className="profile-breakdown-list">
                <div>
                  <span>Purchased Sets</span>
                  <strong>{summary.total_purchased_sets || 0}</strong>
                </div>
                <div>
                  <span>Subjective Submissions</span>
                  <strong>{summary.subjective_submissions || 0}</strong>
                </div>
                <div>
                  <span>Reviewed Subjective</span>
                  <strong>{summary.reviewed_subjective_submissions || 0}</strong>
                </div>
              </div>
              <div className="profile-breakdown-tags">
                {paymentBreakdown.map((item) => (
                  <span key={`pay-${item.payment_gateway || "unknown"}`} className="breakdown-pill">
                    {item.payment_gateway || "unknown"}: {item.total}
                  </span>
                ))}
                {subjectiveBreakdown.map((item) => (
                  <span key={`sub-${item.status || "unknown"}`} className="breakdown-pill">
                    {item.status || "unknown"}: {item.total}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <div className="profile-attempt-list-card" style={{ marginTop: 6 }}>
            <h3>Recent Attempts</h3>
              {recentAttempts.length === 0 ? (
                <p>No attempts yet.</p>
              ) : (
                <>
                  <ul className="file-list">
                    {visibleAttempts.map((item) => (
                      <li key={item.id} className="file-item">
                        <div className="file-details">
                          <h4>{item.exam_name}</h4>
                          <p>Score: {Number(item.score || 0).toFixed(2)}</p>
                        </div>
                        <small>{formatNepalDateTime(item.created_at)}</small>
                      </li>
                    ))}
                  </ul>
                  {recentAttempts.length > 5 ? (
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={() => setShowAllAttempts((prev) => !prev)}
                    >
                      {showAllAttempts ? "See less" : "See more"}
                    </button>
                  ) : null}
                </>
              )}
            </div>

          <div className="profile-attempt-list-card profile-subjective-review-card" style={{ marginTop: 10 }}>
            <h3>Subjective Submission Reviews</h3>
            {subjectiveSubmissions.length === 0 ? (
              <p>No subjective submissions yet.</p>
            ) : (
              <div className="subjective-summary-list profile-subjective-submissions">
                {subjectiveSubmissions.map((item) => {
                  const hasScore = item.score !== null && item.score !== undefined && item.score !== "";
                  const isExpanded = expandedSubmissionId === item.id;
                  return (
                    <div key={item.id} className="subjective-summary-item">
                      <button
                        type="button"
                        className={`subjective-summary-row ${isExpanded ? "expanded" : ""}`}
                        onClick={() => toggleSubjectiveDetails(item.id)}
                        aria-expanded={isExpanded}
                      >
                        <div className="subjective-summary-left">
                          <div className="subjective-summary-title">
                            <span className="subjective-summary-name">{item.exam_set_name || "Subjective Exam"}</span>
                            <span className={`subjective-status-pill status-${item.status || "pending"}`}>
                              {formatSubmissionStatus(item.status)}
                            </span>
                          </div>
                          <div className="subjective-summary-meta">
                            <span className={`subjective-summary-score ${hasScore ? "scored" : "pending"}`}>
                              {hasScore ? item.score : "Pending"}
                              {hasScore && item.max_marks != null ? ` / ${item.max_marks}` : ""}
                            </span>
                            <span className="subjective-summary-date">
                              {item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}
                            </span>
                          </div>
                        </div>
                        <span className="subjective-summary-toggle">{isExpanded ? "Hide" : "Details"}</span>
                      </button>

                      {isExpanded ? (
                        <div className="subjective-summary-details">
                          <div className="subjective-detail-times">
                            <span>
                              Submitted:{" "}
                              <strong>{item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}</strong>
                            </span>
                            {item.reviewed_at ? (
                              <span>
                                Reviewed: <strong>{formatNepalDateTime(item.reviewed_at)}</strong>
                              </span>
                            ) : null}
                          </div>

                          <div className={`subjective-score-panel ${hasScore ? "scored" : "pending"}`}>
                            <span className="subjective-score-label">Marks</span>
                            <strong className="subjective-score-value">{hasScore ? item.score : "Pending"}</strong>
                            {hasScore && item.max_marks != null ? (
                              <span className="subjective-score-total">/ {item.max_marks}</span>
                            ) : null}
                          </div>

                          <div className="subjective-comment-notepad">
                            <div className="subjective-comment-title">Examiner Comments</div>
                            <p>{item.feedback || "No comments yet. Your submission is under review."}</p>
                          </div>

                          {item.file_url ? (
                            <div className="profile-subjective-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-soft-blue-action"
                                onClick={() => openPreview(item.file_url, item.exam_set_name || "Submitted File")}
                              >
                                View Submission
                              </button>
                            </div>
                          ) : null}
                          {item.reviewed_file_url ? (
                            <div className="profile-subjective-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-soft-blue-action"
                                onClick={() => openPreview(item.reviewed_file_url, item.exam_set_name || "Reviewed File")}
                              >
                                View Reviewed File
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-soft-blue-action"
                                onClick={() =>
                                  downloadFile(item.reviewed_file_url, `${item.exam_set_name || "reviewed-file"}.pdf`)
                                }
                              >
                                Download Reviewed File
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="profile-analytics-side">
          <div className="profile-attempt-list-card contribution-profile-card">
            <h3>Contribute Notes</h3>
            <p>
              Initially you can upload up to 3 different notes (PDF/JPG/PNG, max 2MB). Your file will appear in Contributions
              section after admin approval. Then, you can upload and contribute more. You will get a star rating on each approved
              contributions.
            </p>

            <div className="contribution-upload-form">
              <input
                type="text"
                placeholder="Contribution name"
                value={contributionForm.title}
                onChange={(e) => updateContributionForm("title", e.target.value)}
              />
              <textarea
                rows={2}
                placeholder="Short details about your notes"
                value={contributionForm.description}
                onChange={(e) => updateContributionForm("description", e.target.value)}
              />
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => updateContributionForm("file", e.target.files?.[0] || null)}
              />
              <button
                className="btn btn-primary"
                type="button"
                disabled={uploadingContribution}
                onClick={submitContribution}
              >
                {uploadingContribution ? "Uploading..." : "Submit Contribution"}
              </button>
            </div>

            {availableUnlocks > 0 ? (
              <div className="contribution-unlock-panel">
                <div>
                  <strong>Available Unlocks:</strong> {availableUnlocks}
                </div>
                <div className="contribution-unlock-row">
                  <input
                    type="text"
                    placeholder="Enter Exam Set Name to unlock"
                    value={unlockExamSetName}
                    onChange={(e) => setUnlockExamSetName(e.target.value)}
                  />
                  <button className="btn btn-secondary" type="button" onClick={claimUnlock}>
                    Unlock Exam Set
                  </button>
                </div>
              </div>
            ) : (
              <p className="contribution-unlock-note">
                Earn a free exam set unlock after every 5 approved contributions.
              </p>
            )}

            <h4 style={{ marginTop: "1rem" }}>My Contributions</h4>
            {loadingContributions ? (
              <p>Loading contributions...</p>
            ) : myContributions.length === 0 ? (
              <p>No contributions yet.</p>
            ) : (
              <>
                <ul className="file-list">
                  {visibleContributions.map((item) => (
                    <li key={item.id} className="file-item">
                      <div className="file-details">
                        <h4>{item.title || item.file_name || "Contribution"}</h4>
                        <p>
                          Status: {item.status || "pending"}
                          {item.category ? ` | Category: ${item.category}` : ""}
                        </p>
                      </div>
                      <small>{item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}</small>
                    </li>
                  ))}
                </ul>
                {myContributions.length > 5 ? (
                  <button
                    type="button"
                    className="text-link-btn"
                    onClick={() => setShowAllContributions((prev) => !prev)}
                  >
                    {showAllContributions ? "See less" : "See more"}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </section>

      {referralModalOpen ? (
        <div className="payment-overlay" onClick={() => setReferralModalOpen(false)}>
          <div
            className="payment-modal-content referral-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="referral-modal-header">
              <h3>Refer to Friends</h3>
              <button className="btn btn-secondary btn-soft-blue-action" onClick={() => setReferralModalOpen(false)}>
                Close
              </button>
            </div>
            <div className="referral-summary-grid">
              <div>
                <span>Matched</span>
                <strong>{referralSummary.matched_count || 0}</strong>
              </div>
              <div>
                <span>Pending</span>
                <strong>{referralSummary.pending_count || 0}</strong>
              </div>
              <div>
                <span>Available Unlocks</span>
                <strong>{availableReferralUnlocks}</strong>
              </div>
            </div>

            <div className="referral-form">
              <input
                type="text"
                placeholder="Friend full name"
                value={referralForm.name}
                onChange={(e) => setReferralForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Friend mobile number"
                value={referralForm.mobile}
                onChange={(e) => setReferralForm((prev) => ({ ...prev, mobile: e.target.value }))}
              />
              <button
                className="btn btn-primary"
                type="button"
                disabled={submittingReferral}
                onClick={submitReferral}
              >
                {submittingReferral ? "Submitting..." : "Submit Referral"}
              </button>
            </div>

            {availableReferralUnlocks > 0 ? (
              <div className="referral-unlock-panel">
                <div>
                  <strong>Unlock a paid set with referrals:</strong>
                </div>
                <div className="referral-unlock-row">
                  <input
                    type="text"
                    placeholder="Enter Exam Set Name to unlock"
                    value={referralUnlockName}
                    onChange={(e) => setReferralUnlockName(e.target.value)}
                  />
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={unlockingReferral}
                    onClick={claimReferralUnlock}
                  >
                    {unlockingReferral ? "Unlocking..." : "Unlock Exam Set"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="referral-unlock-note">
                Submit two successful referrals to unlock a paid set.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <FilePreviewModal preview={previewFile} onClose={closePreview} />
    </div>
  );
}
