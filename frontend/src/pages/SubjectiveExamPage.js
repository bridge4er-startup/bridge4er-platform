import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMySubjectiveSubmissions, startExamSet, uploadSubjective } from "../services/examService";
import API from "../services/api";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { formatNepalDate, formatNepalDateTime } from "../utils/dateTime";
import FilePreviewModal from "../components/common/FilePreviewModal";

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

function inferPreviewType(contentType = "", filename = "") {
  const normalized = String(contentType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();
  if (normalized.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (
    normalized.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some(
      (ext) => lowerName.endsWith(ext)
    )
  ) {
    return "image";
  }
  return "other";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [openingFileUrl, setOpeningFileUrl] = useState("");
  const [expandedSubmissionId, setExpandedSubmissionId] = useState(null);
  const timerRef = useRef(null);
  const submitLockRef = useRef(false);

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

  const closePreview = () => {
    setPreviewFile((current) => {
      if (current?.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  useEffect(() => {
    return () => {
      if (previewFile?.url && previewFile.url.startsWith("blob:")) {
        URL.revokeObjectURL(previewFile.url);
      }
    };
  }, [previewFile]);

  const openPreview = async (fileUrl, nameFallback) => {
    const safeUrl = String(fileUrl || "").trim();
    if (!safeUrl) return;
    if (openingFileUrl === safeUrl) return;
    setOpeningFileUrl(safeUrl);
    try {
      const response = await API.get(safeUrl, { responseType: "blob" });
      const contentType = String(response?.headers?.["content-type"] || "");
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType || undefined });
      const objectUrl = URL.createObjectURL(blob);
      const previewType = inferPreviewType(contentType, nameFallback || safeUrl);
      setPreviewFile((current) => {
        if (current?.url && current.url.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }
        return {
          name: nameFallback || "File Preview",
          url: objectUrl,
          type: previewType,
        };
      });
    } catch (_error) {
      toast.error("Unable to open file.");
    } finally {
      setOpeningFileUrl((current) => (current === safeUrl ? "" : current));
    }
  };

  const downloadFile = async (fileUrl, nameFallback) => {
    const safeUrl = String(fileUrl || "").trim();
    if (!safeUrl) return;
    try {
      const downloadUrl = safeUrl.includes("?") ? `${safeUrl}&download=1` : `${safeUrl}?download=1`;
      const response = await API.get(downloadUrl, { responseType: "blob" });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = nameFallback || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (_error) {
      toast.error("Unable to download file.");
    }
  };

  const toggleSubjectiveDetails = (submissionId) => {
    setExpandedSubmissionId((current) => (current === submissionId ? null : submissionId));
  };

  const submit = async () => {
    if (submitLockRef.current || isSubmitting) return;
    if (isSubmissionWindowClosed) {
      toast.error("Submission time window has ended.");
      return;
    }
    const latestSubmission = orderedSubmissions[0];
    const latestStatus = String(latestSubmission?.status || "pending").toLowerCase();
    if (latestSubmission && latestStatus !== "rejected") {
      toast.error("A submission has already been recorded for this exam set.");
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
    submitLockRef.current = true;
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
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
  const orderedSubmissions = useMemo(() => {
    const rows = [...submissions];
    return rows.sort((a, b) => {
      const aTime = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bTime = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [submissions]);
  const latestSubmission = orderedSubmissions[0];
  const latestSubmissionStatus = String(latestSubmission?.status || "pending").toLowerCase();
  const canSubmitExam =
    !isSubmissionWindowClosed && !isSubmitting && (!latestSubmission || latestSubmissionStatus === "rejected");

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
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmitExam}>
            <i className="fas fa-paper-plane"></i>{" "}
            {isSubmissionWindowClosed ? "Submission Closed" : isSubmitting ? "Submitting..." : "Submit Exam"}
          </button>
        </div>
      </div>

      <div className="profile-attempt-list-card profile-subjective-review-card" style={{ marginTop: 24 }}>
        <h3>Your Submissions</h3>
        {orderedSubmissions.length === 0 ? (
          <p>No submissions yet.</p>
        ) : (
          <div className="subjective-summary-list profile-subjective-submissions">
            {orderedSubmissions.map((item) => {
              const hasScore = item.score !== null && item.score !== undefined && item.score !== "";
              const isExpanded = expandedSubmissionId === item.id;
              return (
                <div key={item.id} className="subjective-summary-item">
                  <button
                    type="button"
                    className={`subjective-summary-row ${isExpanded ? "expanded" : ""}`}
                    onClick={() => toggleSubjectiveDetails(item.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="subjective-summary-left">
                      <div className="subjective-summary-title">
                        <span className="subjective-summary-name">
                          {item.exam_set_name || exam?.name || "Subjective Exam"}
                        </span>
                        <span className={`subjective-status-pill status-${item.status || "pending"}`}>
                          {formatSubmissionStatus(item.status)}
                        </span>
                      </div>
                      <div className="subjective-summary-meta">
                        <span className={`subjective-summary-score ${hasScore ? "scored" : "pending"}`}>
                          {hasScore ? item.score : "Pending"}
                          {hasScore && item.max_marks != null ? ` / ${item.max_marks}` : ""}
                        </span>
                        <span className="subjective-summary-date">
                          {item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}
                        </span>
                      </div>
                    </div>
                    <span className="subjective-summary-toggle">{isExpanded ? "Hide" : "Details"}</span>
                  </button>

                  {isExpanded ? (
                    <div className="subjective-summary-details">
                      <div className="subjective-detail-times">
                        <span>
                          Submitted:{" "}
                          <strong>{item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}</strong>
                        </span>
                        {item.reviewed_at ? (
                          <span>
                            Reviewed: <strong>{formatNepalDateTime(item.reviewed_at)}</strong>
                          </span>
                        ) : null}
                      </div>

                      <div className={`subjective-score-panel ${hasScore ? "scored" : "pending"}`}>
                        <span className="subjective-score-label">Marks</span>
                        <strong className="subjective-score-value">{hasScore ? item.score : "Pending"}</strong>
                        {hasScore && item.max_marks != null ? (
                          <span className="subjective-score-total">/ {item.max_marks}</span>
                        ) : null}
                      </div>

                      <div className="subjective-comment-notepad">
                        <div className="subjective-comment-title">Examiner Comments</div>
                        <p>{item.feedback || "No comments yet. Your submission is under review."}</p>
                      </div>

                      {item.file_url ? (
                        <div className="profile-subjective-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-soft-blue-action"
                            onClick={() => openPreview(item.file_url, item.exam_set_name || "Submitted File")}
                            disabled={openingFileUrl === item.file_url}
                          >
                            {openingFileUrl === item.file_url ? (
                              <>
                                Opening ...
                              </>
                            ) : (
                              "View Submission"
                            )}
                          </button>
                        </div>
                      ) : null}
                      {item.reviewed_file_url ? (
                        <div className="profile-subjective-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-soft-blue-action"
                            onClick={() => openPreview(item.reviewed_file_url, item.exam_set_name || "Reviewed File")}
                            disabled={openingFileUrl === item.reviewed_file_url}
                          >
                            {openingFileUrl === item.reviewed_file_url ? (
                              <>
                                Opening ...
                              </>
                            ) : (
                              "View Reviewed File"
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-soft-blue-action"
                            onClick={() =>
                              downloadFile(item.reviewed_file_url, `${item.exam_set_name || "reviewed-file"}.pdf`)
                            }
                          >
                            Download Reviewed File
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FilePreviewModal preview={previewFile} onClose={closePreview} />
    </div>
  );
}

