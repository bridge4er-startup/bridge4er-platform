import React, { useState } from "react";
import { fileService } from "../services/fileService";
import { mcqService } from "../services/mcqService";
import {
  listSubjectiveSubmissionsForAdmin,
  reviewSubjectiveSubmission,
} from "../services/examService";
import { reportService } from "../services/reportService";
import { contributionService } from "../services/contributionService";
import API from "../services/api";
import {
  getQRCodePaymentConfig,
  listManualPaymentRequestsForAdmin,
  reviewManualPaymentRequest,
  saveQRCodePaymentConfig,
} from "../services/paymentService";
import toast from "react-hot-toast";
import { formatNepalDateTime } from "../utils/dateTime";

const BRANCH_OPTIONS = [
  "Civil Engineering",
  "Mechanical Engineering",
  "Electrical Engineering",
  "Electronics Engineering",
  "Computer Engineering",
];
const MANAGED_CONTENT_TYPES = [
  "notice",
  "syllabus",
  "old_question",
  "objective_mcq",
  "subjective",
  "take_exam_mcq",
  "take_exam_subjective",
];
const MANAGED_CONTENT_TYPES_WITH_DIRS = new Set([
  "subjective",
  "objective_mcq",
  "take_exam_mcq",
  "take_exam_subjective",
]);
const BULK_SYNC_RESOURCE_CONTENT_TYPES = [
  "notice",
  "syllabus",
  "old_question",
  "subjective",
];
const BULK_SYNC_SCOPE_LABELS = {
  objective: "Objective MCQ Bank",
  exam_sets: "Exam Hall Sets",
  resources: "Resource Files",
  all: "All Storage Content",
};
const CONTENT_TYPE_OPTIONS = [
  { value: "notice", label: "Notice", group: "Notice" },
  { value: "syllabus", label: "Syllabus", group: "Syllabus" },
  { value: "old_question", label: "Old Questions", group: "Old Questions" },
  { value: "objective_mcq", label: "Objective MCQs", group: "Objective MCQs" },
  { value: "subjective", label: "Library", group: "Library" },
  { value: "take_exam_mcq", label: "Exam Hall - MCQ Sets", group: "Exam Hall" },
  { value: "take_exam_subjective", label: "Exam Hall - Subjective Sets", group: "Exam Hall" },
];
const DEFAULT_CONTRIBUTION_CATEGORIES = ["PSC", "NEC", "MSC", "GK/IQ", "NTC", "NEA", "Other"];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("upload-files"); // upload-files, manage-mcqs, bulk-upload-mcqs, review-subjective, payment-operations

  // File Upload State
  const [file, setFile] = useState(null);
  const [contentType, setContentType] = useState("notice");
  const [branch, setBranch] = useState("Civil Engineering");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadFolderPath, setUploadFolderPath] = useState("");

  // MCQ State
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [chapters, setChapters] = useState([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newChapterName, setNewChapterName] = useState("");
  const [newChapterNote, setNewChapterNote] = useState("");

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
  const [creatingNewChapterUpload, setCreatingNewChapterUpload] = useState(false);
  const [newBulkChapterName, setNewBulkChapterName] = useState("");
  const [newBulkChapterNote, setNewBulkChapterNote] = useState("");
  const [syncingDropboxScope, setSyncingDropboxScope] = useState("");
  const [quickDropboxPath, setQuickDropboxPath] = useState("");
  const [importingQuickDropboxPath, setImportingQuickDropboxPath] = useState(false);

  // Manage Files State
  const [manageContentType, setManageContentType] = useState("notice");
  const [managedFiles, setManagedFiles] = useState([]);
  const [loadingManagedFiles, setLoadingManagedFiles] = useState(false);
  const [syncingManagedContent, setSyncingManagedContent] = useState(false);
  const [savingManagedFilePath, setSavingManagedFilePath] = useState("");
  const [resettingManagedContent, setResettingManagedContent] = useState(false);
  const [manageObjectiveSubject, setManageObjectiveSubject] = useState("");
  const [manageObjectiveChapterId, setManageObjectiveChapterId] = useState("");
  const [manageObjectiveChapters, setManageObjectiveChapters] = useState([]);
  const [manageObjectiveQuestions, setManageObjectiveQuestions] = useState([]);
  const [manageObjectiveQuestionPage, setManageObjectiveQuestionPage] = useState(1);
  const [manageObjectiveTotalPages, setManageObjectiveTotalPages] = useState(1);
  const [manageObjectiveQuestionCount, setManageObjectiveQuestionCount] = useState(0);
  const [loadingManageObjectiveChapters, setLoadingManageObjectiveChapters] = useState(false);
  const [loadingManageObjectiveQuestions, setLoadingManageObjectiveQuestions] = useState(false);
  const [deletingObjectiveAction, setDeletingObjectiveAction] = useState("");
  const [manageObjectiveChapterNoteDraft, setManageObjectiveChapterNoteDraft] = useState("");
  const [savingManageObjectiveChapterNote, setSavingManageObjectiveChapterNote] = useState(false);
  const [syncPathInput, setSyncPathInput] = useState("");

  // Homepage Metrics State
  const [homepageMetrics, setHomepageMetrics] = useState({
    enrolled_students: "",
    objective_mcqs_available: "",
    resource_files_available: "",
    exam_sets_available: "",
    motivational_quote: "",
    motivational_image_url: "",
    login_hero_image_url: "",
    register_hero_image_url: "",
  });
  const [savingHomepageMetrics, setSavingHomepageMetrics] = useState(false);
  const [heroImageFiles, setHeroImageFiles] = useState({ login: null, register: null });
  const [uploadingHeroTarget, setUploadingHeroTarget] = useState("");

  // Subjective Review State
  const [subjectiveSubmissions, setSubjectiveSubmissions] = useState([]);
  const [subjectiveStatusFilter, setSubjectiveStatusFilter] = useState("all");
  const [loadingSubjectiveSubmissions, setLoadingSubjectiveSubmissions] = useState(false);
  const [savingSubjectiveReviewId, setSavingSubjectiveReviewId] = useState(null);
  const [subjectiveReviewDrafts, setSubjectiveReviewDrafts] = useState({});
  const [subjectiveEditMode, setSubjectiveEditMode] = useState({});
  const [expandedSubjectiveId, setExpandedSubjectiveId] = useState(null);
  const [subjectiveReviewFiles, setSubjectiveReviewFiles] = useState({});
  const [uploadingSubjectiveFileId, setUploadingSubjectiveFileId] = useState(null);

  // Problem Reports State
  const [problemReports, setProblemReports] = useState([]);
  const [problemStatusFilter, setProblemStatusFilter] = useState("all");
  const [loadingProblemReports, setLoadingProblemReports] = useState(false);
  const [savingProblemReportId, setSavingProblemReportId] = useState(null);

  // Contributions State
  const [contributions, setContributions] = useState([]);
  const [contributionStatusFilter, setContributionStatusFilter] = useState("all");
  const [loadingContributions, setLoadingContributions] = useState(false);
  const [savingContributionId, setSavingContributionId] = useState(null);
  const [contributionDrafts, setContributionDrafts] = useState({});
  const [expandedContributionIds, setExpandedContributionIds] = useState({});
  const [contributionCategories, setContributionCategories] = useState([]);
  const [loadingContributionCategories, setLoadingContributionCategories] = useState(false);
  const [newContributionCategory, setNewContributionCategory] = useState("");
  const [savingContributionCategory, setSavingContributionCategory] = useState(false);
  const [deletingContributionCategory, setDeletingContributionCategory] = useState("");

  // Payment Operations State
  const [paymentConfigForm, setPaymentConfigForm] = useState({
    title: "Bridge4ER Official Payment QR",
    account_name: "",
    account_number: "",
    contact_email: "",
    contact_phone: "",
    qr_image_url: "",
    instructions: "",
    is_active: true,
  });
  const [loadingPaymentConfig, setLoadingPaymentConfig] = useState(false);
  const [savingPaymentConfig, setSavingPaymentConfig] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("pending_approval");
  const [loadingPaymentRequests, setLoadingPaymentRequests] = useState(false);
  const [reviewingPaymentReference, setReviewingPaymentReference] = useState("");
  const [paymentReviewDrafts, setPaymentReviewDrafts] = useState({});

  const statusLabel = (value) => {
    const text = String(value || "pending").replace(/_/g, " ");
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

  const normalizeNameForComparison = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const deriveChapterNameFromSource = () => {
    const explicitName = String(newBulkChapterName || "").trim();
    if (explicitName) {
      return explicitName;
    }
    const fromUpload = String(bulkQuestionsFile?.name || "").trim();
    if (fromUpload) {
      return fromUpload.replace(/\.[^/.]+$/, "").trim();
    }
    const sourcePath = normalizeDropboxQuestionSource(bulkQuestionsPath);
    if (!sourcePath) {
      return "";
    }
    try {
      const url = new URL(sourcePath);
      const pathname = decodeURIComponent(url.pathname || "");
      const rawSegment = pathname.split("/").filter(Boolean).pop() || "";
      return rawSegment.replace(/\.[^/.]+$/, "").trim();
    } catch (_error) {
      const rawSegment = sourcePath.split(/[\\/]/).filter(Boolean).pop() || "";
      return rawSegment.replace(/\?.*$/, "").replace(/\.[^/.]+$/, "").trim();
    }
  };

  const clearBulkUploadInputs = () => {
    setBulkQuestionsFile(null);
    setBulkQuestionsPath("");
    setNewBulkChapterName("");
    setNewBulkChapterNote("");
    const input = document.getElementById("bulk-questions-input");
    if (input) {
      input.value = "";
    }
  };

  const loadPaymentConfig = async () => {
    setLoadingPaymentConfig(true);
    try {
      const config = await getQRCodePaymentConfig();
      setPaymentConfigForm({
        title: config?.title || "Bridge4ER Official Payment QR",
        account_name: config?.account_name || "",
        account_number: config?.account_number || "",
        contact_email: config?.contact_email || "",
        contact_phone: config?.contact_phone || "",
        qr_image_url: config?.qr_image_url || "",
        instructions: config?.instructions || "",
        is_active: config?.is_active !== false,
      });
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load payment QR configuration.");
    } finally {
      setLoadingPaymentConfig(false);
    }
  };

  const loadPaymentRequests = async (statusFilter = paymentStatusFilter) => {
    setLoadingPaymentRequests(true);
    try {
      const rows = await listManualPaymentRequestsForAdmin(statusFilter);
      setPaymentRequests(Array.isArray(rows) ? rows : []);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load payment requests.");
    } finally {
      setLoadingPaymentRequests(false);
    }
  };

  const openPaymentOperationsTab = () => {
    setActiveTab("payment-operations");
    void loadPaymentConfig();
    void loadPaymentRequests(paymentStatusFilter);
  };

  const handlePaymentConfigFieldChange = (field, value) => {
    setPaymentConfigForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSavePaymentConfig = async () => {
    setSavingPaymentConfig(true);
    try {
      const payload = {
        ...paymentConfigForm,
        is_active: !!paymentConfigForm.is_active,
      };
      const saved = await saveQRCodePaymentConfig(payload);
      setPaymentConfigForm({
        title: saved?.title || "",
        account_name: saved?.account_name || "",
        account_number: saved?.account_number || "",
        contact_email: saved?.contact_email || "",
        contact_phone: saved?.contact_phone || "",
        qr_image_url: saved?.qr_image_url || "",
        instructions: saved?.instructions || "",
        is_active: saved?.is_active !== false,
      });
      toast.success("Payment QR configuration saved.");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to save payment QR configuration.");
    } finally {
      setSavingPaymentConfig(false);
    }
  };

  const handlePaymentReviewDraftChange = (referenceId, value) => {
    setPaymentReviewDrafts((prev) => ({
      ...prev,
      [referenceId]: value,
    }));
  };

  const handleReviewPaymentRequest = async (referenceId, action) => {
    setReviewingPaymentReference(referenceId);
    try {
      const adminNote = String(paymentReviewDrafts?.[referenceId] || "").trim();
      const result = await reviewManualPaymentRequest(referenceId, {
        action,
        admin_note: adminNote,
      });
      toast.success(result?.message || "Payment request updated.");
      setPaymentReviewDrafts((prev) => ({ ...prev, [referenceId]: "" }));
      await loadPaymentRequests(paymentStatusFilter);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to update payment request.");
    } finally {
      setReviewingPaymentReference("");
    }
  };

  // File Upload Handlers
  const handleBranchChange = (nextBranch) => {
    setBranch(nextBranch);
    setSubjects([]);
    setSelectedSubject("");
    setChapters([]);
    setSelectedChapterId("");
    setNewChapterNote("");
    setNewBulkChapterNote("");
    setManageObjectiveSubject("");
    setManageObjectiveChapterId("");
    setManageObjectiveChapters([]);
    setManageObjectiveQuestions([]);
    setManageObjectiveQuestionPage(1);
    setManageObjectiveTotalPages(1);
    setManageObjectiveQuestionCount(0);
    setManageObjectiveChapterNoteDraft("");
  };

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
      const result = await fileService.uploadFile(file, contentType, branch, uploadFolderPath.trim());
      const objectiveImported = Number(result?.objective_sync?.imported_questions || 0);
      const mcqImported = Number(result?.exam_sets_sync?.mcq?.imported_questions || 0);
      const subjectiveImported = Number(result?.exam_sets_sync?.subjective?.imported_questions || 0);
      const imported = objectiveImported + mcqImported + subjectiveImported;
      toast.success(imported ? `File uploaded and ${imported} questions imported.` : "File uploaded successfully!");
      setFile(null);
      setUploadFolderPath("");
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
      clearBulkUploadInputs();
    } catch (error) {
      toast.error("Failed to bulk upload questions");
      console.error(error);
    } finally {
      setBulkUploading(false);
    }
  };

  const handleUploadNewChapterFile = async () => {
    if (!selectedSubject) {
      toast.error("Select a subject first");
      return;
    }
    if (!bulkQuestionsFile && !bulkQuestionsPath.trim()) {
      toast.error("Select a file or provide a backend/dropbox file path");
      return;
    }
    const subjectObj = subjects.find((s) => s.name === selectedSubject);
    if (!subjectObj) {
      toast.error("Invalid subject");
      return;
    }

    const chapterName = deriveChapterNameFromSource();
    if (!chapterName) {
      toast.error("Enter chapter name or upload a file with valid chapter filename");
      return;
    }

    const alreadyExists = chapters.some(
      (chapter) => normalizeNameForComparison(chapter.name) === normalizeNameForComparison(chapterName)
    );
    if (alreadyExists) {
      toast.error("Chapter already exists. Select it above or choose a different chapter name.");
      return;
    }

    setCreatingNewChapterUpload(true);
    try {
      const chapter = await mcqService.createChapter(
        subjectObj.id,
        chapterName,
        0,
        newBulkChapterNote.trim()
      );
      const chapterId = chapter?.id;
      if (!chapterId) {
        throw new Error("Failed to create chapter");
      }

      const result = bulkQuestionsFile
        ? await mcqService.bulkUploadQuestionsFile(chapterId, bulkQuestionsFile)
        : await mcqService.bulkUploadQuestionsFromPath(chapterId, bulkQuestionsPath.trim());

      toast.success(result?.message || `Chapter "${chapterName}" created and uploaded.`);
      clearBulkUploadInputs();
      await handleSelectSubject(selectedSubject);
      setSelectedChapterId(String(chapterId));
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to upload new chapter file");
      console.error(error);
    } finally {
      setCreatingNewChapterUpload(false);
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

  const summarizeStorageSyncRows = (rows) => {
    const fileCount = rows.reduce((total, row) => total + Number(row?.file_count || 0), 0);
    const folderCount = rows.reduce((total, row) => total + Number(row?.folder_count || 0), 0);
    return `${fileCount} files, ${folderCount} folders`;
  };

  const handleSyncDropboxQuestionBank = async (scope = "all") => {
    if (syncingDropboxScope) {
      return;
    }

    setSyncingDropboxScope(scope);
    try {
      let objectiveImported = 0;
      let mcqSetImported = 0;
      let subjectiveSetImported = 0;
      let syncedStorageRows = [];
      const errors = [];

      const collectExamSyncResult = (result) => {
        objectiveImported += Number(result?.objective?.imported_questions || 0);
        mcqSetImported += Number(result?.exam_sets?.mcq?.imported_questions || 0);
        subjectiveSetImported += Number(result?.exam_sets?.subjective?.imported_questions || 0);
        const resultErrors = Array.isArray(result?.errors) ? result.errors : [];
        resultErrors.forEach((row) => {
          errors.push(`${row.scope}: ${row.error}`);
        });
        const storageRows = Array.isArray(result?.storage?.synced) ? result.storage.synced : [];
        syncedStorageRows = syncedStorageRows.concat(storageRows);
        const storageErrors = Array.isArray(result?.storage?.errors) ? result.storage.errors : [];
        storageErrors.forEach((row) => {
          errors.push(`storage-${row.content_type}: ${row.error}`);
        });
      };

      const collectStorageSyncResult = (result) => {
        const syncedRows = Array.isArray(result?.synced) ? result.synced : [];
        syncedStorageRows = syncedStorageRows.concat(syncedRows);
        const syncErrors = Array.isArray(result?.errors) ? result.errors : [];
        syncErrors.forEach((row) => {
          errors.push(`storage-${row.content_type}: ${row.error}`);
        });
      };

      if (scope === "objective" || scope === "all") {
        const objectiveResult = await mcqService.syncDropboxQuestionBank(
          branch,
          true,
          true,
          false
        );
        collectExamSyncResult(objectiveResult);
      }

      if (scope === "exam_sets" || scope === "all") {
        const examResult = await mcqService.syncDropboxQuestionBank(
          branch,
          true,
          false,
          true
        );
        collectExamSyncResult(examResult);
      }

      if (scope === "resources" || scope === "all") {
        const resourceResult = await fileService.syncContent(
          branch,
          BULK_SYNC_RESOURCE_CONTENT_TYPES,
          true
        );
        collectStorageSyncResult(resourceResult);
      }

      if ((scope === "objective" || scope === "all") && subjects.length > 0) {
        await handleLoadSubjects();
      }

      const summaryParts = [];
      if (scope === "objective" || scope === "all") {
        summaryParts.push(`Objective imported: ${objectiveImported}`);
      }
      if (scope === "exam_sets" || scope === "all") {
        summaryParts.push(`MCQ set questions imported: ${mcqSetImported}`);
        summaryParts.push(`Subjective set questions imported: ${subjectiveSetImported}`);
      }
      if (scope === "resources" || scope === "all" || syncedStorageRows.length > 0) {
        summaryParts.push(`Indexed for management: ${summarizeStorageSyncRows(syncedStorageRows)}`);
      }

      if (errors.length > 0) {
        toast.error(`Sync partially failed. ${errors.join(" | ")}`);
      }
      if (summaryParts.length > 0) {
        toast.success(`${BULK_SYNC_SCOPE_LABELS[scope] || "Storage"} sync complete. ${summaryParts.join(" | ")}`);
      } else if (errors.length === 0) {
        toast.success(`${BULK_SYNC_SCOPE_LABELS[scope] || "Storage"} sync complete.`);
      }
    } catch (error) {
      const errorRows = error?.response?.data?.errors;
      const details = Array.isArray(errorRows)
        ? errorRows.map((row) => `${row.scope}: ${row.error}`).join(" | ")
        : "";
      const message = error?.response?.data?.error || details || "Failed to sync question files from storage";
      toast.error(message);
      console.error(error);
    } finally {
      setSyncingDropboxScope("");
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
      await mcqService.createChapter(subjectObj.id, newChapterName.trim(), 0, newChapterNote.trim());
      toast.success("Chapter created");
      setNewChapterName("");
      setNewChapterNote("");
      handleSelectSubject(selectedSubject);
    } catch (error) {
      toast.error("Failed to create chapter");
    }
  };

  const handleLoadManagedFiles = async () => {
    setLoadingManagedFiles(true);
    try {
      const includeDirs = MANAGED_CONTENT_TYPES_WITH_DIRS.has(manageContentType);
      const result = await fileService.listFiles(manageContentType, branch, true, includeDirs);
      setManagedFiles(result || []);
    } catch (error) {
      toast.error("Failed to load files");
    } finally {
      setLoadingManagedFiles(false);
    }
  };

  const handleSyncManagedContent = async (syncAll = false) => {
    setSyncingManagedContent(true);
    try {
      const targetTypes = syncAll ? MANAGED_CONTENT_TYPES : [manageContentType];
      const result = await fileService.syncContent(branch, targetTypes, true);
      const shouldSyncObjective = targetTypes.includes("objective_mcq");
      const shouldSyncExamSets =
        targetTypes.includes("take_exam_mcq") || targetTypes.includes("take_exam_subjective");
      const questionResult =
        shouldSyncObjective || shouldSyncExamSets
          ? await mcqService.syncDropboxQuestionBank(
              branch,
              true,
              shouldSyncObjective,
              shouldSyncExamSets
            )
          : null;
      const syncedRows = Array.isArray(result?.synced) ? result.synced : [];
      const errors = Array.isArray(result?.errors) ? result.errors : [];

      if (syncedRows.length > 0) {
        const summary = syncedRows
          .map((row) => {
            const deleted = Number(row.files_deleted || 0) + Number(row.folders_deleted || 0);
            return `${row.content_type}: ${row.file_count} files${deleted ? `, ${deleted} removed` : ""}`;
          })
          .join(" | ");
        const imported =
          Number(questionResult?.objective?.imported_questions || 0)
          + Number(questionResult?.exam_sets?.mcq?.imported_questions || 0)
          + Number(questionResult?.exam_sets?.subjective?.imported_questions || 0);
        toast.success(`Storage sync complete. ${summary}${imported ? ` | ${imported} questions imported` : ""}`);
      }
      if (errors.length > 0) {
        const details = errors.map((row) => `${row.content_type}: ${row.error}`).join(" | ");
        toast.error(`Some content types failed to sync. ${details}`);
      }

      await handleLoadManagedFiles();
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to sync storage content";
      toast.error(message);
    } finally {
      setSyncingManagedContent(false);
    }
  };

  const handleDeleteManagedFile = async (path) => {
    if (
      !window.confirm(
        `Delete this path from storage, website display, and synced question data?\n\n${path}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const result = await fileService.deleteFile(path);
      const objectiveDeleted = Number(result?.objective_sync?.questions_deleted || 0);
      const mcqDeactivated = Number(result?.exam_sets_sync?.mcq?.sets_deactivated || 0);
      const subjectiveDeactivated = Number(result?.exam_sets_sync?.subjective?.sets_deactivated || 0);
      const details = [];
      if (objectiveDeleted) details.push(`${objectiveDeleted} objective questions removed`);
      if (mcqDeactivated) details.push(`${mcqDeactivated} MCQ sets hidden`);
      if (subjectiveDeactivated) details.push(`${subjectiveDeactivated} subjective sets hidden`);
      toast.success(`Path deleted successfully${details.length ? `. ${details.join(" | ")}` : ""}`);
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete file/folder");
    }
  };

  const handleSetManagedFileVisibility = async (path, isVisible, isDir = false) => {
    setSavingManagedFilePath(path);
    try {
      await fileService.setVisibility(path, isVisible, isDir);
      toast.success(isVisible ? "File is visible on website" : "File hidden from website");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to update file visibility");
    } finally {
      setSavingManagedFilePath("");
    }
  };

  const handleEditManagedMetadata = async (item) => {
    const displayName = window.prompt("Display name", item.display_name || item.name || "");
    if (displayName === null) return;
    const sortOrderText = window.prompt("Sort order (number)", String(item.sort_order || 0));
    if (sortOrderText === null) return;
    const iconUrl = window.prompt("Icon URL (optional)", item.icon_url || "");
    if (iconUrl === null) return;
    try {
      await fileService.updateMetadata(
        item.path,
        {
          display_name: displayName,
          sort_order: Number(sortOrderText || 0),
          icon_url: iconUrl,
        },
        !!item.is_dir
      );
      toast.success("Metadata updated.");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to update metadata.");
    }
  };

  const handleRenameManagedPath = async (item) => {
    const nextPath = window.prompt("New path (include full storage path)", item.path || "");
    if (!nextPath || nextPath === item.path) return;
    try {
      await fileService.renamePath(item.path, nextPath);
      toast.success("Path renamed.");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to rename path.");
    }
  };

  const handleCreateManagedFolder = async () => {
    const path = window.prompt("New folder path (full storage path)");
    if (!path) return;
    try {
      await fileService.createFolder({ path, content_type: manageContentType, branch });
      toast.success("Folder created.");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to create folder.");
    }
  };

  const handleSyncManagedPath = async () => {
    const path = syncPathInput.trim();
    if (!path) return;
    try {
      const result = await fileService.syncPath({
        path,
        include_dirs: true,
        content_type: manageContentType,
        branch,
      });
      const objectiveImported = Number(result?.objective_sync?.imported_questions || 0);
      const mcqImported = Number(result?.exam_sets_sync?.mcq?.imported_questions || 0);
      const subjectiveImported = Number(result?.exam_sets_sync?.subjective?.imported_questions || 0);
      const imported = objectiveImported + mcqImported + subjectiveImported;
      toast.success(imported ? `Path synced and ${imported} questions imported.` : "Path synced.");
      setSyncPathInput("");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to sync path.");
    }
  };

  const handleAttachManagedPath = async () => {
    const path = window.prompt("Storage file path to attach");
    if (!path) return;
    try {
      await fileService.attachPath({ path, content_type: manageContentType, branch });
      toast.success("Path attached.");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to attach path.");
    }
  };

  const handleResetManagedContent = async () => {
    const confirmed = window.confirm(
      "This will remove all storage-indexed files and folders from the website across ALL branches. Storage bucket files will not be deleted. Continue?"
    );
    if (!confirmed) return;

    setResettingManagedContent(true);
    try {
      const result = await fileService.resetContent();
      const deletedFiles = Number(result?.deleted?.files || 0);
      const deletedFolders = Number(result?.deleted?.folders || 0);
      toast.success(`Storage index cleared. ${deletedFiles} files, ${deletedFolders} folders removed.`);
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to clear storage index.");
    } finally {
      setResettingManagedContent(false);
    }
  };

  const handleManageObjectiveSubjectChange = async (subject) => {
    setManageObjectiveSubject(subject);
    setManageObjectiveChapterId("");
    setManageObjectiveChapterNoteDraft("");
    setManageObjectiveQuestions([]);
    setManageObjectiveQuestionPage(1);
    setManageObjectiveTotalPages(1);
    setManageObjectiveQuestionCount(0);

    if (!subject) {
      setManageObjectiveChapters([]);
      return;
    }

    setLoadingManageObjectiveChapters(true);
    try {
      const result = await mcqService.getChapters(subject, branch);
      setManageObjectiveChapters(result || []);
    } catch (error) {
      toast.error("Failed to load chapters");
    } finally {
      setLoadingManageObjectiveChapters(false);
    }
  };

  const handleUpdateObjectiveChapterNote = async () => {
    if (!manageObjectiveChapterId) {
      toast.error("Select a chapter first");
      return;
    }
    const chapterObj = manageObjectiveChapters.find(
      (chapter) => String(chapter.id) === String(manageObjectiveChapterId)
    );
    if (!chapterObj) {
      toast.error("Invalid chapter");
      return;
    }

    setSavingManageObjectiveChapterNote(true);
    try {
      const updated = await mcqService.updateChapterNote(
        chapterObj.id,
        manageObjectiveChapterNoteDraft.trim()
      );

      setManageObjectiveChapters((prev) =>
        prev.map((chapter) =>
          String(chapter.id) === String(chapterObj.id)
            ? { ...chapter, small_note: updated?.small_note || "" }
            : chapter
        )
      );
      setManageObjectiveChapterNoteDraft(updated?.small_note || "");
      setChapters((prev) =>
        prev.map((chapter) =>
          String(chapter.id) === String(chapterObj.id)
            ? { ...chapter, small_note: updated?.small_note || "" }
            : chapter
        )
      );
      toast.success("Chapter note saved");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to save chapter note");
    } finally {
      setSavingManageObjectiveChapterNote(false);
    }
  };

  const handleLoadManageObjectiveQuestions = async (targetPage = 1) => {
    if (!manageObjectiveSubject || !manageObjectiveChapterId) {
      toast.error("Select subject and chapter first");
      return;
    }
    const chapterObj = manageObjectiveChapters.find(
      (chapter) => String(chapter.id) === String(manageObjectiveChapterId)
    );
    if (!chapterObj) {
      toast.error("Invalid chapter");
      return;
    }

    setLoadingManageObjectiveQuestions(true);
    try {
      const result = await mcqService.getQuestions(
        manageObjectiveSubject,
        chapterObj.name,
        branch,
        targetPage,
        20
      );
      setManageObjectiveQuestions(result?.results || []);
      setManageObjectiveQuestionPage(result?.page || targetPage);
      setManageObjectiveTotalPages(result?.total_pages || 1);
      setManageObjectiveQuestionCount(result?.count || 0);
    } catch (error) {
      toast.error("Failed to load chapter questions");
    } finally {
      setLoadingManageObjectiveQuestions(false);
    }
  };

  const handleDeleteObjectiveQuestion = async (questionId) => {
    if (!window.confirm("Delete this question permanently?")) {
      return;
    }
    setDeletingObjectiveAction(`question-${questionId}`);
    try {
      await mcqService.deleteQuestion(questionId);
      toast.success("Question deleted");
      await handleLoadManageObjectiveQuestions(manageObjectiveQuestionPage);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete question");
    } finally {
      setDeletingObjectiveAction("");
    }
  };

  const handleDeleteObjectiveChapter = async () => {
    if (!manageObjectiveChapterId) {
      toast.error("Select a chapter first");
      return;
    }
    const chapterObj = manageObjectiveChapters.find(
      (chapter) => String(chapter.id) === String(manageObjectiveChapterId)
    );
    if (!chapterObj) {
      toast.error("Invalid chapter");
      return;
    }

    if (
      !window.confirm(
        `Delete chapter "${chapterObj.name}" and all questions in it? This also removes matching chapter files from storage.`
      )
    ) {
      return;
    }

    setDeletingObjectiveAction(`chapter-${chapterObj.id}`);
    try {
      await mcqService.deleteChapter(chapterObj.id, true);
      toast.success("Chapter deleted");
      await handleManageObjectiveSubjectChange(manageObjectiveSubject);
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete chapter");
    } finally {
      setDeletingObjectiveAction("");
    }
  };

  const handleDeleteObjectiveSubject = async () => {
    if (!manageObjectiveSubject) {
      toast.error("Select a subject first");
      return;
    }
    const subjectObj = subjects.find((subject) => subject.name === manageObjectiveSubject);
    if (!subjectObj) {
      toast.error("Invalid subject");
      return;
    }

    if (
      !window.confirm(
        `Delete subject "${subjectObj.name}" with all chapters/questions? This also removes its storage subject folder.`
      )
    ) {
      return;
    }

    setDeletingObjectiveAction(`subject-${subjectObj.id}`);
    try {
      await mcqService.deleteSubject(subjectObj.id, true);
      toast.success("Subject deleted");
      await handleLoadSubjects();
      setManageObjectiveSubject("");
      setManageObjectiveChapterId("");
      setManageObjectiveChapters([]);
      setManageObjectiveQuestions([]);
      setManageObjectiveQuestionPage(1);
      setManageObjectiveTotalPages(1);
      setManageObjectiveQuestionCount(0);
      setManageObjectiveChapterNoteDraft("");
      await handleLoadManagedFiles();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete subject");
    } finally {
      setDeletingObjectiveAction("");
    }
  };

  const handleImportQuestionsFromDropboxLink = async () => {
    const source = normalizeDropboxQuestionSource(quickDropboxPath);
    if (!source) {
      toast.error("Please enter storage file path/link");
      return;
    }
    if (!selectedChapterId) {
      toast.error("Please select a chapter first");
      return;
    }

    setImportingQuickDropboxPath(true);
    try {
      const result = await mcqService.bulkUploadQuestionsFromPath(selectedChapterId, source);
      toast.success(result?.message || "Questions imported from storage path.");
      setQuickDropboxPath("");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to import questions from storage path");
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

  const loadContributions = async (statusFilter = contributionStatusFilter, branchFilter = branch) => {
    setLoadingContributions(true);
    try {
      const data = await contributionService.adminListContributions(statusFilter, "", branchFilter);
      const rows = Array.isArray(data) ? data : data?.results || [];
      setContributions(rows);
      setExpandedContributionIds({});
      const nextDrafts = {};
      rows.forEach((item) => {
        nextDrafts[item.id] = {
          status: item.status || "pending",
          category: item.category || "",
        };
      });
      setContributionDrafts(nextDrafts);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load contributions.");
    } finally {
      setLoadingContributions(false);
    }
  };

  const normalizeContributionCategories = (values) => {
    const normalized = (values || [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const loadContributionCategories = async () => {
    setLoadingContributionCategories(true);
    try {
      const data = await contributionService.listCategories(branch);
      const rows = normalizeContributionCategories(data?.categories || data || []);
      setContributionCategories(rows.length ? rows : DEFAULT_CONTRIBUTION_CATEGORIES);
    } catch (_error) {
      setContributionCategories(DEFAULT_CONTRIBUTION_CATEGORIES);
    } finally {
      setLoadingContributionCategories(false);
    }
  };

  const createContributionCategory = async () => {
    const name = String(newContributionCategory || "").trim();
    if (!name) {
      toast.error("Enter a category name.");
      return;
    }
    setSavingContributionCategory(true);
    try {
      await contributionService.adminCreateCategory(name, branch);
      toast.success("Category added.");
      setNewContributionCategory("");
      await loadContributionCategories();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to add category.");
    } finally {
      setSavingContributionCategory(false);
    }
  };

  const deleteContributionCategory = async (name) => {
    if (!window.confirm(`Delete category "${name}"?`)) {
      return;
    }
    setDeletingContributionCategory(name);
    try {
      await contributionService.adminDeleteCategory({ name, branch });
      toast.success("Category deleted.");
      await loadContributionCategories();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete category.");
    } finally {
      setDeletingContributionCategory("");
    }
  };

  const updateContributionDraft = (contributionId, field, value) => {
    setContributionDrafts((prev) => ({
      ...prev,
      [contributionId]: {
        ...(prev[contributionId] || {}),
        [field]: value,
      },
    }));
  };

  const toggleContributionDetails = (contributionId) => {
    setExpandedContributionIds((prev) => ({
      ...prev,
      [contributionId]: !prev[contributionId],
    }));
  };

  const saveContribution = async (contribution) => {
    const draft = contributionDrafts[contribution.id] || {};
    setSavingContributionId(contribution.id);
    try {
      await contributionService.adminUpdateContribution(contribution.id, {
        status: draft.status,
        category: draft.category,
      });
      toast.success("Contribution updated.");
      await loadContributions(contributionStatusFilter, branch);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to update contribution.");
    } finally {
      setSavingContributionId(null);
    }
  };

  const deleteContribution = async (contributionId) => {
    if (!window.confirm("Delete this contribution?")) {
      return;
    }
    setSavingContributionId(contributionId);
    try {
      await contributionService.adminDeleteContribution(contributionId);
      toast.success("Contribution deleted.");
      await loadContributions(contributionStatusFilter, branch);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete contribution.");
    } finally {
      setSavingContributionId(null);
    }
  };

  const deleteContributionComment = async (commentId) => {
    if (!window.confirm("Delete this comment?")) {
      return;
    }
    try {
      await contributionService.deleteComment(commentId);
      toast.success("Comment deleted.");
      await loadContributions(contributionStatusFilter, branch);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete comment.");
    }
  };

  const contributionCategoryOptions =
    contributionCategories.length > 0 ? contributionCategories : DEFAULT_CONTRIBUTION_CATEGORIES;

  const loadHomepageMetrics = async () => {
    try {
      const res = await API.get("storage/homepage/stats/", {
        params: { branch },
      });
      setHomepageMetrics({
        enrolled_students: String(res.data?.enrolled_students ?? ""),
        objective_mcqs_available: String(res.data?.objective_mcqs_available ?? ""),
        resource_files_available: String(res.data?.resource_files_available ?? ""),
        exam_sets_available: String(res.data?.exam_sets_available ?? ""),
        motivational_quote: String(res.data?.motivational_quote ?? ""),
        motivational_image_url: String(res.data?.motivational_image_url ?? ""),
        login_hero_image_url: String(res.data?.login_hero_image_url ?? ""),
        register_hero_image_url: String(res.data?.register_hero_image_url ?? ""),
      });
    } catch (_error) {
      toast.error("Failed to load homepage metrics.");
    }
  };

  const saveHomepageMetrics = async () => {
    try {
      setSavingHomepageMetrics(true);
      await API.post("storage/homepage/stats/", homepageMetrics, {
        params: { branch },
      });
      toast.success("Homepage metrics updated.");
      await loadHomepageMetrics();
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to update homepage metrics.";
      toast.error(message);
    } finally {
      setSavingHomepageMetrics(false);
    }
  };

  const handleHeroFileSelect = (target, file) => {
    setHeroImageFiles((prev) => ({ ...prev, [target]: file || null }));
  };

  const uploadHeroImage = async (target) => {
    const file = heroImageFiles[target];
    if (!file) {
      toast.error("Please select an image first.");
      return;
    }
    setUploadingHeroTarget(target);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target", target);
      const res = await API.post("storage/homepage/hero-image/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = res?.data?.url || res?.data?.image_url || "";
      if (url) {
        setHomepageMetrics((prev) => ({
          ...prev,
          [`${target}_hero_image_url`]: url,
        }));
        toast.success("Hero image uploaded.");
      } else {
        toast.error("Upload succeeded but no image URL returned.");
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to upload hero image.");
    } finally {
      setUploadingHeroTarget("");
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
          student_name: item.student_name || item.student_username || "",
          exam_set_name: item.exam_set_name || "",
        };
        nextEditMode[item.id] = false;
      });
      setSubjectiveReviewDrafts(nextDrafts);
      setSubjectiveEditMode(nextEditMode);
      setExpandedSubjectiveId(null);
      setSubjectiveReviewFiles({});
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
        student_name: prev[submissionId]?.student_name || "",
        exam_set_name: prev[submissionId]?.exam_set_name || "",
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
        student_name: submission.student_name || submission.student_username || "",
        exam_set_name: submission.exam_set_name || "",
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
    const currentStatus = String(submission.status || "pending").toLowerCase();
    const nextStatus = scoreText ? "reviewed" : currentStatus;
    if (nextStatus === "reviewed" && !scoreText) {
      toast.error("Marks are required");
      return;
    }

    setSavingSubjectiveReviewId(submission.id);
    try {
      const payload = {
        status: nextStatus,
        feedback: draft.feedback || "",
        student_name: draft.student_name || "",
        exam_set_name: draft.exam_set_name || "",
      };
      if (scoreText) {
        payload.score = scoreText;
      }

      await reviewSubjectiveSubmission(submission.id, payload);
      toast.success(nextStatus === "reviewed" ? "Submission review saved" : "Submission details saved");
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

  const handleOpenSubjectivePdf = async (submission) => {
    const fileUrl = String(submission?.file_url || "").trim();
    if (!fileUrl) {
      toast.error("No PDF file available.");
      return;
    }

    try {
      const response = await API.get(fileUrl, { responseType: "blob" });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to open PDF.");
    }
  };

  const handleDownloadSubjectivePdf = async (submission) => {
    const fileUrl = String(submission?.file_url || "").trim();
    if (!fileUrl) {
      toast.error("No PDF file available.");
      return;
    }

    const downloadUrl = fileUrl.includes("?") ? `${fileUrl}&download=1` : `${fileUrl}?download=1`;
    try {
      const response = await API.get(downloadUrl, { responseType: "blob" });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `subjective-submission-${submission?.id || "file"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to download PDF.");
    }
  };

  const handleSelectReviewedFile = (submissionId, file) => {
    setSubjectiveReviewFiles((prev) => ({ ...prev, [submissionId]: file || null }));
  };

  const uploadReviewedFile = async (submission) => {
    const file = subjectiveReviewFiles[submission.id];
    if (!file) {
      toast.error("Select a reviewed file first.");
      return;
    }
    setUploadingSubjectiveFileId(submission.id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await API.post(`exams/subjective/submissions/${submission.id}/reviewed-file/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Reviewed file uploaded.");
      await loadSubjectiveSubmissions(subjectiveStatusFilter);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to upload reviewed file.");
    } finally {
      setUploadingSubjectiveFileId(null);
    }
  };

  const deleteSubjectiveSubmission = async (submissionId) => {
    if (!window.confirm("Delete this submission? This cannot be undone.")) {
      return;
    }
    setSavingSubjectiveReviewId(submissionId);
    try {
      await API.delete(`exams/subjective/submissions/${submissionId}/`);
      toast.success("Submission deleted.");
      await loadSubjectiveSubmissions(subjectiveStatusFilter);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to delete submission.");
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
            File Manager
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
            onClick={openPaymentOperationsTab}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "payment-operations" ? "#007bff" : "transparent",
              color: activeTab === "payment-operations" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "payment-operations" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Payment Ops
          </button>
          <button
            onClick={() => {
              setActiveTab("contributions");
              loadContributions();
              loadContributionCategories();
            }}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor:
                activeTab === "contributions" ? "#007bff" : "transparent",
              color: activeTab === "contributions" ? "white" : "#333",
              border: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === "contributions" ? "3px solid #007bff" : "none",
              marginBottom: "-2px",
            }}
          >
            Contributions
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

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.3rem" }}>Login Page Hero Image URL</label>
              <input
                type="text"
                value={homepageMetrics.login_hero_image_url}
                onChange={(e) =>
                  setHomepageMetrics((prev) => ({
                    ...prev,
                    login_hero_image_url: e.target.value,
                  }))
                }
                placeholder="https://example.com/login-hero.jpg"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.5rem" }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleHeroFileSelect("login", e.target.files?.[0])}
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={uploadingHeroTarget === "login"}
                  onClick={() => uploadHeroImage("login")}
                >
                  {uploadingHeroTarget === "login" ? "Uploading..." : "Upload Login Image"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.3rem" }}>Register Page Hero Image URL</label>
              <input
                type="text"
                value={homepageMetrics.register_hero_image_url}
                onChange={(e) =>
                  setHomepageMetrics((prev) => ({
                    ...prev,
                    register_hero_image_url: e.target.value,
                  }))
                }
                placeholder="https://example.com/register-hero.jpg"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.5rem" }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleHeroFileSelect("register", e.target.files?.[0])}
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={uploadingHeroTarget === "register"}
                  onClick={() => uploadHeroImage("register")}
                >
                  {uploadingHeroTarget === "register" ? "Uploading..." : "Upload Register Image"}
                </button>
              </div>
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
                    student_name: submission.student_name || submission.student_username || "",
                    exam_set_name: submission.exam_set_name || "",
                  };
                  const isReviewed = String(submission.status || "").toLowerCase() === "reviewed";
                  const inEditMode = !!subjectiveEditMode[submission.id];
                  const isLocked = isReviewed && !inEditMode;
                  const maxMarksText =
                    submission.max_marks == null || submission.max_marks === ""
                      ? ""
                      : ` / ${submission.max_marks}`;
                  const isSavingCurrent = savingSubjectiveReviewId === submission.id;
                  const isExpanded = expandedSubjectiveId === submission.id;

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
                              ? formatNepalDateTime(submission.submitted_at)
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
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.85rem", padding: "0.35rem 0.7rem" }}
                                onClick={() => handleOpenSubjectivePdf(submission)}
                              >
                                Open PDF
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.85rem", padding: "0.35rem 0.7rem" }}
                                onClick={() => handleDownloadSubjectivePdf(submission)}
                              >
                                Download
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>No PDF file</span>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: "0.82rem", padding: "0.32rem 0.7rem" }}
                            onClick={() =>
                              setExpandedSubjectiveId(isExpanded ? null : submission.id)
                            }
                          >
                            {isExpanded ? "Hide Details" : "View Details"}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                              gap: "0.8rem",
                            }}
                          >
                            <div>
                              <label style={{ display: "block", marginBottom: "0.35rem" }}>Student Name</label>
                              <input
                                type="text"
                                value={draft.student_name}
                                onChange={(e) => handleSubjectiveDraftChange(submission.id, "student_name", e.target.value)}
                                placeholder="Enter student name"
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
                            <div>
                              <label style={{ display: "block", marginBottom: "0.35rem" }}>Exam Set Name</label>
                              <input
                                type="text"
                                value={draft.exam_set_name}
                                onChange={(e) => handleSubjectiveDraftChange(submission.id, "exam_set_name", e.target.value)}
                                placeholder="Enter exam set name"
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

                          <div style={{ marginTop: "0.8rem", display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => handleSelectReviewedFile(submission.id, e.target.files?.[0])}
                            />
                            <button
                              className="btn btn-secondary"
                              type="button"
                              disabled={uploadingSubjectiveFileId === submission.id}
                              onClick={() => uploadReviewedFile(submission)}
                            >
                              {uploadingSubjectiveFileId === submission.id ? "Uploading..." : "Upload Reviewed File"}
                            </button>
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
                              className="btn btn-secondary"
                              onClick={() => deleteSubjectiveSubmission(submission.id)}
                              disabled={isSavingCurrent}
                            >
                              Delete
                            </button>
                            <button
                              className="btn btn-primary"
                              onClick={() => saveSubjectiveReview(submission)}
                              disabled={isSavingCurrent || isLocked}
                            >
                              {isSavingCurrent ? "Saving..." : "Save Review"}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "payment-operations" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Payment Operations</h2>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              Publish payment QR details and approve/reject exam unlock requests.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "1.2rem",
              }}
            >
              <section
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "1rem",
                  backgroundColor: "#f8fafc",
                }}
              >
                <h3 style={{ marginTop: 0 }}>QR Configuration</h3>
                {loadingPaymentConfig ? <p>Loading configuration...</p> : null}
                <div style={{ display: "grid", gap: "0.7rem" }}>
                  <input
                    type="text"
                    value={paymentConfigForm.title}
                    placeholder="Title"
                    onChange={(e) => handlePaymentConfigFieldChange("title", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  />
                  <input
                    type="text"
                    value={paymentConfigForm.account_name}
                    placeholder="Account Name"
                    onChange={(e) => handlePaymentConfigFieldChange("account_name", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  />
                  <input
                    type="text"
                    value={paymentConfigForm.account_number}
                    placeholder="Account Number / Wallet ID"
                    onChange={(e) => handlePaymentConfigFieldChange("account_number", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  />
                  <input
                    type="email"
                    value={paymentConfigForm.contact_email}
                    placeholder="Support Email"
                    onChange={(e) => handlePaymentConfigFieldChange("contact_email", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  />
                  <input
                    type="text"
                    value={paymentConfigForm.contact_phone}
                    placeholder="Support Phone"
                    onChange={(e) => handlePaymentConfigFieldChange("contact_phone", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  />
                  <input
                    type="url"
                    value={paymentConfigForm.qr_image_url}
                    placeholder="QR Image URL"
                    onChange={(e) => handlePaymentConfigFieldChange("qr_image_url", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  />
                  <textarea
                    rows={4}
                    value={paymentConfigForm.instructions}
                    placeholder="Instructions shown to students"
                    onChange={(e) => handlePaymentConfigFieldChange("instructions", e.target.value)}
                    style={{ padding: "0.6rem", borderRadius: "4px", border: "1px solid #d1d5db", resize: "vertical" }}
                  />
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.92rem" }}>
                    <input
                      type="checkbox"
                      checked={!!paymentConfigForm.is_active}
                      onChange={(e) => handlePaymentConfigFieldChange("is_active", !!e.target.checked)}
                    />
                    Active configuration
                  </label>
                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    <button className="btn btn-primary" onClick={handleSavePaymentConfig} disabled={savingPaymentConfig}>
                      {savingPaymentConfig ? "Saving..." : "Save QR Config"}
                    </button>
                    <button className="btn btn-secondary" onClick={() => void loadPaymentConfig()} disabled={loadingPaymentConfig}>
                      Refresh
                    </button>
                  </div>
                </div>
              </section>

              <section
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "1rem",
                }}
              >
                <h3 style={{ marginTop: 0 }}>Payment Approval Queue</h3>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setPaymentStatusFilter(nextValue);
                      void loadPaymentRequests(nextValue);
                    }}
                    style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                  >
                    <option value="pending_approval">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="all">All</option>
                  </select>
                  <button className="btn btn-secondary" onClick={() => void loadPaymentRequests(paymentStatusFilter)} disabled={loadingPaymentRequests}>
                    {loadingPaymentRequests ? "Loading..." : "Refresh Requests"}
                  </button>
                </div>

                {loadingPaymentRequests ? (
                  <p>Loading requests...</p>
                ) : paymentRequests.length === 0 ? (
                  <p style={{ color: "#64748b" }}>No requests found for selected filter.</p>
                ) : (
                  <div style={{ display: "grid", gap: "0.8rem" }}>
                    {paymentRequests.map((row) => {
                      const referenceId = row.reference_id;
                      const reviewingCurrent = reviewingPaymentReference === referenceId;
                      return (
                        <article
                          key={referenceId}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "0.85rem",
                            backgroundColor: "#f8fafc",
                          }}
                        >
                          <div style={{ display: "grid", gap: "0.35rem" }}>
                            <strong>{row?.exam_set_name || "Exam Set"}</strong>
                            <span>Student: {row?.student?.full_name || row?.student?.username || "-"}</span>
                            <span>Email: {row?.email || "-"}</span>
                            <span>Mobile: {row?.mobile_number || "-"}</span>
                            <span>Amount: NPR {row?.amount || "0.00"}</span>
                            <span>Status: {statusLabel(row?.status || "pending_approval")}</span>
                            <span>Reference: {row?.transaction_reference || referenceId}</span>
                            <span>Submitted: {formatNepalDateTime(row?.created_at)}</span>
                            {row?.payment_screenshot_url ? (
                              <a href={row.payment_screenshot_url} target="_blank" rel="noreferrer">
                                Open Screenshot Link
                              </a>
                            ) : null}
                            {row?.payer_note ? <span>Student Note: {row.payer_note}</span> : null}
                            {row?.admin_note ? <span>Admin Note: {row.admin_note}</span> : null}
                          </div>

                          {row?.status === "pending_approval" ? (
                            <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                              <textarea
                                rows={2}
                                value={paymentReviewDrafts?.[referenceId] || ""}
                                onChange={(e) => handlePaymentReviewDraftChange(referenceId, e.target.value)}
                                placeholder="Optional admin note"
                                style={{
                                  width: "100%",
                                  padding: "0.55rem",
                                  borderRadius: "4px",
                                  border: "1px solid #d1d5db",
                                  resize: "vertical",
                                }}
                              />
                              <div style={{ display: "flex", gap: "0.6rem" }}>
                                <button
                                  className="btn btn-primary"
                                  onClick={() => void handleReviewPaymentRequest(referenceId, "approve")}
                                  disabled={reviewingCurrent}
                                >
                                  {reviewingCurrent ? "Processing..." : "Approve"}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => void handleReviewPaymentRequest(referenceId, "reject")}
                                  disabled={reviewingCurrent}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {activeTab === "contributions" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Manage Contributions</h2>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              Approve, categorize, or delete user-submitted notes.
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
                    value={contributionStatusFilter}
                    onChange={(e) => setContributionStatusFilter(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div style={{ minWidth: "220px" }}>
                  <label style={{ display: "block", marginBottom: "0.35rem" }}>Branch</label>
                  <select
                    value={branch}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  >
                    {BRANCH_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    loadContributions(contributionStatusFilter, branch);
                    loadContributionCategories();
                  }}
                >
                  Load Contributions
                </button>
              </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "0.85rem",
                backgroundColor: "#f8fafc",
                marginBottom: "1.2rem",
              }}
            >
                <h4 style={{ marginBottom: "0.6rem" }}>Contribution Categories - {branch}</h4>
              {loadingContributionCategories ? (
                <p>Loading categories...</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "0.7rem" }}>
                  {contributionCategoryOptions.map((category) => (
                    <div
                      key={category}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "999px",
                        border: "1px solid #cbd5e1",
                        backgroundColor: "#ffffff",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                      }}
                    >
                      <span>{category}</span>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        style={{
                          padding: "0.2rem 0.5rem",
                          fontSize: "0.7rem",
                        }}
                        onClick={() => deleteContributionCategory(category)}
                        disabled={deletingContributionCategory === category}
                      >
                        {deletingContributionCategory === category ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ))}
                  {contributionCategoryOptions.length === 0 ? (
                    <span style={{ color: "#64748b" }}>No categories available.</span>
                  ) : null}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  <input
                    type="text"
                    placeholder={`New category for ${branch}`}
                    value={newContributionCategory}
                    onChange={(e) => setNewContributionCategory(e.target.value)}
                    style={{
                      flex: 1,
                    minWidth: "220px",
                    padding: "0.55rem",
                    borderRadius: "6px",
                    border: "1px solid #d4dbe6",
                  }}
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={createContributionCategory}
                  disabled={savingContributionCategory}
                >
                  {savingContributionCategory ? "Adding..." : "Add Category"}
                </button>
              </div>
            </div>

            {loadingContributions ? (
              <p>Loading contributions...</p>
            ) : contributions.length === 0 ? (
              <p>No contributions found.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {contributions.map((item) => {
                  const draft = contributionDrafts[item.id] || {
                    status: item.status || "pending",
                    category: item.category || "",
                  };
                  const isSavingCurrent = savingContributionId === item.id;
                  const isExpanded = Boolean(expandedContributionIds[item.id]);

                  return (
                    <article
                      key={item.id}
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
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <h4 style={{ marginBottom: "0.35rem" }}>{item.title || item.file_name || "Contribution"}</h4>
                          <p style={{ marginBottom: "0.2rem", color: "#334155" }}>
                            <strong>User:</strong> {item.contributor_name || item.contributor_username || "Unknown"}
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                          <span
                            style={{
                              ...statusPillStyle(draft.status),
                              padding: "0.2rem 0.6rem",
                              borderRadius: "999px",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                            }}
                          >
                            {statusLabel(draft.status)}
                          </span>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => toggleContributionDetails(item.id)}
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <>
                          <div
                            style={{
                              marginTop: "0.6rem",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.75rem",
                              color: "#475569",
                              fontSize: "0.9rem",
                            }}
                          >
                            <span>
                              <strong>Submitted:</strong>{" "}
                              {item.submitted_at ? formatNepalDateTime(item.submitted_at) : "N/A"}
                            </span>
                            <span>
                              <strong>Branch:</strong> {item.branch || "N/A"}
                            </span>
                          </div>

                          {item.file_url ? (
                            <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => window.open(item.file_url, "_blank", "noopener,noreferrer")}
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  const url = item.file_url.includes("?")
                                    ? `${item.file_url}&download=1`
                                    : `${item.file_url}?download=1`;
                                  window.open(url, "_blank", "noopener,noreferrer");
                                }}
                              >
                                Download
                              </button>
                            </div>
                          ) : null}

                          {item.description ? (
                            <p style={{ marginTop: "0.6rem", color: "#475569" }}>{item.description}</p>
                          ) : null}

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                              gap: "0.8rem",
                              marginTop: "0.8rem",
                            }}
                          >
                            <div>
                              <label style={{ display: "block", marginBottom: "0.35rem" }}>Status</label>
                              <select
                                value={draft.status}
                                onChange={(e) => updateContributionDraft(item.id, "status", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "0.55rem",
                                  borderRadius: "4px",
                                  border: "1px solid #d4dbe6",
                                }}
                              >
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: "block", marginBottom: "0.35rem" }}>Category</label>
                              <select
                                value={draft.category}
                                onChange={(e) => updateContributionDraft(item.id, "category", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "0.55rem",
                                  borderRadius: "4px",
                                  border: "1px solid #d4dbe6",
                                }}
                              >
                                <option value="">Select category</option>
                                {contributionCategoryOptions.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {Array.isArray(item.comments) && item.comments.length > 0 ? (
                            <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.4rem" }}>
                              {item.comments.map((comment) => (
                                <div
                                  key={comment.id || `${item.id}-${comment.user_name}`}
                                  style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                    padding: "0.45rem 0.6rem",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "0.5rem",
                                    backgroundColor: "#ffffff",
                                  }}
                                >
                                  <span>
                                    <strong>{comment.user_name || comment.user_username || "User"}:</strong>{" "}
                                    {comment.text}
                                  </span>
                                  {comment.id ? (
                                    <button
                                      className="btn btn-secondary"
                                      type="button"
                                      onClick={() => deleteContributionComment(comment.id)}
                                    >
                                      Delete
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div
                            style={{
                              marginTop: "0.85rem",
                              display: "flex",
                              gap: "0.6rem",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              className="btn btn-secondary"
                              onClick={() => deleteContribution(item.id)}
                              disabled={isSavingCurrent}
                            >
                              Delete
                            </button>
                            <button
                              className="btn btn-primary"
                              onClick={() => saveContribution(item)}
                              disabled={isSavingCurrent}
                            >
                              {isSavingCurrent ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </>
                      ) : null}
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
                              ? formatNepalDateTime(report.created_at)
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
                onChange={(e) => handleBranchChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                {BRANCH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
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
                {CONTENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Upload Folder Path (optional):
              </label>
              <input
                type="text"
                value={uploadFolderPath}
                onChange={(e) => setUploadFolderPath(e.target.value)}
                placeholder="/bridge4er/... (leave blank to use default folder)"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
              <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "0.4rem" }}>
                Use a full bucket path or a relative folder/subfolder name. Question files in Objective MCQs or Exam Hall
                are extracted automatically after upload.
              </p>
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
          </div>
        )}

        {/* Manage Files Panel */}
        {activeTab === "upload-files" && (
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              marginTop: "1.5rem",
            }}
          >
            <h2>Manage Files and Folders</h2>
            <div
              style={{
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1e3a8a",
                borderRadius: "8px",
                padding: "0.9rem",
                margin: "0.8rem 0 1.2rem",
                lineHeight: 1.5,
              }}
            >
              <strong>Admin flow:</strong> storage files are indexed into backend metadata, then the website reads
              that metadata. Sync Selected Type imports the selected section. Sync Folder Path imports one folder/file;
              for Objective MCQs and Exam Hall it also extracts questions. Delete removes the storage item and clears
              its website/database records.
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Select Branch:
              </label>
              <select
                value={branch}
                onChange={(e) => handleBranchChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                {BRANCH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Content Type:
              </label>
              <select
                value={manageContentType}
                onChange={(e) => {
                  setManageContentType(e.target.value);
                  setManagedFiles([]);
                }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                {CONTENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Folder/File Path to Sync:
              </label>
              <input
                type="text"
                value={syncPathInput}
                onChange={(e) => setSyncPathInput(e.target.value)}
                placeholder="/bridge4er/Civil Engineering/Objective MCQs/... or a relative path"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "1rem" }}>
              <button
                onClick={handleLoadManagedFiles}
                className="btn btn-primary"
                disabled={syncingManagedContent}
              >
                {MANAGED_CONTENT_TYPES_WITH_DIRS.has(manageContentType) ? "Load Files and Folders" : "Load Files"}
              </button>
              <button
                onClick={() => handleSyncManagedContent(false)}
                className="btn btn-secondary"
                disabled={syncingManagedContent}
              >
                {syncingManagedContent ? "Syncing..." : "Sync Selected Type"}
              </button>
              <button
                onClick={() => handleSyncManagedContent(true)}
                className="btn btn-secondary"
                disabled={syncingManagedContent}
              >
                {syncingManagedContent ? "Syncing..." : "Sync All Content Types"}
              </button>
              <button
                onClick={handleResetManagedContent}
                className="btn btn-secondary"
                disabled={resettingManagedContent}
              >
                {resettingManagedContent ? "Clearing..." : "Clear Loaded Content"}
              </button>
              <button
                onClick={handleCreateManagedFolder}
                className="btn btn-secondary"
                disabled={syncingManagedContent}
              >
                Create Folder
              </button>
              <button
                onClick={handleSyncManagedPath}
                className="btn btn-secondary"
                disabled={syncingManagedContent || !syncPathInput.trim()}
              >
                Sync Folder Path
              </button>
              <button
                onClick={handleAttachManagedPath}
                className="btn btn-secondary"
                disabled={syncingManagedContent}
              >
                Attach Storage File
              </button>
            </div>

            {loadingManagedFiles ? (
              <p>Loading files...</p>
            ) : managedFiles.length === 0 ? (
              <p>No files loaded yet.</p>
            ) : (
              <ul className="file-list">
                {managedFiles.map((f) => {
                  const isDirectory = !!f.is_dir;
                  const supportsVisibility = true;
                  const isSavingVisibility = savingManagedFilePath === f.path;
                  return (
                    <li key={f.path} className="file-item">
                      <div className="file-info">
                        <div className="file-details">
                          <h4>{f.display_name || f.name}</h4>
                          <p>{f.path}</p>
                          <p
                            style={{
                              marginTop: "0.3rem",
                              fontSize: "0.85rem",
                              color: isDirectory
                                ? "#1d4ed8"
                                : f.is_visible
                                ? "#047857"
                                : "#b91c1c",
                            }}
                          >
                            {isDirectory
                              ? f.is_visible
                                ? "Folder (Visible on website)"
                                : "Folder (Hidden from website)"
                              : f.is_visible
                              ? "Visible on website"
                              : "Hidden from website"}
                          </p>
                        </div>
                      </div>
                      <div className="file-actions">
                        {supportsVisibility ? (
                          f.is_visible ? (
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleSetManagedFileVisibility(f.path, false, isDirectory)}
                              disabled={isSavingVisibility}
                            >
                              {isSavingVisibility ? "Saving..." : "Hide"}
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleSetManagedFileVisibility(f.path, true, isDirectory)}
                              disabled={isSavingVisibility}
                            >
                              {isSavingVisibility ? "Saving..." : "Show on Website"}
                            </button>
                          )
                        ) : null}
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleEditManagedMetadata(f)}
                          disabled={isSavingVisibility}
                        >
                          Edit Display
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleRenameManagedPath(f)}
                          disabled={isSavingVisibility}
                        >
                          Rename Path
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleDeleteManagedFile(f.path)}
                          disabled={isSavingVisibility}
                        >
                          {isDirectory ? "Delete Folder" : "Delete"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
