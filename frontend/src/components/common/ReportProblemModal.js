import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { reportService } from "../../services/reportService";

const ISSUE_TYPES = [
  { value: "question_error", label: "Question error" },
  { value: "answer_error", label: "Answer error" },
  { value: "technical_bug", label: "Technical bug" },
  { value: "other", label: "Other" },
];

export default function ReportProblemModal({ isOpen, onClose, branch = "Civil Engineering" }) {
  const { isAuthenticated } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    issue_type: "question_error",
    section: "exam-hall",
    question_reference: "",
    description: "",
  });

  useEffect(() => {
    if (!isOpen) {
      setForm({
        issue_type: "question_error",
        section: "exam-hall",
        question_reference: "",
        description: "",
      });
      setSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const onChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      toast.error("Please login to report a problem.");
      return;
    }

    const description = form.description.trim();
    if (!description) {
      toast.error("Please write the problem details.");
      return;
    }

    setSubmitting(true);
    try {
      await reportService.submitReport({
        branch,
        issue_type: form.issue_type,
        section: form.section,
        question_reference: form.question_reference.trim(),
        description,
      });
      toast.success("Report sent to administration.");
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="report-problem-overlay" onClick={onClose}>
      <div className="report-problem-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-problem-header">
          <h3>Report a problem</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </div>
        <p className="report-problem-subtext">
          Found a bug or mistake in a question/answer? Send details for admin review.
        </p>

        <form onSubmit={onSubmit}>
          <div className="report-problem-field">
            <label>Issue type</label>
            <select
              value={form.issue_type}
              onChange={(e) => onChange("issue_type", e.target.value)}
              disabled={submitting}
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="report-problem-field">
            <label>Section</label>
            <input
              type="text"
              value={form.section}
              onChange={(e) => onChange("section", e.target.value)}
              placeholder="example: objective-mcqs, exam-hall, library"
              disabled={submitting}
            />
          </div>

          <div className="report-problem-field">
            <label>Question reference (optional)</label>
            <input
              type="text"
              value={form.question_reference}
              onChange={(e) => onChange("question_reference", e.target.value)}
              placeholder="question ID, exam set name, file name, or screenshot note"
              disabled={submitting}
            />
          </div>

          <div className="report-problem-field">
            <label>Details</label>
            <textarea
              rows={5}
              value={form.description}
              onChange={(e) => onChange("description", e.target.value)}
              placeholder="Describe what is wrong and what should be corrected."
              disabled={submitting}
            />
          </div>

          <div className="report-problem-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Submitting..." : "Send report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
