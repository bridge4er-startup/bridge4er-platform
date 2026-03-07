import { cachedGet, prefetchGet } from "./api";

const BOOTSTRAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const inFlightWarmups = new Map();

const normalizeSubjectName = (subject) => {
  if (typeof subject === "string") {
    return subject;
  }
  return String(subject?.name || "").trim();
};

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
      }),
      prefetchGet("storage/files/list/", {
        params: { content_type: "notice", branch: normalizedBranch },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
    ];

    let subjects = [];
    if (isAuthenticated) {
      startupRequests.push(
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
        prefetchGet("exams/sets/", {
          params: { branch: normalizedBranch, exam_type: "mcq" },
          ttlMs: BOOTSTRAP_CACHE_TTL_MS,
        }),
        prefetchGet("exams/sets/", {
          params: { branch: normalizedBranch, exam_type: "subjective" },
          ttlMs: BOOTSTRAP_CACHE_TTL_MS,
        })
      );

      try {
        const subjectsRes = await cachedGet("exams/subjects/", {
          params: { branch: normalizedBranch },
          ttlMs: BOOTSTRAP_CACHE_TTL_MS,
        });
        subjects = Array.isArray(subjectsRes?.data) ? subjectsRes.data : [];
      } catch (_error) {
        subjects = [];
      }
    }

    await Promise.allSettled(startupRequests);

    if (!isAuthenticated || subjects.length === 0) {
      return;
    }

    const chapterPrefetches = subjects
      .map((subject) => normalizeSubjectName(subject))
      .filter(Boolean)
      .map((subjectName) =>
        prefetchGet(`exams/subjects/${encodeURIComponent(subjectName)}/chapters/`, {
          params: { branch: normalizedBranch },
          ttlMs: BOOTSTRAP_CACHE_TTL_MS,
        })
      );
    await Promise.allSettled(chapterPrefetches);
  })().finally(() => {
    inFlightWarmups.delete(key);
  });

  inFlightWarmups.set(key, warmupPromise);
  return warmupPromise;
}
