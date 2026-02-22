import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { getInstitutionIcon, getSubjectIcon } from "../../utils/subjectIcons";

function normalizeSubjectRecord(subject) {
  if (typeof subject === "string") {
    return {
      id: subject,
      name: subject,
      display_name: subject,
      institution: "General",
      institution_key: "General",
    };
  }

  const name = subject?.name || "";
  return {
    id: subject?.id ?? name,
    name,
    display_name: subject?.display_name || name,
    institution: subject?.institution || "General",
    institution_key: subject?.institution_key || subject?.institution || "General",
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
  const [view, setView] = useState("institutions");

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [attempts, setAttempts] = useState({});

  const resetQuestionSession = () => {
    setQuestions([]);
    setAttempts({});
    setPage(1);
    setTotalPages(1);
    setTotalQuestions(0);
  };

  useEffect(() => {
    if (!isActive) return;
    loadSubjects();
    setView("institutions");
    setSelectedInstitution("");
    setSelectedSubject("");
    setSelectedSubjectLabel("");
    setSelectedChapter("");
    setChapters([]);
    resetQuestionSession();
  }, [branch, isActive]);

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const [subjectsRes, objectiveFoldersRes] = await Promise.all([
        API.get("exams/subjects/", {
          params: { branch, refresh: true },
        }),
        API.get("storage/files/list/", {
          params: {
            content_type: "objective_mcq",
            branch,
            include_dirs: true,
            refresh: true,
          },
        }),
      ]);

      const normalizedSubjects = (subjectsRes.data || []).map(normalizeSubjectRecord);
      setSubjects(normalizedSubjects);

      const institutions = new Set(normalizedSubjects.map((item) => item.institution || "General"));
      const rootPrefix = `/bridge4er/${branch}/Objective MCQs/`.toLowerCase();
      (objectiveFoldersRes.data || []).forEach((entry) => {
        if (!entry?.is_dir) return;
        const path = String(entry.path || "");
        const lowerPath = path.toLowerCase();
        const index = lowerPath.indexOf(rootPrefix);
        if (index < 0) return;
        const relative = path.slice(index + rootPrefix.length).split("/").filter(Boolean);
        if (relative.length === 0) return;
        if (String(relative[0]).toLowerCase() === "subjects") {
          institutions.add("General");
        } else {
          institutions.add(relative[0]);
        }
      });
      setInstitutionFolders([...institutions].sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      toast.error("Failed to load subjects");
      console.error(error);
      setInstitutionFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInstitution = (institution) => {
    setSelectedInstitution(institution);
    setSelectedSubject("");
    setSelectedSubjectLabel("");
    setSelectedChapter("");
    setChapters([]);
    resetQuestionSession();
    setView("subjects");
  };

  const handleSelectSubject = async (subject) => {
    const subjectName = subject?.name || "";
    const displayName = subject?.display_name || subjectName;
    setSelectedSubject(subjectName);
    setSelectedSubjectLabel(displayName);
    setSelectedChapter("");
    resetQuestionSession();
    setLoading(true);
    try {
      const res = await API.get(`exams/subjects/${encodeURIComponent(subjectName)}/chapters/`, {
        params: { branch, refresh: true },
      });
      setChapters(res.data || []);
      setView("chapters");
    } catch (error) {
      toast.error("Failed to load chapters");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionPage = async (subjectName, chapterName, nextPage, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await API.get(
        `exams/subjects/${encodeURIComponent(subjectName)}/chapters/${encodeURIComponent(chapterName)}/questions/`,
        {
          params: {
            branch,
            page: nextPage,
            page_size: Math.max(5, nextPageSize),
            refresh: true,
          },
        }
      );
      setQuestions(res.data?.results || []);
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
    setSelectedChapter(chapter);
    resetQuestionSession();
    await loadQuestionPage(selectedSubject, chapter, 1, pageSize);
    setView("questions");
  };

  const handleSelectOption = async (question, optionKey) => {
    if (attempts[question.id]?.locked) return;
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
    if (!selectedSubject || !selectedChapter) return;
    await loadQuestionPage(selectedSubject, selectedChapter, 1, nextSize);
  };

  const goToPage = async (targetPage) => {
    const safePage = Math.max(1, Math.min(totalPages, targetPage));
    if (safePage === page) return;
    await loadQuestionPage(selectedSubject, selectedChapter, safePage, pageSize);
  };

  const getOptionClassName = (questionId, optionKey) => {
    const attempt = attempts[questionId];
    if (!attempt?.locked) return "mcq-option";
    if (optionKey === attempt.correct_option) return "mcq-option correct";
    if (optionKey === attempt.selected_option && !attempt.is_correct) return "mcq-option incorrect";
    if (optionKey === attempt.selected_option) return "mcq-option selected";
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
  const visibleSubjects = subjects
    .filter((subject) => (subject.institution || "General") === selectedInstitution)
    .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));

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
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading institution folders...</p>
            </div>
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
              setChapters([]);
              resetQuestionSession();
            }}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Institutions
          </button>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading subjects...</p>
            </div>
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
              setChapters([]);
              resetQuestionSession();
            }}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Subjects
          </button>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading chapters...</p>
            </div>
          ) : chapters.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No chapters found</h4>
            </div>
          ) : (
            <div className="subject-grid">
              {chapters.map((chapter) => (
                <div key={chapter.id || chapter.name} className="subject-card folder-card chapter-card">
                  <i className={getSubjectIcon(chapter.name || chapter, "fas fa-file-lines")}></i>
                  <h3 className="folder-display-name">{chapter.name || chapter}</h3>
                  {chapter.small_note ? <p className="chapter-small-note">{chapter.small_note}</p> : null}
                  <button
                    className="btn btn-primary mcq-folder-open-btn"
                    onClick={() => handleSelectChapter(chapter.name || chapter)}
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
              resetQuestionSession();
            }}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Chapters
          </button>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading questions...</p>
            </div>
          ) : (
            <>
              {questions.map((question, index) => {
                const attempt = attempts[question.id];
                const options = question.options || {};
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
                        <h4>Explanation:</h4>
                        {attempt.explanation ? <p>{attempt.explanation}</p> : null}
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
