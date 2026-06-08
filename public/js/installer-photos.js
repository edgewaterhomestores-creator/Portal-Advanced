const uploadStatus = document.querySelector("#installer-upload-status");
const refreshUploadsButton = document.querySelector("#refresh-uploads");
const filterForm = document.querySelector("#installer-upload-filters");
const installerUploadFilter = document.querySelector("#installer-upload-installer-filter");
const uploadCounts = document.querySelector("#installer-upload-counts");
const uploadList = document.querySelector("#installer-upload-list");
const installerForm = document.querySelector("#installer-form");
const newInstallerButton = document.querySelector("#new-installer");
const installerDirectoryList = document.querySelector("#installer-directory-list");
const photoModal = document.querySelector("#installer-photo-modal");
const photoModalClose = document.querySelector("#installer-photo-close");
const photoModalTitle = document.querySelector("#installer-photo-title");
const photoModalCount = document.querySelector("#installer-photo-count");
const photoModalImage = document.querySelector("#installer-photo-image");
const photoModalCaption = document.querySelector("#installer-photo-caption");
const photoModalPrev = document.querySelector("#installer-photo-prev");
const photoModalNext = document.querySelector("#installer-photo-next");

let uploadFilterTimer = null;
let installerRows = [];
let renderedUploads = [];
let activePhotoUpload = null;
let activePhotoIndex = 0;
let canManageInstallers = false;
let uploadPermissions = { canManageAll: false, manageDepartments: [] };
const selectedAssignments = new Map();
const customerResultsByUpload = new Map();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, type = "") {
  uploadStatus.textContent = message;
  uploadStatus.className = `document-inbox-status${type ? ` ${type}` : ""}`.trim();
  uploadStatus.classList.toggle("hidden", !message);
}

function departmentLabel(value) {
  if (value === "cabinet") return "Cabinet";
  if (value === "floor") return "Floor";
  if (value === "both") return "Both";
  return value || "Unknown";
}

function statusLabel(value) {
  if (value === "assigned") return "Assigned";
  if (value === "archived") return "Archived";
  if (value === "deleted") return "Deleted";
  return "Inbox";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function uploadQueryString() {
  const params = new URLSearchParams(new FormData(filterForm));
  return params.toString();
}

function renderCounts(counts = {}) {
  uploadCounts.innerHTML = `
    <span><strong>${counts.inbox || 0}</strong> Inbox</span>
    <span><strong>${counts.assigned || 0}</strong> Assigned</span>
    <span><strong>${counts.archived || 0}</strong> Archived</span>
    <span><strong>${counts.deleted || 0}</strong> Deleted</span>
    <span><strong>${counts.all || 0}</strong> Total</span>
  `;
}

function fileThumbs(upload) {
  const files = upload.files || [];
  if (!files.length) return '<p class="muted-text">No photo files listed.</p>';
  return files.slice(0, 9).map((file, index) => `
    <button class="installer-photo-thumb" type="button" data-photo-view="1" data-upload-id="${escapeHtml(upload.uploadId)}" data-photo-index="${index}" title="${escapeHtml(file.originalName || file.storedName)}">
      <img src="${escapeHtml(file.photoUrl)}" alt="Installer upload ${index + 1}" loading="lazy" />
    </button>
  `).join("");
}

function uploadMeta(upload) {
  const assignment = upload.assignment;
  const assignedText = assignment
    ? [assignment.customerName, assignment.contractNumber || assignment.invoiceNumber, assignment.installAddress].filter(Boolean).join(" | ")
    : "";
  return `
    <div class="installer-upload-meta">
      <span><strong>Store</strong> ${escapeHtml(departmentLabel(upload.storeDepartment))}</span>
      <span><strong>Status</strong> ${escapeHtml(statusLabel(upload.status))}</span>
      <span><strong>Photos</strong> ${escapeHtml(upload.photoCount)}</span>
      <span><strong>Uploaded</strong> ${escapeHtml(upload.uploadedAtDisplay || formatDate(upload.uploadedAt))}</span>
      ${assignedText ? `<span class="installer-assigned-line"><strong>Assigned</strong> ${escapeHtml(assignedText)}</span>` : ""}
    </div>
  `;
}

function assignmentForm(upload) {
  if (!upload.canManage) {
    return '<p class="installer-permission-note">View only. Assignment and cleanup require manager access for this store.</p>';
  }

  const selected = selectedAssignments.get(upload.uploadId) || {};
  const manualName = selected.customerName || "";
  const manualAddress = selected.installAddress || (upload.jobAddress === "Not entered" ? "" : upload.jobAddress);
  const archiveChecked = upload.status === "archived" || upload.status === "deleted" ? "" : "checked";
  const storeDepartment = upload.storeDepartment === "floor" ? "floor" : upload.storeDepartment === "cabinet" ? "cabinet" : "unknown";

  return `
    <form class="installer-assign-form" data-upload-id="${escapeHtml(upload.uploadId)}">
      <div class="installer-assignment-grid">
        <label>
          Store
          <select name="storeDepartment">
            <option value="unknown"${storeDepartment === "unknown" ? " selected" : ""}>Unknown</option>
            <option value="cabinet"${storeDepartment === "cabinet" ? " selected" : ""}>Cabinet</option>
            <option value="floor"${storeDepartment === "floor" ? " selected" : ""}>Floor</option>
          </select>
        </label>
        <label class="installer-store-save-field">
          Store action
          <button class="secondary-action" type="button" data-action="update-store" data-upload-id="${escapeHtml(upload.uploadId)}">Save Store</button>
        </label>
      </div>
      <div class="installer-customer-search">
        <label>
          Find customer/job
          <input name="customerSearch" autocomplete="off" placeholder="Search customer, address, invoice, phone" />
        </label>
        <button type="button" data-action="search-customer" data-upload-id="${escapeHtml(upload.uploadId)}">Search</button>
      </div>
      <div class="installer-customer-results" data-customer-results="${escapeHtml(upload.uploadId)}"></div>
      <div class="installer-assignment-grid">
        <label>
          Customer/job
          <input name="customerName" value="${escapeHtml(manualName)}" placeholder="Customer or job name" />
        </label>
        <label>
          Job address
          <input name="installAddress" value="${escapeHtml(manualAddress)}" placeholder="Job address" />
        </label>
      </div>
      <label class="toggle installer-archive-toggle">
        <input name="archiveAfterAssign" type="checkbox" ${archiveChecked} />
        Archive after assigning
      </label>
      <div class="installer-upload-actions">
        <button type="submit">Assign</button>
        ${upload.status !== "archived" ? `<button class="secondary-action" type="button" data-action="archive" data-upload-id="${escapeHtml(upload.uploadId)}">Archive</button>` : ""}
        ${upload.status === "deleted"
          ? `<button class="secondary-action" type="button" data-action="restore" data-upload-id="${escapeHtml(upload.uploadId)}">Restore</button>`
          : `<button class="danger-action" type="button" data-action="delete" data-upload-id="${escapeHtml(upload.uploadId)}">Delete</button>`}
        ${upload.canHardDelete ? `<button class="danger-action" type="button" data-action="hard-delete" data-upload-id="${escapeHtml(upload.uploadId)}">Hard delete</button>` : ""}
      </div>
    </form>
  `;
}

function renderUploads(uploads = []) {
  renderedUploads = uploads;
  if (!uploads.length) {
    uploadList.innerHTML = '<section class="panel"><p class="muted-text">No installer uploads match this view.</p></section>';
    return;
  }

  uploadList.innerHTML = uploads.map((upload) => `
    <article class="installer-upload-card" data-upload-id="${escapeHtml(upload.uploadId)}">
      <div class="installer-upload-card-head">
        <div>
          <h2>${escapeHtml(upload.installerName || "Installer")}</h2>
          <p>${escapeHtml(upload.jobAddress || "No job address")}</p>
        </div>
        <span class="installer-status-pill ${escapeHtml(upload.status)}">${escapeHtml(statusLabel(upload.status))}</span>
      </div>
      ${uploadMeta(upload)}
      <div class="installer-photo-grid">${fileThumbs(upload)}</div>
      ${assignmentForm(upload)}
    </article>
  `).join("");
}

function updatePhotoModal() {
  const files = activePhotoUpload?.files || [];
  const file = files[activePhotoIndex];
  if (!file) return;
  const uploadTitle = activePhotoUpload.installerName || "Installer";
  const jobTitle = activePhotoUpload.jobAddress && activePhotoUpload.jobAddress !== "Not entered"
    ? activePhotoUpload.jobAddress
    : "No job address";
  photoModalTitle.textContent = `${uploadTitle} / ${jobTitle}`;
  photoModalCount.textContent = `${activePhotoIndex + 1} of ${files.length}`;
  photoModalImage.src = file.photoUrl;
  photoModalImage.alt = file.originalName || file.storedName || `Installer photo ${activePhotoIndex + 1}`;
  photoModalCaption.textContent = [file.originalName || file.storedName, activePhotoUpload.uploadedAtDisplay || formatDate(activePhotoUpload.uploadedAt)]
    .filter(Boolean)
    .join(" | ");
  photoModalPrev.disabled = activePhotoIndex <= 0;
  photoModalNext.disabled = activePhotoIndex >= files.length - 1;
}

function openPhotoModal(uploadId, index) {
  const upload = renderedUploads.find((item) => item.uploadId === uploadId);
  if (!upload?.files?.length) return;
  activePhotoUpload = upload;
  activePhotoIndex = Math.max(0, Math.min(upload.files.length - 1, Number(index) || 0));
  updatePhotoModal();
  photoModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  photoModalClose.focus();
}

function closePhotoModal() {
  photoModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  photoModalImage.removeAttribute("src");
  activePhotoUpload = null;
  activePhotoIndex = 0;
}

function movePhotoModal(delta) {
  if (!activePhotoUpload) return;
  const files = activePhotoUpload.files || [];
  activePhotoIndex = Math.max(0, Math.min(files.length - 1, activePhotoIndex + delta));
  updatePhotoModal();
}

async function loadUploads() {
  setStatus("Loading installer uploads...");
  const data = await apiJson(`/api/installer-uploads?${uploadQueryString()}`);
  uploadPermissions = data.permissions || uploadPermissions;
  renderInstallerFilter(data.uploads || []);
  renderCounts(data.counts || {});
  renderUploads(data.uploads || []);
  const managed = uploadPermissions.manageDepartments?.length
    ? `Manager access: ${uploadPermissions.manageDepartments.map(departmentLabel).join(", ")}.`
    : "View-only access.";
  setStatus(`${data.count || 0} upload${data.count === 1 ? "" : "s"} shown. ${managed}`);
}

function installerRowHtml(installer) {
  return `
    <button class="installer-directory-row" type="button" data-installer-id="${escapeHtml(installer.id)}">
      <strong>${escapeHtml(installer.name)}</strong>
      <span>${escapeHtml(departmentLabel(installer.storeDepartment))}${installer.active ? "" : " | inactive"}</span>
    </button>
  `;
}

function renderInstallers() {
  if (!installerRows.length) {
    installerDirectoryList.innerHTML = '<p class="muted-text">No installers saved yet.</p>';
    return;
  }
  installerDirectoryList.innerHTML = installerRows.map(installerRowHtml).join("");
}

function renderInstallerFilter(extraUploads = []) {
  if (!installerUploadFilter) return;
  const current = installerUploadFilter.value || "all";
  const names = [...new Set([
    ...installerRows
      .filter((installer) => installer.active !== false)
      .map((installer) => installer.name)
      .filter(Boolean),
    ...extraUploads
      .map((upload) => upload.installerName === "Not entered" ? "" : upload.installerName)
      .filter(Boolean),
  ])]
    .sort((a, b) => a.localeCompare(b));
  installerUploadFilter.innerHTML = [
    '<option value="all">All installers</option>',
    ...names.map((name) => `<option value="${escapeHtml(name.toLowerCase())}">${escapeHtml(name)}</option>`),
  ].join("");
  installerUploadFilter.value = names.some((name) => name.toLowerCase() === current) ? current : "all";
}

function resetInstallerForm() {
  installerForm.reset();
  installerForm.elements.id.value = "";
  installerForm.elements.active.checked = true;
  installerForm.elements.storeDepartment.value = "both";
}

function fillInstallerForm(installer) {
  installerForm.elements.id.value = installer.id || "";
  installerForm.elements.name.value = installer.name || "";
  installerForm.elements.storeDepartment.value = installer.storeDepartment || "both";
  installerForm.elements.phone.value = installer.phone || "";
  installerForm.elements.email.value = installer.email || "";
  installerForm.elements.notes.value = installer.notes || "";
  installerForm.elements.active.checked = installer.active !== false;
}

async function loadInstallers() {
  const data = await apiJson("/api/installers?includeInactive=1");
  installerRows = data.installers || [];
  canManageInstallers = Boolean(data.canManage);
  installerForm.classList.toggle("hidden", !canManageInstallers);
  newInstallerButton.classList.toggle("hidden", !canManageInstallers);
  renderInstallerFilter();
  renderInstallers();
}

function assignmentFromCustomer(customer, contract = {}) {
  return {
    customerKey: customer.key || "",
    customerName: customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" "),
    customerPhone: customer.phone1 || customer.phone2 || "",
    customerEmail: customer.email || "",
    packetId: contract.id || "",
    contractNumber: contract.contractNumber || "",
    invoiceNumber: contract.invoiceNumber || "",
    installAddress: contract.installAddress || customer.mailingAddress || customer.billingAddress || "",
  };
}

function renderCustomerResults(uploadId, customers = []) {
  const container = uploadList.querySelector(`[data-customer-results="${CSS.escape(uploadId)}"]`);
  if (!container) return;

  const candidates = [];
  customers.forEach((customer) => {
    const contracts = Array.isArray(customer.contracts) && customer.contracts.length ? customer.contracts : [{}];
    contracts.slice(0, 4).forEach((contract) => candidates.push(assignmentFromCustomer(customer, contract)));
  });
  customerResultsByUpload.set(uploadId, candidates);

  if (!candidates.length) {
    container.innerHTML = '<p class="muted-text">No matching customer or job found.</p>';
    return;
  }

  container.innerHTML = candidates.slice(0, 8).map((candidate, index) => `
    <button type="button" data-action="select-customer" data-upload-id="${escapeHtml(uploadId)}" data-result-index="${index}">
      <strong>${escapeHtml(candidate.customerName || "Customer")}</strong>
      <span>${escapeHtml([candidate.contractNumber || candidate.invoiceNumber, candidate.installAddress, candidate.customerPhone].filter(Boolean).join(" | "))}</span>
    </button>
  `).join("");
}

async function searchCustomer(uploadId) {
  const form = uploadList.querySelector(`.installer-assign-form[data-upload-id="${CSS.escape(uploadId)}"]`);
  const query = form?.elements.customerSearch?.value.trim();
  if (!form || !query) return;
  const data = await apiJson(`/api/customers/search?q=${encodeURIComponent(query)}`);
  renderCustomerResults(uploadId, data.customers || []);
}

function selectCustomer(uploadId, index) {
  const candidate = customerResultsByUpload.get(uploadId)?.[Number(index)];
  if (!candidate) return;
  selectedAssignments.set(uploadId, candidate);
  const form = uploadList.querySelector(`.installer-assign-form[data-upload-id="${CSS.escape(uploadId)}"]`);
  if (!form) return;
  form.elements.customerName.value = candidate.customerName || "";
  form.elements.installAddress.value = candidate.installAddress || "";
  const container = uploadList.querySelector(`[data-customer-results="${CSS.escape(uploadId)}"]`);
  if (container) {
    container.innerHTML = `<p class="installer-selected-customer">Selected: ${escapeHtml([candidate.customerName, candidate.contractNumber || candidate.invoiceNumber, candidate.installAddress].filter(Boolean).join(" | "))}</p>`;
  }
}

async function assignUpload(form) {
  const uploadId = form.dataset.uploadId;
  const selected = selectedAssignments.get(uploadId) || {};
  const payload = {
    ...selected,
    customerName: form.elements.customerName.value.trim() || selected.customerName || "",
    installAddress: form.elements.installAddress.value.trim() || selected.installAddress || "",
    archiveAfterAssign: form.elements.archiveAfterAssign.checked,
    confirm: true,
  };
  const label = [payload.customerName, payload.contractNumber || payload.invoiceNumber, payload.installAddress].filter(Boolean).join(" | ");
  if (!label) {
    setStatus("Choose or enter a customer/job before assigning.", "error");
    return;
  }
  const archiveText = payload.archiveAfterAssign ? " and archive it" : "";
  if (!window.confirm(`Assign this upload to ${label}${archiveText}?`)) return;
  await apiJson(`/api/installer-uploads/${encodeURIComponent(uploadId)}/assign`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  selectedAssignments.delete(uploadId);
  await loadUploads();
}

async function postUploadAction(uploadId, action) {
  if (action === "delete" && !window.confirm("Delete this upload from the staff inbox? This is a soft delete so the audit record is kept.")) return;
  let payload = {};
  if (action === "hard-delete") {
    const typed = window.prompt("Hard delete permanently removes this upload folder and photos from the server. Type DELETE to confirm.");
    if (typed !== "DELETE") return;
    payload = { confirm: true, confirmText: "DELETE", reason: "Hard deleted from staff page." };
  }
  if (action === "archive" && !window.confirm("Archive this upload?")) return;
  if (action === "delete") payload = { confirm: true, reason: "Deleted from staff page." };
  await apiJson(`/api/installer-uploads/${encodeURIComponent(uploadId)}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await loadUploads();
}

async function updateUploadStore(uploadId) {
  const form = uploadList.querySelector(`.installer-assign-form[data-upload-id="${CSS.escape(uploadId)}"]`);
  if (!form) return;
  await apiJson(`/api/installer-uploads/${encodeURIComponent(uploadId)}/store`, {
    method: "POST",
    body: JSON.stringify({ storeDepartment: form.elements.storeDepartment.value }),
  });
  await loadUploads();
  setStatus("Store saved.");
}

filterForm.addEventListener("input", () => {
  window.clearTimeout(uploadFilterTimer);
  uploadFilterTimer = window.setTimeout(() => loadUploads().catch((error) => setStatus(error.message, "error")), 220);
});

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadUploads().catch((error) => setStatus(error.message, "error"));
});

refreshUploadsButton.addEventListener("click", () => {
  loadUploads().catch((error) => setStatus(error.message, "error"));
});

uploadList.addEventListener("click", (event) => {
  const photoButton = event.target.closest("[data-photo-view]");
  if (photoButton) {
    openPhotoModal(photoButton.dataset.uploadId, photoButton.dataset.photoIndex);
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const uploadId = button.dataset.uploadId;
  if (action === "search-customer") {
    searchCustomer(uploadId).catch((error) => setStatus(error.message, "error"));
    return;
  }
  if (action === "select-customer") {
    selectCustomer(uploadId, button.dataset.resultIndex);
    return;
  }
  if (action === "update-store") {
    updateUploadStore(uploadId).catch((error) => setStatus(error.message, "error"));
    return;
  }
  postUploadAction(uploadId, action).catch((error) => setStatus(error.message, "error"));
});

photoModalClose.addEventListener("click", closePhotoModal);
photoModalPrev.addEventListener("click", () => movePhotoModal(-1));
photoModalNext.addEventListener("click", () => movePhotoModal(1));
photoModal.addEventListener("click", (event) => {
  if (event.target === photoModal) closePhotoModal();
});
document.addEventListener("keydown", (event) => {
  if (photoModal.classList.contains("hidden")) return;
  if (event.key === "Escape") closePhotoModal();
  if (event.key === "ArrowLeft") movePhotoModal(-1);
  if (event.key === "ArrowRight") movePhotoModal(1);
});

uploadList.addEventListener("submit", (event) => {
  const form = event.target.closest(".installer-assign-form");
  if (!form) return;
  event.preventDefault();
  assignUpload(form).catch((error) => setStatus(error.message, "error"));
});

installerDirectoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-installer-id]");
  if (!button) return;
  const installer = installerRows.find((item) => item.id === button.dataset.installerId);
  if (installer) fillInstallerForm(installer);
});

newInstallerButton.addEventListener("click", resetInstallerForm);

installerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canManageInstallers) return;
  const formData = new FormData(installerForm);
  const payload = Object.fromEntries(formData.entries());
  payload.active = installerForm.elements.active.checked;
  const id = payload.id;
  const url = id ? `/api/installers/${encodeURIComponent(id)}` : "/api/installers";
  const method = id ? "PUT" : "POST";
  await apiJson(url, {
    method,
    body: JSON.stringify(payload),
  });
  resetInstallerForm();
  await loadInstallers();
  setStatus("Installer table saved.");
});

Promise.all([
  loadInstallers(),
  loadUploads(),
]).catch((error) => setStatus(error.message, "error"));
