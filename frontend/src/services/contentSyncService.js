import { API_SYNC_TIMEOUT_MS, cachedGet, clearGetResponseCache, clearPersistedGetCache } from "./api";
import { fileService } from "./fileService";
import { mcqService } from "./mcqService";

export const CONTENT_SYNC_EVENT = "bridge4er:content-sync";

function normalizeBranch(value) {
  const cleaned = String(value || "").trim();
  return cleaned || "Civil Engineering";
}

function summarizeError(error) {
  return (
    error?.response?.data?.error
    || error?.message
    || "Unknown error"
  );
}

export function emitContentSyncEvent(payload = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONTENT_SYNC_EVENT, {
      detail: {
        at: Date.now(),
        ...payload,
      },
    })
  );
}

export function onContentSyncEvent(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => callback?.(event?.detail || {});
  window.addEventListener(CONTENT_SYNC_EVENT, handler);
  return () => window.removeEventListener(CONTENT_SYNC_EVENT, handler);
}

export async function getContentSyncStatus(branch = "Civil Engineering") {
  const normalizedBranch = normalizeBranch(branch);
  const response = await cachedGet("storage/files/sync-status/", {
    params: { branch: normalizedBranch },
    persistCache: true,
    allowStaleOnError: true,
  });
  return response?.data || null;
}

export async function syncContentSnapshot(branch = "Civil Engineering", isAdmin = false) {
  const normalizedBranch = normalizeBranch(branch);
  const results = {
    branch: normalizedBranch,
    is_admin_sync: !!isAdmin,
    synced: false,
    errors: [],
  };

  if (isAdmin) {
    const syncTasks = await Promise.allSettled([
      mcqService.syncDropboxQuestionBank(normalizedBranch, true, true, true),
      fileService.syncContent(normalizedBranch, ["notice", "syllabus", "old_question", "subjective"], true),
    ]);
    syncTasks.forEach((task) => {
      if (task.status === "fulfilled") {
        results.synced = true;
        return;
      }
      results.errors.push(summarizeError(task.reason));
    });
  } else {
    results.synced = true;
  }

  clearGetResponseCache();
  clearPersistedGetCache();
  emitContentSyncEvent({
    branch: normalizedBranch,
    synced: results.synced,
    errors: results.errors,
    source: isAdmin ? "admin-sync" : "client-refresh",
  });
  return results;
}

export { API_SYNC_TIMEOUT_MS };

