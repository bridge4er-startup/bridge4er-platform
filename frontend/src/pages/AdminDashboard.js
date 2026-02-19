import React, { useState } from "react";
import { fileService } from "../services/fileService";
import { mcqService } from "../services/mcqService";
import {
  listSubjectiveSubmissionsForAdmin,
  reviewSubjectiveSubmission,
} from "../services/examService";
import { reportService } from "../services/reportService";
import API from "../services/api";
import toast from "react-hot-toast";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("upload-files"); // upload-files, manage-files, manage-mcqs, bulk-upload-mcqs, review-subjective

  // File Upload State
  const [file, setFile] = useState(null);
  const [contentType, setContentType] = useState("notice");
  const [branch, setBranch] = useState("Civil Engineering");
  const [uploadingFile, setUploadingFile] = useState(false);

  // MCQ State
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [chapters, setChapters] = useState([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newChapterName, setNewChapterName] = useState("");

  // Single Question State
  const [questionData, setQuestionData] = useState({
    question_text: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_option: "a",
    explanation: "",
  });
  const [creatingQuestion, setCreatingQuestion] = useState(false);

  // Bulk Upload State
  const [bulkQuestionsFile, setBulkQuestionsFile] = useState(null);
  const [bulkQuestionsPath, setBulkQuestionsPath] = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [syncingDropbox, setSyncingDropbox] = useState(false);
  const [quickDropboxPath, setQuickDropboxPath] = useState("");
  const [importingQuickDropboxPath, setImportingQuickDropboxPath] = useState(false);

  // Manage Files State
  const [manageContentType, setManageContentType] = useState("notice");
  const [managedFiles, setManagedFiles] = useState([]);
  const [loadingManagedFiles, setLoadingManagedFiles] = useState(false);
  const [savingManagedFilePath, setSavingManagedFilePath] = useState("");

  // Homepage Metrics State
  const [homepageMetrics, setHomepageMetrics] = useState({
    enrolled_students: "",
    objective_mcqs_available: "",
    resource_files_available: "",
    exam_sets_available: "",
    motivational_quote: "",
    motivational_image_url: "",
  });
  const [savingHomepageMetrics, setSavingHomepageMetrics] = useState(false);

  // Subjective Review State
  const [subjectiveSubmissions, setSubjectiveSubmissions] = useState([]);
  const [subjectiveStatusFilter, setSubjectiveStatusFilter] = useState("all");
  const [loadingSubjectiveSubmissions, setLoadingSubjectiveSubmissions] = useState(false);
  const [savingSubjectiveReviewId, setSavingSubjectiveReviewId] = useState(null);
  const [subjectiveReviewDrafts, setSubjectiveReviewDrafts] = useState({});
  const [subjectiveEditMode, setSubjectiveEditMode] = useState({});

  // Problem Reports State
  const [problemReports, setProblemReports] = useState([]);
  const [problemStatusFilter, setProblemStatusFilter] = useState("all");
  const [loadingProblemReports, setLoadingProblemReports] = useState(false);
  const [savingProblemReportId, setSavingProblemReportId] = useState(null);

  const statusLabel = (value) => {
    const text = String(value || "pending");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const statusPillStyle = (value) => {
    const normalized = String(value || "pending").toLowerCase();
    if (normalized === "reviewed") {
      return { backgroundColor: "#fee2e2", color: "#b91c1c" };
    }
    if (normalized === "rejected") {
      return { backgroundColor: "#e2e8f0", color: "#334155" };
    }
    return { backgroundColor: "#dbeafe", color: "#1d4ed8" };
  };

  const normalizeDropboxQuestionSource = (value) => {
    return String(value || "").trim();
  };

  // File Upload Handlers
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUploadFile = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setUploadingFile(true);
    try {
      const result = await fileService.uploadFile(file, contentType, branch);
      toast.success("File uploaded successfully!");
      setFile(null);
      document.getElementById("file-input").value = "";
    } catch (error) {
      toast.error("Failed to upload file");
      console.error(error);
    } finally {
      setUploadingFile(false);
    }
  };

  // MCQ Handlers
  const handleLoadSubjects = async () => {
    try {
      const result = await mcqService.getSubjects(branch);
      setSubjects(result);
      setSelectedSubject("");
      setChapters([]);
      setSelectedChapterId("");
    } catch (error) {
      toast.error("Failed to load subjects");
    }
  };

  const handleSelectSubject = async (subject) => {
    setSelectedSubject(subject);
    setLoadingChapters(true);
    try {
      const result = await mcqService.getChapters(subject, branch);
      setChapters(result);
      setSelectedChapterId("");
    } catch (error) {
      toast.error("Failed to load chapters");
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleQuestionChange = (field, value) => {
    setQuestionData({
      ...questionData,
      [field]: value,
    });
  };

  const handleCreateQuestion = async () => {
    if (
      !questionData.question_text ||
      !questionData.option_a ||
      !questionData.option_b ||
      !questionData.option_c ||
      !questionData.option_d
    ) {
      toast.error("Please fill all fields");
      return;
    }

    if (!selectedChapterId) {
      toast.error("Please select a chapter first");
      return;
    }

    setCreatingQuestion(true);
    try {
      await mcqService.createQuestion(selectedChapterId, questionData);
      toast.success("Question created successfully!");
      setQuestionData({
        question_text: "",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        correct_option: "a",
        explanation: "",
      });
    } catch (error) {
      toast.error("Failed to create question");
      console.error(error);
    } finally {
      setCreatingQuestion(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkQuestionsFile && !bulkQuestionsPath.trim()) {
      toast.error("Select a file or provide a backend/dropbox file path");
      return;
    }

    if (!selectedChapterId) {
      toast.error("Please select a chapter first");
      return;
    }

    setBulkUploading(true);
    try {
      const result = bulkQuestionsFile
        ? await mcqService.bulkUploadQuestionsFile(selectedChapterId, bulkQuestionsFile)
        : await mcqService.bulkUploadQuestionsFromPath(selectedChapterId, bulkQuestionsPath.trim());
      toast.success(result?.message || "Questions uploaded successfully!");
      setBulkQuestionsFile(null);
      setBulkQuestionsPath("");
      document.getElementById("bulk-questions-input").value = "";
    } catch (error) {
      toast.error("Failed to bulk upload questions");
      console.error(error);
    } finally {
      setBulkUploading(false);
    }
  };

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) {
      toast.error("Please enter subject name");
      return;
    }
    try {
      await mcqService.createSubject(newSubjectName.trim(), branch);
      toast.success("Subject created");
      setNewSubjectName("");
      handleLoadSubjects();
    } catch (error) {
      toast.error("Failed to create subject");
    }
  };

  const handleSyncDropboxQuestionBank = async () => {
    setSyncingDropbox(true);
    try {
      const result = await mcqService.syncDropboxQuestionBank(branch, true, true, true);
      const objectiveImported = result?.objective?.imported_questions || 0;
      const mcqSetImported = result?.exam_sets?.mcq?.imported_questions || 0;
      const subjectiveSetImported = result?.exam_sets?.subjective?.imported_questions || 0;
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      if (errors.length > 0) {
        const details = errors.map((row) => `${row.scope}: ${row.error}`).join(" | ");
        toast.error(`Dropbox sync partially failed. ${details}`);
      } else {
        toast.success(
          `Dropbox sync complete. Objective: ${objectiveImported}, MCQ sets: ${mcqSetImported}, Subjective sets: ${subjectiveSetImported}`
        );
      }
    } catch (error) {
      const errorRows = error?.response?.data?.errors;
      const details = Array.isArray(errorRows)
        ? errorRows.map((row) => `${row.scope}: ${row.error}`).join(" | ")
        : "";
      const message = error?.response?.data?.error || details || "Failed to sync question files from Dropbox";
      toast.error(message);
      console.error(error);
    } finally {
      setSyncingDropbox(false);
    }
  };

  const handleCreateChapter = async () => {
    if (!selectedSubject || !newChapterName.trim()) {
      toast.error("Select subject and enter chapter name");
      return;
    }
    const subjectObj = subjects.find((s) => s.name === selectedSubject);
    if (!subjectObj) {
      toast.error("Invalid subject");
      return;
    }
    try {
      await mcqService.createChapter(subjectObj.id, newChapterName.trim());
      toast.success("Chapter created");
      setNewChapterName("");
      handleSelectSubject(selectedSubject);
    } catch (error) {
      toast.error("Failed to create chapter");
    }
  };

  const handleLoadManagedFiles = async () => {
    setLoadingManagedFiles(true);
    try {
      const result = await fileService.listFiles(manageContentType, branch, true);
      setManagedFiles(result || []);
    } catch (error) {
      toast.error("Failed to load files");
    } finally {
      setLoadingManagedFiles(false);
    }
  };

  const handleDeleteManagedFile = async (path) => {
    try {
      await fileService.deleteFile(path);
      toast.success("File deleted successfully");
      handleLoadManagedFiles();
    } catch (error) {
      toast.error("Failed to delete file");
    }
  };

  const handleSetManagedFileVisibility = async (path, isVisible) => {
    setSavingManagedFilePath(path);
    try {
      await fileService.setVisibility(path, isVisible);
      toast.success(isVisible ? "File is visible on website" : "File hidden from website");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to update file visibility");
    } finally {
      setSavingManagedFilePath("");
    }
  };

  const handleImportQuestionsFromDropboxLink = async () => {
    const source = normalizeDropboxQuestionSource(quickDropboxPath);
    if (!source) {
      toast.error("Please enter Dropbox file path/link");
      return;
    }
    if (!selectedChapterId) {
      toast.error("Please select a chapter first");
      return;
    }

    setImportingQuickDropboxPath(true);
    try {
      const result = await mcqService.bulkUploadQuestionsFromPath(selectedChapterId, source);
      toast.success(result?.message || "Questions imported from Dropbox link.");
      setQuickDropboxPath("");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to import questions from Dropbox link");
    } finally {
      setImportingQuickDropboxPath(false);
    }
  };

  const loadProblemReports = async (statusFilter = problemStatusFilter) => {
    setLoadingProblemReports(true);
    try {
      const result = await reportService.listReports(statusFilter);
      setProblemReports(result || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load reports");
    } finally {
      setLoadingProblemReports(false);
    }
  };

  const handleSolveProblemReport = async (reportId) => {
    setSavingProblemReportId(reportId);
    try {
      await reportService.updateReport(reportId, { status: "solved" });
      toast.success("Report marked as solved");
      await loadProblemReports(problemStatusFilter);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to update report");
    } finally {
      setSavingProblemReportId(null);
    }
  };

  const handleDeleteProblemReport = async (reportId) => {
    setSavingProblemReportId(reportId);
    try {
      await reportService.deleteReport(reportId);
      toast.success("Report deleted");
      await loadProblemReports(problemStatusFilter);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete report");
    } finally {
      setSavingProblemReportId(null);
    }
  };

  const loadHomepageMetrics = async () => {
    try {
      const res = await API.get("storage/homepage/stats/");
      setHomepageMetrics({
        enrolled_students: String(res.data?.enrolled_students ?? ""),
        objective_mcqs_available: String(res.data?.objective_mcqs_available ?? ""),
        resource_files_available: String(res.data?.resource_files_available ?? ""),
        exam_sets_available: String(res.data?.exam_sets_available ?? ""),
        motivational_quote: String(res.data?.motivational_quote ?? ""),
        motivational_image_url: String(res.data?.motivational_image_url ?? ""),
      });
    } catch (_error) {
      toast.error("Failed to load homepage metrics.");
    }
  };

  const saveHomepageMetrics = async () => {
    try {
      setSavingHomepageMetrics(true);
      await API.post("storage/homepage/stats/", homepageMetrics);
      toast.success("Homepage metrics updated.");
      await loadHomepageMetrics();
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to update homepage metrics.";
      toast.error(message);
    } finally {
      setSavingHomepageMetrics(false);
    }
  };

  const loadSubjectiveSubmissions = async (statusFilter = subjectiveStatusFilter) => {
    try {
      setLoadingSubjectiveSubmissions(true);
      const result = await listSubjectiveSubmissionsForAdmin(statusFilter);
      const rows = result || [];
      setSubjectiveSubmissions(rows);
      const nextDrafts = {};
      const nextEditMode = {};
      rows.forEach((item) => {
        nextDrafts[item.id] = {
          status: item.status || "pending",
          score: item.score == null ? "" : String(item.score),
          feedback: item.feedback || "",
        };
        nextEditMode[item.id] = false;
      });
      setSubjectiveReviewDrafts(nextDrafts);
      setSubjectiveEditMode(nextEditMode);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load subjective submissions");
    } finally {
      setLoadingSubjectiveSubmissions(false);
    }
  };

  const handleSubjectiveDraftChange = (submissionId, field, value) => {
    setSubjectiveReviewDrafts((prev) => ({
      ...prev,
      [submissionId]: {
        status: prev[submissionId]?.status || "pending",
        score: prev[submissionId]?.score || "",
        feedback: prev[submissionId]?.feedback || "",
        ...(prev[submissionId] || {}),
        [field]: value,
      },
    }));
  };

  const resetSubjectiveDraft = (submission) => {
    setSubjectiveReviewDrafts((prev) => ({
      ...prev,
      [submission.id]: {
        status: submission.status || "pending",
        score: submission.score == null ? "" : String(submission.score),
        feedback: submission.feedback || "",
      },
    }));
  };

  const startSubjectiveEdit = (submission) => {
    resetSubjectiveDraft(submission);
    setSubjectiveEditMode((prev) => ({
      ...prev,
      [submission.id]: true,
    }));
  };

  const cancelSubjectiveEdit = (submission) => {
    resetSubjectiveDraft(submission);
    setSubjectiveEditMode((prev) => ({
      ...prev,
      [submission.id]: false,
    }));
  };

  const saveSubjectiveReview = async (submission) => {
    const draft = subjectiveReviewDrafts[submission.id] || {};
    const scoreText = String(draft.score ?? "").trim();
    if (!scoreText) {
      toast.error("Marks are required");
      return;
    }

    setSavingSubjectiveReviewId(submission.id);
    try {
      const nextStatus = "reviewed";
      await reviewSubjectiveSubmission(submission.id, {
        status: nextStatus,
        score: scoreText,
        feedback: draft.feedback || "",
      });
      toast.success("Submission review saved");
      await loadSubjectiveSubmissions();
      setSubjectiveEditMode((prev) => ({
        ...prev,
        [submission.id]: false,
      }));
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to save submission review");
    } finally {
      setSavingSubjectiveReviewId(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", padding: "2rem" }}>
      <div className="container">
        <h1>Admin Dashboard</h1>
        <p style={{ color: "#666", marginBottom: "2rem" }}>
          Manage files, questions, and exam content
        </p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "2rem",
            borderBottom: "2px solid #e0e0e0",
          }}
        >
          <button
            onClick={() => {
              setActiveTab("homepage-metrics");
              loadHomepageMetrics();
            }}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "homepage-metrics" ? "#007bff" : "transparent",
              color: activeTab === "homepage-metrics" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "homepage-metrics" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Homepage Stats
          </button>
          <button
            onClick={() => setActiveTab("upload-files")}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "upload-files" ? "#007bff" : "transparent",
              color: activeTab === "upload-files" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "upload-files" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Upload Files
          </button>
          <button
            onClick={() => setActiveTab("manage-files")}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "manage-files" ? "#007bff" : "transparent",
              color: activeTab === "manage-files" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "manage-files" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Manage Files
          </button>
          <button
            onClick={() => setActiveTab("manage-mcqs")}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "manage-mcqs" ? "#007bff" : "transparent",
              color: activeTab === "manage-mcqs" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "manage-mcqs" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Add MCQs
          </button>
          <button
            onClick={() => setActiveTab("bulk-upload-mcqs")}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "bulk-upload-mcqs" ? "#007bff" : "transparent",
              color: activeTab === "bulk-upload-mcqs" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "bulk-upload-mcqs"
                  ? "3px solid #007bff"
                  : "none",
              marginBottom: "-2px",
            }}
          >
            Bulk Upload MCQs
          </button>
          <button
            onClick={() => {
              setActiveTab("review-subjective");
              loadSubjectiveSubmissions();
            }}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "review-subjective" ? "#007bff" : "transparent",
              color: activeTab === "review-subjective" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "review-subjective" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Review Subjective
          </button>
          <button
            onClick={() => {
              setActiveTab("problem-reports");
              loadProblemReports();
            }}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "problem-reports" ? "#007bff" : "transparent",
              color: activeTab === "problem-reports" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "problem-reports" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Problem Reports
          </button>
        </div>

        {activeTab === "homepage-metrics" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Homepage Statistics</h2>
            <p style={{ marginBottom: "1rem", color: "#666" }}>
              You can set fixed numbers for homepage cards. Use empty value for auto values.
            </p>

            {[
              ["enrolled_students", "Students Enrolled"],
              ["objective_mcqs_available", "Objective MCQs Available"],
              ["resource_files_available", "Library Materials Available"],
              ["exam_sets_available", "Exam Sets Available"],
            ].map(([key, label]) => (
              <div key={key} style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.3rem" }}>{label}</label>
                <input
                  type="number"
                  min="0"
                  value={homepageMetrics[key]}
                  onChange={(e) => setHomepageMetrics((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                />
              </div>
            ))}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.3rem" }}>Motivational Quote</label>
              <textarea
                value={homepageMetrics.motivational_quote}
                onChange={(e) =>
                  setHomepageMetrics((prev) => ({
                    ...prev,
                    motivational_quote: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Write a motivational quote to display below homepage stats"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.3rem" }}>Motivational Image URL</label>
              <input
                type="text"
                value={homepageMetrics.motivational_image_url}
                onChange={(e) =>
                  setHomepageMetrics((prev) => ({
                    ...prev,
                    motivational_image_url: e.target.value,
                  }))
                }
                placeholder="https://example.com/motivation-image.jpg"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.7rem" }}>
              <button className="btn btn-secondary" onClick={loadHomepageMetrics}>
                Reload
              </button>
              <button className="btn btn-primary" onClick={saveHomepageMetrics} disabled={savingHomepageMetrics}>
                {savingHomepageMetrics ? "Saving..." : "Save Metrics"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "review-subjective" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Review Subjective Submissions</h2>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              Add marks and comments for each student submission.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                alignItems: "flex-end",
                marginBottom: "1.2rem",
              }}
            >
              <div style={{ minWidth: "220px" }}>
                <label style={{ display: "block", marginBottom: "0.35rem" }}>Status Filter</label>
                <select
                  value={subjectiveStatusFilter}
                  onChange={(e) => setSubjectiveStatusFilter(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => loadSubjectiveSubmissions(subjectiveStatusFilter)}
              >
                Load Submissions
              </button>
            </div>

            {loadingSubjectiveSubmissions ? (
              <p>Loading subjective submissions...</p>
            ) : subjectiveSubmissions.length === 0 ? (
              <p>No subjective submissions found.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {subjectiveSubmissions.map((submission) => {
                  const draft = subjectiveReviewDrafts[submission.id] || {
                    status: submission.status || "pending",
                    score: submission.score == null ? "" : String(submission.score),
                    feedback: submission.feedback || "",
                  };
                  const isReviewed = String(submission.status || "").toLowerCase() === "reviewed";
                  const inEditMode = !!subjectiveEditMode[submission.id];
                  const isLocked = isReviewed && !inEditMode;
                  const maxMarksText =
                    submission.max_marks == null || submission.max_marks === ""
                      ? ""
                      : ` / ${submission.max_marks}`;
                  const isSavingCurrent = savingSubjectiveReviewId === submission.id;

                  return (
                    <article
                      key={submission.id}
                      style={{
                        border: "1px solid #dbe4f0",
                        borderRadius: "10px",
                        padding: "1rem",
                        backgroundColor: "#f8fbff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
                          marginBottom: "0.8rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <h4 style={{ marginBottom: "0.35rem" }}>
                            {submission.student_name || submission.student_username || "Student"}
                          </h4>
                          <p style={{ marginBottom: "0.2rem", color: "#334155" }}>
                            <strong>Exam Set:</strong> {submission.exam_set_name || "N/A"}
                          </p>
                          <p style={{ marginBottom: "0.2rem", color: "#475569", fontSize: "0.92rem" }}>
                            <strong>Submitted:</strong>{" "}
                            {submission.submitted_at
                              ? new Date(submission.submitted_at).toLocaleString("en-US")
                              : "N/A"}
                          </p>
                          <p style={{ marginBottom: 0, color: "#475569", fontSize: "0.92rem" }}>
                            <strong>Contact:</strong> {submission.email || "No email"} |{" "}
                            {submission.mobile_number || "No mobile"}
                          </p>
                        </div>
                        <div style={{ display: "grid", gap: "0.4rem", justifyItems: "end" }}>
                          <span
                            style={{
                              padding: "0.25rem 0.65rem",
                              borderRadius: "999px",
                              fontSize: "0.74rem",
                              fontWeight: "700",
                              ...statusPillStyle(submission.status),
                            }}
                          >
                            {statusLabel(submission.status)}
                          </span>
                          {submission.file_url ? (
                            <a
                              href={submission.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ fontSize: "0.85rem", padding: "0.35rem 0.7rem" }}
                            >
                              Open PDF
                            </a>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>No PDF file</span>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                          gap: "0.8rem",
                        }}
                      >
                        <div>
                          <label style={{ display: "block", marginBottom: "0.35rem" }}>Status</label>
                          <div
                            style={{
                              width: "100%",
                              padding: "0.55rem",
                              borderRadius: "4px",
                              border: "1px solid #d4dbe6",
                              backgroundColor: "#f8fafc",
                              color: "#334155",
                              fontSize: "0.92rem",
                            }}
                          >
                            {isLocked
                              ? "Reviewed (locked)"
                              : "Will be set to Reviewed when marks are saved"}
                          </div>
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: "0.35rem" }}>
                            Marks{maxMarksText}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.score}
                            onChange={(e) => handleSubjectiveDraftChange(submission.id, "score", e.target.value)}
                            placeholder="Enter marks"
                            disabled={isLocked || isSavingCurrent}
                            style={{
                              width: "100%",
                              padding: "0.55rem",
                              borderRadius: "4px",
                              border: "1px solid #d4dbe6",
                              backgroundColor: isLocked ? "#f1f5f9" : "white",
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: "0.8rem" }}>
                        <label style={{ display: "block", marginBottom: "0.35rem" }}>Comments</label>
                        <textarea
                          value={draft.feedback}
                          onChange={(e) => handleSubjectiveDraftChange(submission.id, "feedback", e.target.value)}
                          rows={4}
                          placeholder="Write comments for this submission"
                          disabled={isLocked || isSavingCurrent}
                          style={{
                            width: "100%",
                            padding: "0.65rem",
                            borderRadius: "4px",
                            border: "1px solid #d4dbe6",
                            resize: "vertical",
                            backgroundColor: isLocked ? "#f1f5f9" : "white",
                          }}
                        />
                      </div>

                      <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
                        {isLocked ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => startSubjectiveEdit(submission)}
                            disabled={isSavingCurrent}
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            onClick={() =>
                              inEditMode ? cancelSubjectiveEdit(submission) : resetSubjectiveDraft(submission)
                            }
                            disabled={isSavingCurrent}
                          >
                            {inEditMode ? "Cancel" : "Reset"}
                          </button>
                        )}
                        <button
                          className="btn btn-primary"
                          onClick={() => saveSubjectiveReview(submission)}
                          disabled={isSavingCurrent || isLocked}
                        >
                          {isSavingCurrent ? "Saving..." : "Save Review"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "problem-reports" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Problem Reports</h2>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              Students report question bugs/errors here. Mark solved after correction, then delete when no longer needed.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                alignItems: "flex-end",
                marginBottom: "1.2rem",
              }}
            >
              <div style={{ minWidth: "220px" }}>
                <label style={{ display: "block", marginBottom: "0.35rem" }}>Status Filter</label>
                <select
                  value={problemStatusFilter}
                  onChange={(e) => setProblemStatusFilter(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                  }}
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="solved">Solved</option>
                </select>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => loadProblemReports(problemStatusFilter)}
              >
                Load Reports
              </button>
            </div>

            {loadingProblemReports ? (
              <p>Loading reports...</p>
            ) : problemReports.length === 0 ? (
              <p>No reports found.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {problemReports.map((report) => {
                  const isSavingCurrent = savingProblemReportId === report.id;
                  const isSolved = String(report.status || "").toLowerCase() === "solved";
                  return (
                    <article
                      key={report.id}
                      style={{
                        border: "1px solid #dbe4f0",
                        borderRadius: "10px",
                        padding: "1rem",
                        backgroundColor: "#f8fbff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
                          flexWrap: "wrap",
                          marginBottom: "0.6rem",
                        }}
                      >
                        <div>
                          <h4 style={{ marginBottom: "0.2rem" }}>
                            {report.reporter_name || report.reporter_username || "Student"} -{" "}
                            {String(report.issue_type || "other").replace("_", " ")}
                          </h4>
                          <p style={{ marginBottom: "0.2rem", color: "#475569", fontSize: "0.92rem" }}>
                            <strong>Branch:</strong> {report.branch || "N/A"} | <strong>Section:</strong>{" "}
                            {report.section || "N/A"}
                          </p>
                          <p style={{ marginBottom: "0.2rem", color: "#475569", fontSize: "0.92rem" }}>
                            <strong>Reference:</strong> {report.question_reference || "N/A"}
                          </p>
                          <p style={{ marginBottom: 0, color: "#334155" }}>{report.description}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span
                            style={{
                              padding: "0.3rem 0.65rem",
                              borderRadius: "999px",
                              fontSize: "0.74rem",
                              fontWeight: "700",
                              backgroundColor: isSolved ? "#dcfce7" : "#dbeafe",
                              color: isSolved ? "#166534" : "#1d4ed8",
                            }}
                          >
                            {isSolved ? "Solved" : "Pending"}
                          </span>
                          <p style={{ marginTop: "0.5rem", color: "#64748b", fontSize: "0.85rem" }}>
                            {report.created_at
                              ? new Date(report.created_at).toLocaleString("en-US")
                              : "N/A"}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSolveProblemReport(report.id)}
                          disabled={isSavingCurrent || isSolved}
                        >
                          {isSavingCurrent && !isSolved ? "Saving..." : "Mark Solved"}
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleDeleteProblemReport(report.id)}
                          disabled={isSavingCurrent}
                        >
                          {isSavingCurrent ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Upload Files Tab */}
        {activeTab === "upload-files" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Upload Files</h2>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Select Branch:
              </label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                <option>Civil Engineering</option>
                <option>Mechanical Engineering</option>
                <option>Electrical Engineering</option>
                <option>Electronics Engineering</option>
                <option>Computer Engineering</option>
              </select>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Content Type:
              </label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                <option value="notice">Notice</option>
                <option value="syllabus">Syllabus</option>
                <option value="old_question">Old Question</option>
                <option value="subjective">Library</option>
                <option value="take_exam_mcq">Exam Hall - MCQ Sets</option>
                <option value="take_exam_subjective">Exam Hall - Subjective Sets</option>
              </select>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Select File:
              </label>
              <input
                id="file-input"
                type="file"
                onChange={handleFileChange}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
              {file && <p style={{ color: "#666", fontSize: "0.9rem" }}>Selected: {file.name}</p>}
            </div>

            <button
              onClick={handleUploadFile}
              disabled={uploadingFile || !file}
              style={{
                backgroundColor: uploadingFile ? "#ccc" : "#28a745",
                color: "white",
                padding: "0.75rem 1.5rem",
                border: "none",
                borderRadius: "4px",
                cursor: uploadingFile ? "not-allowed" : "pointer",
              }}
            >
              {uploadingFile ? "Uploading..." : "Upload File"}
            </button>

            <hr style={{ margin: "1.5rem 0" }} />

            <h3 style={{ marginBottom: "0.8rem" }}>Load Questions from Dropbox Link</h3>
            <p style={{ color: "#64748b", marginBottom: "0.8rem" }}>
              Paste Dropbox file path/link and import questions directly to a chapter.
            </p>

            {subjects.length === 0 ? (
              <button className="btn btn-secondary" onClick={handleLoadSubjects} style={{ marginBottom: "1rem" }}>
                Load Subjects
              </button>
            ) : (
              <>
                <div style={{ marginBottom: "0.9rem" }}>
                  <label style={{ display: "block", marginBottom: "0.4rem" }}>Subject:</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => handleSelectSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  >
                    <option value="">Choose a subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id || s.name} value={s.name || s}>
                        {s.name || s}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSubject ? (
                  <div style={{ marginBottom: "0.9rem" }}>
                    <label style={{ display: "block", marginBottom: "0.4rem" }}>Chapter:</label>
                    <select
                      value={selectedChapterId}
                      onChange={(e) => setSelectedChapterId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "4px",
                        border: "1px solid #ddd",
                      }}
                    >
                      <option value="">Choose a chapter...</option>
                      {chapters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div style={{ marginBottom: "0.9rem" }}>
                  <label style={{ display: "block", marginBottom: "0.4rem" }}>Dropbox Path/Link:</label>
                  <input
                    type="text"
                    placeholder="/bridge4er/.../questions.xlsx or https://www.dropbox.com/..."
                    value={quickDropboxPath}
                    onChange={(e) => setQuickDropboxPath(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleImportQuestionsFromDropboxLink}
                  disabled={importingQuickDropboxPath || !selectedChapterId || !quickDropboxPath.trim()}
                >
                  {importingQuickDropboxPath ? "Importing..." : "Import Questions from Dropbox"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Manage Files Tab */}
        {activeTab === "manage-files" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Manage Files and Folders</h2>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Content Type:
              </label>
              <select
                value={manageContentType}
                onChange={(e) => setManageContentType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                <option value="notice">Notice</option>
                <option value="syllabus">Syllabus</option>
                <option value="old_question">Old Question</option>
                <option value="subjective">Library</option>
                <option value="take_exam_mcq">Exam Hall - MCQ Sets</option>
                <option value="take_exam_subjective">Exam Hall - Subjective Sets</option>
              </select>
            </div>

            <button
              onClick={handleLoadManagedFiles}
              className="btn btn-primary"
              style={{ marginBottom: "1rem" }}
            >
              Load Files
            </button>

            {loadingManagedFiles ? (
              <p>Loading files...</p>
            ) : managedFiles.length === 0 ? (
              <p>No files loaded yet.</p>
            ) : (
              <ul className="file-list">
                {managedFiles.map((f) => (
                  <li key={f.path} className="file-item">
                    <div className="file-info">
                      <div className="file-details">
                        <h4>{f.name}</h4>
                        <p>{f.path}</p>
                        <p style={{ marginTop: "0.3rem", fontSize: "0.85rem", color: f.is_visible ? "#047857" : "#b91c1c" }}>
                          {f.is_visible ? "Visible on website" : "Hidden from website"}
                        </p>
                      </div>
                    </div>
                    <div className="file-actions">
                      {f.is_visible ? (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSetManagedFileVisibility(f.path, false)}
                          disabled={savingManagedFilePath === f.path}
                        >
                          {savingManagedFilePath === f.path ? "Saving..." : "Hide"}
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSetManagedFileVisibility(f.path, true)}
                          disabled={savingManagedFilePath === f.path}
                        >
                          {savingManagedFilePath === f.path ? "Saving..." : "Show on Website"}
                        </button>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={() => handleDeleteManagedFile(f.path)}
                        disabled={savingManagedFilePath === f.path}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Add MCQs Tab */}
        {activeTab === "manage-mcqs" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Add MCQ Question One by One</h2>

            {subjects.length === 0 && (
              <button
                onClick={handleLoadSubjects}
                style={{
                  backgroundColor: "#007bff",
                  color: "white",
                  padding: "0.75rem 1.5rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  marginBottom: "1.5rem",
                }}
              >
                Load Subjects
              </button>
            )}

            {subjects.length > 0 && (
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Select Subject:
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => handleSelectSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  >
                    <option value="">Choose a subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id || s.name} value={s.name || s}>
                        {s.name || s}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
                  <input
                    placeholder="New subject name"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ddd" }}
                  />
                  <button className="btn btn-secondary" onClick={handleCreateSubject}>
                    Add Subject
                  </button>
                </div>

                {selectedSubject && (
                  <>
                    <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
                      <input
                        placeholder="New chapter name"
                        value={newChapterName}
                        onChange={(e) => setNewChapterName(e.target.value)}
                        style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ddd" }}
                      />
                      <button className="btn btn-secondary" onClick={handleCreateChapter}>
                        Add Chapter
                      </button>
                    </div>
                    {loadingChapters ? (
                      <p>Loading chapters...</p>
                    ) : (
                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.5rem" }}>
                          Select Chapter:
                        </label>
                        <select
                          value={selectedChapterId}
                          onChange={(e) => setSelectedChapterId(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.5rem",
                            borderRadius: "4px",
                            border: "1px solid #ddd",
                          }}
                        >
                          <option value="">Choose a chapter...</option>
                          {chapters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {selectedChapterId && (
                  <>
                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>
                        Question:
                      </label>
                      <textarea
                        value={questionData.question_text}
                        onChange={(e) =>
                          handleQuestionChange("question_text", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                          minHeight: "100px",
                        }}
                      />
                    </div>

                    {["a", "b", "c", "d"].map((option) => (
                      <div key={option} style={{ marginBottom: "1rem" }}>
                        <label style={{ display: "block", marginBottom: "0.5rem" }}>
                          Option {option.toUpperCase()}:
                        </label>
                        <input
                          type="text"
                          value={questionData[`option_${option}`]}
                          onChange={(e) =>
                            handleQuestionChange(`option_${option}`, e.target.value)
                          }
                          style={{
                            width: "100%",
                            padding: "0.5rem",
                            borderRadius: "4px",
                            border: "1px solid #ddd",
                          }}
                        />
                      </div>
                    ))}

                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>
                        Correct Option:
                      </label>
                      <select
                        value={questionData.correct_option}
                        onChange={(e) =>
                          handleQuestionChange("correct_option", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                        }}
                      >
                        {["a", "b", "c", "d"].map((option) => (
                          <option key={option} value={option}>
                            {option.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>
                        Explanation (Optional):
                      </label>
                      <textarea
                        value={questionData.explanation}
                        onChange={(e) =>
                          handleQuestionChange("explanation", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                          minHeight: "80px",
                        }}
                      />
                    </div>

                    <button
                      onClick={handleCreateQuestion}
                      disabled={creatingQuestion}
                      style={{
                        backgroundColor: creatingQuestion ? "#ccc" : "#28a745",
                        color: "white",
                        padding: "0.75rem 1.5rem",
                        border: "none",
                        borderRadius: "4px",
                        cursor: creatingQuestion ? "not-allowed" : "pointer",
                      }}
                    >
                      {creatingQuestion ? "Creating..." : "Create Question"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Bulk Upload MCQs Tab */}
        {activeTab === "bulk-upload-mcqs" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Bulk Upload MCQs from CSV/JSON/Excel</h2>
            <p style={{color: '#666', marginBottom: '1rem'}}>
              Upload a CSV/TSV/JSON/XLSX/XLS file or enter a backend/dropbox file path/link. Columns: question_header, question_text, question_image_url, option_a, option_b, option_c, option_d, correct_option, explanation
            </p>
            <div style={{ marginBottom: "1rem" }}>
              <button
                onClick={handleSyncDropboxQuestionBank}
                disabled={syncingDropbox}
                className="btn btn-secondary"
              >
                {syncingDropbox ? "Syncing Dropbox..." : "Sync All Dropbox Question Files"}
              </button>
            </div>

            {subjects.length === 0 && (
              <button
                onClick={handleLoadSubjects}
                style={{
                  backgroundColor: "#007bff",
                  color: "white",
                  padding: "0.75rem 1.5rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  marginBottom: "1.5rem",
                }}
              >
                Load Subjects
              </button>
            )}

            {subjects.length > 0 && (
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Select Subject:
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => handleSelectSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  >
                    <option value="">Choose a subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id || s.name} value={s.name || s}>
                        {s.name || s}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSubject && (
                  <>
                    {loadingChapters ? (
                      <p>Loading chapters...</p>
                    ) : (
                      <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.5rem" }}>
                          Select Chapter:
                        </label>
                        <select
                          value={selectedChapterId}
                          onChange={(e) => setSelectedChapterId(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.5rem",
                            borderRadius: "4px",
                            border: "1px solid #ddd",
                          }}
                        >
                          <option value="">Choose a chapter...</option>
                          {chapters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {selectedChapterId && (
                  <>
                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>
                        Select Question File:
                      </label>
                      <input
                        id="bulk-questions-input"
                        type="file"
                        accept=".csv,.tsv,.json,.xlsx,.xls"
                        onChange={(e) => setBulkQuestionsFile(e.target.files[0])}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                        }}
                      />
                      {bulkQuestionsFile && (
                        <p style={{ color: "#666", fontSize: "0.9rem" }}>
                          Selected: {bulkQuestionsFile.name}
                        </p>
                      )}
                    </div>

                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={{ display: "block", marginBottom: "0.5rem" }}>
                        Or File Path/Link (Backend/Dropbox):
                      </label>
                      <input
                        type="text"
                        placeholder="exams/objective_questions_template.csv or /bridge4er/.../questions.xlsx or https://www.dropbox.com/..."
                        value={bulkQuestionsPath}
                        onChange={(e) => setBulkQuestionsPath(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid #ddd",
                        }}
                      />
                    </div>

                    <button
                      onClick={handleBulkUpload}
                      disabled={bulkUploading || (!bulkQuestionsFile && !bulkQuestionsPath.trim())}
                      style={{
                        backgroundColor:
                          bulkUploading || (!bulkQuestionsFile && !bulkQuestionsPath.trim()) ? "#ccc" : "#28a745",
                        color: "white",
                        padding: "0.75rem 1.5rem",
                        border: "none",
                        borderRadius: "4px",
                        cursor:
                          bulkUploading || (!bulkQuestionsFile && !bulkQuestionsPath.trim())
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {bulkUploading ? "Uploading..." : "Upload Questions"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
