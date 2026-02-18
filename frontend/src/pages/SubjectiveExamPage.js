import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMySubjectiveSubmissions, startExamSet, uploadSubjective } from "../services/examService";
import toast from "react-hot-toast";

function formatDuration(seconds = 0) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return "N/A";
  if (total % 3600 === 0) {
    const hours = total / 3600;
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  if (total % 60 === 0) {
    const minutes = total / 60;
    return `${minutes} min`;
  }
  return `${total} sec`;
}

function formatSubmissionStatus(value = "") {
  const normalized = String(value || "pending");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default function SubjectiveExamPage() {
  const { branch, setName: setId } = useParams();
  const decodedBranch = decodeURIComponent(branch || "");
  const numericSetId = Number(setId);
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [file, setFile] = useState(null);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [loadingExam, setLoadingExam] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingExam(true);
      try {
        const data = await startExamSet(numericSetId);
        setExam(data);
      } catch (e) {
        setExam(null);
        toast.error(e?.response?.data?.error || "Failed to load exam");
      } finally {
        setLoadingExam(false);
      }
    }
    load();
  }, [numericSetId]);

  useEffect(() => {
    async function loadSubmissions() {
      try {
        const data = await getMySubjectiveSubmissions();
        setSubmissions((data || []).filter((item) => Number(item.exam_set) === numericSetId));
      } catch (e) {
        setSubmissions([]);
      }
    }
    loadSubmissions();
  }, [numericSetId]);

  const submit = async () => {
    if (!file) return toast.error("Select a PDF to upload");
    if (!mobile.trim()) return toast.error("Enter mobile number");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("exam_set_id", numericSetId);
    fd.append("email", email || "");
    fd.append("mobile_number", mobile || "");
    try {
      await uploadSubjective(fd);
      toast.success("Uploaded successfully");
      setFile(null);
      setEmail("");
      setMobile("");
      const data = await getMySubjectiveSubmissions();
      setSubmissions((data || []).filter((item) => Number(item.exam_set) === numericSetId));
    } catch (e) {
      toast.error(e?.response?.data?.error || "Upload failed");
    }
  };

  const questions = exam?.questions || [];
  const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 1), 0);
  const sectionGroups = useMemo(() => {
    const grouped = [];
    const indexBySection = new Map();

    questions.forEach((question, index) => {
      const sectionTitle = String(question.question_header || "").trim() || "Questions";
      let sectionIndex = indexBySection.get(sectionTitle);

      if (sectionIndex == null) {
        sectionIndex = grouped.length;
        indexBySection.set(sectionTitle, sectionIndex);
        grouped.push({
          title: sectionTitle,
          questions: [],
        });
      }

      grouped[sectionIndex].questions.push({
        ...question,
        displayOrder: index + 1,
      });
    });

    return grouped;
  }, [questions]);
  const descriptionLine = String(exam?.description || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const instructionLines = String(exam?.instructions || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (loadingExam) {
    return <div className="container" style={{ paddingTop: 20 }}>Loading exam...</div>;
  }

  if (!exam) {
    return (
      <div className="container" style={{ paddingTop: 20 }}>
        <button className="btn btn-secondary btn-soft-blue-action" onClick={() => navigate("/#exam-hall")}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
        <p style={{ marginTop: "1rem" }}>Unable to load this subjective exam set.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 20 }}>
      <div className="exam-header-actions" style={{ marginBottom: "0.8rem" }}>
        <button className="btn btn-secondary btn-soft-blue-action" onClick={() => navigate("/#exam-hall")}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {questions.length ? (
        <div className="subjective-paper-shell">
          <header className="subjective-paper-head">
            <h2>{exam?.name || decodedBranch}</h2>
            {descriptionLine ? <h3>{descriptionLine}</h3> : null}
            {!descriptionLine && decodedBranch ? <h3>{decodedBranch}</h3> : null}
          </header>

          <div className="subjective-paper-meta">
            <span><strong>Date:</strong> {new Date().toLocaleDateString("en-US")}</span>
            <span><strong>Time:</strong> {formatDuration(exam?.duration_seconds)}</span>
            <span><strong>Subject:</strong> {decodedBranch}</span>
            <span><strong>Full Marks:</strong> {totalMarks}</span>
          </div>

          {instructionLines.length ? (
            <section className="subjective-instruction-board">
              <ul>
                {instructionLines.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="subjective-paper-questions">
            {sectionGroups.map((section, sectionIndex) => (
              <div key={`${section.title}-${sectionIndex}`} className="subjective-section-block">
                <h3 className="subjective-question-section-title">{section.title}</h3>
                {section.questions.map((question) => (
                  <article key={question.id} className="subjective-paper-question">
                    <div className="subjective-paper-qhead">
                      <span className="subjective-marks-chip">({question.marks || 1})</span>
                    </div>
                    <p className="subjective-paper-question-line">
                      <span className="subjective-question-number-inline">{question.displayOrder}. </span>
                      {question.question_text}
                    </p>
                  </article>
                ))}
              </div>
            ))}
          </section>
        </div>
      ) : null}

      <div className="submission-form" style={{ marginTop: 20 }}>
        <h4><i className="fas fa-paper-plane"></i> Submit Your Answers</h4>

        <div className="form-group">
          <label htmlFor="user-email"><i className="fas fa-envelope"></i> Email Address</label>
          <input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email for results" />
        </div>

        <div className="form-group">
          <label htmlFor="user-mobile"><i className="fas fa-phone"></i> Mobile Number</label>
          <input id="user-mobile" type="text" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Enter mobile number" />
        </div>

        <div className="form-group">
          <label htmlFor="answer-pdf"><i className="fas fa-file-pdf"></i> Upload Answer Sheet (PDF only)</label>
          <input id="answer-pdf" type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} />
          <small>Maximum file size: 10MB. Upload your scanned answer sheet.</small>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={submit}><i className="fas fa-paper-plane"></i> Submit Exam</button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h4>Your Submissions</h4>
        {submissions.length === 0 ? (
          <p>No submissions yet.</p>
        ) : (
          <div className="subjective-submissions-list">
            {submissions.map((item) => {
              const hasScore = item.score !== null && item.score !== undefined && item.score !== "";
              return (
                <article key={item.id} className="subjective-result-card">
                  <header className="subjective-result-header">
                    <div>
                      <h5>{item.exam_set_name || exam?.name || "Subjective Exam"}</h5>
                      <p>
                        Submitted:{" "}
                        {item.submitted_at ? new Date(item.submitted_at).toLocaleString("en-US") : "N/A"}
                      </p>
                    </div>
                    <span className={`subjective-status-pill status-${item.status || "pending"}`}>
                      {formatSubmissionStatus(item.status)}
                    </span>
                  </header>

                  <div className={`subjective-score-panel ${hasScore ? "scored" : "pending"}`}>
                    <span className="subjective-score-label">Marks</span>
                    <strong className="subjective-score-value">
                      {hasScore ? item.score : "Pending"}
                    </strong>
                    {hasScore && item.max_marks != null ? (
                      <span className="subjective-score-total">/ {item.max_marks}</span>
                    ) : null}
                  </div>

                  <div className="subjective-comment-notepad">
                    <div className="subjective-comment-title">Examiner Comments</div>
                    <p>{item.feedback || "No comments yet. Your submission is under review."}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
