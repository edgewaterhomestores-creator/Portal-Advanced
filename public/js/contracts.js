const searchForm = document.querySelector("#contract-search-form");
const searchStatus = document.querySelector("#contract-search-status");
const resultsEl = document.querySelector("#contract-results");
const searchInput = searchForm.elements.q;

let searchTimer = null;
let activeSearchId = 0;
let printChoiceModal = null;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "Not listed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const dateText = `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
  const timeText = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateText}, ${timeText}`;
}

function singleLineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function amountText(value) {
  const raw = singleLineText(value);
  if (!raw) return "";
  return raw.startsWith("$") ? raw : `$${raw}`;
}

function resultCellHtml(value, className, { strong = false } = {}) {
  const text = singleLineText(value);
  const content = strong ? `<strong>${escapeHtml(text)}</strong>` : escapeHtml(text);
  return `<span class="result-cell ${className}" title="${escapeHtml(text)}">${content}</span>`;
}

function statusLabel(value) {
  if (value === "draft") return "Autosaved draft";
  if (value === "completed") return "Completed";
  if (value === "signed") return "Signed";
  if (value === "accepted") return "Accepted";
  return "Signable";
}

function passwordDisplayHtml(password) {
  if (!password) return "<p>Password: Not available</p>";
  return `
    <p class="password-display">
      <strong>Password:</strong>
      <span data-password-mask data-password-value="${escapeHtml(password)}">********</span>
      <button type="button" class="inline-password-toggle" data-toggle-password>Show</button>
    </p>
  `;
}

function toggleMaskedPassword(button) {
  const value = button.parentElement?.querySelector("[data-password-mask]");
  if (!value) return;
  const hidden = button.textContent === "Show";
  value.textContent = hidden ? value.dataset.passwordValue || "" : "********";
  button.textContent = hidden ? "Hide" : "Show";
}

function contractLabel(record) {
  if (record.draft) return escapeHtml(record.contractNumber || "Unsaved draft");
  const revision = Number(record.revisionNumber || 0);
  const baseContract = record.revisionBaseContractNumber || String(record.contractNumber || record.id).replace(/-E\d+$/i, "");
  if (!revision) return `${escapeHtml(baseContract || record.contractNumber || record.id)} <span class="muted-text">Original</span>`;
  return `${escapeHtml(baseContract || record.contractNumber || record.id)} <span class="muted-text">Edit ${revision}</span>`;
}

function fileName(record) {
  const firstName = String(record.customerFirstName || "").trim();
  const lastName = String(record.customerLastName || "").trim();
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return record.customerFileName || record.customerName || "Customer";
}

function filingLetter(record) {
  const letter = fileName(record).trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : "#";
}

function sortByFilingName(a, b) {
  return fileName(a).localeCompare(fileName(b), undefined, { sensitivity: "base" })
    || String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function estimateLabel(record) {
  const estimate = record.estimate || {};
  return estimate.estimateNumber || estimate.fileName || (estimate.available ? "Estimate attached" : "");
}

function duplicateWarningHtml(record) {
  const duplicate = record.possibleDuplicate;
  if (!duplicate?.count || duplicate.count < 2) return "";
  const others = duplicate.count - 1;
  return `
    <p class="duplicate-warning">
      <span><strong>Possible duplicate:</strong> Same customer/invoice as ${others} other record${others === 1 ? "" : "s"}.</span>
      <em>Compare customer, address, and estimate before sending.</em>
    </p>
  `;
}

function recordMenuHtml(record, locked) {
  if (record.draft) {
    return `
      <nav class="record-menu" aria-label="Draft actions for ${escapeHtml(fileName(record))}">
        <a href="${escapeHtml(record.resumeUrl || "/contract/new?restoreDraft=1")}">Resume draft</a>
        ${record.estimate?.viewUrl ? `<a href="${escapeHtml(record.estimate.viewUrl)}" target="_blank" rel="noreferrer">View estimate</a>` : ""}
      </nav>
    `;
  }

  return `
    <nav class="record-menu" aria-label="Record actions for ${escapeHtml(fileName(record))}">
      <button type="button" data-view-contract="${escapeHtml(record.id)}">Show details</button>
      ${record.finalPdfUrl ? `<a href="${escapeHtml(record.finalPdfUrl)}" target="_blank" rel="noreferrer">Open signed PDF</a>` : ""}
      ${record.signUrl ? `<a href="${escapeHtml(record.signUrl)}" target="_blank" rel="noreferrer">Open signing</a>` : ""}
      ${record.estimate?.viewUrl ? `<a href="${escapeHtml(record.estimate.viewUrl)}" target="_blank" rel="noreferrer">View estimate</a>` : ""}
      ${record.signUrl ? `<button type="button" data-email-signing-link="${escapeHtml(record.id)}">Email link</button>` : ""}
      ${record.finalPdfUrl ? `<button type="button" data-email-final-pdf="${escapeHtml(record.id)}">Email signed PDF</button>` : ""}
      <button type="button" data-print-contract="${escapeHtml(record.finalPdfUrl || record.signablePdfUrl)}">${record.finalPdfUrl ? "Print signed PDF" : "Print PDF"}</button>
      ${record.signablePdfUrl ? `<a href="${escapeHtml(record.signablePdfUrl)}" target="_blank" rel="noreferrer">${record.finalPdfUrl ? "Original signable PDF" : "Signable PDF"}</a>` : ""}
      ${locked
        ? `<a href="/contract/${encodeURIComponent(record.id)}/edit?revision=1">Create edit</a>`
        : `<a href="/contract/${encodeURIComponent(record.id)}/edit">Edit draft</a>`}
    </nav>
  `;
}

function resultLineHtml(record) {
  return [
    resultCellHtml(fileName(record), "result-name", { strong: true }),
    resultCellHtml(record.installAddress, "result-address"),
    resultCellHtml(record.customerEmail, "result-email"),
    resultCellHtml(record.customerPhone, "result-phone"),
    resultCellHtml(estimateLabel(record) || record.invoiceNumber, "result-doc"),
    resultCellHtml(record.estimate?.estimateDate, "result-date"),
    resultCellHtml(amountText(record.invoiceAmount), "result-total"),
  ].join("");
}

function resultHtml(record) {
  const locked = Boolean(record.locked);

  return `
    <article class="contract-card contract-record${record.draft ? " contract-draft-record" : ""}" data-contract-card="${escapeHtml(record.id)}">
      <div class="contract-record-layout">
        <div class="contract-record-main">
          <div class="contract-record-heading">
            <p class="contract-record-line search-result-grid">${resultLineHtml(record)}</p>
            <span class="record-status${record.draft ? " draft-status" : ""}">${statusLabel(record.status)}</span>
          </div>
          ${record.draft ? '<p class="notice">This is an autosaved draft, not a generated packet yet.</p>' : duplicateWarningHtml(record)}
          ${record.lockReason ? `<p class="notice">${escapeHtml(record.lockReason)}</p>` : ""}
          <div class="contract-detail hidden" data-contract-detail="${escapeHtml(record.id)}"></div>
        </div>
        ${recordMenuHtml(record, locked)}
      </div>
    </article>
  `;
}

function alphabeticalResultsHtml(records) {
  const groups = new Map();
  [...records].sort(sortByFilingName).forEach((record) => {
    const letter = filingLetter(record);
    groups.set(letter, [...(groups.get(letter) || []), record]);
  });

  return `
    <div class="alpha-file-list">
      ${[...groups.entries()].map(([letter, items]) => `
        <details class="alpha-group">
          <summary>
            <span class="alpha-letter">${escapeHtml(letter)}</span>
            <span class="alpha-count">${items.length} record${items.length === 1 ? "" : "s"}</span>
          </summary>
          <div class="alpha-group-records">
            ${items.map(resultHtml).join("")}
          </div>
        </details>
      `).join("")}
    </div>
  `;
}

function hiddenRecordText(data = {}) {
  const parts = [];
  if (data.hiddenRevisionRecords) {
    parts.push(`${data.hiddenRevisionRecords} older edit record${data.hiddenRevisionRecords === 1 ? "" : "s"}`);
  }
  if (data.hiddenDraftRecords) {
    parts.push(`${data.hiddenDraftRecords} autosave draft row${data.hiddenDraftRecords === 1 ? "" : "s"}`);
  }
  return parts.length ? ` ${parts.join(" and ")} hidden.` : "";
}

function detailListHtml(title, items) {
  if (!items?.length) return "";
  return `
    <div class="detail-block">
      <strong>${escapeHtml(title)}</strong>
      ${items.map((item) => `<p>${escapeHtml(item.label || item.id)}: ${escapeHtml(item.status || "Included")}</p>`).join("")}
    </div>
  `;
}

function consentLabel(value) {
  return value ? "Yes" : "No";
}

function communicationConsentHtml(consent) {
  if (!consent) return "<p>Communication permissions were not captured on this signature.</p>";
  return `
    <div class="status-list">
      <span>Account/contract email: accepted as part of signing</span>
      <span>Marketing email: ${consentLabel(consent.marketingEmailConsent)}</span>
      <span>Account/order text: ${consentLabel(consent.accountTextConsent)}</span>
      <span>Marketing text: ${consentLabel(consent.marketingTextConsent)}</span>
      <span>Social media tag: ${consentLabel(consent.socialMediaTagConsent)}${consent.socialMediaProfile ? ` (${escapeHtml(consent.socialMediaProfile)})` : ""}</span>
    </div>
  `;
}

function signatureHtml(signatures) {
  if (!signatures?.length) return "<p>No customer signature has been captured yet.</p>";
  return signatures.map((signature) => `
    <div class="signature-audit-item">
      <div class="history-row">
        <span>${formatDate(signature.signedAt)}</span>
        <span>${escapeHtml(signature.printedName || "Signed customer")}</span>
        <span>IP: ${escapeHtml(signature.ip || "Not captured")}</span>
        <span>Digital signing: ${signature.digitalSignatureAccepted ? "Accepted" : "Not captured"}</span>
      </div>
      ${communicationConsentHtml(signature.communicationConsent)}
    </div>
  `).join("");
}

function historyHtml(history, currentId) {
  if (!history?.length) return "<p>No edit history yet.</p>";
  return history.map((item) => `
    <div class="history-row">
      <span>${contractLabel(item)}</span>
      <span>${statusLabel(item.status)}</span>
      <span>${formatDate(item.createdAt)}</span>
      ${item.id === currentId ? "<strong>Current</strong>" : `<a href="/contract/${encodeURIComponent(item.id)}/edit">Open</a>`}
    </div>
  `).join("");
}

function versionsHtml(record) {
  const versions = record.versions || [];
  if (!versions.length) return "<p>No saved draft versions yet.</p>";
  return `
    ${versions.map((version, index) => `
      <div class="history-row">
        <span>${escapeHtml(version.label || `Version ${index + 1}`)}</span>
        <span>${escapeHtml(version.by?.name || version.by?.username || "Unknown")}</span>
        <span>${formatDate(version.savedAt)}</span>
      </div>
    `).join("")}
    <p class="muted-text">Open the draft edit screen to load an older saved version back into the form.</p>
  `;
}

function compactAddress(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function detailLineHtml(label, value, fallback = "Not listed") {
  return `<p><span class="detail-label">${escapeHtml(label)}:</span> ${escapeHtml(value || fallback)}</p>`;
}

function signedContractCopyHtml(record) {
  if (!record.finalPdfUrl) return "";
  return `
    <div class="detail-block signed-copy-block">
      <strong>Signed Contract Copy</strong>
      <p>Customer signed this contract${record.finalizedAt ? ` on ${escapeHtml(formatDate(record.finalizedAt))}` : ""}.</p>
      <div class="result-actions">
        <a href="${escapeHtml(record.finalPdfUrl)}" target="_blank" rel="noreferrer">Open signed PDF</a>
        <button type="button" data-email-final-pdf="${escapeHtml(record.id)}">Email signed PDF</button>
        <button type="button" data-print-contract="${escapeHtml(record.finalPdfUrl)}">Print signed PDF</button>
      </div>
    </div>
  `;
}

function detailHtml(record) {
  const data = record.data || {};
  const mailingAddress = data.customer?.mailingAddress || "";
  const billingAddress = data.customer?.billingAddress || "";
  const billingDisplay = billingAddress && compactAddress(billingAddress) === compactAddress(mailingAddress)
    ? "Same as mailing"
    : billingAddress;
  return `
    <div class="detail-grid">
      <div class="detail-block">
        <strong>Customer</strong>
        <p>${escapeHtml(record.customerName || "Customer")}</p>
        ${detailLineHtml("Mailing", mailingAddress)}
        ${detailLineHtml("Billing", billingDisplay)}
      </div>
      <div class="detail-block">
        <strong>Job</strong>
        ${detailLineHtml("Job address", data.order?.installAddress)}
        ${detailLineHtml("Sales rep", data.order?.salesRep)}
        ${detailLineHtml("Installer", data.order?.installerName)}
      </div>
      <div class="detail-block">
        <strong>Estimate</strong>
        <p>${escapeHtml(record.estimate?.fileName || data.estimate?.fileName || "No file attached/listed")}</p>
        <p>${escapeHtml(record.estimate?.sourcePath || record.estimate?.sourceUrl || data.estimate?.sourcePath || data.estimate?.sourceUrl || "No source listed")}</p>
        ${record.estimate?.viewUrl ? `<p><a href="${escapeHtml(record.estimate.viewUrl)}" target="_blank" rel="noreferrer">View estimate</a></p>` : ""}
      </div>
      <div class="detail-block">
        <strong>Signing</strong>
        ${passwordDisplayHtml(record.password)}
        <p>Owner: ${escapeHtml(record.owner?.name || record.owner?.username || "Unassigned")}</p>
        <p>Created by: ${escapeHtml(record.createdBy?.name || record.createdBy?.username || "Unknown")}</p>
        <p>${record.locked ? "Locked: signed/accepted records require an edit." : "Editable draft."}</p>
      </div>
    </div>
    ${signedContractCopyHtml(record)}
    ${detailListHtml("Included Sections", record.sections || [])}
    <div class="detail-block">
      <strong>Signature Audit</strong>
      ${signatureHtml(record.signatures || [])}
    </div>
    <div class="detail-block">
      <strong>Saved Draft Versions</strong>
      ${versionsHtml(record)}
    </div>
    <div class="detail-block">
      <strong>Edit History</strong>
      ${historyHtml(record.history || [], record.id)}
    </div>
  `;
}

function renderResults(data, query = "") {
  const isSearching = Boolean(query);

  if (!data.totalRecords) {
    searchStatus.textContent = "No records yet.";
    resultsEl.innerHTML = `
      <section class="result">
        <p><strong>No customer or contract records exist yet.</strong></p>
        <div class="result-actions">
          <a href="/contract/new">Create first contract</a>
        </div>
      </section>
    `;
    return;
  }

  if (!data.count) {
    searchStatus.textContent = isSearching ? "No matching records found." : "No records to file yet.";
    resultsEl.innerHTML = "";
    return;
  }

  if (isSearching) {
    const sortedResults = [...data.results].sort(sortByFilingName);
    const hidden = hiddenRecordText(data);
    searchStatus.textContent = `${data.count} matching record${data.count === 1 ? "" : "s"}.${hidden}`;
    resultsEl.innerHTML = sortedResults.map(resultHtml).join("");
    return;
  }

  const hidden = hiddenRecordText(data);
  searchStatus.textContent = `${data.count} record${data.count === 1 ? "" : "s"} filed by last name.${hidden}`;
  resultsEl.innerHTML = alphabeticalResultsHtml(data.results);
}

async function runSearch(query = "") {
  const searchId = ++activeSearchId;
  const response = await fetch(`/api/packets/search?q=${encodeURIComponent(query)}`);
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const data = await readJsonResponse(response);
  if (searchId === activeSearchId) {
    renderResults(data, query);
  }
}

async function showContractDetail(id) {
  const escapedId = cssEscape(id);
  const detailEl = document.querySelector(`[data-contract-detail="${escapedId}"]`);
  const button = document.querySelector(`[data-view-contract="${escapedId}"]`);
  if (!detailEl || !button) return;

  if (!detailEl.classList.contains("hidden")) {
    detailEl.classList.add("hidden");
    button.textContent = "Show details";
    return;
  }

  button.disabled = true;
  button.textContent = "Loading...";
  try {
    const response = await fetch(`/api/packets/${encodeURIComponent(id)}/admin`);
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Could not load details.");
    detailEl.innerHTML = detailHtml(data);
    detailEl.classList.remove("hidden");
    button.textContent = "Hide details";
  } catch (error) {
    detailEl.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    detailEl.classList.remove("hidden");
    button.textContent = "Show details";
  } finally {
    button.disabled = false;
  }
}

async function sendContractEmail(id, kind, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const path = kind === "final" ? "admin-email-final" : "email-link";
    const response = await fetch(`/api/packets/${encodeURIComponent(id)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data.sent) {
      throw new Error(data.reason || data.error || "Email was not sent.");
    }
    button.textContent = "Email sent";
  } catch (error) {
    button.textContent = "Email failed";
    const card = button.closest("[data-contract-card]");
    const detail = card?.querySelector(".contract-detail");
    if (detail) {
      detail.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      detail.classList.remove("hidden");
    }
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = label;
    }, 1600);
  }
}

function openPrintPdf(url) {
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (_error) {
      // Browser PDF viewers can block scripted print; the PDF is still opened.
    }
  }, 900);
}

function ensurePrintChoiceModal() {
  if (printChoiceModal) return printChoiceModal;

  printChoiceModal = document.createElement("div");
  printChoiceModal.className = "record-action-modal hidden";
  printChoiceModal.setAttribute("role", "dialog");
  printChoiceModal.setAttribute("aria-modal", "true");
  printChoiceModal.innerHTML = `
    <section class="record-action-card">
      <div class="section-head">
        <div>
          <h2>Print Or Save PDF</h2>
          <p>Choose how to handle this contract PDF.</p>
        </div>
        <button type="button" class="ghost" data-close-record-action>Close</button>
      </div>
      <div class="record-action-grid">
        <a class="button-link" data-save-pdf href="#" target="_blank" rel="noreferrer">Save PDF</a>
        <button type="button" class="primary" data-open-print-pdf>Open PDF / Print</button>
      </div>
    </section>
  `;
  document.body.append(printChoiceModal);

  printChoiceModal.addEventListener("click", (event) => {
    if (event.target === printChoiceModal || event.target.closest("[data-close-record-action]")) {
      printChoiceModal.classList.add("hidden");
      return;
    }

    const printButton = event.target.closest("[data-open-print-pdf]");
    if (printButton) {
      const url = printChoiceModal.dataset.pdfUrl;
      printChoiceModal.classList.add("hidden");
      openPrintPdf(url);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") printChoiceModal.classList.add("hidden");
  });

  return printChoiceModal;
}

function showPrintChoice(url) {
  const modal = ensurePrintChoiceModal();
  modal.dataset.pdfUrl = url;
  const saveLink = modal.querySelector("[data-save-pdf]");
  saveLink.href = url;
  modal.classList.remove("hidden");
  modal.querySelector("[data-open-print-pdf]").focus();
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.clearTimeout(searchTimer);
  runSearch(searchInput.value.trim());
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim();
  window.clearTimeout(searchTimer);
  if (!query) {
    runSearch("");
    return;
  }

  searchStatus.textContent = "Searching...";
  searchTimer = window.setTimeout(() => {
    runSearch(query);
  }, 180);
});

resultsEl.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-view-contract]");
  if (detailButton) {
    showContractDetail(detailButton.getAttribute("data-view-contract"));
    return;
  }

  const signingEmailButton = event.target.closest("[data-email-signing-link]");
  if (signingEmailButton) {
    sendContractEmail(signingEmailButton.getAttribute("data-email-signing-link"), "signing", signingEmailButton);
    return;
  }

  const finalEmailButton = event.target.closest("[data-email-final-pdf]");
  if (finalEmailButton) {
    sendContractEmail(finalEmailButton.getAttribute("data-email-final-pdf"), "final", finalEmailButton);
    return;
  }

  const printButton = event.target.closest("[data-print-contract]");
  if (printButton) {
    showPrintChoice(printButton.getAttribute("data-print-contract"));
    return;
  }

  const passwordButton = event.target.closest("[data-toggle-password]");
  if (passwordButton) {
    toggleMaskedPassword(passwordButton);
  }
});

const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
searchInput.value = initialQuery;
runSearch(initialQuery.trim());
