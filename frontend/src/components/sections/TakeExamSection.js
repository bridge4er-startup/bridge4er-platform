import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listExamSets } from "../../services/examService";
import API from "../../services/api";
import { initiateEsewaPayment, initiateKhaltiPayment } from "../../services/paymentService";
import toast from "react-hot-toast";
import TimedLoadingState from "../common/TimedLoadingState";
import { getInstitutionIcon, getSubjectIcon } from "../../utils/subjectIcons";

const EXAM_TYPE_CONTENT = {
  subjective: {
    title: "Subjective Exam",
    icon: "fas fa-pen-fancy",
    description: "Display all questions at once and submit scanned PDF answer sheet.",
  },
  mcq: {
    title: "Multiple Choice Exam",
    icon: "fas fa-question-circle",
    description: "Question-by-question mode with negative timer and auto submit.",
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

export default function TakeExamSection({ branch = "Civil Engineering", isActive = false }) {
  const [setsByType, setSetsByType] = useState({ mcq: [], subjective: [] });
  const [folderEntriesByType, setFolderEntriesByType] = useState({ mcq: [], subjective: [] });
  const [loadingByType, setLoadingByType] = useState({ mcq: false, subjective: false });
  const [typeLoaded, setTypeLoaded] = useState({ mcq: false, subjective: false });
  const [folderPathByType, setFolderPathByType] = useState({ mcq: [], subjective: [] });
  const [selectedExamType, setSelectedExamType] = useState("");
  const [paying, setPaying] = useState(false);
  const [selectedSet, setSelectedSet] = useState(null);
  const [paymentGateway, setPaymentGateway] = useState("esewa");
  const [paymentForm, setPaymentForm] = useState({
    mobile_number: "",
    email: "",
  });

  const loadSetType = async (type, force = false) => {
    if (!force && typeLoaded[type]) return;

    setLoadingByType((prev) => ({ ...prev, [type]: true }));
    try {
      const contentType = type === "mcq" ? "take_exam_mcq" : "take_exam_subjective";
      const [data, folderRes] = await Promise.all([
        listExamSets(branch, type, true),
        API.get("storage/files/list/", {
          params: {
            content_type: contentType,
            branch,
            include_dirs: true,
            refresh: true,
          },
        }),
      ]);
      const normalized = (data || []).map((setItem) => ({
        ...setItem,
        folder_parts: normalizeFolderParts(setItem.folder_parts),
      }));
      setSetsByType((prev) => ({ ...prev, [type]: normalized }));

      const folders = (folderRes?.data || [])
        .filter((entry) => !!entry?.is_dir)
        .map((entry) => ({
          ...entry,
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
  }, [branch, isActive]);

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
    setPaymentGateway("esewa");
    setPaymentForm({
      mobile_number: "",
      email: "",
    });
  };

  const submitGatewayPostForm = (url, fields) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.style.display = "none";
    Object.entries(fields || {}).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value ?? "");
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  const unlockSet = async () => {
    if (!selectedSet) return;

    const email = paymentForm.email.trim();
    const mobile = paymentForm.mobile_number.trim();

    if (!email) {
      toast.error("Enter email address for payment");
      return;
    }
    if (!mobile) {
      toast.error("Enter mobile number for payment");
      return;
    }

    const payload = {
      exam_set_id: selectedSet.id,
      email,
      mobile_number: mobile,
    };

    try {
      setPaying(true);
      let paymentSession;
      if (paymentGateway === "esewa") {
        paymentSession = await initiateEsewaPayment(payload);
      } else if (paymentGateway === "khalti") {
        paymentSession = await initiateKhaltiPayment(payload);
      } else {
        toast.error("Unsupported payment gateway.");
        return;
      }

      if (paymentSession?.method === "POST" && paymentSession?.payment_url && paymentSession?.form_fields) {
        toast.success("Redirecting to eSewa...");
        submitGatewayPostForm(paymentSession.payment_url, paymentSession.form_fields);
        return;
      }

      if (paymentSession?.payment_url) {
        toast.success("Redirecting to payment gateway...");
        window.location.assign(paymentSession.payment_url);
        return;
      }

      toast.error("Payment session creation failed.");
    } catch (error) {
      const message = error?.response?.data?.error || "Payment initialization failed.";
      toast.error(message);
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

        <div className="set-actions">
          {isUnlocked ? (
            <Link className="btn btn-primary start-exam-btn-compact" to={`/exam/${routeBase}/${encodeURIComponent(branch)}/${setItem.id}`}>
              Start {type === "mcq" ? "MCQ" : "Subjective"} Exam
            </Link>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedSet({ ...setItem, exam_type: type, display_name: displayName })}
            >
              Unlock by Payment
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

  const currentLoading = selectedExamType ? loadingByType[selectedExamType] : false;
  const currentFolderParts = selectedExamType ? folderPathByType[selectedExamType] || [] : [];

  const folderView = useMemo(() => {
    if (!selectedExamType) {
      return { folders: [], sets: [] };
    }

    const folderMap = new Map();
    const directSets = [];

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
        folderMap.set(key, {
          key,
          name: folderName,
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
          folderMap.set(key, {
            key,
            name: folderName,
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

    const folders = [...folderMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    directSets.sort((a, b) => getSetDisplayName(a).localeCompare(getSetDisplayName(b)));

    return { folders, sets: directSets };
  }, [allSetsForCurrentType, currentFolderParts, folderEntriesForCurrentType, selectedExamType]);

  const openFolder = (parts) => {
    if (!selectedExamType) return;
    setFolderPathByType((prev) => ({ ...prev, [selectedExamType]: parts }));
  };

  const breadcrumbParts = [EXAM_TYPE_CONTENT[selectedExamType]?.title || "Exam Sets", ...currentFolderParts];

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
              <article key={type} className="exam-type-card exam-type-selectable">
                <div className="exam-type-icon">
                  <i className={content.icon}></i>
                </div>
                <div className="exam-type-info">
                  <h3>{content.title}</h3>
                  <p>{content.description}</p>
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
                    <div key={folder.key} className="subject-card folder-card exam-folder-card">
                      <i
                        className={
                          currentFolderParts.length === 0
                            ? getInstitutionIcon(folder.name, "fas fa-building-columns")
                            : getSubjectIcon(folder.name, "fas fa-folder-open")
                        }
                      ></i>
                      <h3 className="folder-display-name">{folder.name}</h3>
                      <p className="chapter-small-note">{folder.count} sets</p>
                      <button className="btn btn-primary mcq-folder-open-btn" onClick={() => openFolder(folder.parts)}>
                        Open Folder
                      </button>
                    </div>
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

            <div className="gateway-options-grid">
              <button
                className={`gateway-option ${paymentGateway === "esewa" ? "selected" : ""}`}
                onClick={() => setPaymentGateway("esewa")}
                type="button"
              >
                <i className="fas fa-wallet"></i>
                <span>eSewa</span>
              </button>
              <button
                className={`gateway-option ${paymentGateway === "khalti" ? "selected" : ""}`}
                onClick={() => setPaymentGateway("khalti")}
                type="button"
              >
                <i className="fas fa-money-check-dollar"></i>
                <span>Khalti</span>
              </button>
            </div>

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
              <div className="full-width">You will be redirected to the selected payment gateway to complete payment.</div>
            </div>

            <div className="payment-modal-actions">
              <button className="btn btn-secondary" onClick={closePayment} disabled={paying}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={unlockSet} disabled={paying}>
                {paying ? "Preparing Payment..." : "Proceed to Payment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
