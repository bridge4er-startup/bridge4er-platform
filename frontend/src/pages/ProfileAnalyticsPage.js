import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getUserAnalytics } from "../services/examService";
import API from "../services/api";
import toast from "react-hot-toast";
import { formatNepalDateTime } from "../utils/dateTime";

function formatSubmissionStatus(value = "") {
  const normalized = String(value || "pending");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

  useEffect(() => {
    async function load() {
      try {
        const data = await getUserAnalytics();
        setAnalytics(data);
      } catch (_error) {
        toast.error("Failed to load profile analytics");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const openSubmissionPdf = async (fileUrl) => {
    const safeUrl = String(fileUrl || "").trim();
    if (!safeUrl) return;
    try {
      const response = await API.get(safeUrl, { responseType: "blob" });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (_error) {
      toast.error("Unable to open submitted PDF.");
    }
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
  const paymentBreakdown = analytics.payment_gateway_breakdown || [];
  const subjectiveBreakdown = analytics.subjective_status_breakdown || [];
  const subjectiveSubmissions = analytics.subjective_submissions || [];

  return (
    <div className="container profile-analytics-page" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <section className="profile-hero-card">
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
        <Link className="btn btn-secondary btn-soft-blue-action profile-home-btn" to="/">Back to Home</Link>
      </section>

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

      <div className="profile-attempt-list-card" style={{ marginTop: 24 }}>
        <h3>Recent Attempts</h3>
        {recentAttempts.length === 0 ? (
          <p>No attempts yet.</p>
        ) : (
          <ul className="file-list">
            {recentAttempts.map((item) => (
              <li key={item.id} className="file-item">
                <div className="file-details">
                  <h4>{item.exam_name}</h4>
                  <p>Score: {Number(item.score || 0).toFixed(2)}</p>
                </div>
                <small>{formatNepalDateTime(item.created_at)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="profile-attempt-list-card profile-subjective-review-card" style={{ marginTop: 24 }}>
        <h3>Subjective Submission Reviews</h3>
        {subjectiveSubmissions.length === 0 ? (
          <p>No subjective submissions yet.</p>
        ) : (
          <div className="subjective-submissions-list profile-subjective-submissions">
            {subjectiveSubmissions.map((item) => {
              const hasScore = item.score !== null && item.score !== undefined && item.score !== "";
              return (
                <article key={item.id} className="subjective-result-card profile-subjective-result-card">
                  <header className="subjective-result-header">
                    <div>
                      <h5>{item.exam_set_name || "Subjective Exam"}</h5>
                      <p className="profile-subjective-time-chip">
                        Submitted: {formatNepalDateTime(item.submitted_at)}
                      </p>
                      <p className="profile-subjective-time-chip">
                        Reviewed: {item.reviewed_at ? formatNepalDateTime(item.reviewed_at) : "Pending review"}
                      </p>
                    </div>
                    <span className={`subjective-status-pill status-${item.status || "pending"}`}>
                      {formatSubmissionStatus(item.status)}
                    </span>
                  </header>

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
                    <button
                      type="button"
                      className="btn btn-secondary btn-soft-blue-action"
                      style={{ marginTop: "0.75rem", width: "fit-content" }}
                      onClick={() => openSubmissionPdf(item.file_url)}
                    >
                      Open Submitted PDF
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
