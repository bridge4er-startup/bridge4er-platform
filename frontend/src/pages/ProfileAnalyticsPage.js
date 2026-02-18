import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getUserAnalytics } from "../services/examService";
import toast from "react-hot-toast";

function ScoreTrendChart({ data = [] }) {
  const width = 640;
  const height = 220;
  const padding = 30;

  const points = useMemo(() => {
    if (!data.length) return "";
    const maxScore = Math.max(...data.map((item) => Number(item.score || 0)), 1);
    return data
      .map((item, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
        const y = height - padding - ((Number(item.score || 0) / maxScore) * (height - padding * 2));
        return `${x},${y}`;
      })
      .join(" ");
  }, [data]);

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
      <polyline fill="none" stroke="url(#scoreLine)" strokeWidth="4" points={points} />
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
          <span>Objective Accuracy</span>
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
                <small>{new Date(item.created_at).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
