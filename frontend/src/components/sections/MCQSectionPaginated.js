import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import { getSubjectIcon } from "../../utils/subjectIcons";

export default function MCQSectionPaginated({ branch = "Civil Engineering", isActive = false }) {
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);

  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [view, setView] = useState("subjects");

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
    setView("subjects");
    setSelectedSubject("");
    setSelectedChapter("");
    setChapters([]);
    resetQuestionSession();
  }, [branch, isActive]);

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const res = await API.get("exams/subjects/", {
        params: { branch },
      });
      setSubjects(res.data || []);
    } catch (error) {
      toast.error("Failed to load subjects");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSubject = async (subject) => {
    setSelectedSubject(subject);
    setSelectedChapter("");
    resetQuestionSession();
    setLoading(true);
    try {
      const res = await API.get(`exams/subjects/${encodeURIComponent(subject)}/chapters/`, {
        params: { branch },
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

  return (
    <section id="objective-mcqs" className={`section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-question-circle"></i> Objective MCQs
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>

      {view === "subjects" && (
        <>
          <p>Select a subject to practice MCQs with instant answer checking.</p>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading subjects...</p>
            </div>
          ) : subjects.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No subjects found</h4>
            </div>
          ) : (
            <div className="subject-grid">
              {subjects.map((subject) => (
                <div key={subject.id || subject.name || subject} className="subject-card folder-card">
                  <i className={getSubjectIcon(subject.name || subject, "fas fa-folder-open")}></i>
                  <h3 className="folder-display-name">{subject.name || subject}</h3>
                  <button className="btn btn-primary" onClick={() => handleSelectSubject(subject.name || subject)}>
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
            Select a chapter to practice questions from <strong>{selectedSubject}</strong>.
          </p>

          <button
            className="btn btn-secondary btn-soft-blue-action"
            onClick={() => {
              setView("subjects");
              setSelectedSubject("");
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
                  <button className="btn btn-primary" onClick={() => handleSelectChapter(chapter.name || chapter)}>
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
              {selectedSubject} / {selectedChapter} - Page {page} of {totalPages}
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
