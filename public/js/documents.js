const inboxStatus = document.querySelector("#document-inbox-status");
const inboxList = document.querySelector("#document-inbox-list");
const uploadForm = document.querySelector("#document-upload-form");
const scanButton = document.querySelector("#document-scan-button");
const refreshButton = document.querySelector("#document-refresh-button");
const documentInboxTitle = document.querySelector("#document-inbox-title");
const documentInboxSubtitle = document.querySelector("#document-inbox-subtitle");

function documentInboxMode() {
  return new URLSearchParams(window.location.search).get("type") || "";
}

function applyDocumentInboxMode() {
  if (documentInboxMode() !== "receiving") return;
  if (documentInboxTitle) documentInboxTitle.textContent = "Receiving Documents";
  if (documentInboxSubtitle) {
    documentInboxSubtitle.textContent = "Scan receiving reports, review OCR output, and stage material documents before attaching them to customer or receiving records.";
  }
  const uploadHeading = uploadForm?.querySelector("h2");
  const uploadText = uploadForm?.querySelector("p");
  if (uploadHeading) uploadHeading.textContent = "Upload / Scan Receiving Report";
  if (uploadText) uploadText.textContent = "Use this for handwritten receiving reports, supplier paperwork, or material documents saved outside email.";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setInboxStatus(kind, title, detail) {
  if (!inboxStatus) return;
  inboxStatus.className = `document-inbox-status status-${kind}`;
  inboxStatus.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(detail)}</span>
  `;
}

function documentDetail(document = {}) {
  return [
    document.emailFrom ? `From: ${document.emailFrom}` : "",
    document.emailSubject ? `Subject: ${document.emailSubject}` : "",
    document.suggestedCustomer ? `Customer: ${document.suggestedCustomer}` : "",
    document.suggestedInvoice ? `Document #: ${document.suggestedInvoice}` : "",
    document.suggestedDate ? `Date: ${document.suggestedDate}` : "",
    document.estimateSource ? `Source: ${document.estimateSource}` : "",
  ].filter(Boolean).join(" | ");
}

function documentStatusKind(document = {}) {
  const errors = Array.isArray(document.ocrErrors) ? document.ocrErrors : [];
  if (errors.length || document.ocrStatus === "error") return "error";
  if (document.ocrStatus === "complete") return "ready";
  return "review";
}

function renderDocuments(documents = []) {
  const rows = Array.isArray(documents) ? documents : [];
  if (!inboxList) return;
  if (!rows.length) {
    inboxList.innerHTML = '<p class="muted-text">No documents are waiting for review.</p>';
    return;
  }

  inboxList.innerHTML = rows.map((document) => {
    const kind = documentStatusKind(document);
    const canOcr = document.extension !== "zip";
    const detail = documentDetail(document) || "No suggested match yet.";
    const textPreview = document.ocrTextPreview
      ? `<details><summary>OCR text preview</summary><pre>${escapeHtml(document.ocrTextPreview)}</pre></details>`
      : "";
    const errors = Array.isArray(document.ocrErrors) && document.ocrErrors.length
      ? `<p class="preimport-ocr-errors">${escapeHtml(document.ocrErrors.join(" | "))}</p>`
      : "";
    return `
      <article class="document-inbox-row status-${kind}">
        <div>
          <strong>${escapeHtml(document.fileName || document.relativePath || "Document")}</strong>
          <span>${escapeHtml(document.documentType || "review")} | ${escapeHtml(document.ocrStatus || "not-run")}</span>
          <p>${escapeHtml(detail)}</p>
          ${textPreview}
          ${errors}
        </div>
        <div class="document-row-actions">
          <button class="ghost" type="button" data-ocr-document="${escapeHtml(document.id)}"${canOcr ? "" : " disabled"}>Run OCR</button>
          <button class="ghost" type="button" disabled>Attach Later</button>
        </div>
      </article>
    `;
  }).join("");

  inboxList.querySelectorAll("[data-ocr-document]").forEach((button) => {
    button.addEventListener("click", () => runOcr(button.getAttribute("data-ocr-document"), button));
  });
}

function renderStatusFromDocuments(documents = []) {
  const count = documents.length;
  const errorCount = documents.filter((document) => documentStatusKind(document) === "error").length;
  const completeCount = documents.filter((document) => document.ocrStatus === "complete").length;
  if (errorCount) {
    setInboxStatus("error", `${errorCount} document${errorCount === 1 ? "" : "s"} need attention`, "Check OCR errors or upload the document again.");
    return;
  }
  if (count) {
    setInboxStatus("review", `${count} document${count === 1 ? "" : "s"} waiting`, `${completeCount} OCR complete. Review before attaching.`);
    return;
  }
  setInboxStatus("clear", "No vendor documents waiting", "Email/scan queue is clear.");
}

async function loadDocumentInbox() {
  setInboxStatus("loading", "Checking document queue...", "Loading status.");
  const response = await fetch("/api/preimport");
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    setInboxStatus("error", "Could not load document queue", data.error || "Try again from the server.");
    return;
  }
  const documents = data.documents || [];
  renderStatusFromDocuments(documents);
  renderDocuments(documents);
}

async function uploadDocuments(event) {
  event.preventDefault();
  const files = [...(uploadForm.elements.documents.files || [])];
  if (!files.length) {
    setInboxStatus("error", "Choose a document first", "Upload a PDF or image to add it to review.");
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
    setInboxStatus("error", "Upload failed", data.error || "Could not upload documents.");
    return;
  }
  uploadForm.reset();
  await loadDocumentInbox();
}

async function scanDocuments() {
  scanButton.disabled = true;
  scanButton.textContent = "Checking...";
  try {
    const response = await fetch("/api/document-inbox/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      setInboxStatus("error", "Scan failed", data.error || "Could not check incoming documents.");
      return;
    }
    await loadDocumentInbox();
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = "Check Vendor Emails to Attach";
  }
}

async function runOcr(documentId, button) {
  if (!documentId) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Running...";
  try {
    const response = await fetch(`/api/preimport/documents/${encodeURIComponent(documentId)}/ocr`, { method: "POST" });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      setInboxStatus("error", "OCR failed", data.error || "Could not read this document.");
      return;
    }
    await loadDocumentInbox();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

uploadForm?.addEventListener("submit", uploadDocuments);
scanButton?.addEventListener("click", scanDocuments);
refreshButton?.addEventListener("click", loadDocumentInbox);

applyDocumentInboxMode();
loadDocumentInbox();
