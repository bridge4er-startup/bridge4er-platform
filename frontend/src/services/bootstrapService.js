import { prefetchGet } from "./api";

const BOOTSTRAP_CACHE_TTL_MS = 5 * 60 * 1000;
const inFlightWarmups = new Map();

export async function warmInitialStudentContent(branch, isAuthenticated) {
  const normalizedBranch = String(branch || "Civil Engineering").trim() || "Civil Engineering";
  const key = `${normalizedBranch}|${isAuthenticated ? 1 : 0}`;
  if (inFlightWarmups.has(key)) {
    return inFlightWarmups.get(key);
  }

  const warmupPromise = (async () => {
    const startupRequests = [
      prefetchGet("storage/homepage/stats/", {
        params: { branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
        persistCache: true,
        persistTtlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "notice",
          branch: normalizedBranch,
          prefer_metadata: true,
          metadata_only: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
        persistCache: true,
        persistTtlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
    ];

    await Promise.allSettled(startupRequests);
  })().finally(() => {
    inFlightWarmups.delete(key);
  });

  inFlightWarmups.set(key, warmupPromise);
  return warmupPromise;
}
