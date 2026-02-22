import { cachedGet, prefetchGet } from "./api";

const BOOTSTRAP_CACHE_TTL_MS = 5 * 60 * 1000;
const QUESTION_PAGE_SIZE = 50;
const MAX_PRELOAD_EXAM_STARTS_PER_TYPE = 20;

const inFlightWarmups = new Map();

function subjectNameOf(subject) {
  if (typeof subject === "string") return String(subject).trim();
  return String(subject?.name || "").trim();
}

function chapterNameOf(chapter) {
  if (typeof chapter === "string") return String(chapter).trim();
  return String(chapter?.name || "").trim();
}

async function prefetchAllChapterQuestions(branch, subjectName, chapterName) {
  if (!subjectName || !chapterName) return;
  const endpoint = `exams/subjects/${encodeURIComponent(subjectName)}/chapters/${encodeURIComponent(chapterName)}/questions/`;
  const firstPage = await cachedGet(endpoint, {
    params: {
      branch,
      page: 1,
      page_size: QUESTION_PAGE_SIZE,
      refresh: true,
    },
    ttlMs: BOOTSTRAP_CACHE_TTL_MS,
  });
  const totalPages = Math.max(1, Number(firstPage?.data?.total_pages || 1));
  for (let page = 2; page <= totalPages; page += 1) {
    await prefetchGet(endpoint, {
      params: {
        branch,
        page,
        page_size: QUESTION_PAGE_SIZE,
        refresh: true,
      },
      ttlMs: BOOTSTRAP_CACHE_TTL_MS,
    });
  }
}

async function prefetchObjectiveQuestionBank(branch) {
  const subjectsRes = await cachedGet("exams/subjects/", {
    params: { branch, refresh: true },
    ttlMs: BOOTSTRAP_CACHE_TTL_MS,
  });
  const subjects = Array.isArray(subjectsRes?.data) ? subjectsRes.data : [];

  for (const subject of subjects) {
    const subjectName = subjectNameOf(subject);
    if (!subjectName) continue;

    const chaptersRes = await cachedGet(
      `exams/subjects/${encodeURIComponent(subjectName)}/chapters/`,
      {
        params: { branch, refresh: true },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }
    );
    const chapters = Array.isArray(chaptersRes?.data) ? chaptersRes.data : [];
    for (const chapter of chapters) {
      const chapterName = chapterNameOf(chapter);
      if (!chapterName) continue;
      await prefetchAllChapterQuestions(branch, subjectName, chapterName);
    }
  }
}

async function prefetchExamSetsAndStarts(branch, examType) {
  const listRes = await cachedGet("exams/sets/", {
    params: {
      branch,
      exam_type: examType,
      refresh: true,
    },
    ttlMs: BOOTSTRAP_CACHE_TTL_MS,
  });
  const sets = Array.isArray(listRes?.data) ? listRes.data : [];
  const unlockableSets = sets
    .filter((setItem) => Boolean(setItem?.is_unlocked) || Boolean(setItem?.is_free))
    .slice(0, MAX_PRELOAD_EXAM_STARTS_PER_TYPE);

  for (const setItem of unlockableSets) {
    const setId = Number(setItem?.id);
    if (!Number.isFinite(setId)) continue;
    await prefetchGet(`exams/sets/${setId}/start/`, {
      ttlMs: BOOTSTRAP_CACHE_TTL_MS,
    });
  }
}

export async function warmInitialStudentContent(branch, isAuthenticated) {
  const normalizedBranch = String(branch || "Civil Engineering").trim() || "Civil Engineering";
  const key = `${normalizedBranch}|${isAuthenticated ? 1 : 0}`;
  if (inFlightWarmups.has(key)) {
    return inFlightWarmups.get(key);
  }

  const warmupPromise = (async () => {
    await Promise.allSettled([
      prefetchGet("storage/homepage/stats/", { ttlMs: BOOTSTRAP_CACHE_TTL_MS }),
      prefetchGet("storage/files/list/", {
        params: { content_type: "notice", branch: normalizedBranch, refresh: true },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
    ]);

    if (!isAuthenticated) {
      return;
    }

    await Promise.allSettled([
      prefetchGet("storage/files/list/", {
        params: { content_type: "syllabus", branch: normalizedBranch, refresh: true },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: { content_type: "old_question", branch: normalizedBranch, refresh: true },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "subjective",
          branch: normalizedBranch,
          include_dirs: true,
          refresh: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "objective_mcq",
          branch: normalizedBranch,
          include_dirs: true,
          refresh: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "take_exam_mcq",
          branch: normalizedBranch,
          include_dirs: true,
          refresh: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchGet("storage/files/list/", {
        params: {
          content_type: "take_exam_subjective",
          branch: normalizedBranch,
          include_dirs: true,
          refresh: true,
        },
        ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      }),
      prefetchExamSetsAndStarts(normalizedBranch, "mcq"),
      prefetchExamSetsAndStarts(normalizedBranch, "subjective"),
      prefetchObjectiveQuestionBank(normalizedBranch),
    ]);
  })().finally(() => {
    inFlightWarmups.delete(key);
  });

  inFlightWarmups.set(key, warmupPromise);
  return warmupPromise;
}
