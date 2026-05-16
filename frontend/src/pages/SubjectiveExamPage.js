import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { startExamSet } from "../services/examService";
import { formatNepalDate } from "../utils/dateTime";

const SUBMISSION_INFO_TEXT =
  "Info: For paid sets: Send email at bridge4er@gmail.com with heading “Subjective Exam Submission” with your scanned pdf file of your answer sheet. We’ll ask the available experts for review and guide you in your subjective exam submissions. Review scores with corrected answer sheet and guidance to your answers will be provided to you within 7 business working days via. email";

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

export default function SubjectiveExamPage() {
  const { branch, setName: setId } = useParams();
  const decodedBranch = decodeURIComponent(branch || "");
  const numericSetId = Number(setId);
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [loadingExam, setLoadingExam] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingExam(true);
      try {
        const data = await startExamSet(numericSetId);
        setExam(data);
      } catch (error) {
        setExam(null);
        toast.error(error?.response?.data?.error || "Failed to load exam");
      } finally {
        setLoadingExam(false);
      }
    }
    load();
  }, [numericSetId]);

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
            <span><strong>Date:</strong> {formatNepalDate(new Date())}</span>
            <span><strong>Time:</strong> {formatDuration(exam?.duration_seconds || 0)}</span>
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

      <section className="submission-form subjective-submission-info-panel" style={{ marginTop: 20 }}>
        <h4><i className="fas fa-circle-info"></i> Subjective Exam Submission</h4>
        <p>{SUBMISSION_INFO_TEXT}</p>
      </section>
    </div>
  );
}

