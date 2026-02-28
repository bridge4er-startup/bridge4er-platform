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
    await Promise.allSettled([
      prefetchGet("storage/homepage/stats/", {
        params: { branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: { content_type: "notice", branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
    ]);

    if (!isAuthenticated) {
      return;
    }

    await Promise.allSettled([
      prefetchGet("storage/files/list/", {
        params: { content_type: "syllabus", branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: { content_type: "old_question", branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "subjective",
          branch: normalizedBranch,
          include_dirs: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "objective_mcq",
          branch: normalizedBranch,
          include_dirs: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "take_exam_mcq",
          branch: normalizedBranch,
          include_dirs: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "take_exam_subjective",
          branch: normalizedBranch,
          include_dirs: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("exams/subjects/", {
        params: { branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("exams/sets/", {
        params: { branch: normalizedBranch, exam_type: "mcq" },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("exams/sets/", {
        params: { branch: normalizedBranch, exam_type: "subjective" },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
    ]);
  })().finally(() => {
    inFlightWarmups.delete(key);
  });

  inFlightWarmups.set(key, warmupPromise);
  return warmupPromise;
}
