import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMySubjectiveSubmissions, startExamSet, uploadSubjective } from "../services/examService";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { formatNepalDate, formatNepalDateTime } from "../utils/dateTime";

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

function formatTimer(timeLeft = 0) {
  const absTime = Math.abs(Number(timeLeft || 0));
  const hours = Math.floor(absTime / 3600);
  const minutes = Math.floor((absTime % 3600) / 60);
  const seconds = absTime % 60;
  const prefix = timeLeft < 0 ? "-" : "";
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${prefix}${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${prefix}${minutes}:${paddedSeconds}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("977") && digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

export default function SubjectiveExamPage() {
  const { user } = useAuth();
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
  const [timeLeft, setTimeLeft] = useState(null);
  const [initialDuration, setInitialDuration] = useState(10800);
  const [isSubmissionWindowClosed, setIsSubmissionWindowClosed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    setEmail(String(user.email || "").trim());
    setMobile(String(user.mobile_number || "").trim());
  }, [user]);

  useEffect(() => {
    async function load() {
      setLoadingExam(true);
      try {
        const data = await startExamSet(numericSetId);
        setExam(data);
        const durationFromSet = Number(data?.duration_seconds || 0);
        const resolvedDuration = Number.isFinite(durationFromSet) && durationFromSet > 0 ? durationFromSet : 10800;
        setInitialDuration(resolvedDuration);
        setTimeLeft(resolvedDuration);
        setIsSubmissionWindowClosed(false);
      } catch (e) {
        setExam(null);
        toast.error(e?.response?.data?.error || "Failed to load exam");
      } finally {
        setLoadingExam(false);
      }
    }
    load();
    return () => clearInterval(timerRef.current);
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

  useEffect(() => {
    if (timeLeft == null || isSubmissionWindowClosed || !exam) return undefined;

    const grace = Number(exam.grace_seconds || 0);
    if (timeLeft <= -grace) {
      setIsSubmissionWindowClosed(true);
      return undefined;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((value) => (value == null ? value : value - 1));
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeLeft, exam, isSubmissionWindowClosed]);

  const submit = async () => {
    if (isSubmissionWindowClosed) {
      toast.error("Submission time window has ended.");
      return;
    }
    if (!file) return toast.error("Select a PDF to upload");
    const isPdfFile = /\.pdf$/i.test(String(file.name || "")) || String(file.type || "").toLowerCase() === "application/pdf";
    if (!isPdfFile) return toast.error("Only PDF files are allowed.");
    if (Number(file.size || 0) > 10 * 1024 * 1024) return toast.error("PDF size must be 10MB or less.");
    if (!email.trim()) return toast.error("Enter email address");
    if (!mobile.trim()) return toast.error("Enter mobile number");

    const profileEmail = normalizeEmail(user?.email);
    const profileMobile = normalizeMobile(user?.mobile_number);
    if (!profileEmail || !profileMobile) {
      return toast.error("Update your profile email and mobile number before submitting.");
    }
    if (normalizeEmail(email) !== profileEmail || normalizeMobile(mobile) !== profileMobile) {
      return toast.error("Email and mobile number must match your profile details.");
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("exam_set_id", numericSetId);
    fd.append("email", email || "");
    fd.append("mobile_number", mobile || "");
    const previousSubmissionCount = submissions.length;
    try {
      await uploadSubjective(fd);
      toast.success("Successfully submitted");
      setFile(null);
      setEmail(String(user?.email || "").trim());
      setMobile(String(user?.mobile_number || "").trim());
      try {
        const data = await getMySubjectiveSubmissions();
        setSubmissions((data || []).filter((item) => Number(item.exam_set) === numericSetId));
      } catch (_refreshError) {
        toast.success("Successfully submitted. Submission list will refresh shortly.");
      }
    } catch (e) {
      try {
        const data = await getMySubjectiveSubmissions();
        const nextRows = (data || []).filter((item) => Number(item.exam_set) === numericSetId);
        setSubmissions(nextRows);
        if (nextRows.length > previousSubmissionCount) {
          setFile(null);
          setEmail(String(user?.email || "").trim());
          setMobile(String(user?.mobile_number || "").trim());
          toast.success("Successfully submitted");
          return;
        }
      } catch (_verifyError) {
        // Fall back to primary error below.
      }
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
  const timerLabel = formatTimer(timeLeft || 0);

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
            <span><strong>Date:</strong> {formatNepalDate(new Date())}</span>
            <span><strong>Time:</strong> {formatDuration(initialDuration)}</span>
            <span><strong>Subject:</strong> {decodedBranch}</span>
            <span><strong>Full Marks:</strong> {totalMarks}</span>
          </div>

          <div className="subjective-live-timer-wrap">
            <div className={`exam-timer-large ${timeLeft < 0 ? "negative" : ""}`}>
              {timeLeft < 0 ? `Overtime ${timerLabel}` : timerLabel}
            </div>
            {isSubmissionWindowClosed ? <p className="subjective-live-timer-note">Submission window closed.</p> : null}
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
          <small>Email and mobile number must match your profile details.</small>
        </div>

        <div className="form-group">
          <label htmlFor="answer-pdf"><i className="fas fa-file-pdf"></i> Upload Answer Sheet (PDF only)</label>
          <input id="answer-pdf" type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} />
          <small>Maximum file size: 10MB. Upload your scanned answer sheet.</small>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={submit} disabled={isSubmissionWindowClosed}>
            <i className="fas fa-paper-plane"></i> {isSubmissionWindowClosed ? "Submission Closed" : "Submit Exam"}
          </button>
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
                        {item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}
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
