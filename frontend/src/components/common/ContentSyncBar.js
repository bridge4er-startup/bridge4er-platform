import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import {
  getContentSyncStatus,
  onContentSyncEvent,
  syncContentSnapshot,
} from "../../services/contentSyncService";
import { formatNepalDateTime } from "../../utils/dateTime";

export default function ContentSyncBar({ branch = "Civil Engineering", isActive = false }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = async () => {
    if (!isAdmin) {
      setStatus(null);
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const data = await getContentSyncStatus(branch);
      setStatus(data || null);
    } catch (_error) {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!isActive || !isAdmin) return;
    loadStatus().catch(() => {});
  }, [branch, isActive, isAdmin]);

  useEffect(() => {
    if (!isActive || !isAdmin) return () => {};
    return onContentSyncEvent((event) => {
      const eventBranch = String(event?.branch || "").trim();
      if (eventBranch && eventBranch !== String(branch || "").trim()) return;
      loadStatus().catch(() => {});
    });
  }, [branch, isActive, isAdmin]);

  if (!isAuthenticated || !isActive) {
    return null;
  }

  const lastSyncedLabel = useMemo(() => {
    if (!isAdmin) return "On-demand refresh";
    const timestamp = status?.last_synced;
    if (!timestamp) return "Not synced yet";
    return formatNepalDateTime(timestamp);
  }, [status, isAdmin]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncContentSnapshot(branch, isAdmin);
      if (result.errors?.length) {
        toast.error(result.errors[0]);
      } else {
        toast.success(isAdmin ? "Sync completed. Latest content is now live." : "View refreshed.");
      }
      await loadStatus();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to sync now.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="content-sync-bar">
      <div className="content-sync-left">
        <h3>
          <i className="fas fa-rocket"></i> Fast Content Snapshot
        </h3>
        <p>
          Last sync: <strong>{loadingStatus ? "Checking..." : lastSyncedLabel}</strong>
        </p>
      </div>
      <div className="content-sync-right">
        <span className="content-sync-mode-pill">
          {isAdmin
            ? (status?.manual_sync_mode ? "Manual Sync Mode" : "Auto Snapshot Mode")
            : "Student Refresh Mode"}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing
            ? (isAdmin ? "Syncing..." : "Refreshing...")
            : (isAdmin ? "Sync Latest Content" : "Refresh My View")}
        </button>
      </div>
    </section>
  );
}
