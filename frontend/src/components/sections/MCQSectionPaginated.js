import React, { useEffect, useState } from "react";
import API, { cachedGet, peekCachedGet } from "../../services/api";
import toast from "react-hot-toast";
import { getInstitutionIcon, getSubjectIcon } from "../../utils/subjectIcons";
import TimedLoadingState from "../common/TimedLoadingState";
import { onContentSyncEvent } from "../../services/contentSyncService";

function normalizeSubjectRecord(subject) {
  if (typeof subject === "string") {
    return {
      id: subject,
      name: subject,
      display_name: subject,
      institution: "General",
      institution_key: "General",
      display_order: 0,
      institution_order: 0,
    };
  }

  const name = subject?.name || "";
  return {
    id: subject?.id ?? name,
    name,
    display_name: subject?.display_name || name,
    institution: subject?.institution || "General",
    institution_key: subject?.institution_key || subject?.institution || "General",
    display_order: Number(subject?.display_order || 0),
    institution_order: Number(subject?.institution_order || 0),
  };
}

function normalizeChapterRecord(chapter) {
  if (typeof chapter === "string") {
    return {
      id: chapter,
      name: chapter,
      small_note: "",
      order: 0,
    };
  }
  const name = String(chapter?.name || "").trim();
  const chapterId = chapter?.id ?? name;
  return {
    id: chapterId,
    name,
    small_note: String(chapter?.small_note || "").trim(),
    order: Number(chapter?.order || 0),
  };
}

export default function MCQSectionPaginated({ branch = "Civil Engineering", isActive = false }) {
  const [subjects, setSubjects] = useState([]);
  const [institutionFolders, setInstitutionFolders] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);

  const [selectedInstitution, setSelectedInstitution] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedSubjectLabel, setSelectedSubjectLabel] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedChapterToken, setSelectedChapterToken] = useState("");
  const [view, setView] = useState("institutions");

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [attempts, setAttempts] = useState({});
  const normalizeRows = (value) => (Array.isArray(value) ? value : []);

  const resetQuestionSession = () => {
    setQuestions([]);
    setAttempts({});
    setPage(1);
    setTotalPages(1);
    setTotalQuestions(0);
  };

  const applySubjects = (rows) => {
    const normalizedSubjects = normalizeRows(rows).map(normalizeSubjectRecord);
    setSubjects(normalizedSubjects);

    const institutions = [];
    const seen = new Set();
    normalizedSubjects.forEach((item) => {
      const institutionName = item.institution || "General";
      if (seen.has(institutionName)) return;
      seen.add(institutionName);
      institutions.push(institutionName);
    });
    setInstitutionFolders(institutions);
  };

  useEffect(() => {
    if (!isActive) return;

    const cachedSubjects = peekCachedGet("exams/subjects/", {
      params: { branch },
      persistCache: true,
      allowStale: true,
    });
    if (Array.isArray(cachedSubjects?.data) && cachedSubjects.data.length > 0) {
      applySubjects(cachedSubjects.data);
      setLoading(false);
    }

    loadSubjects({ silent: !!cachedSubjects });
    setView("institutions");
    setSelectedInstitution("");
    setSelectedSubject("");
    setSelectedSubjectLabel("");
    setSelectedChapter("");
    setSelectedChapterToken("");
    setChapters([]);
    resetQuestionSession();
  }, [branch, isActive]);

  useEffect(() => {
    if (!isActive) return () => {};
    return onContentSyncEvent((event) => {
      if (event?.branch && String(event.branch).trim() !== String(branch || "").trim()) {
        return;
      }
      loadSubjects({ forceRefresh: true });
    });
  }, [branch, isActive]);

  const loadSubjects = async ({ forceRefresh = false, silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const subjectsRes = await cachedGet("exams/subjects/", {
        params: { branch, refresh: !!forceRefresh },
        forceRefresh: !!forceRefresh,
        persistCache: true,
      });
      applySubjects(subjectsRes.data);
    } catch (error) {
      toast.error("Failed to load subjects");
      console.error(error);
      setInstitutionFolders([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleSelectInstitution = (institution) => {
    setSelectedInstitution(institution);
    setSelectedSubject("");
    setSelectedSubjectLabel("");
    setSelectedChapter("");
    setSelectedChapterToken("");
    setChapters([]);
    resetQuestionSession();
    setView("subjects");
  };

  const handleSelectSubject = async (subject) => {
    const subjectName = subject?.name || "";
    const subjectToken = String(subject?.id ?? subjectName).trim();
    const displayName = subject?.display_name || subjectName;
    setSelectedSubject(subjectToken);
    setSelectedSubjectLabel(displayName);
    setSelectedChapter("");
    setSelectedChapterToken("");
    resetQuestionSession();

    const chaptersEndpoint = `exams/subjects/${encodeURIComponent(subjectToken)}/chapters/`;
    const cachedChapters = peekCachedGet(chaptersEndpoint, {
      params: { branch },
      persistCache: true,
      allowStale: true,
    });
    if (Array.isArray(cachedChapters?.data) && cachedChapters.data.length > 0) {
      setChapters(cachedChapters.data.map(normalizeChapterRecord));
      setView("chapters");
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const res = await cachedGet(chaptersEndpoint, {
        params: { branch },
        persistCache: true,
      });
      const normalized = normalizeRows(res.data).map(normalizeChapterRecord);
      setChapters(normalized);
      setView("chapters");
    } catch (error) {
      toast.error("Failed to load chapters");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionPage = async (
    subjectName,
    chapterName,
    nextPage,
    nextPageSize = pageSize,
    { forceRefresh = false } = {}
  ) => {
    const questionsEndpoint = `exams/subjects/${encodeURIComponent(subjectName)}/chapters/${encodeURIComponent(chapterName)}/questions/`;
    const queryParams = {
      branch,
      page: nextPage,
      page_size: Math.max(5, nextPageSize),
      refresh: !!forceRefresh,
    };
    const cachedPage = peekCachedGet(questionsEndpoint, {
      params: queryParams,
      persistCache: true,
      allowStale: true,
    });
    if (Array.isArray(cachedPage?.data?.results) && cachedPage.data.results.length > 0) {
      setQuestions(cachedPage.data.results || []);
      setPage(cachedPage.data?.page || nextPage);
      setPageSize(cachedPage.data?.page_size || nextPageSize);
      setTotalPages(cachedPage.data?.total_pages || 1);
      setTotalQuestions(cachedPage.data?.count || 0);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const res = await cachedGet(questionsEndpoint, {
        params: queryParams,
        forceRefresh: !!forceRefresh,
        persistCache: true,
      });
      setQuestions(normalizeRows(res.data?.results));
      setPage(res.data?.page || nextPage);
      setPageSize(res.data?.page_size || nextPageSize);
      setTotalPages(res.data?.total_pages || 1);
      setTotalQuestions(res.data?.count || 0);
    } catch (error) {
      toast.error("Failed to load questions");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChapter = async (chapter) => {
    const chapterToken = String((chapter?.id ?? chapter) || "").trim();
    const chapterName = String((chapter?.name ?? chapter) || "").trim();
    if (!chapterToken) {
      toast.error("Invalid chapter record.");
      return;
    }
    setSelectedChapter(chapterName || chapterToken);
    setSelectedChapterToken(chapterToken);
    resetQuestionSession();
    await loadQuestionPage(selectedSubject, chapterToken, 1, pageSize);
    setView("questions");
  };

  const handleSelectOption = async (question, optionKey) => {
    if (attempts[question.id]?.locked) return;
    const localCorrectOption = String(question.correct_option || question.correctOption || "")
      .trim()
      .toLowerCase();
    if (["a", "b", "c", "d"].includes(localCorrectOption)) {
      setAttempts((prev) => ({
        ...prev,
        [question.id]: {
          locked: true,
          selected_option: optionKey,
          correct_option: localCorrectOption,
          is_correct: optionKey === localCorrectOption,
          explanation: question.explanation || "",
        },
      }));
      API.post("exams/questions/submit/", {
        question_id: question.id,
        selected_option: optionKey,
      }).catch((error) => {
        console.error("Answer submit failed after local reveal:", error);
      });
      return;
    }
    try {
      const res = await API.post("exams/questions/submit/", {
        question_id: question.id,
        selected_option: optionKey,
      });
      setAttempts((prev) => ({
        ...prev,
        [question.id]: {
          locked: true,
          selected_option: res.data.selected_option || optionKey,
          correct_option: res.data.correct_option,
          is_correct: !!res.data.is_correct,
          explanation: res.data.explanation || "",
        },
      }));
    } catch (error) {
      toast.error("Failed to submit answer");
      console.error(error);
    }
  };

  const handlePageSizeChange = async (value) => {
    const nextSize = Math.max(5, Number(value || 5));
    setPageSize(nextSize);
    const chapterToken = selectedChapterToken || selectedChapter;
    if (!selectedSubject || !chapterToken) return;
    await loadQuestionPage(selectedSubject, chapterToken, 1, nextSize);
  };

  const goToPage = async (targetPage) => {
    const safePage = Math.max(1, Math.min(totalPages, targetPage));
    if (safePage === page) return;
    await loadQuestionPage(selectedSubject, selectedChapterToken || selectedChapter, safePage, pageSize);
  };

  const getOptionClassName = (questionId, optionKey) => {
    const attempt = attempts[questionId];
    if (!attempt?.locked) return "mcq-option";
    const correctOption = String(attempt.correct_option || "").toLowerCase();
    const selectedOption = String(attempt.selected_option || "").toLowerCase();
    if (optionKey === correctOption) return "mcq-option correct";
    if (optionKey === selectedOption && !attempt.is_correct) return "mcq-option incorrect";
    if (optionKey === selectedOption) return "mcq-option selected";
    return "mcq-option";
  };

  const renderPageButtons = () => {
    const buttons = [];
    for (let i = 1; i <= totalPages; i += 1) {
      if (i <= 3 || i > totalPages - 2 || Math.abs(i - page) <= 1) {
        buttons.push(i);
      }
    }
    const uniqueButtons = [...new Set(buttons)];
    return uniqueButtons.map((btnPage) => (
      <button
        key={btnPage}
        className={`page-btn ${btnPage === page ? "active" : ""}`}
        onClick={() => goToPage(btnPage)}
      >
        {btnPage}
      </button>
    ));
  };

  const institutionNames = institutionFolders;
  const visibleSubjects = subjects.filter(
    (subject) => (subject.institution || "General") === selectedInstitution
  );

  return (
    <section id="objective-mcqs" className={`section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-question-circle"></i> Objective MCQs
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>

      {view === "institutions" && (
        <>
          <p>Select an institution folder to browse objective subjects and question sets.</p>

          {loading ? (
            <TimedLoadingState baseMessage="Loading institution folders..." />
          ) : institutionNames.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No institution folders found</h4>
            </div>
          ) : (
            <div className="subject-grid">
              {institutionNames.map((institutionName) => (
                <div key={institutionName} className="subject-card folder-card institution-card">
                  <i className={getInstitutionIcon(institutionName, "fas fa-building-columns")}></i>
                  <h3 className="folder-display-name">{institutionName}</h3>
                  <button
                    className="btn btn-primary mcq-folder-open-btn"
                    onClick={() => handleSelectInstitution(institutionName)}
                  >
                    Open Institution Folder
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "subjects" && (
        <>
          <p>
            Select a subject from <strong>{selectedInstitution}</strong>.
          </p>

          <button
            className="btn btn-secondary btn-soft-blue-action"
            onClick={() => {
              setView("institutions");
              setSelectedInstitution("");
              setSelectedSubject("");
              setSelectedSubjectLabel("");
              setSelectedChapter("");
              setSelectedChapterToken("");
              setChapters([]);
              resetQuestionSession();
            }}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Institutions
          </button>

          {loading ? (
            <TimedLoadingState baseMessage="Loading subjects..." />
          ) : visibleSubjects.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No subjects found</h4>
            </div>
          ) : (
            <div className="subject-grid">
              {visibleSubjects.map((subject) => (
                <div key={subject.id || subject.name} className="subject-card folder-card">
                  <i className={getSubjectIcon(subject.display_name || subject.name, "fas fa-folder-open")}></i>
                  <h3 className="folder-display-name">{subject.display_name || subject.name}</h3>
                  <button
                    className="btn btn-primary mcq-folder-open-btn"
                    onClick={() => handleSelectSubject(subject)}
                  >
                    Open Subject Folder
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "chapters" && (
        <>
          <p>
            Select a chapter to practice questions from <strong>{selectedSubjectLabel || selectedSubject}</strong>.
          </p>

          <button
            className="btn btn-secondary btn-soft-blue-action"
            onClick={() => {
              setView("subjects");
              setSelectedSubject("");
              setSelectedSubjectLabel("");
              setSelectedChapter("");
              setSelectedChapterToken("");
              setChapters([]);
              resetQuestionSession();
            }}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Subjects
          </button>

          {loading ? (
            <TimedLoadingState baseMessage="Loading chapters..." />
          ) : chapters.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No chapters found</h4>
            </div>
          ) : (
            <div className="subject-grid">
              {chapters.map((chapter) => (
                <div key={chapter.id || chapter.name} className="subject-card folder-card chapter-card">
                  <i className={getSubjectIcon(chapter.name || chapter.id, "fas fa-file-lines")}></i>
                  <h3 className="folder-display-name">{chapter.name || chapter.id}</h3>
                  {chapter.small_note ? <p className="chapter-small-note">{chapter.small_note}</p> : null}
                  <button
                    className="btn btn-primary mcq-folder-open-btn"
                    onClick={() => handleSelectChapter(chapter)}
                  >
                    Open Question Set
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "questions" && (
        <div className="mcq-paginated-container">
          <div className="mcq-header">
            <div className="mcq-pagination-info">
              {selectedInstitution} / {selectedSubjectLabel || selectedSubject} / {selectedChapter} - Page {page} of {totalPages}
            </div>
            <div className="questions-per-page-selector">
              <label htmlFor="questions-per-page">Questions per page</label>
              <select id="questions-per-page" value={pageSize} onChange={(e) => handlePageSizeChange(e.target.value)}>
                {[5, 10, 15, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="btn btn-secondary btn-soft-blue-action"
            onClick={() => {
              setView("chapters");
              setSelectedChapter("");
              setSelectedChapterToken("");
              resetQuestionSession();
            }}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Chapters
          </button>

          {loading ? (
            <TimedLoadingState baseMessage="Loading questions..." />
          ) : questions.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No questions found in this question set</h4>
              <p>Ask an admin to sync the latest Objective MCQ files for this field.</p>
            </div>
          ) : (
            <>
              {questions.map((question, index) => {
                const attempt = attempts[question.id];
                const options = question.options || {
                  a: question.option_a,
                  b: question.option_b,
                  c: question.option_c,
                  d: question.option_d,
                };
                const correctLabel = String(attempt?.correct_option || "").toUpperCase();
                return (
                  <div key={question.id} className="mcq-question-container">
                    <div className="question-number-badge">Q {(page - 1) * pageSize + index + 1}</div>
                    {question.question_header ? <h4>{question.question_header}</h4> : null}
                    <div className="mcq-question">{question.question_text}</div>
                    {question.question_image_url ? (
                      <img
                        src={question.question_image_url}
                        alt={`Question ${question.id}`}
                        style={{ width: "100%", maxHeight: 300, objectFit: "contain", marginBottom: "1rem" }}
                      />
                    ) : null}

                    <div className="mcq-options">
                      {["a", "b", "c", "d"].map((optionKey, optionIndex) => (
                        <button
                          key={optionKey}
                          type="button"
                          className={getOptionClassName(question.id, optionKey)}
                          onClick={() => handleSelectOption(question, optionKey)}
                          disabled={!!attempt?.locked}
                          style={{ width: "100%", textAlign: "left" }}
                        >
                          <div className="option-letter">{String.fromCharCode(65 + optionIndex)}</div>
                          <div>{options[optionKey]}</div>
                        </button>
                      ))}
                    </div>

                    {attempt?.locked ? (
                      <div className="mcq-explanation show">
                        <h4>
                          {attempt.is_correct ? "Correct." : "Correct answer:"} {correctLabel}
                        </h4>
                        {attempt.explanation ? (
                          <p>{attempt.explanation}</p>
                        ) : (
                          <p>No explanation has been added for this question yet.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <div className="pagination-controls">
                <div className="pagination-buttons">
                  <button className="btn btn-secondary btn-soft-blue-action" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                    Previous Page
                  </button>
                  <button className="btn btn-secondary btn-soft-blue-action" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
                    Next Page
                  </button>
                </div>
                <div className="page-indicator">{renderPageButtons()}</div>
                <div style={{ color: "#666", fontSize: "0.9rem" }}>Total Questions: {totalQuestions}</div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
