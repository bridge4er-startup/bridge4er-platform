
const STORAGE_KEY = "bbdmp_cm_v1";
const API_ENDPOINT = "/api/store";
const UPLOAD_ENDPOINT = "/api/upload";
const REMOTE_SAVE_DELAY = 600;

const baseStore = {
  dailyReports: {},
  structureEntries: [],
  labData: {}
};

const optionSets = {
  fields: new Set(["Civil", "HM", "EM"]),
  majorWorks: new Set(["Excavation", "Concrete", "Drilling", "Shotcrete", "Coffer Dam"]),
  sites: new Set(["Headworks", "Powerhouse"]),
  structures: new Set(["Spillway", "Gravel Trap", "Settling Basin"]),
  subStructures: new Set(["Pier-1", "Pier-2", "SB-Block-9"]),
  concreteGrades: new Set(["M20", "M25", "M30", "M35"]),
  toOptions: new Set(),
  subjectOptions: new Set()
};

let store = loadStore();
let currentReportDate = "";
let constructionEditId = null;
let sentEditId = null;
let receivedEditId = null;
let reminderEditId = null;
let currentMajorWorks = [];
let currentLabCodes = [];
let structureDraft = null;
let concretingChart = null;
let labourChart = null;
let saveTimer = null;

const selectors = {
  todayChip: document.getElementById("todayChip"),
  pendingResponsesCount: document.getElementById("pendingResponsesCount"),
  monthlyCastsCount: document.getElementById("monthlyCastsCount"),
  testsDueCount: document.getElementById("testsDueCount"),
  responsesToSend: document.getElementById("responsesToSend"),
  responsesToReceive: document.getElementById("responsesToReceive"),
  lab3List: document.getElementById("lab3List"),
  lab7List: document.getElementById("lab7List"),
  lab28List: document.getElementById("lab28List"),
  reportDate: document.getElementById("reportDate"),
  loadReport: document.getElementById("loadReport"),
  reportStatus: document.getElementById("reportStatus"),
  fieldInput: document.getElementById("fieldInput"),
  workInput: document.getElementById("workInput"),
  majorWorkInput: document.getElementById("majorWorkInput"),
  addMajorWork: document.getElementById("addMajorWork"),
  majorWorksList: document.getElementById("majorWorksList"),
  structureSummary: document.getElementById("structureSummary"),
  openStructureModal: document.getElementById("openStructureModal"),
  headworksLabour: document.getElementById("headworksLabour"),
  powerhouseLabour: document.getElementById("powerhouseLabour"),
  equipmentsUsed: document.getElementById("equipmentsUsed"),
  equipmentNumber: document.getElementById("equipmentNumber"),
  remarksInput: document.getElementById("remarksInput"),
  sitePhoto: document.getElementById("sitePhoto"),
  saveConstruction: document.getElementById("saveConstruction"),
  resetConstruction: document.getElementById("resetConstruction"),
  constructionTable: document.getElementById("constructionTable"),
  sentDate: document.getElementById("sentDate"),
  sentTo: document.getElementById("sentTo"),
  sentRef: document.getElementById("sentRef"),
  sentSubject: document.getElementById("sentSubject"),
  sentFile: document.getElementById("sentFile"),
  sentKeywords: document.getElementById("sentKeywords"),
  sentPrevRef: document.getElementById("sentPrevRef"),
  sentResponse: document.getElementById("sentResponse"),
  saveSent: document.getElementById("saveSent"),
  resetSent: document.getElementById("resetSent"),
  lettersSentTable: document.getElementById("lettersSentTable"),
  receivedDate: document.getElementById("receivedDate"),
  receivedTo: document.getElementById("receivedTo"),
  receivedRef: document.getElementById("receivedRef"),
  receivedSubject: document.getElementById("receivedSubject"),
  receivedFile: document.getElementById("receivedFile"),
  receivedKeywords: document.getElementById("receivedKeywords"),
  receivedPrevRef: document.getElementById("receivedPrevRef"),
  receivedResponse: document.getElementById("receivedResponse"),
  saveReceived: document.getElementById("saveReceived"),
  resetReceived: document.getElementById("resetReceived"),
  lettersReceivedTable: document.getElementById("lettersReceivedTable"),
  labCode: document.getElementById("labCode"),
  labTestType: document.getElementById("labTestType"),
  labValue1: document.getElementById("labValue1"),
  labValue2: document.getElementById("labValue2"),
  labValue3: document.getElementById("labValue3"),
  saveLab: document.getElementById("saveLab"),
  resetLab: document.getElementById("resetLab"),
  labTable: document.getElementById("labTable"),
  reminderDate: document.getElementById("reminderDate"),
  reminderNote: document.getElementById("reminderNote"),
  reminderFile: document.getElementById("reminderFile"),
  saveReminder: document.getElementById("saveReminder"),
  resetReminder: document.getElementById("resetReminder"),
  reminderTable: document.getElementById("reminderTable"),
  structureSearch: document.getElementById("structureSearch"),
  clearStructureFilters: document.getElementById("clearStructureFilters"),
  structuresBody: document.getElementById("structuresBody"),
  summaryDate: document.getElementById("summaryDate"),
  loadSummaryDate: document.getElementById("loadSummaryDate"),
  summaryConstruction: document.getElementById("summaryConstruction"),
  summaryLettersSent: document.getElementById("summaryLettersSent"),
  summaryLettersReceived: document.getElementById("summaryLettersReceived"),
  summaryReminders: document.getElementById("summaryReminders"),
  summaryMonth: document.getElementById("summaryMonth"),
  generateMonthly: document.getElementById("generateMonthly"),
  monthlyMetrics: document.getElementById("monthlyMetrics"),
  monthlyHighlights: document.getElementById("monthlyHighlights"),
  structureModal: document.getElementById("structureModal"),
  closeStructureModal: document.getElementById("closeStructureModal"),
  structureSite: document.getElementById("structureSite"),
  dateCasting: document.getElementById("dateCasting"),
  structureName: document.getElementById("structureName"),
  subStructure: document.getElementById("subStructure"),
  concreteGrade: document.getElementById("concreteGrade"),
  elevation: document.getElementById("elevation"),
  pouredQty: document.getElementById("pouredQty"),
  labCodeInput: document.getElementById("labCodeInput"),
  addLabCode: document.getElementById("addLabCode"),
  labCodesList: document.getElementById("labCodesList"),
  saveStructure: document.getElementById("saveStructure")
};

const filterInputs = Array.from(document.querySelectorAll("[data-filter]"));
const filterState = {};

init();

function init() {
  const today = getTodayISO();
  selectors.todayChip.textContent = `Today: ${today}`;
  selectors.reportDate.value = today;
  selectors.sentDate.value = today;
  selectors.receivedDate.value = today;
  selectors.reminderDate.value = today;
  selectors.summaryDate.value = today;
  selectors.summaryMonth.value = today.slice(0, 7);

  bindNav();
  bindConstruction();
  bindLetters();
  bindLab();
  bindReminder();
  bindStructureModal();
  bindStructuresFilters();
  bindSummary();

  refreshOptionSets();
  renderAll();
  hydrateFromServer();
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneBaseStore();
    const parsed = JSON.parse(raw);
    return {
      dailyReports: parsed.dailyReports || {},
      structureEntries: parsed.structureEntries || [],
      labData: parsed.labData || {}
    };
  } catch (err) {
    return cloneBaseStore();
  }
}

function cloneBaseStore() {
  return JSON.parse(JSON.stringify(baseStore));
}

function saveStore(options = { sync: true }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  if (options.sync) {
    scheduleRemoteSave();
  }
}

function scheduleRemoteSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistStoreRemote();
  }, REMOTE_SAVE_DELAY);
}

async function persistStoreRemote() {
  try {
    await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store)
    });
  } catch (err) {
    console.warn("Remote save failed", err);
  }
}

async function hydrateFromServer() {
  try {
    const response = await fetch(API_ENDPOINT, { method: "GET" });
    if (!response.ok) return;
    const data = await response.json();
    store = normalizeStore(data);
    saveStore({ sync: false });
    refreshOptionSets();
    renderAll();
  } catch (err) {
    console.warn("Remote load failed", err);
  }
}

function normalizeStore(data) {
  if (!data || typeof data !== "object") return cloneBaseStore();
  return {
    dailyReports: data.dailyReports || {},
    structureEntries: data.structureEntries || [],
    labData: data.labData || {}
  };
}

async function uploadFile(file) {
  try {
    const response = await fetch(`${UPLOAD_ENDPOINT}?filename=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-file-name": file.name
      },
      body: file
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn("Upload failed", err);
    return null;
  }
}

function bindNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      document.querySelectorAll(".section").forEach((section) => {
        section.classList.toggle("active", section.id === target);
      });
      if (target === "structures") {
        renderStructures();
      }
    });
  });
}

function bindConstruction() {
  selectors.loadReport.addEventListener("click", () => {
    const date = selectors.reportDate.value;
    if (!date) {
      setStatus("Choose a report date.");
      return;
    }
    currentReportDate = date;
    ensureReport(date);
    setStatus(`Loaded report for ${date}.`);
    selectors.sentDate.value = date;
    selectors.receivedDate.value = date;
    selectors.reminderDate.value = date;
    resetConstructionForm();
    renderDailyTables();
  });

  selectors.addMajorWork.addEventListener("click", (event) => {
    event.preventDefault();
    addMajorWork();
  });

  selectors.saveConstruction.addEventListener("click", (event) => {
    event.preventDefault();
    saveConstruction();
  });

  selectors.resetConstruction.addEventListener("click", (event) => {
    event.preventDefault();
    resetConstructionForm();
  });

  selectors.openStructureModal.addEventListener("click", (event) => {
    event.preventDefault();
    const field = selectors.fieldInput.value.trim().toLowerCase();
    if (field && field !== "civil") {
      setStatus("Structure details are only required for Civil entries.");
      return;
    }
    openStructureModal();
  });
}

function bindLetters() {
  selectors.saveSent.addEventListener("click", (event) => {
    event.preventDefault();
    saveLetter("sent");
  });
  selectors.resetSent.addEventListener("click", (event) => {
    event.preventDefault();
    resetLetterForm("sent");
  });
  selectors.saveReceived.addEventListener("click", (event) => {
    event.preventDefault();
    saveLetter("received");
  });
  selectors.resetReceived.addEventListener("click", (event) => {
    event.preventDefault();
    resetLetterForm("received");
  });
}

function bindLab() {
  selectors.saveLab.addEventListener("click", (event) => {
    event.preventDefault();
    saveLabData();
  });
  selectors.resetLab.addEventListener("click", (event) => {
    event.preventDefault();
    resetLabForm();
  });
}

function bindReminder() {
  selectors.saveReminder.addEventListener("click", (event) => {
    event.preventDefault();
    saveReminder();
  });
  selectors.resetReminder.addEventListener("click", (event) => {
    event.preventDefault();
    resetReminderForm();
  });
}

function bindStructureModal() {
  selectors.closeStructureModal.addEventListener("click", () => {
    closeStructureModal();
  });

  selectors.addLabCode.addEventListener("click", (event) => {
    event.preventDefault();
    addLabCode();
  });

  selectors.saveStructure.addEventListener("click", (event) => {
    event.preventDefault();
    saveStructureDraft();
  });
}

function bindStructuresFilters() {
  selectors.structureSearch.addEventListener("input", renderStructures);
  selectors.clearStructureFilters.addEventListener("click", () => {
    selectors.structureSearch.value = "";
    filterInputs.forEach((input) => {
      input.value = "";
      filterState[input.dataset.filter] = "";
    });
    renderStructures();
  });
  filterInputs.forEach((input) => {
    filterState[input.dataset.filter] = "";
    input.addEventListener("input", () => {
      filterState[input.dataset.filter] = input.value.toLowerCase();
      renderStructures();
    });
  });
}

function bindSummary() {
  selectors.loadSummaryDate.addEventListener("click", () => {
    loadSummaryDate();
  });
  selectors.generateMonthly.addEventListener("click", () => {
    generateMonthlyReport();
  });
}
function ensureReport(date) {
  if (!store.dailyReports[date]) {
    store.dailyReports[date] = {
      construction: [],
      lettersSent: [],
      lettersReceived: [],
      reminders: []
    };
  }
}

function getTodayISO() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function daysDiff(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(message) {
  selectors.reportStatus.textContent = message;
}

function refreshOptionSets() {
  Object.values(store.dailyReports).forEach((report) => {
    report.construction.forEach((entry) => {
      if (entry.field) optionSets.fields.add(entry.field);
      entry.majorWorks?.forEach((work) => optionSets.majorWorks.add(work));
    });
    report.lettersSent.forEach((letter) => {
      if (letter.to) optionSets.toOptions.add(letter.to);
      if (letter.subject) optionSets.subjectOptions.add(letter.subject);
    });
    report.lettersReceived.forEach((letter) => {
      if (letter.to) optionSets.toOptions.add(letter.to);
      if (letter.subject) optionSets.subjectOptions.add(letter.subject);
    });
  });

  store.structureEntries.forEach((entry) => {
    if (entry.site) optionSets.sites.add(entry.site);
    if (entry.structure) optionSets.structures.add(entry.structure);
    if (entry.subStructure) optionSets.subStructures.add(entry.subStructure);
    if (entry.concreteGrade) optionSets.concreteGrades.add(entry.concreteGrade);
  });

  populateDatalist("fieldOptions", optionSets.fields);
  populateDatalist("majorWorkOptions", optionSets.majorWorks);
  populateDatalist("toOptions", optionSets.toOptions);
  populateDatalist("subjectOptions", optionSets.subjectOptions);
  populateDatalist("siteOptions", optionSets.sites);
  populateDatalist("structureOptions", optionSets.structures);
  populateDatalist("subStructureOptions", optionSets.subStructures);
  populateDatalist("concreteGradeOptions", optionSets.concreteGrades);
}

function populateDatalist(id, setValues) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = "";
  Array.from(setValues)
    .filter(Boolean)
    .sort()
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      element.appendChild(option);
    });
}
function addMajorWork() {
  const value = selectors.majorWorkInput.value.trim();
  if (!value) return;
  if (!currentMajorWorks.includes(value)) {
    currentMajorWorks.push(value);
    optionSets.majorWorks.add(value);
  }
  selectors.majorWorkInput.value = "";
  renderTagList(selectors.majorWorksList, currentMajorWorks, (tag) => {
    currentMajorWorks = currentMajorWorks.filter((item) => item !== tag);
    renderTagList(selectors.majorWorksList, currentMajorWorks, removeMajorWork);
  });
}

function removeMajorWork(tag) {
  currentMajorWorks = currentMajorWorks.filter((item) => item !== tag);
  renderTagList(selectors.majorWorksList, currentMajorWorks, removeMajorWork);
}

function addLabCode() {
  const value = selectors.labCodeInput.value.trim();
  if (!value) return;
  if (!currentLabCodes.includes(value)) {
    currentLabCodes.push(value);
  }
  selectors.labCodeInput.value = "";
  renderTagList(selectors.labCodesList, currentLabCodes, removeLabCode);
}

function removeLabCode(tag) {
  currentLabCodes = currentLabCodes.filter((item) => item !== tag);
  renderTagList(selectors.labCodesList, currentLabCodes, removeLabCode);
}

function renderTagList(container, tags, removeFn) {
  container.innerHTML = "";
  tags.forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "x";
    btn.addEventListener("click", () => removeFn(tag));
    span.appendChild(btn);
    container.appendChild(span);
  });
}

function openStructureModal() {
  selectors.structureModal.classList.add("active");
  selectors.structureModal.setAttribute("aria-hidden", "false");
  if (structureDraft) {
    selectors.structureSite.value = structureDraft.site || "";
    selectors.dateCasting.value = structureDraft.dateOfCasting || "";
    selectors.structureName.value = structureDraft.structure || "";
    selectors.subStructure.value = structureDraft.subStructure || "";
    selectors.concreteGrade.value = structureDraft.concreteGrade || "";
    selectors.elevation.value = structureDraft.elevation || "";
    selectors.pouredQty.value = structureDraft.pouredQty || "";
    currentLabCodes = [...(structureDraft.labCodes || [])];
    renderTagList(selectors.labCodesList, currentLabCodes, removeLabCode);
  } else {
    selectors.structureSite.value = "";
    selectors.dateCasting.value = "";
    selectors.structureName.value = "";
    selectors.subStructure.value = "";
    selectors.concreteGrade.value = "";
    selectors.elevation.value = "";
    selectors.pouredQty.value = "";
    currentLabCodes = [];
    renderTagList(selectors.labCodesList, currentLabCodes, removeLabCode);
  }
}

function closeStructureModal() {
  selectors.structureModal.classList.remove("active");
  selectors.structureModal.setAttribute("aria-hidden", "true");
}

function saveStructureDraft() {
  const draft = {
    site: selectors.structureSite.value.trim(),
    dateOfCasting: selectors.dateCasting.value,
    structure: selectors.structureName.value.trim(),
    subStructure: selectors.subStructure.value.trim(),
    concreteGrade: selectors.concreteGrade.value.trim(),
    elevation: selectors.elevation.value.trim(),
    pouredQty: selectors.pouredQty.value,
    labCodes: [...currentLabCodes]
  };

  structureDraft = draft;
  selectors.structureSummary.value = formatStructureSummary(draft);
  if (draft.site) optionSets.sites.add(draft.site);
  if (draft.structure) optionSets.structures.add(draft.structure);
  if (draft.subStructure) optionSets.subStructures.add(draft.subStructure);
  if (draft.concreteGrade) optionSets.concreteGrades.add(draft.concreteGrade);
  closeStructureModal();
}

function formatStructureSummary(draft) {
  const parts = [];
  if (draft.site) parts.push(draft.site);
  if (draft.structure) parts.push(draft.structure);
  if (draft.subStructure) parts.push(draft.subStructure);
  if (draft.concreteGrade) parts.push(draft.concreteGrade);
  if (draft.pouredQty) parts.push(`${draft.pouredQty} m³`);
  if (draft.labCodes?.length) parts.push(`Lab: ${draft.labCodes.join(", ")}`);
  return parts.join(" | ");
}

async function saveConstruction() {
  if (!currentReportDate) {
    setStatus("Load a report date first.");
    return;
  }
  const field = selectors.fieldInput.value.trim();
  const work = selectors.workInput.value.trim();
  const majorWorks = [...currentMajorWorks];
  const report = store.dailyReports[currentReportDate];
  const existing = constructionEditId ? report.construction.find((item) => item.id === constructionEditId) : null;

  if (!field) {
    setStatus("Field is required.");
    return;
  }

  if (structureDraft && !majorWorks.some((mw) => mw.toLowerCase() === "concrete") && !work.toLowerCase().includes("concrete")) {
    majorWorks.push("Concrete");
  }

  let sitePhotoName = existing?.sitePhotoName || "";
  let sitePhotoUrl = existing?.sitePhotoUrl || "";
  const photoFile = selectors.sitePhoto.files[0];
  if (photoFile) {
    const uploaded = await uploadFile(photoFile);
    sitePhotoName = photoFile.name;
    sitePhotoUrl = uploaded?.url || "";
  }

  const entry = {
    id: constructionEditId || uid(),
    field,
    work,
    majorWorks,
    headworksLabour: toNumber(selectors.headworksLabour.value),
    powerhouseLabour: toNumber(selectors.powerhouseLabour.value),
    equipmentsUsed: selectors.equipmentsUsed.value.trim(),
    equipmentNumber: selectors.equipmentNumber.value.trim(),
    remarks: selectors.remarksInput.value.trim(),
    sitePhotoName,
    sitePhotoUrl,
    structureSummary: selectors.structureSummary.value.trim(),
    structureDetails: structureDraft ? { ...structureDraft } : null,
    structureEntryId: null
  };

  if (constructionEditId) {
    const index = report.construction.findIndex((item) => item.id === constructionEditId);
    if (index !== -1) {
      entry.structureEntryId = report.construction[index].structureEntryId || null;
      report.construction[index] = entry;
      syncStructureEntry(entry);
    }
  } else {
    report.construction.push(entry);
    syncStructureEntry(entry);
  }

  store.dailyReports[currentReportDate] = report;
  saveStore();
  refreshOptionSets();
  renderDailyTables();
  renderHome();
  renderStructures();
  resetConstructionForm();
}

function syncStructureEntry(entry) {
  const hasStructure = !!entry.structureDetails;
  const isConcrete = entry.work.toLowerCase().includes("concrete") || entry.majorWorks.some((mw) => mw.toLowerCase() === "concrete");

  if (!hasStructure || !isConcrete) {
    if (entry.structureEntryId) {
      store.structureEntries = store.structureEntries.filter((item) => item.id !== entry.structureEntryId);
    }
    entry.structureEntryId = null;
    return;
  }

  const data = {
    id: entry.structureEntryId || uid(),
    sourceDate: currentReportDate,
    sourceEntryId: entry.id,
    site: entry.structureDetails.site,
    dateOfCasting: entry.structureDetails.dateOfCasting,
    structure: entry.structureDetails.structure,
    subStructure: entry.structureDetails.subStructure,
    concreteGrade: entry.structureDetails.concreteGrade,
    labCodes: entry.structureDetails.labCodes,
    elevation: entry.structureDetails.elevation,
    pouredQty: toNumber(entry.structureDetails.pouredQty),
    headworksLabour: entry.headworksLabour,
    powerhouseLabour: entry.powerhouseLabour
  };

  if (entry.structureEntryId) {
    const index = store.structureEntries.findIndex((item) => item.id === entry.structureEntryId);
    if (index !== -1) {
      store.structureEntries[index] = data;
    }
  } else {
    store.structureEntries.push(data);
  }
  entry.structureEntryId = data.id;
}

function resetConstructionForm() {
  selectors.fieldInput.value = "";
  selectors.workInput.value = "";
  selectors.majorWorkInput.value = "";
  currentMajorWorks = [];
  renderTagList(selectors.majorWorksList, currentMajorWorks, removeMajorWork);
  selectors.structureSummary.value = "";
  selectors.headworksLabour.value = "";
  selectors.powerhouseLabour.value = "";
  selectors.equipmentsUsed.value = "";
  selectors.equipmentNumber.value = "";
  selectors.remarksInput.value = "";
  selectors.sitePhoto.value = "";
  structureDraft = null;
  constructionEditId = null;
}

function renderDailyTables() {
  if (!currentReportDate) return;
  const report = store.dailyReports[currentReportDate];
  renderConstructionTable(report.construction || []);
  renderLettersTable(report.lettersSent || [], "sent");
  renderLettersTable(report.lettersReceived || [], "received");
  renderRemindersTable(report.reminders || []);
}

function renderConstructionTable(entries) {
  selectors.constructionTable.innerHTML = "";
  entries.forEach((entry) => {
    const photoDisplay = entry.sitePhotoUrl
      ? `<a href="${entry.sitePhotoUrl}" target="_blank" rel="noopener">${entry.sitePhotoName || "View"}</a>`
      : (entry.sitePhotoName || "");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.field || ""}</td>
      <td>${(entry.majorWorks || []).join(", ")}</td>
      <td>${entry.work || ""}</td>
      <td>${entry.structureSummary || ""}</td>
      <td>${entry.headworksLabour ?? ""}</td>
      <td>${entry.powerhouseLabour ?? ""}</td>
      <td>${entry.equipmentsUsed || ""}</td>
      <td>${entry.equipmentNumber || ""}</td>
      <td>${entry.remarks || ""}</td>
      <td>${photoDisplay}</td>
      <td>
        <button class="btn ghost" data-action="edit" data-id="${entry.id}">Edit</button>
        <button class="btn ghost" data-action="delete" data-id="${entry.id}">Delete</button>
      </td>
    `;
    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => handleConstructionAction(button.dataset.action, button.dataset.id));
    });
    selectors.constructionTable.appendChild(row);
  });
}

function handleConstructionAction(action, id) {
  const report = store.dailyReports[currentReportDate];
  const entry = report.construction.find((item) => item.id === id);
  if (!entry) return;
  if (action === "edit") {
    constructionEditId = id;
    selectors.fieldInput.value = entry.field || "";
    selectors.workInput.value = entry.work || "";
    currentMajorWorks = [...(entry.majorWorks || [])];
    renderTagList(selectors.majorWorksList, currentMajorWorks, removeMajorWork);
    selectors.structureSummary.value = entry.structureSummary || "";
    structureDraft = entry.structureDetails ? { ...entry.structureDetails } : null;
    selectors.headworksLabour.value = entry.headworksLabour ?? "";
    selectors.powerhouseLabour.value = entry.powerhouseLabour ?? "";
    selectors.equipmentsUsed.value = entry.equipmentsUsed || "";
    selectors.equipmentNumber.value = entry.equipmentNumber || "";
    selectors.remarksInput.value = entry.remarks || "";
    setStatus("Editing construction entry.");
  }
  if (action === "delete") {
    report.construction = report.construction.filter((item) => item.id !== id);
    if (entry.structureEntryId) {
      store.structureEntries = store.structureEntries.filter((item) => item.id !== entry.structureEntryId);
    }
    saveStore();
    renderDailyTables();
    renderHome();
    renderStructures();
  }
}
async function saveLetter(type) {
  if (!currentReportDate) {
    setStatus("Load a report date first.");
    return;
  }
  const isSent = type === "sent";
  const date = isSent ? selectors.sentDate.value : selectors.receivedDate.value;
  const report = store.dailyReports[currentReportDate];
  const existing = isSent
    ? report.lettersSent.find((item) => item.id === sentEditId)
    : report.lettersReceived.find((item) => item.id === receivedEditId);

  let fileName = existing?.fileName || "";
  let fileUrl = existing?.fileUrl || "";
  const fileInput = isSent ? selectors.sentFile : selectors.receivedFile;
  const file = fileInput.files[0];
  if (file) {
    const uploaded = await uploadFile(file);
    fileName = file.name;
    fileUrl = uploaded?.url || "";
  }

  const letter = {
    id: isSent ? sentEditId || uid() : receivedEditId || uid(),
    date,
    to: isSent ? selectors.sentTo.value.trim() : selectors.receivedTo.value.trim(),
    refNo: isSent ? selectors.sentRef.value.trim() : selectors.receivedRef.value.trim(),
    subject: isSent ? selectors.sentSubject.value.trim() : selectors.receivedSubject.value.trim(),
    fileName,
    fileUrl,
    keywords: splitKeywords(isSent ? selectors.sentKeywords.value : selectors.receivedKeywords.value),
    prevRef: isSent ? selectors.sentPrevRef.value.trim() : selectors.receivedPrevRef.value.trim(),
    responseRequired: (isSent ? selectors.sentResponse.value : selectors.receivedResponse.value) === "yes"
  };

  if (isSent) {
    if (sentEditId) {
      const index = report.lettersSent.findIndex((item) => item.id === sentEditId);
      if (index !== -1) report.lettersSent[index] = letter;
    } else {
      report.lettersSent.push(letter);
    }
  } else {
    if (receivedEditId) {
      const index = report.lettersReceived.findIndex((item) => item.id === receivedEditId);
      if (index !== -1) report.lettersReceived[index] = letter;
    } else {
      report.lettersReceived.push(letter);
    }
  }

  saveStore();
  refreshOptionSets();
  renderDailyTables();
  renderHome();
  resetLetterForm(type);
}

function resetLetterForm(type) {
  if (type === "sent") {
    selectors.sentTo.value = "";
    selectors.sentRef.value = "";
    selectors.sentSubject.value = "";
    selectors.sentFile.value = "";
    selectors.sentKeywords.value = "";
    selectors.sentPrevRef.value = "";
    selectors.sentResponse.value = "no";
    sentEditId = null;
  } else {
    selectors.receivedTo.value = "";
    selectors.receivedRef.value = "";
    selectors.receivedSubject.value = "";
    selectors.receivedFile.value = "";
    selectors.receivedKeywords.value = "";
    selectors.receivedPrevRef.value = "";
    selectors.receivedResponse.value = "no";
    receivedEditId = null;
  }
}

function renderLettersTable(entries, type) {
  const target = type === "sent" ? selectors.lettersSentTable : selectors.lettersReceivedTable;
  target.innerHTML = "";
  entries.forEach((letter) => {
    const fileDisplay = letter.fileUrl
      ? `<a href="${letter.fileUrl}" target="_blank" rel="noopener">${letter.fileName || "View"}</a>`
      : (letter.fileName || "");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${letter.date || ""}</td>
      <td>${letter.to || ""}</td>
      <td>${letter.refNo || ""}</td>
      <td>${letter.subject || ""}</td>
      <td>${fileDisplay}</td>
      <td>${(letter.keywords || []).join(", ")}</td>
      <td>${letter.prevRef || ""}</td>
      <td>${letter.responseRequired ? "Yes" : "No"}</td>
      <td>
        <button class="btn ghost" data-action="edit" data-id="${letter.id}">Edit</button>
        <button class="btn ghost" data-action="delete" data-id="${letter.id}">Delete</button>
      </td>
    `;
    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => handleLetterAction(type, button.dataset.action, button.dataset.id));
    });
    target.appendChild(row);
  });
}

function handleLetterAction(type, action, id) {
  const report = store.dailyReports[currentReportDate];
  const collection = type === "sent" ? report.lettersSent : report.lettersReceived;
  const letter = collection.find((item) => item.id === id);
  if (!letter) return;

  if (action === "edit") {
    if (type === "sent") {
      sentEditId = id;
      selectors.sentDate.value = letter.date || "";
      selectors.sentTo.value = letter.to || "";
      selectors.sentRef.value = letter.refNo || "";
      selectors.sentSubject.value = letter.subject || "";
      selectors.sentKeywords.value = (letter.keywords || []).join(", ");
      selectors.sentPrevRef.value = letter.prevRef || "";
      selectors.sentResponse.value = letter.responseRequired ? "yes" : "no";
    } else {
      receivedEditId = id;
      selectors.receivedDate.value = letter.date || "";
      selectors.receivedTo.value = letter.to || "";
      selectors.receivedRef.value = letter.refNo || "";
      selectors.receivedSubject.value = letter.subject || "";
      selectors.receivedKeywords.value = (letter.keywords || []).join(", ");
      selectors.receivedPrevRef.value = letter.prevRef || "";
      selectors.receivedResponse.value = letter.responseRequired ? "yes" : "no";
    }
  }

  if (action === "delete") {
    const updated = collection.filter((item) => item.id !== id);
    if (type === "sent") {
      report.lettersSent = updated;
    } else {
      report.lettersReceived = updated;
    }
    saveStore();
    renderDailyTables();
    renderHome();
  }
}

function saveLabData() {
  const code = selectors.labCode.value.trim();
  if (!code) return;
  const type = selectors.labTestType.value;
  const values = [selectors.labValue1.value, selectors.labValue2.value, selectors.labValue3.value]
    .map((value) => (value === "" ? null : Number(value)))
    .filter((value) => value !== null && !Number.isNaN(value));

  if (!store.labData[code]) {
    store.labData[code] = { days3: [], days7: [], days28: [] };
  }

  if (type === "3") store.labData[code].days3 = values;
  if (type === "7") store.labData[code].days7 = values;
  if (type === "28") store.labData[code].days28 = values;

  saveStore();
  renderLabTable();
  renderStructures();
  renderHome();
  resetLabForm();
}

function resetLabForm() {
  selectors.labCode.value = "";
  selectors.labTestType.value = "3";
  selectors.labValue1.value = "";
  selectors.labValue2.value = "";
  selectors.labValue3.value = "";
}

function renderLabTable() {
  selectors.labTable.innerHTML = "";
  Object.keys(store.labData)
    .sort()
    .forEach((code) => {
      const data = store.labData[code];
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${code}</td>
        <td>${(data.days3 || []).join(", ")}</td>
        <td>${calcAverage(data.days3)}</td>
        <td>${(data.days7 || []).join(", ")}</td>
        <td>${calcAverage(data.days7)}</td>
        <td>${(data.days28 || []).join(", ")}</td>
        <td>${calcAverage(data.days28)}</td>
      `;
      selectors.labTable.appendChild(row);
    });
}
async function saveReminder() {
  if (!currentReportDate) {
    setStatus("Load a report date first.");
    return;
  }
  const report = store.dailyReports[currentReportDate];
  const existing = reminderEditId ? report.reminders.find((item) => item.id === reminderEditId) : null;

  let fileName = existing?.fileName || "";
  let fileUrl = existing?.fileUrl || "";
  const file = selectors.reminderFile.files[0];
  if (file) {
    const uploaded = await uploadFile(file);
    fileName = file.name;
    fileUrl = uploaded?.url || "";
  }

  const reminder = {
    id: reminderEditId || uid(),
    date: selectors.reminderDate.value,
    note: selectors.reminderNote.value.trim(),
    fileName,
    fileUrl
  };
  if (reminderEditId) {
    const index = report.reminders.findIndex((item) => item.id === reminderEditId);
    if (index !== -1) report.reminders[index] = reminder;
  } else {
    report.reminders.push(reminder);
  }
  saveStore();
  renderDailyTables();
  renderHome();
  resetReminderForm();
}

function resetReminderForm() {
  selectors.reminderDate.value = getTodayISO();
  selectors.reminderNote.value = "";
  selectors.reminderFile.value = "";
  reminderEditId = null;
}

function renderRemindersTable(entries) {
  selectors.reminderTable.innerHTML = "";
  entries.forEach((reminder) => {
    const fileDisplay = reminder.fileUrl
      ? `<a href="${reminder.fileUrl}" target="_blank" rel="noopener">${reminder.fileName || "View"}</a>`
      : (reminder.fileName || "");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${reminder.date || ""}</td>
      <td>${reminder.note || ""}</td>
      <td>${fileDisplay}</td>
      <td>
        <button class="btn ghost" data-action="edit" data-id="${reminder.id}">Edit</button>
        <button class="btn ghost" data-action="delete" data-id="${reminder.id}">Delete</button>
      </td>
    `;
    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => handleReminderAction(button.dataset.action, button.dataset.id));
    });
    selectors.reminderTable.appendChild(row);
  });
}

function handleReminderAction(action, id) {
  const report = store.dailyReports[currentReportDate];
  const reminder = report.reminders.find((item) => item.id === id);
  if (!reminder) return;
  if (action === "edit") {
    reminderEditId = id;
    selectors.reminderDate.value = reminder.date || "";
    selectors.reminderNote.value = reminder.note || "";
  }
  if (action === "delete") {
    report.reminders = report.reminders.filter((item) => item.id !== id);
    saveStore();
    renderDailyTables();
    renderHome();
  }
}

function renderHome() {
  renderResponses();
  renderLabDue();
  renderMetrics();
}

function renderResponses() {
  const allReceived = collectLetters("received").filter((letter) => letter.responseRequired);
  const allSent = collectLetters("sent").filter((letter) => letter.responseRequired);
  const sentPrevRefs = new Set(collectLetters("sent").map((letter) => letter.prevRef).filter(Boolean));
  const receivedPrevRefs = new Set(collectLetters("received").map((letter) => letter.prevRef).filter(Boolean));

  const pendingSend = allReceived.filter((letter) => !sentPrevRefs.has(letter.refNo));
  const pendingReceive = allSent.filter((letter) => !receivedPrevRefs.has(letter.refNo));

  pendingSend.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  pendingReceive.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  selectors.responsesToSend.innerHTML = "";
  selectors.responsesToReceive.innerHTML = "";

  const today = getTodayISO();
  pendingSend.forEach((letter) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${letter.date || ""}</td>
      <td>${letter.to || ""}</td>
      <td>${letter.refNo || ""}</td>
      <td>${letter.subject || ""}</td>
      <td>${letter.prevRef || ""}</td>
      <td>${letter.date ? daysDiff(letter.date, today) : ""}</td>
    `;
    selectors.responsesToSend.appendChild(row);
  });

  pendingReceive.forEach((letter) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${letter.date || ""}</td>
      <td>${letter.to || ""}</td>
      <td>${letter.refNo || ""}</td>
      <td>${letter.subject || ""}</td>
      <td>${letter.prevRef || ""}</td>
      <td>${letter.date ? daysDiff(letter.date, today) : ""}</td>
    `;
    selectors.responsesToReceive.appendChild(row);
  });

  selectors.pendingResponsesCount.textContent = pendingSend.length + pendingReceive.length;
}

function renderLabDue() {
  const today = getTodayISO();
  const due3 = new Set();
  const due7 = new Set();
  const due28 = new Set();

  store.structureEntries.forEach((entry) => {
    if (!entry.dateOfCasting) return;
    const date3 = addDays(entry.dateOfCasting, 3);
    const date7 = addDays(entry.dateOfCasting, 7);
    const date28 = addDays(entry.dateOfCasting, 28);

    if (date3 === today) entry.labCodes?.forEach((code) => due3.add(code));
    if (date7 === today) entry.labCodes?.forEach((code) => due7.add(code));
    if (date28 === today) entry.labCodes?.forEach((code) => due28.add(code));
  });

  renderLabList(selectors.lab3List, Array.from(due3));
  renderLabList(selectors.lab7List, Array.from(due7));
  renderLabList(selectors.lab28List, Array.from(due28));

  selectors.testsDueCount.textContent = due3.size + due7.size + due28.size;
}

function renderLabList(container, items) {
  container.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No tests due";
    container.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderMetrics() {
  const month = getTodayISO().slice(0, 7);
  const count = store.structureEntries.filter((entry) => entry.dateOfCasting?.startsWith(month)).length;
  selectors.monthlyCastsCount.textContent = count;
}

function renderStructures() {
  const searchValue = selectors.structureSearch.value.toLowerCase();
  const entries = [...store.structureEntries].sort((a, b) => (b.dateOfCasting || "").localeCompare(a.dateOfCasting || ""));
  selectors.structuresBody.innerHTML = "";

  entries
    .filter((entry) => filterStructureEntry(entry, searchValue))
    .forEach((entry) => {
      const test7 = entry.dateOfCasting ? addDays(entry.dateOfCasting, 7) : "";
      const test28 = entry.dateOfCasting ? addDays(entry.dateOfCasting, 28) : "";
      const strength7 = formatLabStrengths(entry.labCodes, 7);
      const strength28 = formatLabStrengths(entry.labCodes, 28);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${entry.site || ""}</td>
        <td>${entry.structure || ""}</td>
        <td>${entry.subStructure || ""}</td>
        <td>${entry.elevation || ""}</td>
        <td>${entry.dateOfCasting || ""}</td>
        <td>${entry.concreteGrade || ""}</td>
        <td>${(entry.labCodes || []).join(", ")}</td>
        <td>${test7}</td>
        <td>${strength7}</td>
        <td>${test28}</td>
        <td>${strength28}</td>
      `;
      selectors.structuresBody.appendChild(row);
    });
}

function filterStructureEntry(entry, searchValue) {
  const searchMatch = !searchValue || Object.values(entry).some((value) => {
    if (!value) return false;
    return value.toString().toLowerCase().includes(searchValue);
  });

  const filterMatch = Object.entries(filterState).every(([key, value]) => {
    if (!value) return true;
    let target = "";
    if (key === "test7") target = entry.dateOfCasting ? addDays(entry.dateOfCasting, 7) : "";
    if (key === "test28") target = entry.dateOfCasting ? addDays(entry.dateOfCasting, 28) : "";
    if (key === "strength7") target = formatLabStrengths(entry.labCodes, 7);
    if (key === "strength28") target = formatLabStrengths(entry.labCodes, 28);
    if (!target) target = entry[key] || "";
    return target.toString().toLowerCase().includes(value);
  });

  return searchMatch && filterMatch;
}
function loadSummaryDate() {
  const date = selectors.summaryDate.value;
  if (!date) return;
  const report = store.dailyReports[date];
  selectors.summaryConstruction.innerHTML = formatSummaryList(report?.construction, (item) => `${item.field} | ${item.work} | ${item.structureSummary || "No structure"}`);
  selectors.summaryLettersSent.innerHTML = formatSummaryList(report?.lettersSent, (item) => `${item.refNo} | ${item.subject}`);
  selectors.summaryLettersReceived.innerHTML = formatSummaryList(report?.lettersReceived, (item) => `${item.refNo} | ${item.subject}`);
  selectors.summaryReminders.innerHTML = formatSummaryList(report?.reminders, (item) => `${item.date} | ${item.note}`);
}

function formatSummaryList(items, formatter) {
  if (!items || !items.length) {
    return "<div class=\"muted\">No entries available.</div>";
  }
  return items.map((item) => `<div>${formatter(item)}</div>`).join("");
}

function generateMonthlyReport() {
  const month = selectors.summaryMonth.value;
  if (!month) return;
  const entries = store.structureEntries.filter((entry) => entry.dateOfCasting?.startsWith(month));
  const dailyTotals = {};
  entries.forEach((entry) => {
    if (!entry.dateOfCasting) return;
    const key = entry.dateOfCasting;
    dailyTotals[key] = (dailyTotals[key] || 0) + (entry.pouredQty || 0);
  });

  const totalPour = Object.values(dailyTotals).reduce((sum, value) => sum + value, 0);
  const activeDays = Object.keys(dailyTotals).length;
  const avgDaily = activeDays ? (totalPour / activeDays) : 0;

  const labourData = collectLabourData(month);
  const avgHeadworks = labourData.headworksCount ? labourData.headworksTotal / labourData.headworksCount : 0;
  const avgPowerhouse = labourData.powerhouseCount ? labourData.powerhouseTotal / labourData.powerhouseCount : 0;

  const letterCounts = collectLetterStats(month);
  const majorWorks = collectMajorWorks(month);
  const topStructures = entries
    .filter((entry) => entry.structure)
    .sort((a, b) => (b.pouredQty || 0) - (a.pouredQty || 0))
    .slice(0, 5)
    .map((entry) => `${entry.structure} (${entry.pouredQty || 0} m³)`);

  selectors.monthlyMetrics.innerHTML = "";
  const metrics = [
    { label: "Total Concrete (m³)", value: totalPour.toFixed(2) },
    { label: "Average Daily Concreting (m³)", value: avgDaily.toFixed(2) },
    { label: "Average Headworks Labour", value: avgHeadworks.toFixed(1) },
    { label: "Average Powerhouse Labour", value: avgPowerhouse.toFixed(1) }
  ];

  metrics.forEach((metric) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h4>${metric.label}</h4><div class="metric">${metric.value}</div>`;
    selectors.monthlyMetrics.appendChild(card);
  });

  selectors.monthlyHighlights.innerHTML = `
    <div>Letters Sent (Response Required): ${letterCounts.sent}</div>
    <div>Letters Received (Response Required): ${letterCounts.received}</div>
    <div>Top Structures by Poured Quantity: ${topStructures.length ? topStructures.join(" | ") : "No data"}</div>
    <div>Major Works Focus: ${majorWorks.join(", ") || "No data"}</div>
  `;

  renderConcretingChart(dailyTotals);
  renderLabourChart(avgHeadworks, avgPowerhouse);
}

function renderConcretingChart(dailyTotals) {
  const labels = Object.keys(dailyTotals).sort();
  const data = labels.map((label) => dailyTotals[label]);
  const ctx = document.getElementById("concretingChart");
  if (concretingChart) concretingChart.destroy();
  concretingChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Concrete (m³)",
          data,
          borderColor: "#1f7a7a",
          backgroundColor: "rgba(31, 122, 122, 0.2)",
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderLabourChart(avgHeadworks, avgPowerhouse) {
  const ctx = document.getElementById("labourChart");
  if (labourChart) labourChart.destroy();
  labourChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Headworks", "Powerhouse"],
      datasets: [
        {
          label: "Average Labour",
          data: [avgHeadworks, avgPowerhouse],
          backgroundColor: ["#1f7a7a", "#f4b35a"]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function collectLabourData(month) {
  const data = { headworksTotal: 0, headworksCount: 0, powerhouseTotal: 0, powerhouseCount: 0 };
  Object.entries(store.dailyReports).forEach(([date, report]) => {
    if (!date.startsWith(month)) return;
    report.construction.forEach((entry) => {
      if (entry.headworksLabour !== null && entry.headworksLabour !== undefined) {
        data.headworksTotal += entry.headworksLabour || 0;
        data.headworksCount += 1;
      }
      if (entry.powerhouseLabour !== null && entry.powerhouseLabour !== undefined) {
        data.powerhouseTotal += entry.powerhouseLabour || 0;
        data.powerhouseCount += 1;
      }
    });
  });
  return data;
}

function collectLetterStats(month) {
  const sent = collectLetters("sent").filter((letter) => letter.date?.startsWith(month) && letter.responseRequired).length;
  const received = collectLetters("received").filter((letter) => letter.date?.startsWith(month) && letter.responseRequired).length;
  return { sent, received };
}

function collectMajorWorks(month) {
  const counts = {};
  Object.entries(store.dailyReports).forEach(([date, report]) => {
    if (!date.startsWith(month)) return;
    report.construction.forEach((entry) => {
      entry.majorWorks?.forEach((work) => {
        counts[work] = (counts[work] || 0) + 1;
      });
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([work, count]) => `${work} (${count})`);
}

function collectLetters(type) {
  const items = [];
  Object.values(store.dailyReports).forEach((report) => {
    if (type === "sent") items.push(...report.lettersSent);
    if (type === "received") items.push(...report.lettersReceived);
  });
  return items;
}

function formatLabStrengths(labCodes, days) {
  if (!labCodes || !labCodes.length) return "";
  return labCodes
    .map((code) => {
      const data = store.labData[code];
      if (!data) return `${code}: -`;
      const values = days === 7 ? data.days7 : data.days28;
      return `${code}: ${calcAverage(values)}`;
    })
    .join(" | ");
}

function calcAverage(values) {
  if (!values || !values.length) return "-";
  const total = values.reduce((sum, value) => sum + value, 0);
  return (total / values.length).toFixed(2);
}

function splitKeywords(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function renderAll() {
  renderHome();
  renderDailyTables();
  renderLabTable();
  renderStructures();
  loadSummaryDate();
}

