import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getUserAnalytics } from "../services/examService";
import { referralService } from "../services/referralService";
import { formatNepalDateTime } from "../utils/dateTime";

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
      .map((item, index) => `${xForIndex(index)},${yForScore(item.score)}`)
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
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="1.2" />
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="1.2" />
      {yTicks.map((tick) => (
        <text key={`ytick-${tick}`} x={padding.left - 10} y={yForScore(tick) + 4} textAnchor="end" fill="#475569" fontSize="11">
          {Number.isInteger(tick) ? String(tick) : tick.toFixed(2)}
        </text>
      ))}
      {xTicks.map((tick) => (
        <text key={`xtick-${tick.index}`} x={xForIndex(tick.index)} y={height - padding.bottom + 18} textAnchor="middle" fill="#475569" fontSize="11">
          {tick.label}
        </text>
      ))}
      <polyline fill="none" stroke="url(#scoreLine)" strokeWidth="4" points={points} />
      {data.map((item, index) => (
        <circle key={`point-${index}`} cx={xForIndex(index)} cy={yForScore(item.score)} r="4" fill="#0ea5e9" stroke="#ffffff" strokeWidth="2" />
      ))}
      <text x={width / 2} y={height - 10} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="700">
        Attempt Timeline
      </text>
      <text x="16" y={height / 2} transform={`rotate(-90 16 ${height / 2})`} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="700">
        Score
      </text>
    </svg>
  );
}

export default function ProfileAnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [showAllAttempts, setShowAllAttempts] = useState(false);
  const [referralForm, setReferralForm] = useState({ name: "", mobile: "" });
  const [submittingReferral, setSubmittingReferral] = useState(false);
  const [referralUnlockName, setReferralUnlockName] = useState("");
  const [unlockingReferral, setUnlockingReferral] = useState(false);

  const refreshAnalytics = async () => {
    try {
      const data = await getUserAnalytics();
      setAnalytics(data);
    } catch (_error) {
      toast.error("Failed to load profile analytics");
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await refreshAnalytics();
      setLoading(false);
    };
    load();
  }, []);

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
  const referralSummary = analytics.referral_summary || {};
  const availableReferralUnlocks =
    Number(referralSummary.available_unlocks ?? summary.referral_unlocks_available ?? 0) || 0;

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
                  <span>Referral Unlocks Available</span>
                  <strong>{availableReferralUnlocks}</strong>
                </div>
              </div>
              <div className="profile-breakdown-tags">
                {paymentBreakdown.map((item) => (
                  <span key={`pay-${item.payment_gateway || "unknown"}`} className="breakdown-pill">
                    {item.payment_gateway || "unknown"}: {item.total}
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
        </div>
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
    </div>
  );
}

