import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { startExamSet, submitExamSet } from "../services/examService";
import toast from "react-hot-toast";

function formatTimer(timeLeft = 0) {
  const absTime = Math.abs(timeLeft);
  const mins = Math.floor(absTime / 60);
  const secs = absTime % 60;
  return `${timeLeft < 0 ? "-" : ""}${mins}:${secs < 10 ? `0${secs}` : secs}`;
}

function answerValueLabel(question, value) {
  if (!value) return "Not answered";
  const optionKey = String(value).toLowerCase();
  const optionValue = question?.options?.[optionKey];
  return optionValue ? String(optionValue) : String(value).toUpperCase();
}

export default function MCQExamPage() {
  const { branch, setName: setId } = useParams();
  const decodedBranch = decodeURIComponent(branch || "");
  const numericSetId = Number(setId);
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState({});
  const [visited, setVisited] = useState({});
  const [skipped, setSkipped] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [submittedResult, setSubmittedResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialDuration, setInitialDuration] = useState(0);
  const [showAnswersModal, setShowAnswersModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await startExamSet(numericSetId);
        setExam(data);
        setInitialDuration(data.duration_seconds || 1800);
        setTimeLeft(data.duration_seconds || 1800);
        setCurrentIndex(0);
        setAnswers({});
        setMarked({});
        setSkipped({});
        const firstQuestion = (data.questions || [])[0];
        setVisited(firstQuestion ? { [firstQuestion.id]: true } : {});
      } catch (error) {
        const message = error?.response?.data?.error || "Failed to load exam";
        toast.error(message);
        navigate("/");
      }
    }
    load();
    return () => clearInterval(timerRef.current);
  }, [numericSetId, navigate]);

  useEffect(() => {
    if (!exam?.questions?.length) return;
    const currentQuestion = exam.questions[currentIndex];
    if (!currentQuestion) return;
    setVisited((prev) => ({ ...prev, [currentQuestion.id]: true }));
  }, [currentIndex, exam]);

  useEffect(() => {
    if (timeLeft == null || submittedResult || !exam) return undefined;

    const grace = exam.grace_seconds || 0;
    if (timeLeft <= -grace) {
      handleSubmit(true);
      return undefined;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((value) => value - 1);
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeLeft, exam, submittedResult]);

  const questions = exam?.questions || [];
  const currentQuestion = questions[currentIndex];
  const normalizedQuestionMarks = Number(currentQuestion?.marks ?? 1);
  const currentQuestionMarks = Number.isFinite(normalizedQuestionMarks) && normalizedQuestionMarks > 0 ? normalizedQuestionMarks : 1;
  const questionById = useMemo(
    () =>
      questions.reduce((acc, question) => {
        acc[String(question.id)] = question;
        return acc;
      }, {}),
    [questions]
  );

  const answeredCount = useMemo(
    () => questions.filter((question) => !!answers[question.id]).length,
    [answers, questions]
  );

  const flaggedCount = useMemo(
    () => questions.filter((question) => !!marked[question.id]).length,
    [marked, questions]
  );

  const skippedCount = useMemo(
    () => questions.filter((question) => !!skipped[question.id]).length,
    [questions, skipped]
  );

  const unseenCount = useMemo(
    () =>
      questions.filter((question) => {
        const qid = question.id;
        return !visited[qid] && !answers[qid] && !marked[qid] && !skipped[qid];
      }).length,
    [answers, marked, questions, skipped, visited]
  );

  const timerLabel = formatTimer(timeLeft || 0);

  const goToQuestion = (index) => {
    const safeIndex = Math.max(0, Math.min(questions.length - 1, index));
    const nextQuestion = questions[safeIndex];
    if (nextQuestion) {
      setVisited((prev) => ({ ...prev, [nextQuestion.id]: true }));
    }
    setCurrentIndex(safeIndex);
  };

  const selectOption = (questionId, optionKey) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
    setSkipped((prev) => {
      if (!prev[questionId]) return prev;
      const updated = { ...prev };
      delete updated[questionId];
      return updated;
    });
  };

  const toggleFlag = (questionId) => {
    setMarked((prev) => {
      const nextValue = !prev[questionId];
      if (nextValue) {
        setSkipped((prevSkipped) => {
          if (!prevSkipped[questionId]) return prevSkipped;
          const updated = { ...prevSkipped };
          delete updated[questionId];
          return updated;
        });
      }
      return { ...prev, [questionId]: nextValue };
    });
  };

  const getPaletteStatus = (questionId) => {
    if (marked[questionId]) return "flagged";
    if (answers[questionId]) return "answered";
    if (skipped[questionId]) return "skipped";
    return "unseen";
  };

  const handleNextQuestion = () => {
    if (!currentQuestion) return;
    const questionId = currentQuestion.id;
    const hasAnswer = !!answers[questionId];
    const isFlagged = !!marked[questionId];
    if (!hasAnswer && !isFlagged) {
      setSkipped((prev) => ({ ...prev, [questionId]: true }));
    }
    goToQuestion(currentIndex + 1);
  };

  const openConfirm = (type) => {
    if (submitting || submittedResult) return;
    setConfirmAction(type);
  };

  const closeConfirm = () => setConfirmAction("");

  async function handleSubmit(autoSubmit = false, options = {}) {
    if (submitting || submittedResult) return;

    try {
      setSubmitting(true);
      const response = await submitExamSet(exam.id, answers);
      setSubmittedResult(response);
      clearInterval(timerRef.current);
      toast.success(autoSubmit ? "Auto-submitted after timer end" : "Exam submitted successfully");
      if (options.goToHall) {
        navigate("/#exam-hall");
      }
    } catch (_error) {
      toast.error("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!exam) {
    return <div style={{ padding: 20 }}>Loading exam...</div>;
  }

  if (!currentQuestion && !submittedResult) {
    return (
      <div className="container" style={{ paddingTop: 20 }}>
        <div className="exam-info-container">
          <h2 className="exam-info-title">{exam.name}</h2>
          <p>No questions available in this set.</p>
        </div>
      </div>
    );
  }

  if (submittedResult) {
    const total = submittedResult.total_questions || 0;
    const correct = submittedResult.correct_answers || 0;
    const wrong = submittedResult.wrong_answers || 0;
    const skipped = submittedResult.unanswered || 0;
    const scorePercentValue = total > 0 ? (correct / total) * 100 : 0;
    const scorePercent = scorePercentValue.toFixed(2);

    return (
      <div className="container mcq-result-page" style={{ paddingTop: 20, paddingBottom: 40 }}>
        <div className="result-hero">
          <div>
            <h2>{exam.name} - Exam Results</h2>
            <p>
              {decodedBranch} | Submitted: {submittedResult.submitted_at ? new Date(submittedResult.submitted_at).toLocaleString() : "Now"}
            </p>
          </div>
          <div
            className="result-score-donut"
            aria-label="Percentage score"
            style={{ "--score-angle": `${Math.max(0, Math.min(360, (scorePercentValue / 100) * 360))}deg` }}
          >
            <span>{scorePercent}%</span>
          </div>
        </div>

        <div className="result-main-grid">
          <div className="result-summary-grid">
            <article className="result-stat-card stat-score">
              <span>% Scored</span>
              <strong>{scorePercent}%</strong>
            </article>
            <article className="result-stat-card stat-correct">
              <span>Correct</span>
              <strong>{correct}</strong>
            </article>
            <article className="result-stat-card stat-wrong">
              <span>Wrong</span>
              <strong>{wrong}</strong>
            </article>
            <article className="result-stat-card stat-skipped">
              <span>Skipped</span>
              <strong>{skipped}</strong>
            </article>
          </div>

          <aside className="result-leaderboard-panel">
            <h3>
              <i className="fas fa-ranking-star"></i> Leaderboard
            </h3>
            {(submittedResult.leaderboard || []).length === 0 ? (
              <p>No leaderboard entries yet.</p>
            ) : (
              <ul className="result-leaderboard-list">
                {submittedResult.leaderboard.map((entry) => (
                  <li key={`${entry.rank}-${entry.student_name}`}>
                    <div>
                      <strong>#{entry.rank}</strong> {entry.student_name}
                    </div>
                    <span>{entry.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <div className="result-actions-row">
          <button className="btn btn-secondary btn-soft-blue-action" onClick={() => setShowAnswersModal(true)}>
            View Answers
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/#exam-hall")}>
            Try Another Exam
          </button>
        </div>

        {showAnswersModal ? (
          <div className="answer-review-modal-overlay">
            <div className="answer-review-modal">
              <div className="answer-review-header">
                <h3>Answer Review</h3>
                <button className="btn" onClick={() => setShowAnswersModal(false)}>
                  <i className="fas fa-xmark"></i>
                </button>
              </div>
              <div className="answer-review-body">
                {(submittedResult.review || []).map((item, index) => (
                  <article
                    key={item.question_id}
                    className={`answer-review-item ${item.is_correct ? "review-correct" : "review-wrong"}`}
                  >
                    <h4>Q{index + 1}</h4>
                    <p>{item.question_text}</p>
                    <div className="answer-review-meta">
                      <span
                        className={`answer-review-value ${
                          item.is_correct ? "answer-review-value-match" : "answer-review-value-your-mismatch"
                        }`}
                      >
                        Your Answer: {answerValueLabel(questionById[String(item.question_id)], item.selected_option)}
                      </span>
                      <span
                        className={`answer-review-value ${
                          item.is_correct ? "answer-review-value-match" : "answer-review-value-correct-mismatch"
                        }`}
                      >
                        Correct Answer: {answerValueLabel(questionById[String(item.question_id)], item.correct_option)}
                      </span>
                    </div>
                    {item.explanation ? <p className="answer-review-explain">Explanation: {item.explanation}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="container modern-mcq-exam-page" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <div className="exam-paper-header-wrap">
        <div className="exam-paper-top-row">
          <div>
            <h2 className="exam-info-title">{exam.name}</h2>
            <div className="exam-info-subtitle">{decodedBranch}</div>
          </div>
          <div className="exam-header-actions">
            <button className="btn btn-secondary btn-soft-blue-action" onClick={() => openConfirm("back")}>
              Back
            </button>
          </div>
        </div>

        {exam.instructions ? (
          <div className="exam-instruction-box">
            <h4>
              <i className="fas fa-circle-info"></i> Instructions
            </h4>
            {String(exam.instructions)
              .split("\n")
              .filter((line) => line.trim())
              .map((line, idx) => (
                <p key={`${line}-${idx}`}>{line}</p>
              ))}
          </div>
        ) : null}

        <div className="exam-info-row">
          <div className={`exam-timer-large ${timeLeft < 0 ? "negative" : ""}`}>
            {timeLeft < 0 ? `Overtime ${timerLabel}` : timerLabel}
          </div>
          <div className="exam-quick-details">
            <span>
              <i className="fas fa-list"></i> Questions: <strong>{questions.length}</strong>
            </span>
            <span>
              <i className="fas fa-hourglass-half"></i> Duration: <strong>{Math.floor(initialDuration / 60)} min</strong>
            </span>
            <span>
              <i className="fas fa-minus-circle"></i> Negative Marking: <strong>{exam.negative_marking || 0}</strong>
            </span>
          </div>
        </div>

        <div className="exam-submit-cta-row">
          <button className="btn btn-primary exam-submit-cta" onClick={() => openConfirm("submit")} disabled={submitting}>
            {submitting ? (
              "Submitting..."
            ) : (
              <>
                <i className="fas fa-paper-plane"></i> Submit Exam
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mcq-exam-main-layout">
        <section className="mcq-question-stage">
          <div className="mcq-question-container">
            <div className="question-head-row">
              <div className="question-number-badge">Q {currentIndex + 1}</div>
              <span className="question-marks-badge">
                {currentQuestionMarks} Mark{currentQuestionMarks > 1 ? "s" : ""}
              </span>
            </div>
            {currentQuestion.question_header ? <h4>{currentQuestion.question_header}</h4> : null}
            <div className="mcq-question">{currentQuestion.question_text}</div>
            {currentQuestion.question_image_url ? (
              <img
                src={currentQuestion.question_image_url}
                alt={`Question ${currentQuestion.id}`}
                style={{ width: "100%", maxHeight: 320, objectFit: "contain", marginTop: "0.8rem", marginBottom: "0.8rem" }}
              />
            ) : null}

            <div className="mcq-options">
              {Object.entries(currentQuestion.options || {}).map(([optionKey, optionValue], optionIndex) => {
                const selected = answers[currentQuestion.id] === optionKey;
                return (
                  <button
                    key={optionKey}
                    type="button"
                    className={`mcq-option ${selected ? "selected" : ""}`}
                    onClick={() => selectOption(currentQuestion.id, optionKey)}
                  >
                    <div className="option-letter">{String.fromCharCode(65 + optionIndex)}</div>
                    <div>{optionValue}</div>
                  </button>
                );
              })}
            </div>

            <div className="mcq-nav-actions">
              <button className={`btn mcq-flag-btn ${marked[currentQuestion.id] ? "active" : ""}`} onClick={() => toggleFlag(currentQuestion.id)}>
                {marked[currentQuestion.id] ? "Unflag" : "Flag"}
              </button>
              <button className="btn btn-soft-blue-action" onClick={() => goToQuestion(currentIndex - 1)}>
                Previous
              </button>
              <button className="btn btn-soft-blue-action" onClick={handleNextQuestion}>
                Next
              </button>
            </div>
          </div>
        </section>

        <aside className="progress-panel modern-progress-panel">
          <div className="palette-summary-list">
            <h4>Summary</h4>
            <div className="progress-summary single-column-summary">
              <div className="summary-item">
                <div className="summary-label">Answered</div>
                <div className="summary-value answered">{answeredCount}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Skipped</div>
                <div className="summary-value remaining">{skippedCount}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Flagged</div>
                <div className="summary-value flagged">{flaggedCount}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Not Visited</div>
                <div className="summary-value">{unseenCount}</div>
              </div>
            </div>
          </div>

          <div className="question-palette-box">
            <h4>Question Palette</h4>
            <div className="question-palette-scroll">
              <div className="question-palette-grid">
                {questions.map((question, index) => {
                  const status = getPaletteStatus(question.id);
                  return (
                    <button
                      key={question.id}
                      className={`palette-btn ${status} ${index === currentIndex ? "current" : ""}`}
                      onClick={() => goToQuestion(index)}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {confirmAction ? (
        <div className="answer-review-modal-overlay">
          <div className="answer-review-modal action-confirm-modal">
            <div className="answer-review-header">
              <h3>{confirmAction === "submit" ? "Confirm Submit" : "Leave Exam?"}</h3>
              <button className="btn" onClick={closeConfirm}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="answer-review-body">
              {confirmAction === "submit" ? (
                <p>Do you want to submit now or go back to the exam?</p>
              ) : (
                <p>Do you want to go back to exam hall or submit before leaving?</p>
              )}
              <div className="result-actions-row">
                {confirmAction === "submit" ? (
                  <>
                    <button className="btn btn-primary" onClick={() => { closeConfirm(); handleSubmit(false); }}>
                      Submit Now
                    </button>
                    <button className="btn btn-secondary btn-soft-blue-action" onClick={closeConfirm}>
                      Back to Exam
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-soft-blue-action" onClick={() => navigate("/#exam-hall")}>
                      Go Back
                    </button>
                    <button className="btn btn-primary" onClick={() => { closeConfirm(); handleSubmit(false, { goToHall: true }); }}>
                      Submit and Go Back
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
