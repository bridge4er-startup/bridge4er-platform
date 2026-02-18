import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";

export default function MCQSection({ branch = "Civil Engineering", isActive = false }) {
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedOption, setSelectedOption] = useState("");
  const [view, setView] = useState("subjects"); // subjects, chapters, exam

  useEffect(() => {
    if (!isActive) return;
    loadSubjects();
    setView("subjects");
    setSelectedSubject("");
    setSelectedChapter("");
    setQuestions([]);
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

  const handleSelectChapter = async (chapter) => {
    setSelectedChapter(chapter);
    setLoading(true);
    try {
      const res = await API.get(
        `exams/subjects/${encodeURIComponent(selectedSubject)}/chapters/${encodeURIComponent(chapter)}/questions/`,
        { params: { branch } }
      );
      setQuestions(res.data || []);
      setCurrentQuestionIndex(0);
      setShowAnswer(false);
      setSelectedOption("");
      setView("exam");
    } catch (error) {
      toast.error("Failed to load questions");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (option) => {
    setSelectedOption(option);
  };

  const handleSubmitAnswer = async () => {
    if (!selectedOption) {
      toast.error("Please select an option");
      return;
    }

    try {
      const res = await API.post("exams/questions/submit/", {
        question_id: currentQuestion.id,
        selected_option: selectedOption,
      });

      setShowAnswer(true);
    } catch (error) {
      toast.error("Failed to submit answer");
      console.error(error);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowAnswer(false);
      setSelectedOption("");
    } else {
      toast.success("Exam completed!");
      setView("subjects");
      setSelectedSubject("");
      setSelectedChapter("");
      setQuestions([]);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setShowAnswer(false);
      setSelectedOption("");
    }
  };

  const currentQuestion = questions[currentQuestionIndex];

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
          <p>Select a subject to practice MCQs. Answer and see explanations.</p>

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
                <div key={subject.id || subject.name || subject} className="subject-card">
                  <i className="fas fa-book"></i>
                  <h3>{subject.name || subject}</h3>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSelectSubject(subject.name || subject)}
                  >
                    Start Practice
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "chapters" && (
        <>
          <p>Select a chapter to practice questions from <strong>{selectedSubject}</strong>.</p>

          <button
            className="btn btn-secondary btn-soft-blue-action"
            onClick={() => setView("subjects")}
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
                <div key={chapter.id || chapter.name} className="subject-card">
                  <i className="fas fa-list"></i>
                  <h3>{chapter.name || chapter}</h3>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSelectChapter(chapter.name || chapter)}
                  >
                    Practice Chapter
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "exam" && currentQuestion && (
        <>
          <div className="exam-header">
            <h3>
              Question {currentQuestionIndex + 1} of {questions.length}
            </h3>
            <div className="progress-bar">
              <div
                className="progress"
                style={{
                  width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          <button
            className="btn btn-secondary btn-soft-blue-action"
            onClick={() => setView("chapters")}
            style={{ marginBottom: "1rem" }}
          >
            <i className="fas fa-arrow-left"></i> Back to Chapters
          </button>

          <div className="question-container">
            <div className="question-text">
              <h3>{currentQuestion.question_text}</h3>
            </div>

            <div className="options-container">
              {["a", "b", "c", "d"].map((option) => (
                <label key={option} className="option-label">
                  <input
                    type="radio"
                    name="option"
                    value={option}
                    checked={selectedOption === option}
                    onChange={() => handleSelectOption(option)}
                    disabled={showAnswer}
                  />
                  <span
                    className={`option-text ${
                      showAnswer
                        ? option === currentQuestion.correct_option
                          ? "correct"
                          : option === selectedOption
                          ? "incorrect"
                          : ""
                        : ""
                    }`}
                  >
                    <strong>{option.toUpperCase()}.</strong>{" "}
                    {currentQuestion[`option_${option}`]}
                  </span>
                </label>
              ))}
            </div>

            {showAnswer && (
              <div className="answer-display">
                <div className="explanation-box">
                  <h4>✓ Correct Answer: {currentQuestion.correct_option.toUpperCase()}</h4>
                  {currentQuestion.explanation && (
                    <p>
                      <strong>Explanation:</strong> {currentQuestion.explanation}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="button-group">
              {!showAnswer ? (
                <button
                  className="btn btn-primary"
                  onClick={handleSubmitAnswer}
                  disabled={!selectedOption}
                >
                  Check Answer
                </button>
              ) : (
                <>
                  {currentQuestionIndex > 0 && (
                    <button
                      className="btn btn-secondary btn-soft-blue-action"
                      onClick={handlePreviousQuestion}
                    >
                      <i className="fas fa-arrow-left"></i> Previous
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-soft-blue-action"
                    onClick={handleNextQuestion}
                  >
                    {currentQuestionIndex < questions.length - 1
                      ? "Next Question"
                      : "Complete Exam"}{" "}
                    <i className="fas fa-arrow-right"></i>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
