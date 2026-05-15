import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listExamSets } from "../../services/examService";
import { cachedGet } from "../../services/api";
import {
  getMyPaymentRequests,
  getQRCodePaymentConfig,
  submitManualPaymentRequest,
} from "../../services/paymentService";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import TimedLoadingState from "../common/TimedLoadingState";
import { getInstitutionIcon, getSubjectIcon } from "../../utils/subjectIcons";

const EXAM_TYPE_CONTENT = {
  subjective: {
    title: "Subjective Exam",
    icon: "fas fa-pen-fancy",
    features: [
      { icon: "fas fa-file-lines", tone: "feature-indigo", text: "Real Question Papers" },
      { icon: "fas fa-stopwatch-20", tone: "feature-amber", text: "Negative Timer" },
      { icon: "fas fa-laptop-code", tone: "feature-sky", text: "Practice Exam in real time simulation" },
      { icon: "fas fa-cloud-arrow-up", tone: "feature-emerald", text: "Upload your answers within time limit" },
      { icon: "fas fa-comments", tone: "feature-rose", text: "Get peer review, comments and score within a week" },
    ],
  },
  mcq: {
    title: "Multiple Choice Exam",
    icon: "fas fa-question-circle",
    features: [
      { icon: "fas fa-desktop", tone: "feature-sky", text: "Computer Based Exam" },
      { icon: "fas fa-triangle-exclamation", tone: "feature-orange", text: "Negative Timer, Negative Marking" },
      { icon: "fas fa-square-check", tone: "feature-emerald", text: "Get your score on submission" },
      { icon: "fas fa-clipboard-check", tone: "feature-indigo", text: "Review your answers" },
      { icon: "fas fa-ranking-star", tone: "feature-rose", text: "Leaderboard" },
    ],
  },
};

function toMinutes(seconds = 0) {
  return Math.max(1, Math.floor(Number(seconds || 0) / 60));
}

function getRelativeExamParts(path = "", type = "mcq") {
  const segments = String(path || "").split("/").filter(Boolean);
  const lowered = segments.map((segment) => segment.toLowerCase());
  const marker = type === "mcq" ? ["take exam", "multiple choice exam"] : ["take exam", "subjective exam"];
  for (let index = 0; index <= lowered.length - marker.length; index += 1) {
    if (lowered[index] === marker[0] && lowered[index + 1] === marker[1]) {
      return segments.slice(index + marker.length);
    }
  }
  return [];
}

function normalizeFolderParts(folderParts) {
  if (Array.isArray(folderParts)) {
    return folderParts.map((part) => String(part || "").trim()).filter(Boolean);
  }
  if (typeof folderParts === "string") {
    return folderParts
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function startsWithParts(parts = [], prefix = []) {
  if (prefix.length > parts.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (parts[index] !== prefix[index]) return false;
  }
  return true;
}

function getSetDisplayName(setItem) {
  return setItem?.display_name || setItem?.source_file_name || setItem?.name || "Exam Set";
}

function byExamSetOrder(a, b) {
  const aOrder = Number(a?.display_order || 0);
  const bOrder = Number(b?.display_order || 0);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return getSetDisplayName(a).localeCompare(getSetDisplayName(b));
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

function getLatestRequestBySet(paymentRequests = [], setId) {
  const rows = (paymentRequests || []).filter((row) => Number(row?.exam_set_id) === Number(setId));
  if (!rows.length) return null;
  return rows[0];
}

function labelFromPaymentStatus(statusText) {
  const normalized = String(statusText || "").trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "pending_approval") return "Pending Approval";
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function TakeExamSection({ branch = "Civil Engineering", isActive = false }) {
  const { user } = useAuth();
  const [setsByType, setSetsByType] = useState({ mcq: [], subjective: [] });
  const [folderEntriesByType, setFolderEntriesByType] = useState({ mcq: [], subjective: [] });
  const [loadingByType, setLoadingByType] = useState({ mcq: false, subjective: false });
  const [typeLoaded, setTypeLoaded] = useState({ mcq: false, subjective: false });
  const [folderPathByType, setFolderPathByType] = useState({ mcq: [], subjective: [] });
  const [selectedExamType, setSelectedExamType] = useState("");
  const [paying, setPaying] = useState(false);
  const [selectedSet, setSelectedSet] = useState(null);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [loadingPaymentConfig, setLoadingPaymentConfig] = useState(false);
  const [myPaymentRequests, setMyPaymentRequests] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    mobile_number: "",
    email: "",
    transaction_reference: "",
    payment_screenshot_url: "",
    payer_note: "",
  });

  const loadSetType = async (type, force = false) => {
    if (!force && typeLoaded[type]) return;

    setLoadingByType((prev) => ({ ...prev, [type]: true }));
    try {
      const contentType = type === "mcq" ? "take_exam_mcq" : "take_exam_subjective";
      const [data, folderRes] = await Promise.all([
        listExamSets(branch, type),
        cachedGet("storage/files/list/", {
          params: {
            content_type: contentType,
            branch,
            include_dirs: true,
            prefer_metadata: true,
            metadata_only: true,
          },
          persistCache: true,
        }),
      ]);
      const normalized = (data || []).map((setItem) => ({
        ...setItem,
        folder_parts: normalizeFolderParts(setItem.folder_parts),
        folder_display_parts: normalizeFolderParts(setItem.folder_display_parts || setItem.folder_parts),
      }));
      setSetsByType((prev) => ({ ...prev, [type]: normalized }));

      const folders = (folderRes?.data || [])
        .filter((entry) => !!entry?.is_dir)
        .map((entry) => ({
          ...entry,
          display_name: entry.display_name || entry.name,
          icon_url: entry.icon_url || "",
          sort_order: Number(entry.sort_order || 0),
          folder_parts: getRelativeExamParts(entry.path || "", type),
        }))
        .filter((entry) => entry.folder_parts.length > 0);
      setFolderEntriesByType((prev) => ({ ...prev, [type]: folders }));

      setTypeLoaded((prev) => ({ ...prev, [type]: true }));
      setFolderPathByType((prev) => ({ ...prev, [type]: [] }));
    } catch (_error) {
      toast.error(`Failed to load ${type.toUpperCase()} exam sets`);
    } finally {
      setLoadingByType((prev) => ({ ...prev, [type]: false }));
    }
  };

  useEffect(() => {
    if (!isActive) return;
    setSetsByType({ mcq: [], subjective: [] });
    setFolderEntriesByType({ mcq: [], subjective: [] });
    setLoadingByType({ mcq: false, subjective: false });
    setTypeLoaded({ mcq: false, subjective: false });
    setFolderPathByType({ mcq: [], subjective: [] });
    setSelectedExamType("");
    setSelectedSet(null);
    setPaymentConfig(null);
    setMyPaymentRequests([]);
  }, [branch, isActive]);

  useEffect(() => {
    if (!isActive || !user) return;
    const bootstrapRequests = async () => {
      try {
        const rows = await getMyPaymentRequests("all");
        setMyPaymentRequests(Array.isArray(rows) ? rows : []);
      } catch (_error) {
        // Ignore background refresh errors.
      }
    };
    bootstrapRequests();
  }, [isActive, user]);

  const selectType = async (type) => {
    setSelectedExamType(type);
    await loadSetType(type);
  };

  const updatePaymentField = (field, value) => {
    setPaymentForm((prev) => ({ ...prev, [field]: value }));
  };

  const closePayment = () => {
    if (paying) return;
    setSelectedSet(null);
    setPaymentConfig(null);
    setPaymentForm({
      mobile_number: "",
      email: "",
      transaction_reference: "",
      payment_screenshot_url: "",
      payer_note: "",
    });
  };

  const openPayment = async (setItem, type) => {
    setSelectedSet({ ...setItem, exam_type: type, display_name: getSetDisplayName(setItem) });
    setPaymentForm({
      email: String(user?.email || "").trim(),
      mobile_number: String(user?.mobile_number || "").trim(),
      transaction_reference: "",
      payment_screenshot_url: "",
      payer_note: "",
    });
    setLoadingPaymentConfig(true);
    try {
      const [config, myRequests] = await Promise.all([getQRCodePaymentConfig(), getMyPaymentRequests("all")]);
      setPaymentConfig(config || null);
      setMyPaymentRequests(Array.isArray(myRequests) ? myRequests : []);
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to load payment instructions.";
      toast.error(message);
    } finally {
      setLoadingPaymentConfig(false);
    }
  };

  const unlockSet = async () => {
    if (!selectedSet) return;

    const email = paymentForm.email.trim();
    const mobile = paymentForm.mobile_number.trim();
    const transactionReference = paymentForm.transaction_reference.trim();

    if (!email) {
      toast.error("Enter email address for payment");
      return;
    }
    if (!mobile) {
      toast.error("Enter mobile number for payment");
      return;
    }

    const profileEmail = normalizeEmail(user?.email);
    const profileMobile = normalizeMobile(user?.mobile_number);
    if (!profileEmail || !profileMobile) {
      toast.error("Update your profile email and mobile number before payment.");
      return;
    }

    if (normalizeEmail(email) !== profileEmail || normalizeMobile(mobile) !== profileMobile) {
      toast.error("Email and mobile number must match your profile details.");
      return;
    }
    if (!transactionReference) {
      toast.error("Enter payment transaction/reference ID.");
      return;
    }

    const payload = {
      exam_set_id: selectedSet.id,
      email,
      mobile_number: mobile,
      transaction_reference: transactionReference,
      payment_screenshot_url: paymentForm.payment_screenshot_url.trim(),
      payer_note: paymentForm.payer_note.trim(),
    };

    try {
      setPaying(true);
      const response = await submitManualPaymentRequest(payload);
      toast.success(response?.message || "Payment request submitted.");
      const myRequests = await getMyPaymentRequests("all");
      setMyPaymentRequests(Array.isArray(myRequests) ? myRequests : []);
      setPaymentForm((prev) => ({
        ...prev,
        transaction_reference: "",
        payment_screenshot_url: "",
        payer_note: "",
      }));
    } catch (error) {
      const message = error?.response?.data?.error || "Payment request submission failed.";
      toast.error(message);
      const requestRow = error?.response?.data?.request;
      if (requestRow?.status === "pending_approval") {
        setMyPaymentRequests((prev) => [requestRow, ...(prev || []).filter((row) => row.reference_id !== requestRow.reference_id)]);
      }
    } finally {
      setPaying(false);
    }
  };

  const renderSetCard = (setItem, type) => {
    const routeBase = type === "mcq" ? "mcq" : "subjective";
    const isUnlocked = !!setItem.is_unlocked || !!setItem.is_free;
    const totalMarks = Number(setItem.total_marks || setItem.question_count || 0);
    const feeLabel = setItem.is_free ? "FREE" : `NPR ${setItem.fee}`;
    const displayName = getSetDisplayName(setItem);
    const latestRequest = getLatestRequestBySet(myPaymentRequests, setItem.id);
    const hasPendingRequest = latestRequest?.status === "pending_approval";
    const isRejectedRequest = latestRequest?.status === "rejected";

    return (
      <article
        key={setItem.id}
        className={`exam-set-card detailed-set-card ${isUnlocked ? "" : "locked"} ${
          setItem.is_free ? "free" : "paid"
        }`}
      >
        <div className={`floating-price-tag ${setItem.is_free ? "free" : "paid"}`}>{feeLabel}</div>
        {!isUnlocked ? (
          <span className="floating-lock-icon" title="Locked">
            <i className="fas fa-lock"></i>
          </span>
        ) : null}

        <h4>{displayName}</h4>

        <p className="set-meta-inline">
          <small>
            Time: {toMinutes(setItem.duration_seconds)} min | Total Marks: {totalMarks}
          </small>
        </p>
        {latestRequest ? (
          <p className="set-meta-inline">
            <small>Latest payment request: {labelFromPaymentStatus(latestRequest.status)}</small>
          </p>
        ) : null}

        <div className="set-actions">
          {isUnlocked ? (
            <Link className="btn btn-primary start-exam-btn-compact" to={`/exam/${routeBase}/${encodeURIComponent(branch)}/${setItem.id}`}>
              Start {type === "mcq" ? "MCQ" : "Subjective"} Exam
            </Link>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={() => {
                void openPayment(setItem, type);
              }}
            >
              {hasPendingRequest ? "View Payment Status" : isRejectedRequest ? "Retry Payment Request" : "Unlock by QR Payment"}
            </button>
          )}
        </div>
      </article>
    );
  };

  const allSetsForCurrentType = useMemo(() => {
    if (!selectedExamType) return [];
    return setsByType[selectedExamType] || [];
  }, [selectedExamType, setsByType]);
  const folderEntriesForCurrentType = useMemo(() => {
    if (!selectedExamType) return [];
    return folderEntriesByType[selectedExamType] || [];
  }, [selectedExamType, folderEntriesByType]);
  const institutionDisplayByType = useMemo(() => {
    const output = { mcq: new Map(), subjective: new Map() };
    ["mcq", "subjective"].forEach((type) => {
      (setsByType[type] || []).forEach((setItem) => {
        const raw = normalizeFolderParts(setItem.folder_parts || []);
        const display = normalizeFolderParts(setItem.folder_display_parts || raw);
        if (!raw.length || !display.length) return;
        const key = raw[0];
        if (!output[type].has(key)) {
          output[type].set(key, display[0]);
        }
      });
    });
    return output;
  }, [setsByType]);

  const currentLoading = selectedExamType ? loadingByType[selectedExamType] : false;
  const currentFolderParts = selectedExamType ? folderPathByType[selectedExamType] || [] : [];
  const institutionDisplayMap = selectedExamType ? institutionDisplayByType[selectedExamType] || new Map() : new Map();

  const folderView = useMemo(() => {
    if (!selectedExamType) {
      return { folders: [], sets: [] };
    }

    const folderMap = new Map();
    const folderMetaByKey = new Map();
    const directSets = [];

    folderEntriesForCurrentType.forEach((folderEntry) => {
      const folderParts = normalizeFolderParts(folderEntry.folder_parts);
      if (!folderParts.length) return;
      const key = folderParts.join("/");
      folderMetaByKey.set(key, {
        display_name: folderEntry.display_name || folderParts[folderParts.length - 1],
        icon_url: folderEntry.icon_url || "",
        sort_order: Number(folderEntry.sort_order || 0),
      });
    });

    folderEntriesForCurrentType.forEach((folderEntry) => {
      const folderParts = normalizeFolderParts(folderEntry.folder_parts);
      if (!startsWithParts(folderParts, currentFolderParts)) {
        return;
      }
      const remainder = folderParts.slice(currentFolderParts.length);
      if (remainder.length === 0) {
        return;
      }
      const folderName = remainder[0];
      const key = [...currentFolderParts, folderName].join("/");
      if (!folderMap.has(key)) {
        const meta = folderMetaByKey.get(key) || {};
        folderMap.set(key, {
          key,
          name: folderName,
          display_name: meta.display_name || folderName,
          icon_url: meta.icon_url || "",
          sort_order: Number(meta.sort_order || 0),
          parts: [...currentFolderParts, folderName],
          count: 0,
        });
      }
      const current = folderMap.get(key);
      current.count += 1;
    });

    allSetsForCurrentType.forEach((setItem) => {
      const folderParts = normalizeFolderParts(setItem.folder_parts);
      if (!startsWithParts(folderParts, currentFolderParts)) {
        return;
      }

      const remainder = folderParts.slice(currentFolderParts.length);
      if (remainder.length > 0) {
        const folderName = remainder[0];
        const key = [...currentFolderParts, folderName].join("/");
        if (!folderMap.has(key)) {
          const meta = folderMetaByKey.get(key) || {};
          folderMap.set(key, {
            key,
            name: folderName,
            display_name: meta.display_name || folderName,
            icon_url: meta.icon_url || "",
            sort_order: Number(meta.sort_order || 0),
            parts: [...currentFolderParts, folderName],
            count: 0,
          });
        }
        const current = folderMap.get(key);
        current.count += 1;
        return;
      }

      directSets.push(setItem);
    });

    const folders = [...folderMap.values()].sort((a, b) => {
      const aOrder = Number(a.sort_order || 0);
      const bOrder = Number(b.sort_order || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.display_name || a.name || "").localeCompare(String(b.display_name || b.name || ""));
    });
    directSets.sort(byExamSetOrder);

    return { folders, sets: directSets };
  }, [allSetsForCurrentType, currentFolderParts, folderEntriesForCurrentType, selectedExamType]);

  const openFolder = (parts) => {
    if (!selectedExamType) return;
    setFolderPathByType((prev) => ({ ...prev, [selectedExamType]: parts }));
  };

  const breadcrumbParts = [EXAM_TYPE_CONTENT[selectedExamType]?.title || "Exam Sets"];
  currentFolderParts.forEach((part, index) => {
    if (index === 0) {
      breadcrumbParts.push(institutionDisplayMap.get(part) || part);
      return;
    }
    breadcrumbParts.push(part);
  });
  const selectedSetPaymentRequest = getLatestRequestBySet(myPaymentRequests, selectedSet?.id);
  const isSelectedSetPendingApproval = selectedSetPaymentRequest?.status === "pending_approval";

  return (
    <section id="exam-hall" className={`section exam-hall-modern ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-file-alt"></i> Exam Hall
        <span className="field-indicator" id="exam-field-indicator">
          {branch}
        </span>
      </h2>

      {!selectedExamType ? (
        <div className="exam-type-selector-panel">
          <h3>Select Exam Type</h3>
          <div className="exam-type-grid">
            {Object.entries(EXAM_TYPE_CONTENT).map(([type, content]) => (
              <article
                key={type}
                className="exam-type-card exam-type-selectable"
                role="button"
                tabIndex={0}
                onClick={() => selectType(type)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectType(type);
                  }
                }}
              >
                <div className="exam-type-info">
                  <div className="exam-type-head">
                    <div className="exam-type-icon">
                      <i className={content.icon}></i>
                    </div>
                    <h3>{content.title}</h3>
                  </div>
                  <ul className="exam-type-feature-list">
                    {(content.features || []).map((feature) => (
                      <li key={feature.text}>
                        <span className={`exam-feature-icon ${feature.tone || "feature-sky"}`}>
                          <i className={feature.icon}></i>
                        </span>
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="btn btn-primary" onClick={() => selectType(type)} disabled={loadingByType[type]}>
                    {loadingByType[type] ? "Loading Sets..." : `Choose ${type.toUpperCase()} Exam`}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="exam-set-selection-container">
          <div className="exam-list-header">
            <button className="btn btn-secondary btn-soft-blue-action" onClick={() => setSelectedExamType("")}> 
              <i className="fas fa-arrow-left"></i> Back to Exam Types
            </button>
            <h3>{EXAM_TYPE_CONTENT[selectedExamType].title} Sets</h3>
          </div>

          {!currentLoading ? (
            <div className="exam-breadcrumbs">
              {breadcrumbParts.map((crumb, index) => {
                const isLast = index === breadcrumbParts.length - 1;
                const target = currentFolderParts.slice(0, Math.max(0, index));
                return (
                  <button
                    key={`${crumb}-${index}`}
                    type="button"
                    className={`library-breadcrumb-btn ${isLast ? "active" : ""}`}
                    onClick={() => openFolder(target)}
                    disabled={isLast}
                  >
                    {crumb}
                  </button>
                );
              })}
            </div>
          ) : null}

          {currentLoading ? (
            <TimedLoadingState baseMessage="Loading question sets..." />
          ) : folderView.folders.length > 0 || folderView.sets.length > 0 ? (
            <>
              {folderView.folders.length > 0 ? (
                <div className="subject-grid exam-folder-grid">
                  {folderView.folders.map((folder) => (
                    <button
                      key={folder.key}
                      type="button"
                      className="subject-card folder-card exam-folder-card"
                      onClick={() => openFolder(folder.parts)}
                    >
                      <div className="exam-folder-icon">
                        {folder.icon_url ? (
                          <img src={folder.icon_url} alt="" className="exam-folder-icon-img" />
                        ) : (
                          <i
                            className={
                              currentFolderParts.length === 0
                                ? getInstitutionIcon(folder.name, "fas fa-building-columns")
                                : getSubjectIcon(folder.name, "fas fa-folder-open")
                            }
                          ></i>
                        )}
                      </div>
                      <h3 className="folder-display-name">
                        {folder.display_name
                          || (currentFolderParts.length === 0
                            ? institutionDisplayMap.get(folder.name) || folder.name
                            : folder.name)}
                      </h3>
                      <p className="chapter-small-note">{folder.count} sets</p>
                      <span className="library-folder-action">Open Folder</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {folderView.sets.length > 0 ? (
                <div className="exam-set-grid">{folderView.sets.map((setItem) => renderSetCard(setItem, selectedExamType))}</div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h4>No sets found</h4>
            </div>
          )}
        </div>
      )}

      {selectedSet ? (
        <div className="payment-overlay">
          <div className="payment-modal-content professional-payment-modal">
            <div className="payment-modal-head">
              <h3>Unlock {selectedSet.display_name || selectedSet.name}</h3>
              <button className="btn" onClick={closePayment} disabled={paying}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <div className="payment-summary">
              <div>
                <span>Quoted Amount</span>
                <strong>NPR {selectedSet.fee}</strong>
              </div>
              <div>
                <span>Exam Type</span>
                <strong>{(selectedSet.exam_type || selectedExamType || "mcq").toUpperCase()}</strong>
              </div>
            </div>

            {loadingPaymentConfig ? (
              <div className="payment-form-grid">
                <div className="full-width">Loading QR payment instructions...</div>
              </div>
            ) : (
              <div className="payment-form-grid">
                <div className="full-width qr-visual">
                  <strong>{paymentConfig?.title || "Bridge4ER Official Payment QR"}</strong>
                  {paymentConfig?.qr_image_url ? (
                    <img src={paymentConfig.qr_image_url} alt="Payment QR" className="payment-qr-image" />
                  ) : (
                    <div className="qr-pattern" aria-label="QR placeholder"></div>
                  )}
                  <p>{paymentConfig?.instructions || "Contact admin for payment instructions."}</p>
                </div>
                <div className="full-width payment-meta-grid">
                  <span><strong>Account Name:</strong> {paymentConfig?.account_name || "-"}</span>
                  <span><strong>Account Number:</strong> {paymentConfig?.account_number || "-"}</span>
                  <span><strong>Support Email:</strong> {paymentConfig?.contact_email || "-"}</span>
                  <span><strong>Support Phone:</strong> {paymentConfig?.contact_phone || "-"}</span>
                </div>
              </div>
            )}

            {selectedSetPaymentRequest ? (
              <div className="payment-request-status-banner">
                <strong>Latest Request: {labelFromPaymentStatus(selectedSetPaymentRequest.status)}</strong>
                <span>Reference: {selectedSetPaymentRequest.transaction_reference || selectedSetPaymentRequest.reference_id}</span>
                {selectedSetPaymentRequest.admin_note ? (
                  <span>Admin Note: {selectedSetPaymentRequest.admin_note}</span>
                ) : null}
              </div>
            ) : null}

            <div className="payment-form-grid">
              <label>
                Email Address
                <input
                  type="email"
                  placeholder="student@email.com"
                  value={paymentForm.email}
                  onChange={(e) => updatePaymentField("email", e.target.value)}
                />
              </label>
              <label>
                Mobile Number
                <input
                  type="text"
                  placeholder="98XXXXXXXX"
                  value={paymentForm.mobile_number}
                  onChange={(e) => updatePaymentField("mobile_number", e.target.value)}
                />
              </label>
              <label>
                Transaction / UTR ID
                <input
                  type="text"
                  placeholder="eg. 4C9F82X1"
                  value={paymentForm.transaction_reference}
                  onChange={(e) => updatePaymentField("transaction_reference", e.target.value)}
                />
              </label>
              <label>
                Screenshot URL (Optional)
                <input
                  type="url"
                  placeholder="https://..."
                  value={paymentForm.payment_screenshot_url}
                  onChange={(e) => updatePaymentField("payment_screenshot_url", e.target.value)}
                />
              </label>
              <label className="full-width">
                Note (Optional)
                <textarea
                  placeholder="Any extra payment detail for admin verification"
                  value={paymentForm.payer_note}
                  onChange={(e) => updatePaymentField("payer_note", e.target.value)}
                  rows={3}
                />
              </label>
              <div className="full-width">
                Enter profile-matching email/mobile and your payment reference. Admin approval unlocks this set permanently.
              </div>
            </div>

            <div className="payment-modal-actions">
              <button className="btn btn-secondary" onClick={closePayment} disabled={paying}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={unlockSet}
                disabled={paying || loadingPaymentConfig || !paymentConfig?.has_config || isSelectedSetPendingApproval}
              >
                {isSelectedSetPendingApproval
                  ? "Awaiting Admin Approval"
                  : paying
                    ? "Submitting Request..."
                    : "Submit Payment Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
