const businessForm = document.querySelector("#business-form");
const securityForm = document.querySelector("#security-form");
const staffUserForm = document.querySelector("#staff-user-form");
const staffUserList = document.querySelector("#staff-user-list");
const staffUserSaveButton = document.querySelector("#staff-user-save-button");
const staffUserCancelButton = document.querySelector("#staff-user-cancel-button");
const staffSignatureSelect = document.querySelector("#staff-signature-select");
const staffSignatureCreateButton = document.querySelector("#staff-signature-create");
const signatureForm = document.querySelector("#signature-form");
const signatureList = document.querySelector("#signature-list");
const signatureModal = document.querySelector("#signature-modal");
const signatureModalTitle = document.querySelector("#signature-modal-title");
const signatureUploadNote = document.querySelector("#signature-upload-note");
const saveSignatureButton = document.querySelector("#save-signature-button");
const closeSignatureModalButton = document.querySelector("#close-signature-modal");
const cancelSignatureModalButton = document.querySelector("#cancel-signature-modal");
const settingsResult = document.querySelector("#settings-result");
const logoutButton = document.querySelector("#logout");
const adminReturnLink = document.querySelector("#admin-return-link");
const logoPreviewWrap = document.querySelector("#logo-preview-wrap");
const logoPreview = document.querySelector("#logo-preview");
const settingsTabs = [...document.querySelectorAll("[data-settings-tab]")];
const settingsPanels = [...document.querySelectorAll("[data-settings-panel]")];
const salesTaxHistory = document.querySelector("#sales-tax-history");
const preimportForm = document.querySelector("#preimport-form");
const preimportPreview = document.querySelector("#preimport-preview");
const preimportCounts = document.querySelector("#preimport-counts");
const preimportRuns = document.querySelector("#preimport-runs");
const preimportClearButton = document.querySelector("#preimport-clear-button");
const preimportDocumentForm = document.querySelector("#preimport-document-form");
const preimportDocumentsList = document.querySelector("#preimport-documents-list");
const preimportScanDocumentsButton = document.querySelector("#preimport-scan-documents");
const gmailAccountForm = document.querySelector("#gmail-account-form");
const gmailAccountList = document.querySelector("#gmail-account-list");
const gmailAccountClearButton = document.querySelector("#gmail-account-clear");
const gmailScanNowButton = document.querySelector("#gmail-scan-now");
const gmailOauthNote = document.querySelector("#gmail-oauth-note");
const storeSignatureCanvas = document.querySelector("#store-signature-canvas");
const clearStoreSignatureButton = document.querySelector("#clear-store-signature");
const storeSignatureCtx = storeSignatureCanvas.getContext("2d");
const DEFAULT_LOGO_SRC = "/img/logos/edgewater-original.png";

let settings = null;
let drawingStoreSignature = false;
let hasDrawnStoreSignature = false;
let pendingLogoObjectUrl = "";
let savingSignature = false;
let savingStaffUser = false;
let staffUsers = [];
let preimportPreviewRows = [];
let initialRepParamsApplied = false;
let gmailAccounts = [];

function showResult(message, isError = false) {
  settingsResult.innerHTML = `<p class="${isError ? "error" : ""}">${message}</p>`;
  settingsResult.classList.remove("hidden");
}

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

function bindBusinessPhoneFormatting() {
  const input = businessForm?.elements.phone;
  if (!input) return;
  input.maxLength = 14;
  input.pattern = "\\(\\d{3}\\) \\d{3}-\\d{4}";
  input.addEventListener("input", () => formatPhoneInput(input));
  input.addEventListener("blur", () => formatPhoneInput(input));
}

function validateBusinessPhone() {
  const input = businessForm?.elements.phone;
  if (!input?.value.trim()) return true;
  if (phoneDigits(input.value).length === 10) {
    formatPhoneInput(input);
    return true;
  }
  input.focus();
  showResult("Business phone must be 10 digits and cannot start with 1.", true);
  return false;
}

function safeContractReturnPath(value) {
  const raw = String(value || "");
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "";

    const path = `${url.pathname}${url.search}${url.hash}`;
    const isNewContract = path === "/contract/new" || path.startsWith("/contract/new?");
    const isEditContract = /^\/contract\/[^/]+\/edit(?:[?#]|$)/.test(path);
    return isNewContract || isEditContract ? path : "";
  } catch (_error) {
    return "";
  }
}

function configureReturnLink() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeContractReturnPath(params.get("returnTo"));
  if (!adminReturnLink || !returnTo) return;

  adminReturnLink.href = returnTo;
  adminReturnLink.textContent = "Back to Contract";
}

function keyText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function currentStaff() {
  return settings?.currentStaff || {};
}

function canManageOwnedRecord(record) {
  const staff = currentStaff();
  const username = String(staff.username || "").toLowerCase();
  if (!username) return false;
  if (String(record?.ownerUsername || "").toLowerCase() === username) return true;
  return !record?.ownerUsername && keyText(record?.name) && keyText(record.name) === keyText(staff.name || staff.username);
}

function canManageStaffUsers() {
  const staff = currentStaff();
  const role = staffRole(staff);
  return Boolean(staff.envAdmin || role === "superadmin" || role === "admin");
}

function canRemoveStaffUsers() {
  const staff = currentStaff();
  return Boolean(staff.envAdmin || staffRole(staff) === "superadmin");
}

function syncStaffRoleOptionAccess() {
  const select = staffUserForm?.elements.role;
  if (!select) return;
  const canGrantElevated = canRemoveStaffUsers();
  Array.from(select.options).forEach((option) => {
    if (option.value === "superadmin" || option.value === "admin") {
      option.disabled = !canGrantElevated;
    }
  });
}

function staffRole(user = {}) {
  const role = String(user.role || "").toLowerCase();
  if (role === "superadmin" || role === "owner" || role === "admin" || role === "sales_manager" || role === "finance" || role === "salesperson") return role;
  return user.canManageUsers ? "admin" : "salesperson";
}

function staffRoleLabel(role) {
  if (role === "superadmin") return "Superadmin";
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "sales_manager") return "Sales Manager";
  if (role === "finance") return "Finance";
  return "Salesperson";
}

function staffRoleCanManage(role) {
  return role === "superadmin" || role === "admin";
}

function staffRepProfile(user = {}) {
  const role = staffRole(user);
  return {
    id: `staff:${user.id || user.username}`,
    name: user.name || user.username || "",
    title: user.title || staffRoleLabel(role),
    role,
    signatureId: user.signatureId || "",
    staffUser: true,
    ownerUsername: user.username || "",
  };
}

function staffSignatureProfiles({ includeStaff = true } = {}) {
  if (!includeStaff) return [];
  return staffUsers
    .filter((user) => user.name && !user.disabled)
    .map(staffRepProfile);
}

function usernameFromName(value) {
  const parts = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s._-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].replace(/[^a-z0-9._-]/g, "");
  return `${parts[0]}.${parts[parts.length - 1]}`.replace(/[^a-z0-9._-]/g, "");
}

function resetStaffUserForm() {
  if (!staffUserForm) return;
  staffUserForm.reset();
  staffUserForm.elements.staffId.value = "";
  staffUserForm.elements.email.value = "";
  staffUserForm.elements.role.value = "salesperson";
  staffUserForm.elements.signatureId.value = "";
  staffUserForm.elements.signatureFile.value = "";
  staffUserForm.elements.mustChangePassword.checked = true;
  staffUserForm.elements.disabled.checked = false;
  staffUserForm.elements.disabled.disabled = !canRemoveStaffUsers();
  syncStaffRoleOptionAccess();
  staffUserSaveButton.textContent = "Create User";
  staffUserCancelButton.classList.add("hidden");
  staffUserForm.elements.password.required = true;
  renderStaffSignatureOptions();
}

function editStaffUser(user) {
  staffUserForm.elements.staffId.value = user.id || "";
  staffUserForm.elements.name.value = user.name || "";
  staffUserForm.elements.username.value = user.username || "";
  staffUserForm.elements.email.value = user.email || "";
  staffUserForm.elements.password.value = "";
  staffUserForm.elements.password.required = false;
  staffUserForm.elements.role.value = staffRole(user);
  staffUserForm.elements.signatureId.value = user.signatureId || "";
  staffUserForm.elements.signatureFile.value = "";
  staffUserForm.elements.mustChangePassword.checked = Boolean(user.mustChangePassword);
  staffUserForm.elements.disabled.checked = Boolean(user.disabled);
  staffUserForm.elements.disabled.disabled = !canRemoveStaffUsers();
  syncStaffRoleOptionAccess();
  staffUserSaveButton.textContent = "Update User";
  staffUserCancelButton.classList.remove("hidden");
  staffUserForm.scrollIntoView({ behavior: "smooth", block: "center" });
  staffUserForm.elements.name.focus();
}

function renderStaffUsers() {
  if (!staffUserList) return;
  if (!canManageStaffUsers()) {
    staffUserForm?.classList.add("hidden");
    staffUserList.innerHTML = '<p class="muted-text">Only Superadmin or Admin accounts can manage staff users.</p>';
    return;
  }

  staffUserForm?.classList.remove("hidden");
  if (!staffUsers.length) {
    staffUserList.innerHTML = '<p class="muted-text">No staff users yet.</p>';
    return;
  }

  staffUserList.innerHTML = staffUsers.map((user) => {
    const role = staffRole(user);
    const badges = [
      staffRoleLabel(role),
      user.signatureId ? "Signature saved" : "No signature",
      user.mustChangePassword ? "Must change password" : "",
      user.disabled ? "Disabled" : "Active",
    ].filter(Boolean);
    const dates = [
      user.lastLoginAt ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}` : "No login recorded",
      user.createdAt ? `Created ${new Date(user.createdAt).toLocaleDateString()}` : "",
    ].filter(Boolean).join(" | ");
    return `
      <article class="staff-user-row${user.disabled ? " disabled" : ""}">
        <div>
          <strong>${escapeHtml(user.name || user.username)}</strong>
          <span>${escapeHtml([user.username, user.email].filter(Boolean).join(" | "))}</span>
          <small>${escapeHtml(dates)}</small>
        </div>
        <div class="staff-user-badges">
          ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
        </div>
        <div class="profile-actions">
          <button class="ghost" type="button" data-edit-staff="${escapeHtml(user.id)}">Edit</button>
          <button class="ghost" type="button" data-staff-signature="${escapeHtml(user.id)}">${user.signatureId ? "Edit Signature" : "Add Signature"}</button>
          <button class="ghost" type="button" data-reset-staff-password="${escapeHtml(user.id)}">Send Reset Link</button>
        </div>
      </article>
    `;
  }).join("");

  staffUserList.querySelectorAll("[data-edit-staff]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = staffUsers.find((item) => item.id === button.getAttribute("data-edit-staff"));
      if (user) editStaffUser(user);
    });
  });

  staffUserList.querySelectorAll("[data-reset-staff-password]").forEach((button) => {
    button.addEventListener("click", () => resetStaffUserPassword(button.getAttribute("data-reset-staff-password")));
  });

  staffUserList.querySelectorAll("[data-staff-signature]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = staffUsers.find((item) => item.id === button.getAttribute("data-staff-signature"));
      if (!user) return;
      if (!canManageOwnedRecord(staffRepProfile(user))) {
        showResult("Each user must create or replace only their own signature.", true);
        return;
      }
      editStaffUser(user);
      openSignatureModal({ context: "staff", staffId: user.id });
    });
  });
}

async function loadStaffUsersForAdmin() {
  if (!staffUserList || !canManageStaffUsers()) {
    renderStaffUsers();
    return;
  }

  const response = await fetch("/api/admin/users");
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    staffUsers = [];
    staffUserList.innerHTML = `<p class="error">${escapeHtml(data.error || "Could not load staff users.")}</p>`;
    return;
  }

  staffUsers = data.users || [];
  renderStaffUsers();
}

async function loadStaffUsersPublic() {
  const response = await fetch("/api/staff-users");
  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) {
    staffUsers = data.users || [];
  }
}

async function resetStaffUserPassword(staffId) {
  const user = staffUsers.find((item) => item.id === staffId);
  if (!user) return;
  if (!user.email) {
    showResult("Add an email address before sending a reset link.", true);
    return;
  }

  const response = await fetch(`/api/admin/users/${encodeURIComponent(staffId)}/password-reset-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not send staff password reset link.", true);
    return;
  }
  await loadStaffUsersForAdmin();
  showResult(data.sent
    ? `Password reset link sent to ${data.to || user.email}.`
    : (data.reason || "Reset link was created, but email is not configured."));
}

async function saveStaffSignatureId(staffId, signatureId) {
  const user = staffUsers.find((item) => item.id === staffId);
  if (!user) return false;
  const role = staffRole(user);
  const response = await fetch(`/api/admin/users/${encodeURIComponent(staffId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: user.name,
      username: user.username,
      role,
      canManageUsers: staffRoleCanManage(role),
      signatureId,
      mustChangePassword: Boolean(user.mustChangePassword),
      disabled: Boolean(user.disabled),
    }),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Signature saved, but could not attach it to the staff user.", true);
    return false;
  }
  await loadStaffUsersPublic();
  await loadStaffUsersForAdmin();
  renderSignatures();
  return true;
}

function fillBusinessForm(data) {
  Object.entries(data).forEach(([key, value]) => {
    if (businessForm.elements[key]) {
      businessForm.elements[key].value = value || "";
    }
  });
  if (businessForm.elements.phone) formatPhoneInput(businessForm.elements.phone);
  renderLogoPreview(data.logoDataUrl || DEFAULT_LOGO_SRC);
  renderSalesTaxHistory(data);
}

function fillSecurityForm(data) {
  if (!securityForm) return;
  securityForm.elements.staffSessionIdleMinutes.value = data.staffSessionIdleMinutes || 5;
}

function renderSalesTaxHistory(data) {
  if (!salesTaxHistory) return;
  const history = Array.isArray(data.salesTaxHistory) ? data.salesTaxHistory : [];
  const current = Number(data.salesTaxRate || 6.5).toFixed(4).replace(/\.?0+$/, "");
  const rows = history.length
    ? history.slice(0, 5).map((item) => {
      const rate = Number(item.rate || 0).toFixed(4).replace(/\.?0+$/, "");
      const changedAt = item.changedAt ? new Date(item.changedAt).toLocaleString() : "No date";
      const actor = item.changedBy ? ` by ${escapeHtml(item.changedBy)}` : "";
      return `<div>${escapeHtml(rate)}% <span>${escapeHtml(changedAt)}${actor}</span></div>`;
    }).join("")
    : `<div>${escapeHtml(current)}% <span>No prior changes recorded</span></div>`;
  salesTaxHistory.innerHTML = rows;
}

function preimportRecordTitle(record = {}) {
  return record.itemName
    || record.name
    || [record.firstName, record.lastName].filter(Boolean).join(" ")
    || record.productCode
    || record.sku
    || record.itemNumber
    || "Unnamed";
}

function preimportRecordDetail(kind, record = {}) {
  if (kind === "customers") {
    return [record.phone1, record.email, record.mailingAddress].filter(Boolean).join(" | ");
  }
  if (kind === "suppliers") {
    return [record.contactName, record.phone, record.email, record.accountNumber].filter(Boolean).join(" | ");
  }
  return [
    record.productCode || record.sku || record.itemNumber,
    record.itemType || record.category,
    record.itemDescription,
    record.quantity ? `Qty ${record.quantity}` : "",
    record.price ? `Price ${record.price}` : "",
    record.lineTotal ? `Total ${record.lineTotal}` : "",
  ].filter(Boolean).join(" | ");
}

function documentSuggestionDetail(document = {}) {
  return [
    document.emailFrom ? `From: ${document.emailFrom}` : "",
    document.emailSubject ? `Subject: ${document.emailSubject}` : "",
    document.suggestedCustomer,
    document.suggestedPhone,
    document.suggestedEmail,
    document.suggestedAddress,
    document.suggestedInvoice,
    document.suggestedDate,
  ].filter(Boolean).join(" | ");
}

function renderPreimportDocuments(documents = []) {
  if (!preimportDocumentsList) return;
  const rows = Array.isArray(documents) ? documents.slice(0, 100) : [];
  if (!rows.length) {
    preimportDocumentsList.innerHTML = '<p class="muted-text">No staged documents yet.</p>';
    return;
  }

  preimportDocumentsList.innerHTML = rows.map((document) => {
    const canOcr = document.extension !== "zip";
    const detail = documentSuggestionDetail(document) || "No OCR suggestions yet.";
    const textPreview = document.ocrTextPreview
      ? `<details><summary>OCR text preview</summary><pre>${escapeHtml(document.ocrTextPreview)}</pre></details>`
      : "";
    const errors = Array.isArray(document.ocrErrors) && document.ocrErrors.length
      ? `<p class="preimport-ocr-errors">${escapeHtml(document.ocrErrors.join(" | "))}</p>`
      : "";
    return `
      <article class="preimport-document-row">
        <div>
          <strong>${escapeHtml(document.fileName || document.relativePath || "Document")}</strong>
          <span>${escapeHtml(document.documentType || "review")} | ${escapeHtml(document.ocrStatus || "not-run")} ${document.ocrEngine ? `| ${escapeHtml(document.ocrEngine)}` : ""}</span>
          <p>${escapeHtml(detail)}</p>
          ${textPreview}
          ${errors}
        </div>
        <button class="ghost" type="button" data-ocr-document="${escapeHtml(document.id)}"${canOcr ? "" : " disabled"}>Run OCR</button>
      </article>
    `;
  }).join("");

  preimportDocumentsList.querySelectorAll("[data-ocr-document]").forEach((button) => {
    button.addEventListener("click", () => runPreimportOcr(button.getAttribute("data-ocr-document"), button));
  });
}

function renderPreimportStore(store = {}) {
  if (preimportCounts) {
    const counts = store.counts || {};
    preimportCounts.innerHTML = `
      <div><strong>${Number(counts.customers || 0)}</strong><span>Customers</span></div>
      <div><strong>${Number(counts.suppliers || 0)}</strong><span>Suppliers</span></div>
      <div><strong>${Number(counts.products || 0)}</strong><span>Products</span></div>
      <div><strong>${Number(counts.documents || 0)}</strong><span>Documents</span></div>
      <p class="preimport-storage-note">Storage: ${escapeHtml(store.storage === "postgres" ? "PostgreSQL shared lookup tables" : "local file fallback")}</p>
    `;
  }

  if (preimportRuns) {
    const runs = Array.isArray(store.importRuns) ? store.importRuns : [];
    preimportRuns.innerHTML = runs.length
      ? runs.slice(0, 5).map((run) => `
        <div class="preimport-run">
          <strong>${escapeHtml(run.kind || "Import")}</strong>
          <span>${escapeHtml(run.sourceName || "No source")} | ${Number(run.importedCount || 0)} added, ${Number(run.skippedCount || 0)} skipped</span>
        </div>
      `).join("")
      : '<p class="muted-text">No imports yet.</p>';
  }

  renderPreimportDocuments(store.documents || []);
}

async function loadPreimportStore() {
  if (!preimportCounts && !preimportRuns) return;
  const response = await fetch("/api/preimport");
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) renderPreimportStore(data);
}

function renderPreimportPreview(data = {}) {
  if (!preimportPreview) return;
  preimportPreviewRows = Array.isArray(data.rows) ? data.rows : [];
  const stats = data.stats || {};
  const rows = preimportPreviewRows.slice(0, 80);
  const newCount = Number(stats.new || 0);

  preimportPreview.innerHTML = `
    <div class="preimport-preview-head">
      <div>
        <h3>Preview</h3>
        <p>${Number(stats.total || 0)} rows checked: ${newCount} new, ${Number(stats.duplicate || 0) + Number(stats["duplicate-in-file"] || 0)} duplicate, ${Number(stats.invalid || 0)} invalid. Storage: ${escapeHtml(data.storage === "postgres" ? "PostgreSQL" : "file fallback")}.</p>
      </div>
      <button class="primary" id="preimport-import-button" type="button"${newCount ? "" : " disabled"}>Import New Records</button>
    </div>
    ${rows.length ? `
      <div class="preimport-table-wrap">
        <table class="preimport-table">
          <thead><tr><th>Status</th><th>Name</th><th>Detail</th><th>Note</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="preimport-${escapeHtml(row.status || "new")}">
                <td>${escapeHtml(row.status || "")}</td>
                <td>${escapeHtml(preimportRecordTitle(row.record))}</td>
                <td>${escapeHtml(preimportRecordDetail(data.kind, row.record))}</td>
                <td>${escapeHtml(row.reason || row.record?.reason || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : '<p class="muted-text">No rows to preview.</p>'}
  `;

  const importButton = preimportPreview.querySelector("#preimport-import-button");
  importButton?.addEventListener("click", importPreimportPreviewRows);
}

function clearPreimportPreview() {
  preimportPreviewRows = [];
  if (preimportPreview) preimportPreview.innerHTML = "";
}

async function fileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function importPreimportPreviewRows() {
  const rows = preimportPreviewRows
    .filter((row) => row.status === "new")
    .map((row) => row.record);
  if (!rows.length) {
    showResult("No new preimport rows are ready to import.", true);
    return;
  }

  const payload = {
    kind: preimportForm.elements.kind.value,
    sourceName: preimportForm.elements.sourceName.value.trim(),
    rows,
  };
  const response = await fetch("/api/preimport/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not import records.", true);
    return;
  }
  clearPreimportPreview();
  preimportForm.reset();
  await loadPreimportStore();
  showResult(`${data.importedCount || 0} ${payload.kind} imported. ${data.skippedCount || 0} skipped as duplicates.`);
}

async function uploadPreimportDocuments(event) {
  event.preventDefault();
  const files = [...(preimportDocumentForm.elements.documents.files || [])];
  if (!files.length) {
    showResult("Choose at least one PDF or image for OCR staging.", true);
    return;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("documents", file));
  const response = await fetch("/api/preimport/documents/upload", {
    method: "POST",
    body: formData,
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not upload OCR documents.", true);
    return;
  }

  preimportDocumentForm.reset();
  await loadPreimportStore();
  showResult(`${data.uploaded?.length || 0} document(s) staged. ${data.skipped?.length || 0} skipped.`);
}

async function scanPreimportDocuments() {
  preimportScanDocumentsButton.disabled = true;
  preimportScanDocumentsButton.textContent = "Scanning...";
  try {
    const response = await fetch("/api/preimport/documents/scan", { method: "POST" });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      showResult(data.error || "Could not scan incoming OCR folder.", true);
      return;
    }
    await loadPreimportStore();
    showResult(`${data.scanned?.length || 0} incoming document(s) staged. ${data.skipped?.length || 0} skipped.`);
  } finally {
    preimportScanDocumentsButton.disabled = false;
    preimportScanDocumentsButton.textContent = "Scan Incoming Folder";
  }
}

async function runPreimportOcr(documentId, button) {
  if (!documentId) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Running...";
  try {
    const response = await fetch(`/api/preimport/documents/${encodeURIComponent(documentId)}/ocr`, { method: "POST" });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      showResult(data.error || "Could not OCR this document.", true);
      return;
    }
    await loadPreimportStore();
    const document = data.document || {};
    showResult(document.ocrStatus === "complete" ? "OCR complete. Review the suggested fields." : "OCR needs review. Check the text preview and errors.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderGmailAccounts(data = {}) {
  if (!gmailAccountList) return;
  gmailAccounts = Array.isArray(data.accounts) ? data.accounts : [];
  if (gmailOauthNote) {
    gmailOauthNote.textContent = data.oauthConfigured
      ? `OAuth redirect URL: ${data.redirectUri || "Set PUBLIC_BASE_URL or GMAIL_OAUTH_REDIRECT_URI."}`
      : "Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET on the server before connecting Gmail accounts.";
  }
  if (!gmailAccounts.length) {
    gmailAccountList.innerHTML = '<p class="muted-text">No Gmail import accounts configured yet.</p>';
    return;
  }
  gmailAccountList.innerHTML = gmailAccounts.map((account) => `
    <article class="gmail-account-row ${account.enabled ? "" : "disabled"}">
      <div>
        <strong>${escapeHtml(account.email || "Gmail account")}</strong>
        <span>${escapeHtml(account.store || "cabinet")} | Label: ${escapeHtml(account.labelName || "Portal Import")} | Every ${Number(account.scanEveryMinutes || 240)} minutes</span>
        <p>${account.connected ? "Connected to Gmail" : "Not connected yet"}${account.lastScanAt ? ` | Last scan: ${escapeHtml(account.lastScanAt)}` : ""}</p>
        ${account.lastError ? `<p class="error">${escapeHtml(account.lastError)}</p>` : ""}
      </div>
      <div class="gmail-account-actions">
        <button class="ghost" type="button" data-gmail-edit="${escapeHtml(account.id)}">Edit</button>
        <button class="ghost" type="button" data-gmail-connect="${escapeHtml(account.id)}"${data.oauthConfigured ? "" : " disabled"}>${account.connected ? "Reconnect" : "Connect"}</button>
        <button class="ghost" type="button" data-gmail-delete="${escapeHtml(account.id)}">Remove</button>
      </div>
    </article>
  `).join("");

  gmailAccountList.querySelectorAll("[data-gmail-edit]").forEach((button) => {
    button.addEventListener("click", () => editGmailAccount(button.getAttribute("data-gmail-edit")));
  });
  gmailAccountList.querySelectorAll("[data-gmail-connect]").forEach((button) => {
    button.addEventListener("click", () => connectGmailAccount(button.getAttribute("data-gmail-connect")));
  });
  gmailAccountList.querySelectorAll("[data-gmail-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteGmailAccount(button.getAttribute("data-gmail-delete")));
  });
}

async function loadGmailAccounts() {
  if (!gmailAccountList) return;
  const response = await fetch("/api/gmail-import/accounts");
  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) renderGmailAccounts(data);
}

function clearGmailAccountForm() {
  if (!gmailAccountForm) return;
  gmailAccountForm.reset();
  gmailAccountForm.elements.id.value = "";
  gmailAccountForm.elements.labelName.value = "Portal Import";
  gmailAccountForm.elements.query.value = "has:attachment";
  gmailAccountForm.elements.scanEveryMinutes.value = "240";
  gmailAccountForm.elements.enabled.checked = true;
}

function editGmailAccount(accountId) {
  const account = gmailAccounts.find((item) => item.id === accountId);
  if (!account || !gmailAccountForm) return;
  gmailAccountForm.elements.id.value = account.id || "";
  gmailAccountForm.elements.email.value = account.email || "";
  gmailAccountForm.elements.store.value = account.store || "cabinet";
  gmailAccountForm.elements.labelName.value = account.labelName || "Portal Import";
  gmailAccountForm.elements.query.value = account.query || "has:attachment";
  gmailAccountForm.elements.scanEveryMinutes.value = String(account.scanEveryMinutes || 240);
  gmailAccountForm.elements.enabled.checked = account.enabled !== false;
}

async function saveGmailAccount(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(gmailAccountForm).entries());
  payload.enabled = gmailAccountForm.elements.enabled.checked;
  const response = await fetch("/api/gmail-import/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not save Gmail import account.", true);
    return;
  }
  clearGmailAccountForm();
  await loadGmailAccounts();
  showResult("Gmail import account saved.");
}

async function connectGmailAccount(accountId) {
  const response = await fetch(`/api/gmail-import/accounts/${encodeURIComponent(accountId)}/auth-url`);
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok || !data.url) {
    showResult(data.error || "Could not start Gmail connection.", true);
    return;
  }
  window.location.href = data.url;
}

async function deleteGmailAccount(accountId) {
  if (!window.confirm("Remove this Gmail import account from the portal?")) return;
  const response = await fetch(`/api/gmail-import/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not remove Gmail import account.", true);
    return;
  }
  clearGmailAccountForm();
  await loadGmailAccounts();
  showResult("Gmail import account removed.");
}

async function scanGmailAccountsNow() {
  gmailScanNowButton.disabled = true;
  gmailScanNowButton.textContent = "Scanning...";
  try {
    const response = await fetch("/api/document-inbox/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      showResult(data.error || "Could not scan Gmail import accounts.", true);
      return;
    }
    await loadGmailAccounts();
    showResult(`${data.gmail?.uploaded?.length || 0} Gmail document(s) staged. ${data.local?.scanned?.length || 0} local incoming document(s) staged.`);
  } finally {
    gmailScanNowButton.disabled = false;
    gmailScanNowButton.textContent = "Scan Now";
  }
}

function switchSettingsTab(target) {
  settingsTabs.forEach((button) => button.classList.toggle("active", button.dataset.settingsTab === target));
  settingsPanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.settingsPanel !== target));
}

function switchInitialSettingsTab() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (!tab || !settingsTabs.some((button) => button.dataset.settingsTab === tab)) return;
  switchSettingsTab(tab);
}

function applyInitialRepParams() {
  if (initialRepParamsApplied) return;
  const params = new URLSearchParams(window.location.search);
  const staffKey = (params.get("staff") || "").toLowerCase();
  const repName = params.get("repName") || "";
  if (!staffKey && !repName) return;
  initialRepParamsApplied = true;

  const user = staffUsers.find((item) => (
    String(item.username || "").toLowerCase() === staffKey
    || String(item.id || "").toLowerCase() === staffKey
    || keyText(item.name) === keyText(repName)
  ));
  switchSettingsTab("signatures");
  if (!user) return;
  editStaffUser(user);
  openSignatureModal({ context: "staff", staffId: user.id });
}

function revokePendingLogoObjectUrl() {
  if (!pendingLogoObjectUrl) return;
  URL.revokeObjectURL(pendingLogoObjectUrl);
  pendingLogoObjectUrl = "";
}

function renderLogoPreview(src) {
  if (!logoPreviewWrap || !logoPreview) return;
  if (!src) {
    logoPreviewWrap.classList.add("hidden");
    logoPreview.removeAttribute("src");
    return;
  }

  logoPreview.src = src;
  logoPreviewWrap.classList.remove("hidden");
}

function signatureById(id) {
  return (settings?.signatures || []).find((signature) => signature.id === id);
}

function renderSignatures() {
  const signatures = settings?.signatures || [];
  const reps = staffSignatureProfiles();
  renderStaffSignatureOptions();

  if (!reps.length && !signatures.length) {
    signatureList.innerHTML = "<p>No staff users or saved signatures yet.</p>";
    return;
  }

  const staffRows = reps.map((rep) => {
    const staffId = String(rep.id || "").replace(/^staff:/, "");
    const signature = signatureById(rep.signatureId);
    const canManageRep = canManageOwnedRecord(rep);
    const canManageSignature = signature ? canManageOwnedRecord(signature) : canManageRep;
    return `
      <div class="signature-row signature-profile-row">
        ${signature
          ? `<img class="signature-preview" src="${signature.dataUrl}" alt="${escapeHtml(signature.name)}" />`
          : '<div class="signature-empty-preview">No saved signature</div>'}
        <div class="signature-profile-detail">
          <strong>${escapeHtml(rep.name)}</strong>
          <span>${escapeHtml(rep.title || "Staff user")}</span>
          <small>${signature ? escapeHtml(signature.name) : "Manual signature until saved"}</small>
        </div>
        <div class="profile-actions">
          ${canManageRep ? `<button class="ghost" type="button" data-edit-staff-from-signature="${escapeHtml(staffId)}">Edit User</button>` : ""}
          ${canManageRep || canManageSignature ? `<button class="ghost" type="button" data-staff-signature-from-signature="${escapeHtml(staffId)}">${signature ? "Edit Signature" : "Add Signature"}</button>` : ""}
          ${signature && canManageSignature ? `<button class="ghost" type="button" data-delete-signature="${signature.id}">Delete Signature</button>` : ""}
          ${!canManageRep && !canManageSignature ? '<span class="view-only-pill">View only</span>' : ""}
        </div>
      </div>
    `;
  });

  const linkedSignatureIds = new Set(reps.map((rep) => rep.signatureId).filter(Boolean));
  const unlinkedSignatureRows = signatures
    .filter((signature) => !linkedSignatureIds.has(signature.id))
    .map((signature) => {
      const canManageSignature = canManageOwnedRecord(signature);
    return `
      <div class="signature-row signature-profile-row">
        <img class="signature-preview" src="${signature.dataUrl}" alt="${escapeHtml(signature.name)}" />
        <div class="signature-profile-detail">
          <strong>${escapeHtml(signature.name)}</strong>
          <span>Unassigned saved signature</span>
          <small>Assign it from a staff user row.</small>
        </div>
        <div class="profile-actions">
          ${canManageSignature ? `<button class="ghost" type="button" data-replace-signature="${signature.id}">Edit Signature</button>` : ""}
          ${canManageSignature ? `<button class="ghost" type="button" data-delete-signature="${signature.id}">Delete Signature</button>` : ""}
          ${!canManageSignature ? '<span class="view-only-pill">View only</span>' : ""}
        </div>
      </div>
    `;
  });

  signatureList.innerHTML = [...staffRows, ...unlinkedSignatureRows].join("");

  signatureList.querySelectorAll("[data-edit-staff-from-signature]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = staffUsers.find((item) => item.id === button.getAttribute("data-edit-staff-from-signature"));
      if (!user) return;
      switchSettingsTab("users");
      editStaffUser(user);
    });
  });

  signatureList.querySelectorAll("[data-replace-signature]").forEach((button) => {
    button.addEventListener("click", () => {
      openSignatureModal({ signatureId: button.getAttribute("data-replace-signature") });
    });
  });

  signatureList.querySelectorAll("[data-staff-signature-from-signature]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = staffUsers.find((item) => item.id === button.getAttribute("data-staff-signature-from-signature"));
      if (!user) return;
      if (!canManageOwnedRecord(staffRepProfile(user))) {
        showResult("Each user must create or replace only their own signature.", true);
        return;
      }
      switchSettingsTab("users");
      editStaffUser(user);
      openSignatureModal({ context: "staff", staffId: user.id });
    });
  });

  signatureList.querySelectorAll("[data-delete-signature]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this saved signature image?")) return;

      const id = button.getAttribute("data-delete-signature");
      const response = await fetch(`/api/settings/signatures/${id}`, { method: "DELETE" });
      const data = await readJsonResponse(response).catch(() => ({}));
      if (!response.ok) {
        showResult(data.error || "Could not delete signature.", true);
        return;
      }
      await loadSettings();
      showResult("Signature deleted.");
    });
  });
}

function renderStaffSignatureOptions() {
  if (!staffSignatureSelect) return;
  const signatures = (settings?.signatures || []).filter(canManageOwnedRecord);
  const selected = staffSignatureSelect.value;
  staffSignatureSelect.innerHTML = '<option value="">No saved signature</option>';
  signatures.forEach((signature) => {
    const option = document.createElement("option");
    option.value = signature.id;
    option.textContent = signature.name;
    staffSignatureSelect.append(option);
  });
  staffSignatureSelect.value = signatures.some((signature) => signature.id === selected) ? selected : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function typedSignatureToDataUrl(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 260;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#102c28";
  let fontSize = 96;
  do {
    ctx.font = `${fontSize}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
    fontSize -= 4;
  } while (ctx.measureText(name).width > canvas.width - 120 && fontSize > 42);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

function signatureContextFields() {
  return {
    context: "staff",
    form: staffUserForm,
    select: staffSignatureSelect,
    fileInput: staffUserForm?.elements.signatureFile,
    nameInput: staffUserForm?.elements.name,
  };
}

function openSignatureModal({ staffId = "", signatureId = "" } = {}) {
  const fields = signatureContextFields();
  const selectedSignature = signatureById(signatureId || fields.select?.value);
  const selectedFile = fields.fileInput?.files?.[0];

  if (selectedSignature && !canManageOwnedRecord(selectedSignature)) {
    showResult("You can view that saved signature, but only its owner can replace it.", true);
    return;
  }

  const signerName = fields.nameInput?.value.trim() || "";
  signatureForm.dataset.signatureContext = fields.context;
  signatureForm.dataset.staffId = staffId || staffUserForm?.elements.staffId?.value || "";
  signatureForm.dataset.replaceSignatureId = selectedSignature?.id || "";
  signatureModalTitle.textContent = selectedSignature ? "Replace Signature" : "Create Signature";
  saveSignatureButton.textContent = selectedSignature ? "Replace Signature" : "Save Signature";
  signatureForm.elements.name.value = selectedSignature?.name || (signerName ? `${signerName} signature` : "");
  signatureForm.elements.typedSignatureName.value = signerName || "";
  signatureForm.elements.signatureConsent.checked = false;
  clearDrawnStoreSignature();

  if (selectedFile) {
    signatureUploadNote.textContent = `Selected upload: ${selectedFile.name}`;
    signatureUploadNote.classList.remove("hidden");
  } else {
    signatureUploadNote.textContent = "";
    signatureUploadNote.classList.add("hidden");
  }

  signatureModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    resizeStoreSignatureCanvas();
    signatureForm.elements.typedSignatureName.focus();
  });
}

function closeSignatureModal({ clearFile = false } = {}) {
  const fields = signatureContextFields();
  signatureModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  signatureForm.reset();
  signatureForm.dataset.signatureContext = "";
  signatureForm.dataset.staffId = "";
  signatureForm.dataset.replaceSignatureId = "";
  signatureUploadNote.textContent = "";
  signatureUploadNote.classList.add("hidden");
  clearDrawnStoreSignature();
  if (clearFile && fields.fileInput) {
    fields.fileInput.value = "";
  }
}

function resizeStoreSignatureCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = storeSignatureCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const savedImage = hasDrawnStoreSignature ? storeSignatureCanvas.toDataURL("image/png") : null;
  storeSignatureCanvas.width = Math.max(1, Math.round(rect.width * ratio));
  storeSignatureCanvas.height = Math.max(1, Math.round(rect.height * ratio));
  storeSignatureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  storeSignatureCtx.lineCap = "round";
  storeSignatureCtx.lineJoin = "round";
  storeSignatureCtx.lineWidth = 2.6;
  storeSignatureCtx.strokeStyle = "#1d4ed8";

  if (savedImage) {
    const image = new Image();
    image.onload = () => storeSignatureCtx.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = savedImage;
  }
}

function storeSignaturePointFromEvent(event) {
  const rect = storeSignatureCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function clearDrawnStoreSignature() {
  const rect = storeSignatureCanvas.getBoundingClientRect();
  storeSignatureCtx.clearRect(0, 0, rect.width || storeSignatureCanvas.width, rect.height || storeSignatureCanvas.height);
  hasDrawnStoreSignature = false;
}

async function loadSettings() {
  const response = await fetch("/api/settings");
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  settings = await readJsonResponse(response);
  await loadStaffUsersPublic();
  fillBusinessForm(settings);
  fillSecurityForm(settings);
  renderStaffSignatureOptions();
  renderSignatures();
  resetStaffUserForm();
  await loadStaffUsersForAdmin();
  await loadGmailAccounts();
  applyInitialRepParams();
}

businessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateBusinessPhone()) return;
  const payload = Object.fromEntries(new FormData(businessForm).entries());
  const file = businessForm.elements.logoFile.files[0];
  delete payload.logoFile;
  if (file) {
    payload.logoDataUrl = await fileToDataUrl(file);
  }
  payload.setupComplete = true;
  payload.setupDismissed = true;

  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    showResult("Could not save business settings.", true);
    return;
  }

  settings = await readJsonResponse(response);
  revokePendingLogoObjectUrl();
  businessForm.elements.logoFile.value = "";
  fillBusinessForm(settings);
  fillSecurityForm(settings);
  showResult("Business settings saved.");
});

securityForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      staffSessionIdleMinutes: securityForm.elements.staffSessionIdleMinutes.value,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not save security settings.", true);
    return;
  }

  settings = data;
  fillBusinessForm(settings);
  fillSecurityForm(settings);
  showResult("Security settings saved.");
});

businessForm.elements.logoFile.addEventListener("change", () => {
  revokePendingLogoObjectUrl();
  const file = businessForm.elements.logoFile.files[0];
  if (!file) {
    renderLogoPreview(settings?.logoDataUrl || DEFAULT_LOGO_SRC);
    return;
  }

  pendingLogoObjectUrl = URL.createObjectURL(file);
  renderLogoPreview(pendingLogoObjectUrl);
});

preimportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = preimportForm.elements.preimportFile.files[0];
  const content = file ? await fileText(file) : preimportForm.elements.content.value;
  if (!content.trim()) {
    showResult("Choose a CSV/JSON file or paste CSV/JSON data first.", true);
    return;
  }

  const response = await fetch("/api/preimport/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: preimportForm.elements.kind.value,
      sourceName: preimportForm.elements.sourceName.value.trim() || file?.name || "",
      content,
      format: file?.name.toLowerCase().endsWith(".json") ? "json" : "auto",
    }),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showResult(data.error || "Could not preview import data.", true);
    return;
  }
  renderPreimportPreview(data);
  showResult("Preview ready. Review rows before importing.");
});

preimportClearButton?.addEventListener("click", () => {
  preimportForm.reset();
  clearPreimportPreview();
});

preimportDocumentForm?.addEventListener("submit", uploadPreimportDocuments);
preimportScanDocumentsButton?.addEventListener("click", scanPreimportDocuments);
gmailAccountForm?.addEventListener("submit", saveGmailAccount);
gmailAccountClearButton?.addEventListener("click", clearGmailAccountForm);
gmailScanNowButton?.addEventListener("click", scanGmailAccountsNow);

settingsTabs.forEach((button) => {
  button.addEventListener("click", () => switchSettingsTab(button.dataset.settingsTab));
});

staffUserForm?.elements.name?.addEventListener("input", () => {
  if (staffUserForm.elements.staffId.value || staffUserForm.elements.username.value.trim()) return;
  staffUserForm.elements.username.value = usernameFromName(staffUserForm.elements.name.value);
});

staffUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (savingStaffUser) return;

  const staffId = staffUserForm.elements.staffId.value;
  const password = staffUserForm.elements.password.value;
  const role = staffUserForm.elements.role.value || "salesperson";
  const existingUser = staffId ? staffUsers.find((item) => item.id === staffId) : null;
  const payload = {
    name: staffUserForm.elements.name.value,
    username: staffUserForm.elements.username.value,
    email: staffUserForm.elements.email.value,
    role,
    canManageUsers: staffRoleCanManage(role),
    signatureId: staffUserForm.elements.signatureId.value,
    mustChangePassword: staffUserForm.elements.mustChangePassword.checked,
    disabled: canRemoveStaffUsers()
      ? staffUserForm.elements.disabled.checked
      : Boolean(existingUser?.disabled),
  };
  if (!staffId || password) payload.password = password;

  if (!staffId && String(payload.password || "").length < 10) {
    showResult("Use at least 10 characters for the temporary password.", true);
    return;
  }

  savingStaffUser = true;
  staffUserSaveButton.disabled = true;
  staffUserSaveButton.textContent = staffId ? "Updating..." : "Creating...";
  try {
    const response = await fetch(staffId ? `/api/admin/users/${encodeURIComponent(staffId)}` : "/api/admin/users", {
      method: staffId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      showResult(data.error || "Could not save staff user.", true);
      return;
    }

    if (staffId && password) {
      const passwordResponse = await fetch(`/api/admin/users/${encodeURIComponent(staffId)}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, mustChangePassword: staffUserForm.elements.mustChangePassword.checked }),
      });
      const passwordData = await readJsonResponse(passwordResponse).catch(() => ({}));
      if (!passwordResponse.ok) {
        showResult(passwordData.error || "User saved, but password reset failed.", true);
        return;
      }
    }

    resetStaffUserForm();
    await loadStaffUsersForAdmin();
    showResult(staffId ? "Staff user updated." : "Staff user created.");
  } finally {
    savingStaffUser = false;
    staffUserSaveButton.disabled = false;
    staffUserSaveButton.textContent = staffUserForm.elements.staffId.value ? "Update User" : "Create User";
  }
});

staffUserCancelButton?.addEventListener("click", resetStaffUserForm);

staffSignatureCreateButton?.addEventListener("click", () => openSignatureModal());

signatureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (savingSignature) return;

  const replaceSignatureId = signatureForm.dataset.replaceSignatureId || "";
  savingSignature = true;
  saveSignatureButton.disabled = true;
  saveSignatureButton.textContent = replaceSignatureId ? "Replacing..." : "Saving...";

  try {
    const fields = signatureContextFields();
    const file = fields.fileInput?.files?.[0];
    const typedSignatureName = signatureForm.elements.typedSignatureName.value.trim();
    if (!signatureForm.elements.signatureConsent.checked) {
      showResult("Confirm the official signature acknowledgement before saving.", true);
      return;
    }

    const dataUrl = file
      ? await fileToDataUrl(file)
      : hasDrawnStoreSignature
        ? storeSignatureCanvas.toDataURL("image/png")
        : typedSignatureName
          ? typedSignatureToDataUrl(typedSignatureName)
          : "";

    if (!dataUrl) {
      showResult("Choose a file, draw a signature, or type a signature before saving.", true);
      return;
    }

    const response = await fetch(
      replaceSignatureId ? `/api/settings/signatures/${replaceSignatureId}` : "/api/settings/signatures",
      {
        method: replaceSignatureId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signatureForm.elements.name.value.trim() || (typedSignatureName ? `${typedSignatureName} signature` : ""),
          dataUrl,
        }),
      },
    );

    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      showResult(data.error || "Could not save signature.", true);
      return;
    }

    const staffId = signatureForm.dataset.staffId || staffUserForm.elements.staffId.value;
    closeSignatureModal({ clearFile: true });
    await loadSettings();
    const signatureId = data.id || replaceSignatureId;
    staffSignatureSelect.value = signatureId;
    if (staffId) {
      await saveStaffSignatureId(staffId, signatureId);
      showResult(replaceSignatureId ? "Signature replaced and attached to staff user." : "Signature saved and attached to staff user.");
    } else {
      showResult(replaceSignatureId ? "Signature replaced. Save the staff user to use it." : "Signature saved. Save the staff user to use it.");
    }
  } finally {
    savingSignature = false;
    saveSignatureButton.disabled = false;
    saveSignatureButton.textContent = signatureForm.dataset.replaceSignatureId ? "Replace Signature" : "Save Signature";
  }
});

storeSignatureCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  drawingStoreSignature = true;
  hasDrawnStoreSignature = true;
  storeSignatureCanvas.setPointerCapture(event.pointerId);
  const point = storeSignaturePointFromEvent(event);
  storeSignatureCtx.beginPath();
  storeSignatureCtx.moveTo(point.x, point.y);
});

storeSignatureCanvas.addEventListener("pointermove", (event) => {
  if (!drawingStoreSignature) return;
  event.preventDefault();
  const point = storeSignaturePointFromEvent(event);
  storeSignatureCtx.lineTo(point.x, point.y);
  storeSignatureCtx.stroke();
});

function stopDrawingStoreSignature() {
  drawingStoreSignature = false;
}

storeSignatureCanvas.addEventListener("pointerup", stopDrawingStoreSignature);
storeSignatureCanvas.addEventListener("pointercancel", stopDrawingStoreSignature);
storeSignatureCanvas.addEventListener("pointerleave", stopDrawingStoreSignature);
clearStoreSignatureButton.addEventListener("click", clearDrawnStoreSignature);
closeSignatureModalButton.addEventListener("click", () => closeSignatureModal());
cancelSignatureModalButton.addEventListener("click", () => closeSignatureModal());
signatureModal.addEventListener("click", (event) => {
  if (event.target === signatureModal) closeSignatureModal();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !signatureModal.classList.contains("hidden")) {
    closeSignatureModal();
  }
});
window.addEventListener("resize", () => {
  if (!signatureModal.classList.contains("hidden")) resizeStoreSignatureCanvas();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

configureReturnLink();
switchInitialSettingsTab();
bindBusinessPhoneFormatting();
loadSettings();
loadPreimportStore();
