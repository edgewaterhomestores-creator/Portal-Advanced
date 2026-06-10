const form = document.querySelector("#packet-form");
const result = document.querySelector("#result");
const editModePanel = document.querySelector("#edit-mode-panel");
const editModeTitle = document.querySelector("#edit-mode-title");
const editModeCopy = document.querySelector("#edit-mode-copy");
const editReasonInput = document.querySelector("#edit-reason");
const editHistory = document.querySelector("#edit-history");
const recordLockPanel = document.querySelector("#record-lock-panel");
const contractOwnerPanel = document.querySelector("#contract-owner-panel");
const contractOwnerCopy = document.querySelector("#contract-owner-copy");
const contractOwnerSelect = document.querySelector("#contract-owner-select");
const transferOwnerButton = document.querySelector("#transfer-owner");

const paymentRows = document.querySelector("#payment-rows");
const vendorRows = document.querySelector("#vendor-rows");
const materialRows = document.querySelector("#material-rows");
const pageOptions = document.querySelector("#page-options");
const pagesAll = document.querySelector("#pages-all");
const pagesAgreement = document.querySelector("#pages-agreement");
const storeRepSelect = document.querySelector("#store-rep-select");
const storeSignatureSelect = document.querySelector("#store-signature-select");
const storeSignaturePreview = document.querySelector("#store-signature-preview");
const installerDirectoryList = document.querySelector("#installer-directory-list");
const salesRepList = document.querySelector("#sales-rep-list");
const storeSignatureSetupLink = document.querySelector("#store-signature-setup-link");
const contractSignatureModal = document.querySelector("#contract-signature-modal");
const contractSignatureForm = document.querySelector("#contract-signature-form");
const contractSignatureStatus = document.querySelector("#contract-signature-status");
const contractSignatureCanvas = document.querySelector("#contract-signature-canvas");
const contractSignatureCtx = contractSignatureCanvas?.getContext("2d");
const contractSignatureSaveButton = document.querySelector("#contract-signature-save");
const contractSignatureCloseButton = document.querySelector("#contract-signature-close");
const contractSignatureCancelButton = document.querySelector("#contract-signature-cancel");
const contractSignatureClearButton = document.querySelector("#contract-signature-clear");
const logoutButton = document.querySelector("#logout");
const copyMailingAddressButton = document.querySelector("#copy-mailing-address");
const copyBillingAddressButton = document.querySelector("#copy-billing-address");
const tabButtons = [...document.querySelectorAll("[data-section-tab]")];
const formSections = [...document.querySelectorAll("[data-section]")];
const customerStepDoneButton = document.querySelector("#customer-step-done");
const quickMeasurementDoneButton = document.querySelector("#quick-measurement-done");
const quickMeasurementSkipButton = document.querySelector("#quick-measurement-skip");
const estimateStepDoneButton = document.querySelector("#estimate-step-done");
const signaturesStepDoneButton = document.querySelector("#signatures-step-done");
const addendumDoneButton = document.querySelector("#addendum-done");
const estimateFileInput = document.querySelector("#estimate-file");
const estimateSearchInput = document.querySelector("#estimate-file-search");
const estimateRefreshButton = document.querySelector("#refresh-estimates");
const estimateFolderStatus = document.querySelector("#estimate-folder-status");
const estimateFileList = document.querySelector("#estimate-file-list");
const estimatePreview = document.querySelector("#estimate-preview");
const estimatePreviewButton = document.querySelector("#view-estimate-preview");
const openEstimateToolLink = document.querySelector("#open-estimate-tool");
const submitButton = document.querySelector("#packet-submit");
const saveExitButton = document.querySelector("#packet-save-exit");
const exitNoSaveButton = document.querySelector("#packet-exit-no-save");
const customerRecordSearchInput = document.querySelector("#customer-record-search");
const addNewCustomerButton = document.querySelector("#add-new-customer");
const customerLookupStatus = document.querySelector("#customer-lookup-status");
const customerLookupResults = document.querySelector("#customer-lookup-results");
const selectedCustomerPanel = document.querySelector("#selected-customer-panel");
const customerClearButton = document.querySelector("#customer-clear");
const customerSaveDraftButton = document.querySelector("#customer-save-draft");
const customerSaveDraftTopButton = document.querySelector("#customer-save-draft-top");
const customerSaveStatusNodes = document.querySelectorAll("[data-customer-save-status]");
const workflowClearButton = document.querySelector("#workflow-clear");
const workflowSaveDraftButton = document.querySelector("#workflow-save-draft");
const workflowChangeCustomerButton = document.querySelector("#workflow-change-customer");
const sameBillingAddressCheckbox = document.querySelector("#same-billing-address");
const customerProgressList = document.querySelector("#customer-progress-list");
const customerRecordSummary = document.querySelector("#customer-record-summary");
const sectionPrevButton = document.querySelector("#section-prev");
const sectionNextButton = document.querySelector("#section-next");
const sectionExitButton = document.querySelector("#section-exit");
const draftStatus = document.querySelector("#draft-status");

let editState = {
  packetId: "",
  revision: false,
  packet: null,
  loadedVersionData: null,
  lockAcquired: false,
  lockBlocked: false,
};
let storeRepProfiles = [];
let staffUsers = [];
let estimateFolderPath = "";
let estimateFiles = [];
let estimateSearchTimer = null;
let customerSearchTimer = null;
let activeCustomerSearchId = 0;
let selectedCustomer = null;
let currentStaffUser = null;
let settingsCache = null;
let packetSubmitInFlight = false;
let pendingDuplicateSave = null;
let serverDraftTimer = null;
let serverDraftInFlight = false;
let lastServerDraftSerialized = "";
let editLockHeartbeatTimer = null;
let currentDataResetId = "";
let zipLookupPromise = null;
let zipLookupMap = null;
let installerDirectoryRows = [];
let installerQuickAddKeys = new Set();
let drawingContractSignature = false;
let hasDrawnContractSignature = false;
let savingContractSignature = false;

const draftStoragePrefix = "edgewater-contract-draft:";
const sectionOrder = ["estimate", "customer", "project", "pages", "order", "payments", "vendors", "materials", "signatures", "notes"];
const legacyEstimateKey = ["qu", "ote"].join("");
const legacySalesEstimateSectionId = `${legacyEstimateKey}Estimate`;
const generatedEstimateSectionId = ["estimate", "Estimate"].join("");
const zipLookupUrl = "/estimates-module/USZIPCodes202602.csv";
const paymentRowCount = 3;
const vendorRowCount = 8;
const materialRowCount = 10;
const customerIntakeFieldNames = [
  "customer.firstName",
  "customer.lastName",
  "customer.phone1",
  "customer.phone2",
  "customer.email",
  "customer.textOptIn",
  "customer.socialMediaTagConsent",
  "customer.socialMediaProfile",
  "customer.referral",
  "customer.mailingStreet",
  "customer.mailingCity",
  "customer.mailingState",
  "customer.mailingZip",
  "customer.billingStreet",
  "customer.billingCity",
  "customer.billingState",
  "customer.billingZip",
  "customer.notes",
  "delivery.emailCustomerLink",
];

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "").replace(/^1+/, "").slice(0, 10);
}

function formatPhoneDigits(digits) {
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatPhoneInput(input) {
  input.value = formatPhoneDigits(phoneDigits(input.value));
}

function phoneInputs() {
  return [...form.querySelectorAll('input[autocomplete="tel"], input[name="customer.phone1"], input[name="customer.phone2"]')];
}

function formatPhoneInputs() {
  phoneInputs().forEach(formatPhoneInput);
}

function bindPhoneFormatting() {
  phoneInputs().forEach((input) => {
    input.inputMode = "numeric";
    input.autocomplete = "tel-national";
    input.maxLength = 14;
    input.pattern = "\\(\\d{3}\\) \\d{3}-\\d{4}";
    input.addEventListener("input", () => {
      formatPhoneInput(input);
      updateCustomerIntakeSummary();
    });
    input.addEventListener("blur", () => formatPhoneInput(input));
  });
}

function validatePhoneFields() {
  const invalid = phoneInputs().find((input) => {
    const digits = phoneDigits(input.value);
    return (input.required || digits.length > 0) && digits.length !== 10;
  });
  if (!invalid) return true;

  invalid.focus();
  showResult("<p class=\"error\">Phone numbers must be 10 digits and cannot start with 1.</p>");
  return false;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const directDateFieldNames = new Set([
  "order.saleDate",
  "order.installDate",
  "order.measurementDate",
  "order.customerAcceptedDate",
  "order.storeRepDate",
]);
const rowDateFieldNames = new Set(["customerPaymentDate", "vendorOrderDate", "expectedMaterialDate", "actualMaterialDate", "date"]);
const receivedPaymentFieldNames = new Set(["paidInitials", "paidAmountDate"]);
const directCurrencyFieldNames = new Set([
  "order.invoiceAmount",
  "payments.totalInvoiceAmount",
]);
const rowCurrencyFieldNames = new Set(["amount", "customerPayment", "vendorEstimateAmount", "unitCost", "total", "freight"]);

function isValidEmail(value) {
  const email = String(value || "").trim();
  return !email || emailPattern.test(email);
}

function emailInputs() {
  return [...form.querySelectorAll('input[type="email"], input[name="customer.email"]')];
}

function validateEmailFields() {
  const invalid = emailInputs().find((input) => !isValidEmail(input.value));
  if (!invalid) return true;

  invalid.focus();
  showResult("<p class=\"error\">Enter a valid email address before registering or sending.</p>");
  return false;
}

function validateCustomerContactMethod() {
  const phone = [
    form.elements["customer.phone1"]?.value,
    form.elements["customer.phone2"]?.value,
  ].some((value) => phoneDigits(value).length === 10);
  const email = isValidEmail(form.elements["customer.email"]?.value) && String(form.elements["customer.email"]?.value || "").trim();
  if (phone || email) return true;

  form.elements["customer.phone1"]?.focus();
  showResult("<p class=\"error\">Enter either a 10-digit customer phone number or a valid customer email.</p>");
  return false;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function validDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function datePartsFromValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validDateParts(year, month, day) ? { year, month, day } : null;
  }

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    return validDateParts(year, month, day) ? { year, month, day } : null;
  }

  const compact = raw.replace(/\D/g, "");
  if (compact.length === 8) {
    const month = Number(compact.slice(0, 2));
    const day = Number(compact.slice(2, 4));
    const year = Number(compact.slice(4));
    return validDateParts(year, month, day) ? { year, month, day } : null;
  }

  return null;
}

function formatDateFieldValue(value) {
  const parts = datePartsFromValue(value);
  if (!parts) return String(value || "").trim();
  return `${pad2(parts.month)}/${pad2(parts.day)}/${parts.year}`;
}

function dateInputValue(value) {
  const parts = datePartsFromValue(value);
  if (!parts) return "";
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function isDateFieldName(name) {
  if (directDateFieldNames.has(name)) return true;
  const key = String(name || "").split(".").pop();
  return rowDateFieldNames.has(key);
}

function dateInputs() {
  return [...form.querySelectorAll("input")].filter((input) => isDateFieldName(input.name));
}

function formatDateInput(input) {
  if (input.type === "date") {
    const iso = dateInputValue(input.value);
    if (iso) input.value = iso;
    return;
  }
  const formatted = formatDateFieldValue(input.value);
  if (formatted) input.value = formatted;
}

function fieldLabelForInput(input) {
  const label = input.closest("label");
  if (label) {
    const clone = label.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button").forEach((node) => node.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }
  return input.name || "date field";
}

function sectionNameForInput(input) {
  const section = input.closest("[data-section]");
  return section?.dataset.section || "";
}

function formatDateInputs() {
  dateInputs().forEach(formatDateInput);
}

function bindDateFormatting() {
  dateInputs().forEach((input) => {
    if (input.dataset.dateFormatBound === "1") return;
    input.dataset.dateFormatBound = "1";
    input.classList.add("date-input");
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.addEventListener("change", validateDateFields);
    input.addEventListener("blur", validateDateFields);
  });
}

function validateDateFields() {
  const invalid = dateInputs().find((input) => {
    const value = input.value.trim();
    if (!value) return false;
    const parts = datePartsFromValue(value);
    if (parts) {
      input.value = input.type === "date"
        ? `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
        : `${pad2(parts.month)}/${pad2(parts.day)}/${parts.year}`;
    }
    return !parts;
  });
  if (!invalid) return true;

  const targetSection = sectionNameForInput(invalid);
  if (targetSection && currentSection() !== targetSection) switchSection(targetSection);
  invalid.focus();
  showResult(`<p class="error">Use MM/DD/YYYY for ${escapeHtml(fieldLabelForInput(invalid))}.</p>`);
  return false;
}

function isCurrencyFieldName(name) {
  if (directCurrencyFieldNames.has(name)) return true;
  const key = String(name || "").split(".").pop();
  return rowCurrencyFieldNames.has(key);
}

function currencyInputs() {
  return [...form.querySelectorAll("input")].filter((input) => isCurrencyFieldName(input.name));
}

function parseCurrencyNumber(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function formatCurrencyFieldValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const amount = parseCurrencyNumber(raw);
  if (amount === null) return raw;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrencyInput(input) {
  input.value = formatCurrencyFieldValue(input.value);
}

function formatCurrencyInputs() {
  currencyInputs().forEach(formatCurrencyInput);
}

function bindCurrencyFormatting() {
  currencyInputs().forEach((input) => {
    if (input.dataset.currencyFormatBound === "1") return;
    input.dataset.currencyFormatBound = "1";
    input.classList.add("currency-input");
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.addEventListener("blur", () => formatCurrencyInput(input));
    input.addEventListener("change", () => formatCurrencyInput(input));
  });
}

function fieldInputValue(name, value, input = null) {
  const nextValue = value ?? "";
  if (isDateFieldName(name)) {
    return input?.type === "date" ? dateInputValue(nextValue) : formatDateFieldValue(nextValue);
  }
  if (isCurrencyFieldName(name)) {
    return formatCurrencyFieldValue(nextValue);
  }
  return nextValue;
}

const pageLabels = [
  { id: "customerInformation", page: 1, label: "Customer Information Sheet" },
  { id: "quickMeasurement", page: 2, label: "Quick Measurement Form" },
  { id: "salesEstimate", page: 3, label: "Sales Estimate" },
  { id: "legalDisclaimers", page: 4, label: "Florida Legal Disclaimers" },
  { id: "purchaseAgreement1", page: 5, label: "Purchase Agreement - Page 1/4" },
  { id: "purchaseAgreement2", page: 6, label: "Purchase Agreement - Page 2/4" },
  { id: "purchaseAgreement3", page: 7, label: "Purchase Agreement - Page 3/4" },
  { id: "agreementSignatures", page: 8, label: "Purchase Agreement - Page 4/4" },
  { id: "splitPaymentAddendum", page: 9, label: "Split Payment Addendum" },
  { id: "acknowledgementsReceipts", page: 10, label: "POS Acknowledgements / Receipts" },
  { id: "vendorJobOrders", page: 11, label: "Job Orders to Vendors" },
  { id: "additionalNotes", page: 12, label: "Additional Notes" },
  { id: "materialReceiving", page: 13, label: "Material / Receiving Lines" },
  { id: "chainOfCustody", page: 14, label: "Chain-of-Custody Release" },
  { id: "installerAgreement", page: 15, label: "Installer Job Agreement" },
  { id: "deliveryInstallationChecklist", page: 16, label: "Delivery/Installation Checklist" },
  { id: "deliverySignoff", page: 17, label: "Delivery Signoff Summary" },
  { id: "customerPickupRelease", page: 18, label: "Customer Pickup Release" },
];
const initialContractPages = [4, 5, 6, 7, 8];
const customerHiddenPages = [11, 13];
const customerFinalPacketPages = [10, 14, 15, 16, 17, 18];
const pairedCustomerPages = {
  15: 16,
};
const signaturePageMap = {
  materialHandling: 14,
  installChecklist: 16,
  deliverySignoff: 17,
  pickupRelease: 18,
};

const paymentKeys = ["amount", "dueDate", "paidInitials", "paidAmountDate"];
const vendorKeys = [
  "customerPayment",
  "vendor",
  "customerPaymentDate",
  "vendorEstimateNumber",
  "vendorOrderNumber",
  "vendorEstimateAmount",
  "vendorOrderDate",
  "expectedMaterialDate",
  "actualMaterialDate",
];
const materialKeys = [
  "date",
  "productCode",
  "poNumber",
  "supplier",
  "itemName",
  "styleColor",
  "unitCount",
  "unitCost",
  "total",
  "freight",
];

function editRequestFromLocation() {
  const match = window.location.pathname.match(/^\/contract\/([^/]+)\/edit$/);
  if (!match) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    packetId: decodeURIComponent(match[1]),
    revision: params.get("revision") === "1",
  };
}

function canonicalContractPath(pathname = window.location.pathname, search = window.location.search) {
  const params = new URLSearchParams(search);
  params.delete("restoreDraft");
  params.delete("section");
  params.delete("estimateFile");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

function draftStorageKey() {
  return `${draftStoragePrefix}${canonicalContractPath()}`;
}

function clearBrowserDraftSnapshots(keepKey = "") {
  try {
    Object.keys(sessionStorage).forEach((key) => {
      if (!key.startsWith(draftStoragePrefix)) return;
      if (keepKey && key === keepKey) return;
      sessionStorage.removeItem(key);
    });
  } catch (_error) {
    // Browser storage can be blocked; server autosave is still the source of truth.
  }
}

function lockOwnerLabel(lock) {
  return lock?.owner?.name || lock?.owner?.username || "another staff user";
}

function renderRecordLockPanel({ title, message, lock } = {}) {
  if (!recordLockPanel) return;
  if (!title && !message && !lock) {
    recordLockPanel.classList.add("hidden");
    recordLockPanel.innerHTML = "";
    return;
  }

  const expiresText = lock?.expiresAt ? ` If they closed their browser, the lock expires around ${formatDate(lock.expiresAt)}.` : "";
  recordLockPanel.innerHTML = `
    <h2>${escapeHtml(title || "Record locked")}</h2>
    <p>${escapeHtml(message || `${lockOwnerLabel(lock)} is currently editing this record. Try again after they save and exit.`)}${escapeHtml(expiresText)}</p>
  `;
  recordLockPanel.classList.remove("hidden");
}

function setRecordEditLocked(locked) {
  editState.lockBlocked = Boolean(locked);
  document.body.classList.toggle("record-edit-locked", Boolean(locked));
  const controls = [...form.querySelectorAll("input, select, textarea, button")];
  controls.forEach((control) => {
    if (control.id === "section-exit") return;
    if (control.id === "logout") return;
    control.disabled = Boolean(locked);
  });
}

function clearEditLockHeartbeat() {
  window.clearInterval(editLockHeartbeatTimer);
  editLockHeartbeatTimer = null;
}

async function acquireEditLock(packetId) {
  if (!packetId || editState.revision) return true;
  const response = await fetch(`/api/packets/${encodeURIComponent(packetId)}/edit-lock`, { method: "POST" });
  const data = await readJsonResponse(response);
  if (response.status === 423 || data.recordLocked) {
    setRecordEditLocked(true);
    renderRecordLockPanel({
      title: "Record in use",
      message: data.error,
      lock: data.lock,
    });
    return false;
  }
  if (!response.ok) throw new Error(data.error || "Could not lock this record for editing.");

  if (data.readonly) {
    renderRecordLockPanel({
      title: "Signed record",
      message: data.message || "This record is view-only. Create an edit for changes.",
    });
    return true;
  }

  editState.lockAcquired = Boolean(data.acquired);
  if (editState.lockAcquired) {
    renderRecordLockPanel({
      title: "Editing lock active",
      message: "This record is reserved for you while you work. Exit the contract when you are done so another staff user can edit it.",
      lock: data.lock,
    });
    clearEditLockHeartbeat();
    editLockHeartbeatTimer = window.setInterval(() => {
      fetch(`/api/packets/${encodeURIComponent(packetId)}/edit-lock`, { method: "POST" }).catch(() => null);
    }, 60000);
  }
  return true;
}

async function releaseEditLock({ beacon = false } = {}) {
  if (!editState.packetId || !editState.lockAcquired) return;
  const url = `/api/packets/${encodeURIComponent(editState.packetId)}/edit-lock/release`;
  editState.lockAcquired = false;
  clearEditLockHeartbeat();
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob(["{}"], { type: "application/json" }));
    return;
  }
  try {
    await fetch(`/api/packets/${encodeURIComponent(editState.packetId)}/edit-lock`, { method: "DELETE", keepalive: true });
  } catch (_error) {
    // The server-side lock also expires automatically if the browser disappears.
  }
}

function currentSection() {
  return tabButtons.find((button) => button.classList.contains("active"))?.dataset.sectionTab || sectionOrder[0];
}

function contractReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("restoreDraft", "1");
  params.set("section", currentSection());
  return `${window.location.pathname}?${params.toString()}`;
}

function estimateCustomerParams() {
  const params = new URLSearchParams({
    from: "contract",
    returnTo: contractReturnUrl(),
  });
  const firstName = form.elements["customer.firstName"]?.value.trim() || "";
  const lastName = form.elements["customer.lastName"]?.value.trim() || "";
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const phone = form.elements["customer.phone1"]?.value.trim() || "";
  const email = form.elements["customer.email"]?.value.trim() || "";
  const address = addressStringFromForm("order.install")
    || addressStringFromForm("customer.mailing")
    || "";

  if (name) params.set("customer", name);
  if (phone) params.set("phone", phone);
  if (email) params.set("email", email);
  if (address) params.set("address", address);
  if (lastName || name || phone) params.set("q", lastName || name || phone);
  return params;
}

function estimateToolUrl() {
  return `/estimates/new?${estimateCustomerParams().toString()}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function keyText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function renderInstallerDirectoryList() {
  if (!installerDirectoryList) return;
  installerDirectoryList.innerHTML = installerDirectoryRows
    .filter((installer) => installer?.name && installer.active !== false)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((installer) => `<option value="${escapeHtml(installer.name)}"></option>`)
    .join("");
}

async function loadInstallerDirectory() {
  if (!installerDirectoryList) return;
  try {
    const response = await fetch("/api/installers");
    if (response.status === 401) {
      window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    if (!response.ok) return;
    const data = await readJsonResponse(response);
    installerDirectoryRows = Array.isArray(data.installers) ? data.installers : [];
    renderInstallerDirectoryList();
  } catch (_error) {
    installerDirectoryRows = [];
    renderInstallerDirectoryList();
  }
}

async function saveInstallerNameToDirectory(name) {
  const installerName = String(name || "").trim();
  const installerKey = keyText(installerName);
  if (!installerKey || installerQuickAddKeys.has(installerKey)) return;
  installerQuickAddKeys.add(installerKey);

  try {
    const response = await fetch("/api/installers/quick-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: installerName,
        storeDepartment: "both",
      }),
    });
    if (!response.ok) return;
    const data = await readJsonResponse(response);
    if (!data.installer?.name) return;
    const existingIndex = installerDirectoryRows.findIndex((installer) => keyText(installer.name) === keyText(data.installer.name));
    if (existingIndex >= 0) {
      installerDirectoryRows[existingIndex] = data.installer;
    } else {
      installerDirectoryRows.push(data.installer);
    }
    renderInstallerDirectoryList();
  } catch (_error) {
    // Contract saving still continues if the shared installer list is unavailable.
  }
}

function legacyVendorEstimateKey(suffix) {
  const legacy = `${legacyEstimateKey.charAt(0).toUpperCase()}${legacyEstimateKey.slice(1)}`;
  return `vendor${legacy}${suffix}`;
}

function normalizeSectionName(value) {
  const section = String(value || "").trim();
  return section === legacyEstimateKey ? "estimate" : section;
}

function normalizePageSectionId(value) {
  const id = String(value || "").trim();
  if (id === legacySalesEstimateSectionId || id === generatedEstimateSectionId) return "salesEstimate";
  return id;
}

function normalizePacketPayload(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const data = { ...source };
  if (!data.estimate && source[legacyEstimateKey]) {
    data.estimate = source[legacyEstimateKey];
  }
  if (Array.isArray(source.vendors)) {
    data.vendors = source.vendors.map((row) => {
      const next = { ...(row || {}) };
      next.vendorEstimateNumber = next.vendorEstimateNumber || next[legacyVendorEstimateKey("Number")] || "";
      next.vendorEstimateAmount = next.vendorEstimateAmount || next[legacyVendorEstimateKey("Amount")] || "";
      return next;
    });
  }
  if (data.sections && Array.isArray(data.sections.included)) {
    data.sections = {
      ...data.sections,
      included: data.sections.included.map(normalizePageSectionId),
    };
  }
  return data;
}

function cleanAddressLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeState(value) {
  return String(value || "").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
}

function normalizeZip(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function zipLookupDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function splitZipCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function zipHeaderKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCaseCity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

async function loadZipLookupMap() {
  if (zipLookupMap) return zipLookupMap;
  if (zipLookupPromise) return zipLookupPromise;

  zipLookupPromise = fetch(zipLookupUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`ZIP lookup unavailable: ${response.status}`);
      return response.text();
    })
    .then((csv) => {
      const lines = csv.split(/\r?\n/).filter((line) => line.trim());
      const header = splitZipCsvLine(lines.shift() || "").map(zipHeaderKey);
      const indexFor = (names, fallback) => {
        const index = header.findIndex((key) => names.includes(key));
        return index >= 0 ? index : fallback;
      };
      const zipIndex = indexFor(["zipcode", "zip", "postalcode"], 0);
      const cityIndex = indexFor(["city", "place", "placename"], 1);
      const stateIndex = indexFor(["state", "stateabbr", "statecode"], 3);
      const map = new Map();

      lines.forEach((line) => {
        const cells = splitZipCsvLine(line);
        const zip = zipLookupDigits(cells[zipIndex]);
        const city = titleCaseCity(cells[cityIndex]);
        const state = normalizeState(cells[stateIndex]);
        if (zip && city && state && !map.has(zip)) {
          map.set(zip, { city, state });
        }
      });

      zipLookupMap = map;
      return map;
    })
    .catch(() => {
      zipLookupMap = new Map();
      return zipLookupMap;
    });

  return zipLookupPromise;
}

function cityStateZip(city, state, zip) {
  const cityValue = cleanAddressLine(city).replace(/,$/, "");
  const stateZip = [normalizeState(state), normalizeZip(zip)].filter(Boolean).join(" ");
  return [cityValue, stateZip].filter(Boolean).join(", ");
}

function addressPartsToString(parts = {}) {
  const street = cleanAddressLine(parts.street);
  const cityLine = cityStateZip(parts.city, parts.state, parts.zip);
  return [street, cityLine].filter(Boolean).join("\n");
}

function splitAddressParts(value) {
  const raw = String(value || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(cleanAddressLine)
    .filter(Boolean);
  const textValue = raw.join(" ");
  const empty = { street: "", city: "", state: "", zip: "" };
  if (!textValue) return empty;

  const parseCityLine = (line) => {
    const match = cleanAddressLine(line).match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    return match
      ? { city: cleanAddressLine(match[1]).replace(/,$/, ""), state: normalizeState(match[2]), zip: normalizeZip(match[3]) }
      : { city: cleanAddressLine(line), state: "", zip: "" };
  };

  if (raw.length > 1) {
    return {
      street: raw[0],
      ...parseCityLine(raw.slice(1).join(" ")),
    };
  }

  const suffixes = [
    "Avenue", "Ave", "Street", "St", "Road", "Rd", "Drive", "Dr", "Lane", "Ln",
    "Boulevard", "Blvd", "Court", "Ct", "Circle", "Cir", "Way", "Place", "Pl",
    "Terrace", "Ter", "Trail", "Trl", "Parkway", "Pkwy", "Highway", "Hwy",
    "Loop",
  ].join("|");
  const suffixMatch = textValue.match(new RegExp(`^(.+?(?:${suffixes})\\.?)\\s*(.+?),?\\s+([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)$`, "i"));
  if (suffixMatch) {
    return {
      street: cleanAddressLine(suffixMatch[1]),
      city: cleanAddressLine(suffixMatch[2]).replace(/,$/, ""),
      state: normalizeState(suffixMatch[3]),
      zip: normalizeZip(suffixMatch[4]),
    };
  }

  const commaMatch = textValue.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (commaMatch) {
    return {
      street: cleanAddressLine(commaMatch[1]),
      city: cleanAddressLine(commaMatch[2]).replace(/,$/, ""),
      state: normalizeState(commaMatch[3]),
      zip: normalizeZip(commaMatch[4]),
    };
  }

  return { ...empty, street: textValue };
}

function formatDate(value) {
  if (!value) return "Not listed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const dateText = `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
  const timeText = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateText}, ${timeText}`;
}

function statusLabel(value) {
  if (value === "completed") return "Completed";
  if (value === "signed") return "Signed";
  if (value === "accepted") return "Accepted";
  return "Signable";
}

function valueAtPath(source, dottedName) {
  return dottedName.split(".").reduce((ref, key) => (ref && ref[key] !== undefined ? ref[key] : undefined), source);
}

function setFieldValue(name, value) {
  const elements = form.elements[name];
  if (!elements) return;

  const list = elements instanceof RadioNodeList ? [...elements] : [elements];
  list.forEach((element) => {
    if (element.type === "checkbox") {
      element.checked = Boolean(value);
    } else {
      element.value = fieldInputValue(element.name, value, element);
    }
  });
}

function formFieldValue(name) {
  const element = form.elements[name];
  if (!element) return "";
  if (element instanceof RadioNodeList) {
    const checked = [...element].find((item) => item.checked);
    return checked?.value || "";
  }
  if (element.type === "checkbox") return element.checked ? "yes" : "";
  return (element.value || "").trim();
}

function addressFieldNames(prefix) {
  return {
    street: `${prefix}Street`,
    city: `${prefix}City`,
    state: `${prefix}State`,
    zip: `${prefix}Zip`,
  };
}

function addressInputs(prefix) {
  return Object.values(addressFieldNames(prefix))
    .map((name) => form.elements[name])
    .filter(Boolean);
}

function addressPartsFromForm(prefix) {
  const names = addressFieldNames(prefix);
  return {
    street: formFieldValue(names.street),
    city: formFieldValue(names.city),
    state: normalizeState(formFieldValue(names.state)),
    zip: normalizeZip(formFieldValue(names.zip)),
  };
}

function addressStringFromForm(prefix) {
  return addressPartsToString(addressPartsFromForm(prefix));
}

function setAddressParts(prefix, parts = {}) {
  const names = addressFieldNames(prefix);
  setFieldValue(names.street, parts.street || "");
  setFieldValue(names.zip, normalizeZip(parts.zip || ""));
  setFieldValue(names.city, parts.city || "");
  setFieldValue(names.state, normalizeState(parts.state || ""));
  if (parts.zip && (!parts.city || !parts.state)) {
    autofillAddressCityState(prefix, { overwrite: false });
  }
}

function setAddressFieldsFromValue(prefix, value) {
  setAddressParts(prefix, splitAddressParts(value));
}

function setAddressFieldsDisabled(prefix, disabled) {
  addressInputs(prefix).forEach((input) => {
    input.disabled = Boolean(disabled);
  });
}

function syncAfterAddressAutofill(prefix) {
  if (prefix === "customer.mailing") {
    syncBillingAddressFromMailing();
    return;
  }
  if (prefix === "customer.billing") {
    syncJobAddressFromCustomer();
  }
  updateCustomerIntakeSummary();
}

async function autofillAddressCityState(prefix, { overwrite = true } = {}) {
  const names = addressFieldNames(prefix);
  const zipInput = form.elements[names.zip];
  const cityInput = form.elements[names.city];
  const stateInput = form.elements[names.state];
  if (!zipInput || !cityInput || !stateInput) return;

  const zip = zipLookupDigits(zipInput.value);
  if (zipInput.value && zipInput.value !== zip) {
    setFieldValue(names.zip, zip);
  }
  if (zip.length !== 5) return;

  const lookup = await loadZipLookupMap();
  const match = lookup.get(zip);
  if (!match) return;

  const shouldSetCity = overwrite || !cityInput.value.trim();
  const shouldSetState = overwrite || !stateInput.value.trim();
  if (shouldSetCity) setFieldValue(names.city, match.city);
  if (shouldSetState) setFieldValue(names.state, match.state);
  if (shouldSetCity || shouldSetState) syncAfterAddressAutofill(prefix);
}

function bindZipCityStateLookup(prefix) {
  const names = addressFieldNames(prefix);
  const zipInput = form.elements[names.zip];
  if (!zipInput) return;

  zipInput.inputMode = "numeric";
  zipInput.maxLength = 5;
  zipInput.addEventListener("input", () => {
    zipInput.value = zipLookupDigits(zipInput.value);
    autofillAddressCityState(prefix, { overwrite: true });
  });
  zipInput.addEventListener("blur", () => {
    setFieldValue(names.zip, zipLookupDigits(formFieldValue(names.zip)));
    autofillAddressCityState(prefix, { overwrite: true });
  });
}

function syncSegmentedControls() {
  document.querySelectorAll("[data-segmented-select]").forEach((control) => {
    const select = form.elements[control.dataset.segmentedSelect];
    if (!select) return;
    control.querySelectorAll("button[data-value]").forEach((button) => {
      const active = button.dataset.value === select.value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  });
}

function customerDisplayName() {
  return [formFieldValue("customer.firstName"), formFieldValue("customer.lastName")].filter(Boolean).join(" ");
}

function updateCustomerIntakeSummary() {
  if (!customerProgressList || !customerRecordSummary) return;

  const name = customerDisplayName();
  const phone = formFieldValue("customer.phone1");
  const email = formFieldValue("customer.email");
  const textOptIn = formFieldValue("customer.textOptIn") === "no" ? "No" : "Yes";
  const socialMediaTag = {
    yes: "Yes",
    no: "No",
  }[formFieldValue("customer.socialMediaTagConsent")] || "Ask later";
  const socialMediaProfile = formFieldValue("customer.socialMediaProfile");
  const address = addressStringFromForm("customer.mailing") || addressStringFromForm("customer.billing");
  const contactComplete = Boolean(phoneDigits(phone).length === 10 || (email && isValidEmail(email)));
  const summaryRows = [
    ["Name", name ? "Entered" : "Waiting", Boolean(name)],
    ["Phone/email", contactComplete ? "Entered" : "Waiting", contactComplete],
    ["Text messages", textOptIn, true],
    ["Social media tag", socialMediaProfile ? `${socialMediaTag}: ${socialMediaProfile}` : socialMediaTag, socialMediaTag !== "Ask later" || Boolean(socialMediaProfile)],
    ["Address", address ? "Entered" : "Waiting", Boolean(address)],
  ];

  customerProgressList.innerHTML = summaryRows.map(([label, status, complete]) => `
    <div class="customer-progress-row${complete ? " complete" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(status)}</strong>
    </div>
  `).join("");

  const hasSummary = Boolean(name || phone || email || address);
  if (!hasSummary) {
    customerRecordSummary.textContent = "Customer summary will appear here after entry.";
    return;
  }

  const savedContractText = selectedCustomer?.contractCount
    ? `${selectedCustomer.contractCount} saved contract${selectedCustomer.contractCount === 1 ? "" : "s"}`
    : selectedCustomer ? "New customer record" : "Customer draft in progress";
  customerRecordSummary.innerHTML = `
    <strong>${escapeHtml(name || "Unnamed customer")}</strong>
    <span>${escapeHtml(phone || "No primary phone yet")}</span>
    <span>${escapeHtml(email || "No email yet")}</span>
    <span>${escapeHtml(address || "No address yet")}</span>
    <small>${escapeHtml(savedContractText)}</small>
  `;
}

function syncBillingAddressFromMailing() {
  if (!sameBillingAddressCheckbox) return;

  if (sameBillingAddressCheckbox.checked) {
    setAddressParts("customer.billing", addressPartsFromForm("customer.mailing"));
  }
  setAddressFieldsDisabled("customer.billing", sameBillingAddressCheckbox.checked);
  syncJobAddressFromCustomer();
  updateCustomerIntakeSummary();
}

function customerAddressPartsForJob() {
  const preferredSource = form.elements["order.installStreet"]?.dataset.autoSource;
  if (preferredSource && addressStringFromForm(preferredSource)) {
    return addressPartsFromForm(preferredSource);
  }

  if (addressStringFromForm("customer.mailing")) return addressPartsFromForm("customer.mailing");
  if (addressStringFromForm("customer.billing")) return addressPartsFromForm("customer.billing");
  return { street: "", city: "", state: "", zip: "" };
}

function syncJobAddressFromCustomer({ force = false } = {}) {
  const installStreet = form.elements["order.installStreet"];
  if (!installStreet) return;

  const parts = customerAddressPartsForJob();
  const address = addressPartsToString(parts);
  if (!address) return;

  const current = addressStringFromForm("order.install");
  const autoConnected = installStreet.dataset.autoConnected === "customer";
  if (force || !current || autoConnected) {
    setAddressParts("order.install", parts);
    installStreet.dataset.autoConnected = "customer";
  }
}

function clearCustomerInfo() {
  [
    "customer.firstName",
    "customer.lastName",
    "customer.phone1",
    "customer.phone2",
    "customer.email",
    "customer.socialMediaProfile",
    "customer.referral",
    "customer.mailingStreet",
    "customer.mailingCity",
    "customer.mailingState",
    "customer.mailingZip",
    "customer.billingStreet",
    "customer.billingCity",
    "customer.billingState",
    "customer.billingZip",
    "customer.notes",
  ].forEach((name) => setFieldValue(name, ""));

  setFieldValue("customer.textOptIn", "yes");
  setFieldValue("customer.socialMediaTagConsent", "");
  setFieldValue("delivery.emailCustomerLink", true);
  if (sameBillingAddressCheckbox) sameBillingAddressCheckbox.checked = false;
  selectedCustomer = null;
  selectedCustomerPanel?.classList.add("hidden");
  syncBillingAddressFromMailing();
  syncSegmentedControls();
  updateCustomerIntakeSummary();
  form.elements["customer.firstName"]?.focus();
}

function populateRowValues(prefix, keys, rows) {
  rows.forEach((row, index) => {
    keys.forEach((key) => {
      const input = form.elements[`${prefix}.${index}.${key}`];
      if (input) input.value = fieldInputValue(input.name, row?.[key] || "", input);
    });
  });
}

function populatePacketForm(data) {
  data = normalizePacketPayload(data);
  [
    "customer.firstName",
    "customer.lastName",
    "customer.phone1",
    "customer.phone2",
    "customer.email",
    "customer.textOptIn",
    "customer.socialMediaTagConsent",
    "customer.socialMediaProfile",
    "customer.referral",
    "customer.mailingStreet",
    "customer.mailingCity",
    "customer.mailingState",
    "customer.mailingZip",
    "customer.billingStreet",
    "customer.billingCity",
    "customer.billingState",
    "customer.billingZip",
    "customer.notes",
    "delivery.emailCustomerLink",
    "order.invoiceNumber",
    "order.invoiceAmount",
    "order.installStreet",
    "order.installCity",
    "order.installState",
    "order.installZip",
    "order.saleDate",
    "order.installDate",
    "order.installerName",
    "order.salesRep",
    "order.measurementDate",
    "order.customerAcceptedDate",
    "order.storeRep",
    "order.storeRepTitle",
    "order.storeRepDate",
    "order.storeSignatureId",
    "project.roomType",
    "project.roomTypeOther",
    "project.projectType",
    "project.desiredTimeline",
    "project.totalWallLength",
    "project.ceilingHeight",
    "project.hasIsland",
    "project.islandSize",
    "project.refrigeratorWidth",
    "project.rangeCooktopSize",
    "project.dishwasher",
    "project.dishwasherOther",
    "project.cabinetStyle",
    "project.finish",
    "project.budgetRange",
    "project.projectNotes",
    "estimate.sourcePath",
    "estimate.sourceUrl",
    "estimate.estimateNumber",
    "estimate.fileName",
    "estimate.selectedEstimateFile",
    "estimate.estimateStatus",
    "estimate.acceptedFromEstimate",
    "estimate.changedAfterAcceptance",
    "estimate.approvalBypassed",
    "estimate.approvalBypassedAt",
    "estimate.notes",
    "payments.splitPaymentApproved",
    "payments.totalInvoiceAmount",
    "notes.companyNotes",
    "notes.internalNotes",
  ].forEach((name) => setFieldValue(name, valueAtPath(data, name)));

  if (!addressStringFromForm("customer.mailing")) {
    setAddressFieldsFromValue("customer.mailing", data.customer?.mailingAddress);
  }
  if (!addressStringFromForm("customer.billing")) {
    setAddressFieldsFromValue("customer.billing", data.customer?.billingAddress);
  }
  if (!addressStringFromForm("order.install")) {
    setAddressFieldsFromValue("order.install", data.order?.installAddress);
  }

  setPages(data.pages?.included || initialContractPages);
  const signingSections = new Set(data.signing?.sections || ["mainAgreement"]);
  form.querySelectorAll('[name="signing.sections"]').forEach((input) => {
    input.checked = input.value === "mainAgreement" || signingSections.has(input.value);
  });

  populateRowValues("payments", paymentKeys, data.payments?.rows || []);
  populateRowValues("vendors", vendorKeys, data.vendors || []);
  populateRowValues("materials", materialKeys, data.materialRows || []);
  formatPhoneInputs();
  formatDateInputs();
  formatCurrencyInputs();
  syncStoreRepSelectFromFields();
  syncBillingAddressFromMailing();
  syncSegmentedControls();
  updateCustomerIntakeSummary();
  scheduleServerDraftAutosave();
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function safeEstimateFileName(fileName) {
  const raw = String(fileName || "").trim();
  const base = raw.split(/[\\/]/).pop();
  return base && /\.pdf$/i.test(base) ? base : "";
}

function estimatePreviewUrl(fileName) {
  const safeName = safeEstimateFileName(fileName);
  return safeName
    ? `/api/estimates/${encodeURIComponent(safeName)}/download#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
    : "";
}

function normalizeEstimateReference(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.pdf$/i, "");
}

function estimateReferenceValues(estimate = {}) {
  return [
    estimate.estimateId,
    estimate.estimateNumber,
    estimate.pdfFilename,
    estimate.generatedPdfFilename,
  ].map(normalizeEstimateReference).filter(Boolean);
}

function estimateMatchesFile(estimate = {}, fileName = "") {
  const target = normalizeEstimateReference(fileName);
  if (!target) return false;
  const values = estimateReferenceValues(estimate);
  if (values.includes(target)) return true;
  return values.some((value) => value && target.includes(value));
}

function splitCustomerName(name = "") {
  const value = String(name || "").trim();
  if (!value) return { firstName: "", lastName: "" };
  if (value.includes(",")) {
    const [lastName, ...firstParts] = value.split(",").map((part) => part.trim()).filter(Boolean);
    return { firstName: firstParts.join(" "), lastName: lastName || "" };
  }
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  const suffixPattern = /^(?:jr|sr|ii|iii|iv|v)\.?$/i;
  const lastNameStart = suffixPattern.test(parts.at(-1)) ? Math.max(2, parts.length - 2) : 2;
  return {
    firstName: parts.slice(0, 2).join(" "),
    lastName: parts.slice(lastNameStart).join(" "),
  };
}

function setFieldValueIfPresent(name, value, { onlyIfBlank = false } = {}) {
  const text = String(value || "").trim();
  if (!text) return;
  if (onlyIfBlank && formFieldValue(name)) return;
  setFieldValue(name, text);
}

function signatureOwnedByCurrentStaff(signature = {}) {
  const username = String(currentStaffUser?.username || "").toLowerCase();
  if (!username) return false;
  const ownerUsername = String(signature.ownerUsername || "").toLowerCase();
  if (ownerUsername) return ownerUsername === username;
  return keyText(signature.name) && keyText(signature.name) === keyText(currentStaffUser?.name || currentStaffUser?.username);
}

function currentStaffSignature() {
  return (settingsCache?.signatures || []).find(signatureOwnedByCurrentStaff) || null;
}

function signatureById(id) {
  return (settingsCache?.signatures || []).find((signature) => signature.id === id);
}

function selectedStoreRepIsCurrentStaff() {
  const selectedRep = storeRepProfiles.find((profile) => profile.id === storeRepSelect.value)
    || storeRepProfiles.find((profile) => (
      profile.name === form.elements["order.storeRep"]?.value
      && profile.title === form.elements["order.storeRepTitle"]?.value
    ));
  if (!selectedRep || !currentStaffUser?.username) return false;
  return String(selectedRep.username || "").toLowerCase() === String(currentStaffUser.username || "").toLowerCase();
}

function estimateCustomerAddress(estimate = {}) {
  return addressPartsToString({
    street: estimate.customerStreet || "",
    city: estimate.customerCity || "",
    state: estimate.customerState || "",
    zip: estimate.customerZip || "",
  }) || estimate.customerAddress || "";
}

function applyEstimateDataToContract(estimate = {}) {
  const customerName = estimate.customer || "";
  const nameParts = splitCustomerName(customerName);
  const estimateAddress = estimateCustomerAddress(estimate);
  const estimateTotal = estimate.grandTotal ?? estimate.cabinetTotal ?? "";

  setFieldValueIfPresent("customer.firstName", nameParts.firstName);
  setFieldValueIfPresent("customer.lastName", nameParts.lastName || customerName);
  setFieldValueIfPresent("customer.phone1", estimate.customerPhone);
  setFieldValueIfPresent("customer.email", estimate.customerEmail);
  setFieldValueIfPresent("estimate.estimateNumber", estimate.estimateNumber || estimate.estimateId);
  setFieldValueIfPresent("estimate.estimateStatus", estimate.estimateStatus);
  if (String(estimate.estimateStatus || "").toLowerCase() === "accepted") {
    setFieldValueIfPresent("estimate.acceptedFromEstimate", "true");
  }
  if (estimate.changedAfterAcceptance) setFieldValueIfPresent("estimate.changedAfterAcceptance", "true");
  if (estimate.approvalBypassed) setFieldValueIfPresent("estimate.approvalBypassed", "true");
  if (estimate.approvalBypassedAt) setFieldValueIfPresent("estimate.approvalBypassedAt", estimate.approvalBypassedAt);
  setFieldValueIfPresent("order.invoiceAmount", estimateTotal, { onlyIfBlank: true });
  setFieldValueIfPresent("payments.totalInvoiceAmount", estimateTotal, { onlyIfBlank: true });

  if (estimateAddress) {
    setAddressFieldsFromValue("order.install", estimateAddress);
    if (!addressStringFromForm("customer.mailing")) setAddressFieldsFromValue("customer.mailing", estimateAddress);
  }

  formatPhoneInputs();
  formatCurrencyInputs();
  syncBillingAddressFromMailing();
  syncSegmentedControls();
  updateCustomerIntakeSummary();
}

function applyEstimateParamsToContract(params) {
  const customer = params.get("customer") || "";
  const nameParts = splitCustomerName(customer);
  const estimateAddress = params.get("estimateAddress") || params.get("address") || "";

  setFieldValueIfPresent("customer.firstName", nameParts.firstName);
  setFieldValueIfPresent("customer.lastName", nameParts.lastName || customer);
  setFieldValueIfPresent("customer.phone1", params.get("phone"));
  setFieldValueIfPresent("customer.email", params.get("email"));
  setFieldValueIfPresent("estimate.estimateNumber", params.get("estimateNumber") || params.get("estimateId"));
  setFieldValueIfPresent("estimate.estimateStatus", params.get("estimateStatus"));
  setFieldValueIfPresent("order.invoiceAmount", params.get("estimateTotal"), { onlyIfBlank: true });
  setFieldValueIfPresent("payments.totalInvoiceAmount", params.get("estimateTotal"), { onlyIfBlank: true });
  if (params.get("estimateAccepted") === "1") {
    setFieldValueIfPresent("estimate.acceptedFromEstimate", "true");
  }
  const changedAfterAcceptance = params.get("estimateChangedAfterAcceptance") === "1";
  const approvalBypassed = params.get("estimateApprovalBypassed") === "1";
  if (changedAfterAcceptance) setFieldValueIfPresent("estimate.changedAfterAcceptance", "true");
  if (approvalBypassed) {
    setFieldValueIfPresent("estimate.approvalBypassed", "true");
    setFieldValueIfPresent("estimate.approvalBypassedAt", params.get("estimateApprovalBypassedAt") || new Date().toISOString());
    const notes = form.elements["estimate.notes"];
    const bypassNote = params.get("estimateApprovalBypassedReason")
      || (changedAfterAcceptance
        ? "Store bypassed changed-estimate approval to start this contract."
        : "Store attached estimate before customer acceptance.");
    if (notes && !notes.value.includes(bypassNote)) {
      notes.value = [notes.value.trim(), bypassNote].filter(Boolean).join("\n");
    }
  }
  if (estimateAddress) {
    setAddressFieldsFromValue("order.install", estimateAddress);
    if (!addressStringFromForm("customer.mailing")) setAddressFieldsFromValue("customer.mailing", estimateAddress);
  }
  formatPhoneInputs();
  syncBillingAddressFromMailing();
  updateCustomerIntakeSummary();
  scheduleServerDraftAutosave();
}

async function applyEstimateMetadataForFile(fileName) {
  const safeName = safeEstimateFileName(fileName);
  if (!safeName) return;
  try {
    const response = await fetch("/api/estimate-module/sync/pull");
    if (!response.ok) return;
    const data = await readJsonResponse(response);
    const estimate = (data.estimates || []).find((item) => estimateMatchesFile(item, safeName));
    if (!estimate) return;
    applyEstimateDataToContract(estimate);
    estimateFolderStatus.textContent = "Estimate selected and customer details loaded.";
  } catch (_error) {
    // The selected PDF still attaches even when estimate metadata is unavailable.
  }
}

function renderEstimateFiles(files) {
  const selectedFile = form.elements["estimate.selectedEstimateFile"]?.value || "";

  if (!files.length) {
    estimateFileList.innerHTML = selectedFile
      ? `
        <button class="estimate-file-option active" type="button" data-estimate-file="${escapeHtml(selectedFile)}">
          <span>
            <strong>${escapeHtml(selectedFile)}</strong>
            <small>Selected from estimate tool</small>
          </span>
          <span>Selected</span>
        </button>
      `
      : '<p class="muted-text">No estimate PDFs found.</p>';
    return;
  }

  estimateFileList.innerHTML = files.map((file) => {
    const selected = file.fileName === selectedFile;
    return `
      <button class="estimate-file-option${selected ? " active" : ""}" type="button" data-estimate-file="${escapeHtml(file.fileName)}">
        <span>
          <strong>${escapeHtml(file.fileName)}</strong>
          <small>${formatDate(file.updatedAt)} - ${formatFileSize(file.size)}</small>
        </span>
        <span>${selected ? "Selected" : "Attach"}</span>
      </button>
    `;
  }).join("");
}

async function loadEstimateFiles(query = "") {
  if (!estimateFileList) return;
  const cleanedQuery = String(query || "").trim();
  if (!cleanedQuery && !form.elements["estimate.selectedEstimateFile"]?.value) {
    estimateFiles = [];
    estimateFolderStatus.textContent = "Search customer, date, or filename to find saved estimates.";
    estimateFileList.innerHTML = "";
    estimatePreviewButton?.classList.add("hidden");
    estimatePreview.removeAttribute("src");
    estimatePreview.classList.add("hidden");
    return;
  }

  estimateFolderStatus.textContent = "Loading saved estimates...";
  try {
    const response = await fetch(`/api/estimates?q=${encodeURIComponent(cleanedQuery)}`);
    if (response.status === 401) {
      window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Could not load saved estimates.");

    estimateFolderPath = data.folderPath || "";
    estimateFiles = data.files || [];
    if (!form.elements["estimate.sourcePath"].value && estimateFolderPath) {
      form.elements["estimate.sourcePath"].value = estimateFolderPath;
    }
    estimateFolderStatus.textContent = form.elements["estimate.selectedEstimateFile"]?.value
      ? "Estimate selected for this contract."
      : "Saved estimates ready.";
    renderEstimateFiles(estimateFiles);
  } catch (error) {
    estimateFolderStatus.textContent = error.message;
    estimateFileList.innerHTML = "";
  }
}

function selectedEstimateFileChanged(payload) {
  const selected = payload.estimate.selectedEstimateFile;
  const previous = editState.packet?.data?.estimate?.selectedEstimateFile || "";
  return Boolean(selected && selected !== previous);
}

function selectEstimateFile(fileName) {
  const safeName = safeEstimateFileName(fileName);
  if (!safeName) return;
  const file = estimateFiles.find((item) => item.fileName === safeName) || {
    fileName: safeName,
    url: estimatePreviewUrl(safeName),
  };

  form.elements["estimate.selectedEstimateFile"].value = file.fileName;
  form.elements["estimate.fileName"].value = file.fileName;
  form.elements["estimate.sourcePath"].value = estimateFolderPath || form.elements["estimate.sourcePath"].value;
  estimateFileInput.value = "";
  estimatePreview.removeAttribute("src");
  estimatePreview.classList.add("hidden");
  estimatePreviewButton?.classList.remove("hidden");
  includePage(3);
  renderEstimateFiles(estimateFiles);
  estimateFolderStatus.textContent = "Estimate selected for this contract.";
  setContractSetupCollapsed(true);
  applyEstimateMetadataForFile(file.fileName);
  scheduleServerDraftAutosave();
}

async function selectEstimateFromReturnIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const fileName = safeEstimateFileName(params.get("estimateFile"));
  if (!fileName) return;
  const estimateAddress = params.get("estimateAddress") || "";

  if (estimateSearchInput) estimateSearchInput.value = fileName;
  switchSection("estimate");
  selectEstimateFile(fileName);
  await loadEstimateFiles(fileName);
  selectEstimateFile(fileName);
  applyEstimateParamsToContract(params);
  if (estimateAddress) setAddressFieldsFromValue("order.install", estimateAddress);
  await applyEstimateMetadataForFile(fileName);
  setContractWorkflowVisible(true);
  setContractSetupCollapsed(true);
  setCompactResult(`<p><strong>Estimate attached.</strong> ${escapeHtml(fileName)}</p>`);
  switchSection("customer");
}

function actorLabel(actor) {
  if (!actor) return "Unassigned";
  return actor.name || actor.username || "Unknown";
}

function contractDisplayLabel(record) {
  const revision = Number(record?.revisionNumber || 0);
  const rawContract = String(record?.contractNumber || record?.id || "");
  const baseContract = record?.revisionBaseContractNumber || rawContract.replace(/-E\d+$/i, "");
  if (!revision) return `${baseContract || rawContract || "Contract"} Original`;
  return `${baseContract || rawContract || "Contract"} Edit ${revision}`;
}

function renderOwnerTransfer(packet) {
  if (!packet || editState.revision || packet.locked) {
    contractOwnerPanel.classList.add("hidden");
    return;
  }

  const owner = packet.owner || packet.createdBy;
  contractOwnerCopy.textContent = `Current draft owner: ${actorLabel(owner)}. Created by: ${actorLabel(packet.createdBy)}.`;
  contractOwnerSelect.innerHTML = staffUsers.map((user) => (
    `<option value="${escapeHtml(user.username)}"${user.username === owner?.username ? " selected" : ""}>${escapeHtml(user.name || user.username)}</option>`
  )).join("");
  contractOwnerPanel.classList.remove("hidden");
}

function renderVersions(packet) {
  const versions = packet.versions || [];
  if (!versions.length) return "";

  return `
    <strong>Saved draft versions</strong>
    ${versions.map((version, index) => `
      <div class="history-row">
        <span>${escapeHtml(version.label || `Version ${index + 1}`)}</span>
        <span>${escapeHtml(actorLabel(version.by))}</span>
        <span>${formatDate(version.savedAt)}</span>
        <button type="button" data-load-version="${escapeHtml(version.id)}">Load this version</button>
      </div>
    `).join("")}
  `;
}

function signedContractPanelHtml(packet) {
  if (!packet.finalPdfUrl) return "";

  return `
    <strong>Signed contract copy</strong>
    <div class="history-row">
      <span>${escapeHtml(contractDisplayLabel(packet))}</span>
      <span>${packet.finalizedAt ? `Signed ${escapeHtml(formatDate(packet.finalizedAt))}` : "Signed"}</span>
      <span>View-only</span>
      <a href="${escapeHtml(packet.finalPdfUrl)}" target="_blank" rel="noreferrer">Open signed PDF</a>
    </div>
    ${packet.signablePdfUrl ? `
      <div class="history-row">
        <span>Original signable PDF</span>
        <span>${escapeHtml(statusLabel(packet.status))}</span>
        <span>${escapeHtml(formatDate(packet.createdAt))}</span>
        <a href="${escapeHtml(packet.signablePdfUrl)}" target="_blank" rel="noreferrer">Open</a>
      </div>
    ` : ""}
  `;
}

function renderEditHistory(packet) {
  const history = packet.history || [];
  const versionsHtml = renderVersions(packet);
  const signedPanelHtml = signedContractPanelHtml(packet);
  if (!history.length && !versionsHtml && !signedPanelHtml) {
    editHistory.innerHTML = "";
    return;
  }

  editHistory.innerHTML = `
    ${signedPanelHtml}
    ${versionsHtml}
    ${history.length ? `
      <strong>Contract edit history</strong>
      ${history.map((item) => `
        <div class="history-row">
          <span>${escapeHtml(contractDisplayLabel(item))}</span>
          <span>${statusLabel(item.status)}</span>
          <span>${formatDate(item.createdAt)}</span>
          ${item.id === packet.id ? "<strong>Current</strong>" : `<a href="/contract/${encodeURIComponent(item.id)}/edit">Open</a>`}
        </div>
      `).join("")}
    ` : ""}
  `;
}

async function loadEditPacketIfNeeded() {
  const request = editRequestFromLocation();
  if (!request) return;

  const response = await fetch(`/api/packets/${encodeURIComponent(request.packetId)}/admin`);
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const packet = await readJsonResponse(response);
  if (!response.ok) throw new Error(packet.error || "Could not load contract.");

  editState = {
    packetId: packet.id,
    revision: request.revision,
    packet,
    loadedVersionData: null,
    lockAcquired: false,
    lockBlocked: false,
  };

  await acquireEditLock(packet.id);
  document.body.classList.add("editing-contract");
  populatePacketForm(packet.data);
  editModePanel.classList.remove("hidden");
  const viewOnlySigned = Boolean(packet.locked && !request.revision);
  editModeTitle.textContent = request.revision ? "Create Edit" : viewOnlySigned ? "View Signed Contract" : "Edit Draft Contract";
  editModeCopy.textContent = request.revision
    ? `${contractDisplayLabel(packet)} is locked. This will create the next editable contract record.`
    : viewOnlySigned
      ? `${contractDisplayLabel(packet)} is signed and view-only. Use the signed PDF below, or create an edit if changes are needed.`
    : `${contractDisplayLabel(packet)} is still editable because it has not been accepted/signed/completed.`;
  submitButton.textContent = request.revision ? "Create edit" : "Save draft";
  document.querySelector("h1").textContent = request.revision ? "Create Edit" : viewOnlySigned ? "View Signed Contract" : "Edit Contract";
  document.title = request.revision ? "Create Edit" : viewOnlySigned ? "View Signed Contract" : "Edit Contract";
  renderOwnerTransfer(packet);
  renderEditHistory(packet);
    setContractWorkflowVisible(true);
    updateFinalActions(currentSection());

    result.classList.add("hidden");
    result.innerHTML = "";
}

function applyCustomerSearchFromUrl() {
  if (editRequestFromLocation()) return;
  const query = new URLSearchParams(window.location.search).get("customerSearch")?.trim();
  if (!query) return;
  customerRecordSearchInput.value = query;
  runCustomerSearch(query);
}

function makeRows(container, prefix, keys, count) {
  container.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const tr = document.createElement("tr");
    keys.forEach((key) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.name = `${prefix}.${index}.${key}`;
      td.append(input);
      tr.append(td);
    });
    container.append(tr);
  }
}

function renderPageOptions() {
  pageOptions.innerHTML = "";
  pageLabels.forEach(({ id, page, label }) => {
    const wrapper = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "pages.included";
    input.value = String(page);
    input.dataset.sectionId = id;
    input.checked = initialContractPages.includes(page);
    if (page === 4 || customerHiddenPages.includes(page)) {
      input.disabled = true;
    }
    if (customerHiddenPages.includes(page)) {
      input.checked = false;
      wrapper.classList.add("internal-page-option");
    } else if (customerFinalPacketPages.includes(page)) {
      wrapper.classList.add("final-page-option");
    }
    const suffix = customerHiddenPages.includes(page)
      ? " (internal only)"
      : customerFinalPacketPages.includes(page)
        ? " (customer final packet when applicable)"
        : "";
    wrapper.append(input, `${label}${suffix} (template p. ${page})`);
    pageOptions.append(wrapper);
  });
}

function setPages(pages) {
  const selected = new Set(pages.map(String));
  [...form.querySelectorAll('[name="pages.included"]')].forEach((input) => {
    input.checked = input.value === "4" || (!customerHiddenPages.includes(Number(input.value)) && selected.has(input.value));
  });
}

function includePage(page) {
  const input = form.querySelector(`[name="pages.included"][value="${page}"]`);
  if (input && !input.disabled && !customerHiddenPages.includes(page)) {
    input.checked = true;
  }
}

function excludePage(page) {
  const input = form.querySelector(`[name="pages.included"][value="${page}"]`);
  if (input && !input.disabled && page !== 4) {
    input.checked = false;
  }
}

function includePairedPages(payload) {
  Object.entries(pairedCustomerPages).forEach(([source, paired]) => {
    if (payload.pages.included.includes(Number(source)) && !payload.pages.included.includes(paired)) {
      payload.pages.included.push(paired);
    }
  });
}

function sectionIdsForPages(pages) {
  return [
    ...new Set(
      pages
        .map((page) => form.querySelector(`[name="pages.included"][value="${page}"]`)?.dataset.sectionId)
        .filter(Boolean),
    ),
  ];
}

function syncEstimatePagePayload(payload) {
  const hasComputerEstimateFile = Boolean(estimateFileInput?.files?.length);
  const preservesExistingEstimate = !payload.estimate.selectedEstimateFile
    && !hasComputerEstimateFile
    && !selectedEstimateFileChanged(payload)
    && Boolean(editState.packet?.data?.estimate?.dataUrl);
  const hasEstimateAttachment = Boolean(
    payload.estimate.dataUrl
      || payload.estimate.selectedEstimateFile
      || hasComputerEstimateFile
      || preservesExistingEstimate,
  );

  if (hasEstimateAttachment) {
    if (!payload.pages.included.includes(3)) {
      payload.pages.included.push(3);
    }
    includePage(3);
  } else {
    payload.pages.included = payload.pages.included.filter((page) => page !== 3);
    excludePage(3);
  }

  if (!payload.pages.included.includes(4)) {
    payload.pages.included.push(4);
  }

  payload.pages.included.sort((a, b) => a - b);
  payload.sections.included = sectionIdsForPages(payload.pages.included);
}

function setTodayDefaults() {
  const now = new Date();
  const today = `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}/${now.getFullYear()}`;
  ["order.saleDate", "order.measurementDate", "order.customerAcceptedDate", "order.storeRepDate"].forEach((name) => {
    setFieldValue(name, today);
  });
}

async function loadBusinessSettings() {
  const response = await fetch("/api/settings");
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const settings = await readJsonResponse(response);
  const serverDataResetId = String(settings.dataResetId || "").trim();
  const localDataResetId = sessionStorage.getItem("edgewater-contract-data-reset-id") || "";
  currentDataResetId = serverDataResetId;
  if (serverDataResetId && localDataResetId && localDataResetId !== serverDataResetId) {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(draftStoragePrefix)) sessionStorage.removeItem(key);
    });
    lastServerDraftSerialized = "";
    setDraftStatus("Old browser drafts were cleared after the server reset.", "warning");
  }
  if (serverDataResetId) sessionStorage.setItem("edgewater-contract-data-reset-id", serverDataResetId);

  settingsCache = settings;
  currentStaffUser = settings.currentStaff || null;
  const staffRepProfiles = staffUsers
    .filter((user) => user.name && !user.disabled)
    .map((user) => ({
      id: `staff:${user.id || user.username}`,
      name: user.name,
      title: user.title || (user.role === "admin" ? "Admin" : user.role === "sales_manager" ? "Sales Manager" : "Salesperson"),
      signatureId: user.signatureId || "",
      staffUser: true,
      username: user.username,
    }));
  storeRepProfiles = staffRepProfiles;

  if (salesRepList) {
    salesRepList.innerHTML = staffUsers
      .filter((user) => user.name)
      .map((user) => `<option value="${escapeHtml(user.name)}"></option>`)
      .join("");
  }

  storeRepSelect.innerHTML = '<option value="">Manual / no staff signature</option>';
  storeRepProfiles.forEach((rep) => {
    const option = document.createElement("option");
    option.value = rep.id;
    option.textContent = rep.title ? `${rep.name} - ${rep.title}` : rep.name;
    storeRepSelect.append(option);
  });

  const currentSignatures = (settings.signatures || []).filter(signatureOwnedByCurrentStaff);
  storeSignatureSelect.innerHTML = '<option value="">Manual signature / no digital image</option>';
  currentSignatures.forEach((signature) => {
    const option = document.createElement("option");
    option.value = signature.id;
    option.textContent = signature.name;
    storeSignatureSelect.append(option);
  });
  if (currentStaffUser?.signatureId && currentSignatures.some((signature) => signature.id === currentStaffUser.signatureId)) {
    storeSignatureSelect.value = currentStaffUser.signatureId;
  }

  if (!form.elements["order.salesRep"].value && currentStaffUser?.name) {
    form.elements["order.salesRep"].value = currentStaffUser.name;
  }

  if (!form.elements["order.storeRep"].value) {
    const defaultRep = storeRepProfiles.find((rep) => (
      rep.name === settings.defaultStoreRep && rep.title === settings.defaultStoreRepTitle
    )) || storeRepProfiles.find((rep) => rep.name === currentStaffUser?.name) || storeRepProfiles[0];

    if (defaultRep) {
      applyStoreRep(defaultRep);
    } else if (settings.defaultStoreRep) {
      form.elements["order.storeRep"].value = settings.defaultStoreRep;
      form.elements["order.storeRepTitle"].value = settings.defaultStoreRepTitle || "";
    } else if (currentStaffUser?.name) {
      form.elements["order.storeRep"].value = currentStaffUser.name;
    }
  }

  syncStoreRepSelectFromFields();
  syncSignatureSetupLink();
}

async function loadStaffUsers() {
  const response = await fetch("/api/staff-users");
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const data = await readJsonResponse(response);
  staffUsers = data.users || [];
}

function applyStoreRep(rep) {
  form.elements["order.storeRep"].value = rep.name || "";
  form.elements["order.storeRepTitle"].value = rep.title || "";
  const signature = currentStaffSignature();
  storeSignatureSelect.value = signature ? signature.id : "";
  storeRepSelect.value = rep.id || "";
  syncSignatureSetupLink();
}

function syncStoreRepSelectFromFields() {
  const repName = form.elements["order.storeRep"]?.value || "";
  const repTitle = form.elements["order.storeRepTitle"]?.value || "";
  const rep = storeRepProfiles.find((profile) => profile.name === repName && profile.title === repTitle);
  storeRepSelect.value = rep?.id || "";
  syncSignatureSetupLink();
}

function syncSignatureSetupLink() {
  if (!storeSignatureSetupLink) return;
  const signature = currentStaffSignature();
  const canUseDigitalSignature = selectedStoreRepIsCurrentStaff();
  if (!canUseDigitalSignature) storeSignatureSelect.value = "";
  storeSignatureSelect.disabled = !canUseDigitalSignature;
  const selectedSignature = canUseDigitalSignature ? signatureById(storeSignatureSelect.value) : null;
  if (storeSignaturePreview) {
    if (selectedSignature?.dataUrl) {
      storeSignaturePreview.src = selectedSignature.dataUrl;
      storeSignaturePreview.classList.remove("hidden");
    } else {
      storeSignaturePreview.removeAttribute("src");
      storeSignaturePreview.classList.add("hidden");
    }
  }
  storeSignatureSetupLink.textContent = signature ? "Replace My Signature" : "Add My Signature";
  storeSignatureSetupLink.disabled = !canUseDigitalSignature;
  storeSignatureSetupLink.title = canUseDigitalSignature
    ? "Add or replace your own saved signature."
    : "Only the selected staff user can add or apply their own signature.";
}

function setDeep(target, dottedName, value) {
  const parts = dottedName.split(".");
  let ref = target;
  while (parts.length > 1) {
    const part = parts.shift();
    ref[part] = ref[part] || {};
    ref = ref[part];
  }
  ref[parts[0]] = value;
}

function rowsFrom(prefix, keys, count) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const row = {};
    let hasValue = false;
    keys.forEach((key) => {
      const input = form.elements[`${prefix}.${index}.${key}`];
      const rawValue = input?.value.trim() || "";
      const value = rowDateFieldNames.has(key)
        ? formatDateFieldValue(rawValue)
        : rowCurrencyFieldNames.has(key)
          ? formatCurrencyFieldValue(rawValue)
          : rawValue;
      row[key] = value;
      if (value) hasValue = true;
    });
    if (hasValue) rows.push(row);
  }
  return rows;
}

function connectPayloadFields(payload) {
  payload.customer.mailingAddress = addressPartsToString({
    street: payload.customer.mailingStreet,
    city: payload.customer.mailingCity,
    state: payload.customer.mailingState,
    zip: payload.customer.mailingZip,
  }) || payload.customer.mailingAddress || "";

  payload.customer.billingAddress = addressPartsToString({
    street: payload.customer.billingStreet,
    city: payload.customer.billingCity,
    state: payload.customer.billingState,
    zip: payload.customer.billingZip,
  }) || payload.customer.billingAddress || "";

  payload.order.installAddress = addressPartsToString({
    street: payload.order.installStreet,
    city: payload.order.installCity,
    state: payload.order.installState,
    zip: payload.order.installZip,
  }) || payload.order.installAddress
    || payload.customer.mailingAddress
    || payload.customer.billingAddress
    || "";

  payload.payments.totalInvoiceAmount = payload.payments.totalInvoiceAmount
    || payload.order.invoiceAmount
    || "";

  payload.order.invoiceAmount = payload.order.invoiceAmount
    || payload.payments.totalInvoiceAmount
    || "";

  payload.order.salesRep = payload.order.salesRep
    || payload.order.storeRep
    || currentStaffUser?.name
    || "";

  payload.order.storeRep = payload.order.storeRep
    || payload.order.salesRep
    || "";
}

function collectPayload() {
  const payload = {
    customer: {},
    order: {},
    project: {},
    estimate: {},
    payments: {},
    vendors: [],
    materialRows: [],
    pages: { included: [] },
    sections: { included: [] },
    delivery: {},
    signing: { sections: ["mainAgreement"] },
    notes: {},
  };

  [...form.elements].forEach((element) => {
    if (!element.name || /^(payments|vendors|materials)\.\d+\./.test(element.name)) {
      return;
    }

    if (element.name === "signing.sections") {
      if (element.checked && !payload.signing.sections.includes(element.value)) {
        payload.signing.sections.push(element.value);
      }
      return;
    }

    if (element.name === "pages.included") {
      if ((element.checked || element.value === "4") && !customerHiddenPages.includes(Number(element.value))) {
        payload.pages.included.push(Number(element.value));
        if (element.dataset.sectionId) {
          payload.sections.included.push(element.dataset.sectionId);
        }
      }
      return;
    }

    if (element.type === "checkbox") {
      setDeep(payload, element.name, element.checked);
    } else {
      const value = isDateFieldName(element.name)
        ? formatDateFieldValue(element.value)
        : isCurrencyFieldName(element.name)
          ? formatCurrencyFieldValue(element.value)
          : element.value.trim();
      setDeep(payload, element.name, value);
    }
  });

  payload.payments.rows = rowsFrom("payments", paymentKeys, paymentRowCount);
  const addendumHasData = Boolean(payload.payments.totalInvoiceAmount || payload.payments.rows.length);
  payload.payments.splitPaymentApproved = Boolean(payload.payments.splitPaymentApproved && addendumHasData);

  if (payload.payments.splitPaymentApproved && !payload.signing.sections.includes("splitPayment")) {
    payload.signing.sections.push("splitPayment");
  }

  payload.signing.sections.forEach((section) => {
    const page = signaturePageMap[section];
    if (page && !payload.pages.included.includes(page)) {
      payload.pages.included.push(page);
      const input = form.querySelector(`[name="pages.included"][value="${page}"]`);
      if (input?.dataset.sectionId && !payload.sections.included.includes(input.dataset.sectionId)) {
        payload.sections.included.push(input.dataset.sectionId);
      }
    }
  });
  includePairedPages(payload);
  payload.sections.included = sectionIdsForPages(payload.pages.included);

  payload.vendors = rowsFrom("vendors", vendorKeys, vendorRowCount);
  payload.materialRows = rowsFrom("materials", materialKeys, materialRowCount);
  if (!payload.pages.included.includes(4)) {
    payload.pages.included.push(4);
  }
  payload.pages.included.sort((a, b) => a - b);
  connectPayloadFields(payload);
  syncEstimatePagePayload(payload);

  return payload;
}

function draftTimeText() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function setDraftStatus(message, status = "") {
  if (!draftStatus) return;
  draftStatus.textContent = message;
  if (status) draftStatus.dataset.status = status;
  else delete draftStatus.dataset.status;
}

function setCustomerSaveStatus(message = "", status = "") {
  customerSaveStatusNodes.forEach((node) => {
    node.textContent = message;
    if (status) node.dataset.status = status;
    else delete node.dataset.status;
  });
}

function saveDraftSnapshot() {
  try {
    const storageKey = draftStorageKey();
    const snapshot = {
      savedAt: new Date().toISOString(),
      section: currentSection(),
      payload: collectPayload(),
    };
    clearBrowserDraftSnapshots(storageKey);
    sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
    setDraftStatus(`Browser draft saved ${draftTimeText()}`, "saved");
    return true;
  } catch (_error) {
    // Browsers may block storage. Returning to the saved route still works.
    setDraftStatus("Browser draft could not be saved", "warning");
    return false;
  }
}

function scheduleServerDraftAutosave() {
  saveDraftSnapshot();
  setDraftStatus("Saving draft changes...", "");
  window.clearTimeout(serverDraftTimer);
  serverDraftTimer = window.setTimeout(saveServerDraftSnapshot, 1600);
}

async function saveServerDraftSnapshot() {
  if (serverDraftInFlight) {
    scheduleServerDraftAutosave();
    return false;
  }

  let payload;
  try {
    payload = collectPayload();
  } catch (_error) {
    setDraftStatus("Draft waiting for valid form data", "warning");
    return false;
  }

  const serialized = JSON.stringify({
    draftKey: canonicalContractPath(),
    section: currentSection(),
    dataResetId: currentDataResetId,
    payload,
  });
  if (serialized === lastServerDraftSerialized) {
    setDraftStatus(`Draft autosaved ${draftTimeText()}`, "saved");
    return true;
  }

  serverDraftInFlight = true;
  try {
    const response = await fetch("/api/contract-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    });
    if (response.ok) {
      lastServerDraftSerialized = serialized;
      setDraftStatus(`Draft autosaved ${draftTimeText()}`, "saved");
      return true;
    }
    if (response.status === 409) {
      const data = await readJsonResponse(response).catch(() => ({}));
      if (data.resetRequired) {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith(draftStoragePrefix)) sessionStorage.removeItem(key);
        });
        currentDataResetId = data.dataResetId || currentDataResetId;
        if (currentDataResetId) sessionStorage.setItem("edgewater-contract-data-reset-id", currentDataResetId);
        lastServerDraftSerialized = "";
        setDraftStatus("Old browser draft was not saved after the server reset.", "warning");
        return false;
      }
    }
    setDraftStatus("Browser draft saved; server autosave did not finish", "warning");
    return false;
  } catch (_error) {
    // The browser draft remains available if the server autosave is interrupted.
    setDraftStatus("Browser draft saved; server autosave interrupted", "warning");
    return false;
  } finally {
    serverDraftInFlight = false;
  }
}

async function saveDraftNow() {
  saveDraftSnapshot();
  await saveInstallerNameToDirectory(formFieldValue("order.installerName"));
  window.clearTimeout(serverDraftTimer);
  return saveServerDraftSnapshot();
}

async function preserveEstimateAttachmentForSave(payload) {
  const estimateFile = estimateFileInput.files[0];
  if (estimateFile) {
    payload.estimate.selectedEstimateFile = "";
    payload.estimate.dataUrl = await fileToDataUrl(estimateFile);
    payload.estimate.fileName = payload.estimate.fileName || estimateFile.name;
  } else if (editState.loadedVersionData) {
    payload.estimate.dataUrl = editState.loadedVersionData.estimate?.dataUrl || "";
    payload.estimate.selectedEstimateFile = payload.estimate.selectedEstimateFile || editState.loadedVersionData.estimate?.selectedEstimateFile || "";
  } else if (!selectedEstimateFileChanged(payload) && editState.packet?.data?.estimate?.dataUrl) {
    payload.estimate.dataUrl = editState.packet.data.estimate.dataUrl;
  }
  syncEstimatePagePayload(payload);
}

async function saveExistingPacketDraftNow() {
  if (!editState.packetId || editState.revision || editState.lockBlocked) return false;

  const payload = collectPayload();
  await saveInstallerNameToDirectory(payload.order.installerName);
  await preserveEstimateAttachmentForSave(payload);

  const editReason = editReasonInput?.value.trim() || "";
  const { response, data } = await sendPacketSave(
    `/api/packets/${encodeURIComponent(editState.packetId)}`,
    "PUT",
    payload,
    editReason,
  );

  if (!response.ok) {
    throw new Error(data.detail || data.error || "Could not save contract draft.");
  }

  clearBrowserDraftSnapshots();
  lastServerDraftSerialized = "";
  editState.packet = data;
  editState.loadedVersionData = null;
  renderOwnerTransfer(data);
  renderEditHistory(data);
  return true;
}

function restoreDraftSnapshotIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("restoreDraft") !== "1") return false;

  try {
    const raw = sessionStorage.getItem(draftStorageKey());
    if (!raw) return false;
    const snapshot = JSON.parse(raw);
    if (!snapshot?.payload) return false;
    const payload = normalizePacketPayload(snapshot.payload);
    populatePacketForm(payload);
    switchSection(normalizeSectionName(params.get("section") || snapshot.section || sectionOrder[0]));
    showResult(`
      <p><strong>Contract restored.</strong></p>
      <p>You returned from Admin Menu. Manually attached files cannot be restored by the browser, so reattach the estimate PDF if it was chosen from your computer.</p>
    `);
    return true;
  } catch (_error) {
    return false;
  }
}

async function restoreServerDraftIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const draftId = params.get("serverDraft");
  if (!draftId) return false;

  const response = await fetch(`/api/contract-drafts/${encodeURIComponent(draftId)}`);
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "Could not restore that draft.");
  }

  const draft = data.draft || {};
  const snapshot = draft.draft || {};
  if (!snapshot.payload) return false;

  const payload = normalizePacketPayload(snapshot.payload);
  populatePacketForm(payload);
  setContractWorkflowVisible(true);
  switchSection(normalizeSectionName(params.get("section") || draft.section || snapshot.section || sectionOrder[0]));
  setContractSetupCollapsed(Boolean(payload.customer?.lastName || payload.estimate?.selectedEstimateFile));
  showResult(`
    <p><strong>Autosaved draft restored.</strong></p>
    <p>This draft has not been generated as a packet yet. Use Save Draft while working, then generate the packet when the required contract details are ready.</p>
  `);
  return true;
}

function configureAdminReturnLinks() {
  document.querySelectorAll('a[href="/admin"]').forEach((link) => {
    link.addEventListener("click", () => {
      saveDraftSnapshot();
      const params = new URLSearchParams({ returnTo: contractReturnUrl() });
      if (currentSection() === "signatures") params.set("tab", "signatures");
      link.href = `/admin?${params.toString()}`;
    });
  });
}

function configureEstimateToolLink() {
  if (!openEstimateToolLink) return;
  openEstimateToolLink.addEventListener("click", openEstimateFromContract);
  openEstimateToolLink.href = estimateToolUrl();
}

function showResult(html) {
  result.innerHTML = html;
  result.classList.remove("hidden");
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setCompactResult(html) {
  result.innerHTML = html;
  result.classList.remove("hidden");
}

function setContractSetupCollapsed(collapsed) {
  document.body.classList.toggle("contract-setup-collapsed", Boolean(collapsed));
}

function changeSelectedCustomer() {
  setContractWorkflowVisible(false);
  setContractSetupCollapsed(false);
  selectedCustomerPanel.classList.add("hidden");
  workflowChangeCustomerButton?.classList.add("hidden");
  customerLookupStatus.textContent = "Search for a customer or add a new one.";
  customerLookupResults.innerHTML = "";
  customerRecordSearchInput.select();
  customerRecordSearchInput.focus();
}

function finalContractStepReached(target = currentSection()) {
  return target === sectionOrder[sectionOrder.length - 1];
}

function hasAddendumInformation() {
  if (form.elements["payments.totalInvoiceAmount"]?.value.trim()) return true;
  return rowsFrom("payments", paymentKeys, paymentRowCount).length > 0;
}

function contractReadyForReceivedPayments() {
  return Boolean(editState.packet?.finalizedAt || editState.packet?.status === "signed");
}

function guardReceivedPaymentInput(event) {
  const fieldName = String(event.target?.name || "").split(".").pop();
  if (!receivedPaymentFieldNames.has(fieldName) || contractReadyForReceivedPayments()) return;
  event.preventDefault();
  event.target.value = "";
  event.target.blur();
  showResult("<p class=\"error\">Contract must be signed by store and customer before adding received payments.</p>");
}

function updateFinalActions(target = currentSection()) {
  const panel = document.querySelector(".form-actions-panel");
  if (!panel) return;
  panel.classList.toggle("hidden", !finalContractStepReached(target));
}

function updateWorkflowNav(target = currentSection()) {
  const index = sectionOrder.indexOf(target);
  sectionPrevButton.disabled = index <= 0;
  sectionNextButton.disabled = index < 0 || index >= sectionOrder.length - 1;
  if (index >= 0 && index < sectionOrder.length - 1) {
    const nextTab = tabButtons.find((button) => button.dataset.sectionTab === sectionOrder[index + 1]);
    sectionNextButton.textContent = nextTab ? `Next: ${nextTab.textContent.trim()}` : "Next step";
  } else {
    sectionNextButton.textContent = "Next step";
  }
  updateFinalActions(target);
}

function switchSection(target) {
  target = normalizeSectionName(target) || sectionOrder[0];
  if (!sectionOrder.includes(target)) target = sectionOrder[0];
  tabButtons.forEach((item) => item.classList.toggle("active", item.dataset.sectionTab === target));
  formSections.forEach((section) => section.classList.toggle("hidden", section.dataset.section !== target));
  updateWorkflowNav(target);
  scheduleServerDraftAutosave();
  if (target === "estimate") {
    loadEstimateFiles(estimateSearchInput?.value.trim() || form.elements["customer.lastName"]?.value.trim() || "");
  }
}

function setContractWorkflowVisible(visible) {
  document.querySelector(".contract-workspace")?.classList.toggle("hidden", !visible);
  document.querySelector(".form-tabs")?.classList.toggle("hidden", !visible);
  document.querySelector(".workflow-step-actions")?.classList.toggle("hidden", !visible);
  document.querySelector(".form-actions-panel")?.classList.toggle("hidden", !visible || !finalContractStepReached());
  formSections.forEach((section) => {
    const active = section.dataset.section === currentSection();
    section.classList.toggle("hidden", !visible || !active);
  });
  if (!visible) setContractSetupCollapsed(false);
}

function navigateSection(offset) {
  const index = sectionOrder.indexOf(currentSection());
  const next = sectionOrder[index + offset];
  if (next) {
    switchSection(next);
    document.querySelector(".contract-workspace-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function advanceFromSection() {
  navigateSection(1);
}

function customerContractSummaryHtml(customer) {
  const contracts = customer.contracts || [];
  if (!contracts.length) return '<p class="muted-text">No saved contracts for this customer yet.</p>';
  return `
    <div class="customer-contract-list">
      ${contracts.map((contract) => `
        <div class="customer-contract-row">
          <span>
            <strong>${escapeHtml(contract.contractNumber || contract.id)}</strong>
            <small>${escapeHtml([
              contract.invoiceNumber ? `Invoice ${contract.invoiceNumber}` : contract.status || "Draft",
              contract.hiddenFamilyRecordCount ? `${contract.familyRecordCount} edits; latest shown` : "",
            ].filter(Boolean).join(" | "))}</small>
          </span>
          <span>${escapeHtml(contract.installAddress || "No install address")}</span>
          <a href="/contract/${encodeURIComponent(contract.id)}/edit">${contract.locked ? "Create/View Edit" : "Edit Draft"}</a>
        </div>
      `).join("")}
    </div>
  `;
}

function customerLookupResultHtml(customer) {
  return `
    <button class="customer-result-row" type="button" data-select-customer="${escapeHtml(customer.key)}">
      <span>
        <strong>${escapeHtml(customer.name || "Unnamed customer")}</strong>
        <small>${escapeHtml([customer.phone1, customer.email].filter(Boolean).join(" | ") || "No phone/email listed")}</small>
      </span>
      <span>${escapeHtml(customer.mailingAddress || customer.billingAddress || "No address listed")}</span>
      <span>${customer.contractCount} contract${customer.contractCount === 1 ? "" : "s"}</span>
    </button>
  `;
}

function applyCustomerRecord(customer) {
  form.elements["customer.firstName"].value = customer.firstName || "";
  form.elements["customer.lastName"].value = customer.lastName || "";
  form.elements["customer.phone1"].value = customer.phone1 || "";
  form.elements["customer.phone2"].value = customer.phone2 || "";
  form.elements["customer.email"].value = customer.email || "";
  form.elements["customer.textOptIn"].value = customer.textOptIn || "yes";
  form.elements["customer.socialMediaTagConsent"].value = customer.socialMediaTagConsent || "";
  form.elements["customer.socialMediaProfile"].value = customer.socialMediaProfile || "";
  form.elements["customer.referral"].value = customer.referral || "";
  setAddressFieldsFromValue("customer.mailing", customer.mailingAddress || "");
  setAddressFieldsFromValue("customer.billing", customer.billingAddress || "");
  form.elements["customer.notes"].value = customer.notes || "";
  formatPhoneInputs();
  if (sameBillingAddressCheckbox) sameBillingAddressCheckbox.checked = false;
  syncBillingAddressFromMailing();
  syncSegmentedControls();
  updateCustomerIntakeSummary();
}

function showSelectedCustomer(customer, { existing = true } = {}) {
  selectedCustomer = customer;
  setContractSetupCollapsed(false);
  workflowChangeCustomerButton?.classList.remove("hidden");
  if (existing) {
    customerLookupResults.innerHTML = "";
    customerLookupStatus.textContent = `Selected ${customer.name || "customer"}.`;
    customerRecordSearchInput.value = customer.name || "";
  }
  selectedCustomerPanel.innerHTML = `
    <div class="selected-customer-head">
      <span>
        <strong>${escapeHtml(customer.name || "New customer")}</strong>
        <small>${escapeHtml(existing ? `${customer.contractCount || 0} saved contract${customer.contractCount === 1 ? "" : "s"}` : "New customer record")}</small>
      </span>
      <div class="result-actions">
        ${existing ? `<a href="/contracts?q=${encodeURIComponent(customer.name || customer.phone1 || "")}">Search Contracts</a>` : ""}
      </div>
    </div>
    ${existing ? `
      <div class="selected-estimate-prompt">
        <strong>Estimate for this customer?</strong>
        <span>Use an existing saved estimate, create one now, or continue without an estimate.</span>
        <div class="result-actions">
          <button type="button" id="check-existing-estimate">Use Existing Estimate</button>
          <button type="button" id="create-estimate-for-contract">Create Estimate</button>
        </div>
      </div>
    ` : ""}
    ${existing ? customerContractSummaryHtml(customer) : ""}
  `;
  selectedCustomerPanel.classList.remove("hidden");
  document.querySelector("#check-existing-estimate")?.addEventListener("click", () => {
    const query = customer.name || customer.phone1 || "";
    estimateSearchInput.value = query;
    setContractWorkflowVisible(true);
    switchSection("estimate");
    loadEstimateFiles(query);
  });
  document.querySelector("#create-estimate-for-contract")?.addEventListener("click", openEstimateFromContract);
  updateCustomerIntakeSummary();
}

async function openEstimateFromContract(event) {
  if (event) event.preventDefault();
  await saveDraftNow();
  window.location.href = estimateToolUrl();
}

function startNewCustomerMode() {
  if (editState.packetId) {
    window.location.href = "/contract/new";
    return;
  }

  result.classList.add("hidden");
  clearCustomerInfo();
  showSelectedCustomer({ name: "New customer" }, { existing: false });
  setContractWorkflowVisible(true);
  switchSection("customer");
  syncSegmentedControls();
  updateCustomerIntakeSummary();
  form.elements["customer.firstName"]?.focus();
}

function chooseExistingCustomer(customer) {
  result.classList.add("hidden");
  applyCustomerRecord(customer);
  showSelectedCustomer(customer, { existing: true });
  setContractWorkflowVisible(true);
  estimateSearchInput.value = customer.name || customer.phone1 || "";
  switchSection("estimate");
  loadEstimateFiles(estimateSearchInput.value.trim());
}

async function runCustomerSearch(query = "") {
  const searchId = ++activeCustomerSearchId;
  if (!query) {
    customerLookupStatus.textContent = "Enter a name, phone, address, invoice, or estimate to search.";
    customerLookupResults.innerHTML = "";
    return;
  }

  customerLookupStatus.textContent = "Searching customers...";
  const response = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const data = await readJsonResponse(response);
  if (searchId !== activeCustomerSearchId) return;
  if (!response.ok) {
    customerLookupStatus.textContent = data.error || "Customer search failed.";
    customerLookupResults.innerHTML = "";
    return;
  }

  if (!data.count) {
    customerLookupStatus.textContent = "No matching customers. Add New will open a blank customer form.";
    customerLookupResults.innerHTML = "";
    return;
  }

  customerLookupStatus.textContent = `${data.count} customer${data.count === 1 ? "" : "s"} found.`;
  customerLookupResults.innerHTML = data.customers.map(customerLookupResultHtml).join("");
  customerLookupResults.querySelectorAll("[data-select-customer]").forEach((button) => {
    button.addEventListener("click", () => {
      const customer = data.customers.find((item) => item.key === button.getAttribute("data-select-customer"));
      if (customer) chooseExistingCustomer(customer);
    });
  });
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

async function exitToHomeAndLogout() {
  await releaseEditLock();
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
}

async function saveDraftAndExitContract() {
  showResult("<p><strong>Saving draft before exit...</strong></p>");
  await saveDraftNow();
  setCompactResult("<p><strong>Draft saved.</strong> Exiting contract.</p>");
  window.setTimeout(exitToHomeAndLogout, 350);
}

async function promptExitContract() {
  if (window.confirm("Save this contract draft and exit?")) {
    await saveDraftAndExitContract();
  }
}

function confirmExitWithoutSaving() {
  if (window.confirm("Exit without saving this contract? Unsaved contract changes will be lost.")) {
    exitToHomeAndLogout();
  }
}

function loadSavedVersion(versionId) {
  const version = (editState.packet?.versions || []).find((item) => item.id === versionId);
  if (!version?.data) return;
  editState.loadedVersionData = version.data;
  populatePacketForm(version.data);
  editReasonInput.value = `Loaded ${version.label || "saved version"} from ${formatDate(version.savedAt)}`;
  showResult(`
    <p><strong>Saved version loaded into the form.</strong></p>
    <p>Review it, then save the draft to make it current. Nothing changed on the server yet.</p>
  `);
}

async function transferOwner() {
  if (editState.lockBlocked) {
    showResult("<p class=\"error\">This record is currently locked by another staff user. Ownership cannot be changed until they save and exit.</p>");
    return;
  }
  if (!editState.packetId || !contractOwnerSelect.value) return;

  transferOwnerButton.disabled = true;
  transferOwnerButton.textContent = "Transferring...";
  try {
    const response = await fetch(`/api/packets/${encodeURIComponent(editState.packetId)}/owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: contractOwnerSelect.value }),
    });
    const packet = await readJsonResponse(response);
    if (!response.ok) throw new Error(packet.error || "Could not transfer ownership.");
    editState.packet = packet;
    renderOwnerTransfer(packet);
    renderEditHistory(packet);
    showResult(`<p><strong>Ownership transferred.</strong> Current owner: ${escapeHtml(actorLabel(packet.owner))}.</p>`);
  } catch (error) {
    showResult(`<p class="error">${escapeHtml(error.message)}</p>`);
  } finally {
    transferOwnerButton.disabled = false;
    transferOwnerButton.textContent = "Transfer ownership";
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function setContractSignatureStatus(message = "", isError = false) {
  if (!contractSignatureStatus) return;
  contractSignatureStatus.textContent = message;
  contractSignatureStatus.classList.toggle("error", Boolean(isError));
}

function clearContractSignatureCanvas() {
  if (!contractSignatureCanvas || !contractSignatureCtx) return;
  contractSignatureCtx.clearRect(0, 0, contractSignatureCanvas.width, contractSignatureCanvas.height);
  hasDrawnContractSignature = false;
}

function resizeContractSignatureCanvas() {
  if (!contractSignatureCanvas || !contractSignatureCtx) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = contractSignatureCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const savedImage = hasDrawnContractSignature ? contractSignatureCanvas.toDataURL("image/png") : null;
  contractSignatureCanvas.width = Math.max(1, Math.round(rect.width * ratio));
  contractSignatureCanvas.height = Math.max(1, Math.round(rect.height * ratio));
  contractSignatureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  contractSignatureCtx.lineCap = "round";
  contractSignatureCtx.lineJoin = "round";
  contractSignatureCtx.lineWidth = 2.6;
  contractSignatureCtx.strokeStyle = "#1f4f6a";
  if (savedImage) {
    const image = new Image();
    image.onload = () => contractSignatureCtx.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = savedImage;
  }
}

function contractSignaturePointFromEvent(event) {
  const rect = contractSignatureCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function typedSignatureToDataUrl(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1f2933";
  ctx.font = "44px Segoe Script, Brush Script MT, cursive";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

function openContractSignatureModal() {
  if (!contractSignatureModal || !contractSignatureForm) return;
  if (!selectedStoreRepIsCurrentStaff()) {
    showResult("<p class=\"error\">Only the selected staff user can add or apply their own signature.</p>");
    return;
  }
  const signature = currentStaffSignature();
  contractSignatureForm.dataset.replaceSignatureId = signature?.id || "";
  contractSignatureForm.elements.name.value = signature?.name || (currentStaffUser?.name ? `${currentStaffUser.name} signature` : "");
  contractSignatureForm.elements.typedSignatureName.value = currentStaffUser?.name || "";
  contractSignatureForm.elements.signatureConsent.checked = false;
  setContractSignatureStatus(signature ? "Replacing your saved signature." : "Saving a signature for your login only.");
  clearContractSignatureCanvas();
  contractSignatureModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    resizeContractSignatureCanvas();
    contractSignatureForm.elements.typedSignatureName.focus();
  });
}

function closeContractSignatureModal() {
  if (!contractSignatureModal || !contractSignatureForm) return;
  contractSignatureModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  contractSignatureForm.reset();
  contractSignatureForm.dataset.replaceSignatureId = "";
  setContractSignatureStatus("");
  clearContractSignatureCanvas();
}

async function saveContractSignature(event) {
  event.preventDefault();
  if (savingContractSignature || !contractSignatureForm) return;
  if (!contractSignatureForm.elements.signatureConsent.checked) {
    setContractSignatureStatus("Confirm this is your official staff signature before saving.", true);
    return;
  }

  const typedSignatureName = contractSignatureForm.elements.typedSignatureName.value.trim();
  const dataUrl = hasDrawnContractSignature
    ? contractSignatureCanvas.toDataURL("image/png")
    : typedSignatureName
      ? typedSignatureToDataUrl(typedSignatureName)
      : "";
  if (!dataUrl) {
    setContractSignatureStatus("Draw or type your signature before saving.", true);
    return;
  }

  const replaceSignatureId = contractSignatureForm.dataset.replaceSignatureId || "";
  savingContractSignature = true;
  contractSignatureSaveButton.disabled = true;
  contractSignatureSaveButton.textContent = replaceSignatureId ? "Replacing..." : "Saving...";

  try {
    const response = await fetch(
      replaceSignatureId ? `/api/settings/signatures/${encodeURIComponent(replaceSignatureId)}` : "/api/settings/signatures",
      {
        method: replaceSignatureId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contractSignatureForm.elements.name.value.trim() || (typedSignatureName ? `${typedSignatureName} signature` : ""),
          dataUrl,
        }),
      },
    );
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      setContractSignatureStatus(data.error || "Could not save signature.", true);
      return;
    }
    const signatureId = data.id || replaceSignatureId;
    settingsCache = {
      ...(settingsCache || {}),
      signatures: [data, ...((settingsCache?.signatures || []).filter((signature) => signature.id !== signatureId))],
    };
    currentStaffUser = { ...(currentStaffUser || {}), signatureId };
    storeSignatureSelect.innerHTML = '<option value="">Manual signature / no digital image</option>';
    const option = document.createElement("option");
    option.value = signatureId;
    option.textContent = data.name || "My signature";
    storeSignatureSelect.append(option);
    storeSignatureSelect.value = signatureId;
    if (currentStaffUser?.name) form.elements["order.storeRep"].value = currentStaffUser.name;
    if (currentStaffUser?.title) form.elements["order.storeRepTitle"].value = currentStaffUser.title;
    syncSignatureSetupLink();
    scheduleServerDraftAutosave();
    await saveDraftNow();
    closeContractSignatureModal();
    showResult("<p><strong>Signature saved.</strong> Your signature is attached to this draft.</p>");
  } finally {
    savingContractSignature = false;
    contractSignatureSaveButton.disabled = false;
    contractSignatureSaveButton.textContent = contractSignatureForm.dataset.replaceSignatureId ? "Replace Signature" : "Save Signature";
  }
}

async function sendPacketSave(url, method, payload, editReason, overrideEdit = false, allowDuplicate = false) {
  const body = editState.packetId
    ? { data: payload, reason: editReason, overrideEdit }
    : allowDuplicate ? { data: payload, allowDuplicate: true } : payload;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonResponse(response);
  return { response, data };
}

function duplicateRecordSummary(record) {
  const pieces = [
    contractDisplayLabel(record),
    record.customerName,
    record.invoiceNumber ? `invoice ${record.invoiceNumber}` : "",
    record.createdAt ? `created ${formatDate(record.createdAt)}` : "",
    record.status ? `status ${record.status}` : "",
  ].filter(Boolean);
  return pieces.join(" - ");
}

function duplicateWarningHtml(data) {
  const duplicates = data.duplicates || [];
  return `
    <p class="error"><strong>Possible duplicate record.</strong> This looks like the same customer/invoice as an existing contract.</p>
    <p class="duplicate-choice-copy">Choose an existing record to save this entry as a version/edit, or create a separate record only when it is truly a different contract.</p>
    <div class="duplicate-list">
      ${duplicates.map((record) => `
        <div class="duplicate-row">
          <span>
            <strong>${escapeHtml(contractDisplayLabel(record))}</strong>
            <small>${escapeHtml(duplicateRecordSummary(record))}</small>
          </span>
          <span class="duplicate-row-actions">
            <a href="/contract/${encodeURIComponent(record.id)}/edit${record.locked ? "?revision=1" : ""}">Open</a>
            ${record.locked
              ? `<button type="button" data-duplicate-revision="${escapeHtml(record.id)}">Create edit from this entry</button>`
              : `<button type="button" data-duplicate-version="${escapeHtml(record.id)}">Save as version of existing</button>`}
          </span>
        </div>
      `).join("")}
    </div>
    <button type="button" class="duplicate-separate-action" data-duplicate-separate="true">Create separate new record anyway</button>
  `;
}

function duplicateActionButtons() {
  return [...result.querySelectorAll("[data-duplicate-version], [data-duplicate-revision], [data-duplicate-separate]")];
}

function setDuplicateActionsDisabled(disabled) {
  duplicateActionButtons().forEach((button) => {
    button.disabled = disabled;
  });
}

function packetSavedChoiceHtml(data, message) {
  const signUrl = data.signUrl || "";
  const signablePdfUrl = data.signablePdfUrl || "#";
  return `
    <p><strong>${escapeHtml(message)}</strong></p>
    <p>Contract: <strong>${escapeHtml(contractDisplayLabel(data))}</strong></p>
    <p>No separate duplicate record was created.</p>
    <div class="result-actions">
      <a href="/contract/${encodeURIComponent(data.id)}/edit">Continue editing</a>
      <a href="/contracts">Back to records</a>
      <a href="${escapeHtml(signablePdfUrl)}" target="_blank" rel="noreferrer">Download signable PDF</a>
      ${signUrl ? `<a href="${escapeHtml(signUrl)}" target="_blank" rel="noreferrer">Open signing link</a>` : ""}
    </div>
  `;
}

async function savePendingDuplicateAsChoice(recordId, mode, button) {
  if (!pendingDuplicateSave) {
    showResult('<p class="error">That duplicate action expired. Generate the packet again to re-check for duplicates.</p>');
    return;
  }

  const { payload, editReason, exitAfterSave } = pendingDuplicateSave;
  const revision = mode === "revision";
  const separate = mode === "separate";
  const reason = editReason || (
    revision
      ? "Created edit from possible duplicate entry."
      : "Saved from possible duplicate entry as a version of the existing draft."
  );
  const url = separate
    ? "/api/packets"
    : revision
      ? `/api/packets/${encodeURIComponent(recordId)}/revisions`
      : `/api/packets/${encodeURIComponent(recordId)}`;
  const method = separate || revision ? "POST" : "PUT";
  const body = separate
    ? { data: payload, allowDuplicate: true }
    : { data: payload, reason };

  setDuplicateActionsDisabled(true);
  const originalText = button.textContent;
  button.textContent = separate ? "Creating..." : revision ? "Creating edit..." : "Saving version...";

  try {
    let response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = await readJsonResponse(response);

    if (!response.ok && data.editOverrideRequired && !separate && !revision) {
      const owner = data.owner?.name || data.owner?.username || "another employee";
      const confirmed = window.confirm(`${owner} owns this draft. Save this as a new version anyway and notify them to review it?`);
      if (confirmed) {
        response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, overrideEdit: true }),
        });
        data = await readJsonResponse(response);
      }
    }

    if (!response.ok) throw new Error(data.detail || data.error || "Could not save duplicate choice.");

    pendingDuplicateSave = null;
    if (exitAfterSave) {
      await releaseEditLock();
      await exitToHomeAndLogout();
      return;
    }

    if (separate) {
      showResult(`
        <p><strong>Separate record created.</strong></p>
        <p>Contract: <strong>${escapeHtml(contractDisplayLabel(data))}</strong></p>
        <div class="result-actions">
          <a href="/contract/${encodeURIComponent(data.id)}/edit">Continue editing this draft</a>
          <a href="/contracts">Back to records</a>
          <a href="${escapeHtml(data.signablePdfUrl || "#")}" target="_blank" rel="noreferrer">Download signable PDF</a>
        </div>
      `);
      return;
    }

    showResult(packetSavedChoiceHtml(data, revision ? "Edit created from this entry." : "Version saved to existing draft."));
  } catch (error) {
    button.textContent = originalText;
    setDuplicateActionsDisabled(false);
    showResult(`${result.innerHTML}<p class="error">${escapeHtml(error.message)}</p>`);
  }
}

result.addEventListener("click", async (event) => {
  const separateButton = event.target.closest("[data-duplicate-separate]");
  const revisionButton = event.target.closest("[data-duplicate-revision]");
  const versionButton = event.target.closest("[data-duplicate-version]");
  const button = separateButton || revisionButton || versionButton;
  if (!button) return;

  if (separateButton) {
    await savePendingDuplicateAsChoice("", "separate", button);
    return;
  }

  if (revisionButton) {
    await savePendingDuplicateAsChoice(revisionButton.getAttribute("data-duplicate-revision"), "revision", button);
    return;
  }

  await savePendingDuplicateAsChoice(versionButton.getAttribute("data-duplicate-version"), "version", button);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (editState.lockBlocked) {
    showResult("<p class=\"error\">This record is currently locked by another staff user. Try again after they save and exit.</p>");
    return;
  }
  if (packetSubmitInFlight) return;
  packetSubmitInFlight = true;
  const activeSubmitButton = event.submitter || submitButton;
  const exitAfterSave = activeSubmitButton?.dataset.exitAfterSave === "true";
  if (exitAfterSave && !finalContractStepReached()) {
    await saveDraftAndExitContract();
    packetSubmitInFlight = false;
    return;
  }
  if (!finalContractStepReached()) {
    packetSubmitInFlight = false;
    showResult("<p class=\"error\">Finish the contract workflow before generating the packet. Use Exit contract if you need to leave and save a browser draft.</p>");
    return;
  }
  if (!validateEmailFields() || !validateCustomerContactMethod() || !validateDateFields()) {
    packetSubmitInFlight = false;
    return;
  }
  if (!validatePhoneFields()) {
    packetSubmitInFlight = false;
    return;
  }
  const payload = collectPayload();
  await saveInstallerNameToDirectory(payload.order.installerName);
  const estimateFile = estimateFileInput.files[0];
  if (estimateFile) {
    payload.estimate.selectedEstimateFile = "";
    payload.estimate.dataUrl = await fileToDataUrl(estimateFile);
    payload.estimate.fileName = payload.estimate.fileName || estimateFile.name;
  } else if (editState.loadedVersionData) {
    payload.estimate.dataUrl = editState.loadedVersionData.estimate?.dataUrl || "";
    payload.estimate.selectedEstimateFile = payload.estimate.selectedEstimateFile || editState.loadedVersionData.estimate?.selectedEstimateFile || "";
  } else if (!selectedEstimateFileChanged(payload) && editState.packet?.data?.estimate?.dataUrl) {
    payload.estimate.dataUrl = editState.packet.data.estimate.dataUrl;
  }
  syncEstimatePagePayload(payload);

  if (!payload.pages.included.length) {
    showResult('<p class="error">Select at least one packet page.</p>');
    packetSubmitInFlight = false;
    return;
  }

  submitButton.disabled = true;
  saveExitButton.disabled = true;
  activeSubmitButton.textContent = editState.packetId
    ? editState.revision ? "Creating edit..." : "Saving..."
    : "Generating...";
  showResult(`<p><strong>${editState.packetId ? "Saving contract..." : "Generating packet..."}</strong></p>`);

  try {
    const editReason = editReasonInput?.value.trim() || "";
    const existingDraftSave = Boolean(editState.packetId && !editState.revision);
    const url = editState.packetId
      ? editState.revision
        ? `/api/packets/${encodeURIComponent(editState.packetId)}/revisions`
        : `/api/packets/${encodeURIComponent(editState.packetId)}`
      : "/api/packets";
    const method = editState.packetId && !editState.revision ? "PUT" : "POST";
    let { response, data } = await sendPacketSave(url, method, payload, editReason);
    if (!response.ok && data.editOverrideRequired) {
      const owner = data.owner?.name || data.owner?.username || "another employee";
      const confirmed = window.confirm(`${owner} owns this draft. Save anyway and notify them to review it?`);
      if (confirmed) {
        ({ response, data } = await sendPacketSave(url, method, payload, editReason, true));
      }
    }
    if (!response.ok && data.duplicateOverrideRequired) {
      pendingDuplicateSave = { payload, editReason, exitAfterSave };
      showResult(duplicateWarningHtml(data));
      return;
    }
    if (!response.ok) throw new Error(data.detail || data.error || "Could not generate packet.");
    clearBrowserDraftSnapshots();
    lastServerDraftSerialized = "";

    if (exitAfterSave) {
      await releaseEditLock();
      setCompactResult("<p><strong>Contract saved.</strong> Exiting contract.</p>");
      window.setTimeout(exitToHomeAndLogout, 350);
      return;
    }

    const emailText = data.customerLinkEmail?.sent
      ? "Signing link emailed to customer."
      : data.customerLinkEmail?.reason || "Signing link was not emailed.";
    const customerText = escapeHtml(data.customerName || "Customer");
    const invoiceText = data.invoiceNumber ? `- Invoice ${escapeHtml(data.invoiceNumber)}` : "";
    const contractText = escapeHtml(contractDisplayLabel(data));
    const signUrl = data.signUrl || "";
    const signablePdfUrl = data.signablePdfUrl || "#";
    const safeSignUrl = escapeHtml(signUrl);
    const safeSignablePdfUrl = escapeHtml(signablePdfUrl);
    const passwordHtml = data.password
      ? `
        <p class="password-display">
          <strong>PDF password:</strong>
          <span id="result-password" data-password-value="${escapeHtml(data.password)}">********</span>
          <button type="button" class="inline-password-toggle" id="toggle-result-password">Show</button>
        </p>
      `
      : "";

    if (existingDraftSave) {
      await releaseEditLock();
      setRecordEditLocked(true);
      renderRecordLockPanel({
        title: "Draft saved",
        message: "Your edit lock was released. Use Continue editing this draft to reopen the record if you need more changes.",
      });
    }

    showResult(`
      <p><strong>${editState.packetId ? editState.revision ? "Edit created." : "Draft saved." : "Packet ready."}</strong> Customer: ${customerText} ${invoiceText}</p>
      <p>Contract: <strong>${contractText}</strong></p>
      ${passwordHtml}
      <p>${escapeHtml(emailText)}</p>
      <p>Customer signing link: <a href="${safeSignUrl}" target="_blank" rel="noreferrer">${safeSignUrl}</a></p>
      <div class="result-actions">
        <a href="${safeSignablePdfUrl}" target="_blank" rel="noreferrer">Download signable PDF</a>
        <a href="/contracts">Back to View/Edit</a>
        <a href="/contract/${encodeURIComponent(data.id)}/edit">Continue editing this draft</a>
        <button type="button" id="copy-link">Copy signing link</button>
        <button type="button" id="email-link">Email signing link</button>
      </div>
    `);

    if (editState.packetId && !editState.revision) {
      editState.packet = data;
      editState.loadedVersionData = null;
      renderOwnerTransfer(data);
      renderEditHistory(data);
    }

    if (editState.revision) {
      editState = {
        packetId: data.id,
        revision: false,
        packet: data,
        loadedVersionData: null,
        lockAcquired: false,
        lockBlocked: false,
      };
      window.history.replaceState({}, "", `/contract/${encodeURIComponent(data.id)}/edit`);
      submitButton.textContent = "Save draft";
      editModeTitle.textContent = "Edit Draft Contract";
      editModeCopy.textContent = `${contractDisplayLabel(data)} is the new editable record.`;
      await acquireEditLock(data.id);
    }

    document.querySelector("#copy-link").addEventListener("click", async () => {
      await copyText(data.signUrl);
      document.querySelector("#copy-link").textContent = "Copied";
    });

    document.querySelector("#toggle-result-password")?.addEventListener("click", (event) => {
      const value = document.querySelector("#result-password");
      const hidden = event.target.textContent === "Show";
      value.textContent = hidden ? value.dataset.passwordValue || "" : "********";
      event.target.textContent = hidden ? "Hide" : "Show";
    });

    document.querySelector("#email-link").addEventListener("click", async () => {
      const button = document.querySelector("#email-link");
      button.disabled = true;
      button.textContent = "Sending...";
      const emailResponse = await fetch(`/api/packets/${data.id}/email-link`, { method: "POST" });
      const emailData = await readJsonResponse(emailResponse);
      button.textContent = emailData.sent ? "Email sent" : "Email skipped";
      if (!emailData.sent && emailData.reason) {
        showResult(`${result.innerHTML}<p class="error">${emailData.reason}</p>`);
      }
    });
  } catch (error) {
    showResult(`<p class="error">${error.message}</p>`);
  } finally {
    packetSubmitInFlight = false;
    if (!editState.lockBlocked) {
      submitButton.disabled = false;
      saveExitButton.disabled = false;
    }
    submitButton.textContent = editState.packetId
      ? editState.revision ? "Create edit" : "Save draft"
      : "Generate packet";
    saveExitButton.textContent = "Save and exit";
  }
});

form.addEventListener("input", scheduleServerDraftAutosave);
form.addEventListener("change", scheduleServerDraftAutosave);
window.addEventListener("beforeunload", () => {
  releaseEditLock({ beacon: true });
});

pagesAll.addEventListener("click", () => {
  setPages(pageLabels.map(({ page }) => page));
});

pagesAgreement.addEventListener("click", () => {
  setPages(initialContractPages);
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "https://edgefam.com";
});

exitNoSaveButton.addEventListener("click", confirmExitWithoutSaving);
addNewCustomerButton.addEventListener("click", startNewCustomerMode);
transferOwnerButton.addEventListener("click", transferOwner);

customerClearButton.addEventListener("click", clearCustomerInfo);
workflowClearButton?.addEventListener("click", clearCustomerInfo);

async function saveCustomerDraft(button) {
  const buttons = [customerSaveDraftButton, customerSaveDraftTopButton, workflowSaveDraftButton].filter(Boolean);
  const originalText = button?.textContent || "";
  buttons.forEach((item) => {
    item.disabled = true;
  });
  if (button) button.textContent = "Saving...";
  setCustomerSaveStatus("Saving...", "");

  try {
    const savedExistingPacket = await saveExistingPacketDraftNow();
    if (savedExistingPacket) {
      setCustomerSaveStatus(`Contract draft saved ${draftTimeText()}.`, "saved");
    } else {
      const savedToServer = await saveDraftNow();
      setCustomerSaveStatus(
        savedToServer ? `Customer info saved ${draftTimeText()}.` : "Saved in this browser. Server save did not finish.",
        savedToServer ? "saved" : "warning",
      );
    }
  } catch (error) {
    setCustomerSaveStatus(error.message || "Save failed.", "error");
  } finally {
    buttons.forEach((item) => {
      item.disabled = false;
    });
    if (button) button.textContent = originalText;
  }
}

customerSaveDraftButton.addEventListener("click", () => saveCustomerDraft(customerSaveDraftButton));
customerSaveDraftTopButton?.addEventListener("click", () => saveCustomerDraft(customerSaveDraftTopButton));
workflowSaveDraftButton?.addEventListener("click", () => saveCustomerDraft(workflowSaveDraftButton));
workflowChangeCustomerButton?.addEventListener("click", changeSelectedCustomer);

document.querySelectorAll("[data-segmented-select]").forEach((control) => {
  control.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    const select = form.elements[control.dataset.segmentedSelect];
    if (!select) return;
    select.value = button.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncSegmentedControls();
    updateCustomerIntakeSummary();
  });
});

customerIntakeFieldNames.forEach((name) => {
  const elements = form.elements[name];
  if (!elements) return;
  const list = elements instanceof RadioNodeList ? [...elements] : [elements];
  list.forEach((element) => {
    element.addEventListener("input", updateCustomerIntakeSummary);
    element.addEventListener("change", () => {
      syncSegmentedControls();
      updateCustomerIntakeSummary();
    });
  });
});

sameBillingAddressCheckbox.addEventListener("change", syncBillingAddressFromMailing);
addressInputs("customer.mailing").forEach((input) => {
  input.addEventListener("input", syncBillingAddressFromMailing);
  input.addEventListener("blur", () => {
    const names = addressFieldNames("customer.mailing");
    setFieldValue(names.state, normalizeState(formFieldValue(names.state)));
    setFieldValue(names.zip, normalizeZip(formFieldValue(names.zip)));
  });
});
addressInputs("customer.billing").forEach((input) => {
  input.addEventListener("input", () => {
    syncJobAddressFromCustomer();
    updateCustomerIntakeSummary();
  });
  input.addEventListener("blur", () => {
    const names = addressFieldNames("customer.billing");
    setFieldValue(names.state, normalizeState(formFieldValue(names.state)));
    setFieldValue(names.zip, normalizeZip(formFieldValue(names.zip)));
  });
});
bindZipCityStateLookup("customer.mailing");
bindZipCityStateLookup("customer.billing");

customerRecordSearchInput.addEventListener("input", () => {
  window.clearTimeout(customerSearchTimer);
  const query = customerRecordSearchInput.value.trim();
  customerSearchTimer = window.setTimeout(() => runCustomerSearch(query), 180);
});

customerRecordSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    window.clearTimeout(customerSearchTimer);
    runCustomerSearch(customerRecordSearchInput.value.trim());
  }
});

editHistory.addEventListener("click", (event) => {
  const button = event.target.closest("[data-load-version]");
  if (button) {
    loadSavedVersion(button.getAttribute("data-load-version"));
  }
});

sectionPrevButton.addEventListener("click", () => navigateSection(-1));
sectionNextButton.addEventListener("click", () => navigateSection(1));
sectionExitButton.addEventListener("click", promptExitContract);

storeRepSelect.addEventListener("change", () => {
  const rep = storeRepProfiles.find((profile) => profile.id === storeRepSelect.value);
  if (rep) applyStoreRep(rep);
  else syncSignatureSetupLink();
});

storeSignatureSelect.addEventListener("change", syncSignatureSetupLink);
form.elements["order.storeRep"]?.addEventListener("input", syncSignatureSetupLink);
form.elements["order.storeRepTitle"]?.addEventListener("input", syncSignatureSetupLink);
storeSignatureSetupLink?.addEventListener("click", openContractSignatureModal);
contractSignatureForm?.addEventListener("submit", saveContractSignature);
contractSignatureCloseButton?.addEventListener("click", closeContractSignatureModal);
contractSignatureCancelButton?.addEventListener("click", closeContractSignatureModal);
contractSignatureClearButton?.addEventListener("click", clearContractSignatureCanvas);
contractSignatureModal?.addEventListener("click", (event) => {
  if (event.target === contractSignatureModal) closeContractSignatureModal();
});
contractSignatureCanvas?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  drawingContractSignature = true;
  hasDrawnContractSignature = true;
  contractSignatureCanvas.setPointerCapture(event.pointerId);
  const point = contractSignaturePointFromEvent(event);
  contractSignatureCtx.beginPath();
  contractSignatureCtx.moveTo(point.x, point.y);
});
contractSignatureCanvas?.addEventListener("pointermove", (event) => {
  if (!drawingContractSignature) return;
  const point = contractSignaturePointFromEvent(event);
  contractSignatureCtx.lineTo(point.x, point.y);
  contractSignatureCtx.stroke();
});
contractSignatureCanvas?.addEventListener("pointerup", (event) => {
  drawingContractSignature = false;
  contractSignatureCanvas.releasePointerCapture(event.pointerId);
});
contractSignatureCanvas?.addEventListener("pointercancel", () => {
  drawingContractSignature = false;
});
window.addEventListener("resize", () => {
  if (contractSignatureModal && !contractSignatureModal.classList.contains("hidden")) resizeContractSignatureCanvas();
});

function copyToInstallationAddress(sourcePrefix) {
  setAddressParts("order.install", addressPartsFromForm(sourcePrefix));
  form.elements["order.installStreet"].dataset.autoConnected = "customer";
  form.elements["order.installStreet"].dataset.autoSource = sourcePrefix;
  form.elements["order.installStreet"].focus();
}

copyMailingAddressButton.addEventListener("click", () => copyToInstallationAddress("customer.mailing"));
copyBillingAddressButton.addEventListener("click", () => copyToInstallationAddress("customer.billing"));
paymentRows?.addEventListener("focusin", guardReceivedPaymentInput);
paymentRows?.addEventListener("beforeinput", guardReceivedPaymentInput);
addressInputs("order.install").forEach((input) => {
  input.addEventListener("input", () => {
    delete form.elements["order.installStreet"].dataset.autoConnected;
    delete form.elements["order.installStreet"].dataset.autoSource;
  });
  input.addEventListener("blur", () => {
    const names = addressFieldNames("order.install");
    setFieldValue(names.state, normalizeState(formFieldValue(names.state)));
    setFieldValue(names.zip, normalizeZip(formFieldValue(names.zip)));
  });
});
bindZipCityStateLookup("order.install");

form.querySelectorAll('[name="signing.sections"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked && signaturePageMap[input.value]) {
      includePage(signaturePageMap[input.value]);
    }
  });
});

pageOptions.addEventListener("change", (event) => {
  const input = event.target;
  if (input.name === "pages.included" && input.checked && pairedCustomerPages[input.value]) {
    includePage(pairedCustomerPages[input.value]);
  }
});

estimateFileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-estimate-file]");
  if (!button) return;
  selectEstimateFile(button.getAttribute("data-estimate-file"));
});

estimatePreviewButton?.addEventListener("click", () => {
  const selectedFile = form.elements["estimate.selectedEstimateFile"]?.value || "";
  if (!selectedFile) return;
  const safeName = safeEstimateFileName(selectedFile);
  if (!safeName) return;
  const file = estimateFiles.find((item) => item.fileName === safeName) || {
    fileName: safeName,
    url: estimatePreviewUrl(safeName),
  };
  estimatePreview.src = `${file.url}${String(file.url).includes("#") ? "" : "#toolbar=0&navpanes=0&scrollbar=0&view=FitH"}`;
  estimatePreview.classList.remove("hidden");
});

estimateRefreshButton.addEventListener("click", () => {
  loadEstimateFiles(estimateSearchInput.value.trim());
});

estimateSearchInput.addEventListener("input", () => {
  window.clearTimeout(estimateSearchTimer);
  estimateSearchTimer = window.setTimeout(() => {
    loadEstimateFiles(estimateSearchInput.value.trim());
  }, 180);
});

estimateFileInput.addEventListener("change", () => {
  if (!estimateFileInput.files.length) return;
  form.elements["estimate.selectedEstimateFile"].value = "";
  estimatePreview.removeAttribute("src");
  estimatePreview.classList.add("hidden");
  includePage(3);
  setContractSetupCollapsed(true);
  renderEstimateFiles(estimateFiles);
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchSection(button.dataset.sectionTab);
  });
});

customerStepDoneButton.addEventListener("click", () => {
  setCompactResult("<p><strong>Customer information step complete.</strong> Continue to schedule/measurement, or use Skip Measurement if it does not apply.</p>");
  advanceFromSection();
});

quickMeasurementSkipButton.addEventListener("click", () => {
  setCompactResult("<p><strong>Quick Measurement skipped.</strong> Continue with contract pages and job details, or come back later if measurements need to be added.</p>");
  advanceFromSection();
});

quickMeasurementDoneButton.addEventListener("click", () => {
  setCompactResult("<p><strong>Quick Measurement step accepted.</strong> Continue with contract pages and job details.</p>");
  advanceFromSection();
});

estimateStepDoneButton.addEventListener("click", () => {
  const hasEstimate = Boolean(
    form.elements["estimate.selectedEstimateFile"]?.value
      || estimateFileInput.files.length
      || form.elements["estimate.estimateNumber"]?.value.trim()
  );
  setContractSetupCollapsed(true);
  setCompactResult(hasEstimate
    ? "<p><strong>Estimate accepted.</strong> Continue with customer information, then finish the contract details.</p>"
    : "<p><strong>No estimate attached.</strong> Continue with customer information. An estimate can be added later if needed.</p>");
  switchSection("customer");
});

function setAddendumAPage(enabled) {
  const pageNine = form.querySelector('[name="pages.included"][value="9"]');
  if (pageNine) pageNine.checked = enabled;
  form.elements["payments.splitPaymentApproved"].checked = enabled;
}

signaturesStepDoneButton.addEventListener("click", () => {
  setCompactResult("<p><strong>Support/release forms step complete.</strong> Continue to notes, then generate the packet when ready.</p>");
  advanceFromSection();
});

addendumDoneButton.addEventListener("click", () => {
  const needed = form.elements["payments.splitPaymentApproved"].checked && hasAddendumInformation();
  setAddendumAPage(needed);
  showResult(`
    <p><strong>${needed ? "Addendum A included." : "Addendum A not included."}</strong></p>
    <p>This ends the initial customer contract flow. Review the packet, then generate it when ready.</p>
    <div class="result-actions">
      <button type="button" id="review-pages-after-addendum-done">Review pages</button>
      <button type="submit" form="packet-form">Generate packet</button>
    </div>
  `);
  document.querySelector("#review-pages-after-addendum-done").addEventListener("click", () => switchSection("pages"));
  advanceFromSection();
});

async function init() {
  renderPageOptions();
  makeRows(paymentRows, "payments", paymentKeys, paymentRowCount);
  makeRows(vendorRows, "vendors", vendorKeys, vendorRowCount);
  makeRows(materialRows, "materials", materialKeys, materialRowCount);
  bindPhoneFormatting();
  bindDateFormatting();
  bindCurrencyFormatting();
  setContractWorkflowVisible(true);
  setTodayDefaults();
  await loadStaffUsers();
  await loadBusinessSettings();
  await loadInstallerDirectory();
  await loadEditPacketIfNeeded();
  applyCustomerSearchFromUrl();
  if (await restoreServerDraftIfNeeded()) {
    setContractWorkflowVisible(true);
  } else if (restoreDraftSnapshotIfNeeded()) {
    setContractWorkflowVisible(true);
  }
  await selectEstimateFromReturnIfPresent();
  configureAdminReturnLinks();
  configureEstimateToolLink();
  if (currentSection() === "estimate") {
    loadEstimateFiles(estimateSearchInput?.value.trim() || form.elements["customer.lastName"]?.value.trim() || "");
  }
  syncSegmentedControls();
  updateCustomerIntakeSummary();
  updateWorkflowNav();
}

init().catch((error) => {
  showResult(`<p class="error">${escapeHtml(error.message)}</p>`);
});
