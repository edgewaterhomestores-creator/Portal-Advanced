const welcomeHelpPanel = document.querySelector("#welcome-help-panel");
const staffNoticePanel = document.querySelector("#staff-notice-panel");
const skipSetupButton = document.querySelector("#skip-setup");
const startGuidedSetupLink = document.querySelector("#start-guided-setup");
const logoutButton = document.querySelector("#logout");
const dashboardSearchForms = [...document.querySelectorAll("[data-dashboard-search]")];
const dashboardSearchTimers = new Map();
const vendorEmailStatusCard = document.querySelector("#vendor-email-status-card");
const vendorEmailStatusText = document.querySelector("#vendor-email-status-text");
const vendorEmailStatusCount = document.querySelector("#vendor-email-status-count");
const dashboardScanVendorEmailsButton = document.querySelector("#dashboard-scan-vendor-emails");

const dashboardIconMap = {
  create: "/img/icons/add_contract.png",
  print: "/img/icons/print.png",
  estimate: "/img/icons/estimate.png",
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dashboardIconHtml(key, fallback) {
  const src = dashboardIconMap[key];
  return src
    ? `<img src="${src}" alt="" /><span class="dashboard-card-icon-fallback hidden">${escapeHtml(fallback)}</span>`
    : `<span class="dashboard-card-icon-fallback">${escapeHtml(fallback)}</span>`;
}

function hydrateDashboardIcons() {
  document.querySelectorAll("[data-dashboard-icon]").forEach((slot) => {
    slot.innerHTML = dashboardIconHtml(slot.dataset.dashboardIcon, slot.dataset.iconFallback || slot.textContent || "");
    const image = slot.querySelector("img");
    const fallback = slot.querySelector(".dashboard-card-icon-fallback");
    image?.addEventListener("error", () => {
      image.remove();
      fallback?.classList.remove("hidden");
    }, { once: true });
  });
}

function renderStaffNotifications() {
  const raw = sessionStorage.getItem("edgewaterStaffNotifications");
  if (!raw) return;

  let notices = [];
  try {
    notices = JSON.parse(raw);
  } catch (_error) {
    notices = [];
  }
  sessionStorage.removeItem("edgewaterStaffNotifications");

  if (!notices.length) return;

  staffNoticePanel.innerHTML = `
    <p><strong>Review needed</strong></p>
    ${notices.map((notice) => `
      <p>${escapeHtml(notice.message || "A contract was changed and needs review.")}</p>
      ${notice.packetId ? `<div class="result-actions"><a href="/contract/${encodeURIComponent(notice.packetId)}/edit">Open contract</a></div>` : ""}
    `).join("")}
  `;
  staffNoticePanel.classList.remove("hidden");
}

function searchText(record) {
  return [
    record.customerName,
    record.customer,
    record.customerPhone,
    record.customerAddress,
    record.installAddress,
    record.customerEmail,
    record.estimateNumber,
    record.contractNumber,
    record.invoiceNumber,
    record.pdfFilename,
    record.fileName,
  ].filter(Boolean).join(" ");
}

function renderDashboardResults(type, records, query) {
  const container = document.querySelector(`[data-dashboard-results="${type}"]`);
  if (!container) return;
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    container.innerHTML = "";
    return;
  }

  if (!records.length) {
    container.innerHTML = '<p class="muted-text">No matching records.</p>';
    return;
  }

  container.innerHTML = records.slice(0, 5).map((record) => {
    if (type === "contract") {
      const href = record.draft && record.resumeUrl
        ? record.resumeUrl
        : `/contract/${encodeURIComponent(record.id)}/edit`;
      return `
        <a class="dashboard-live-result" href="${href}">
          <strong>${escapeHtml(record.customerName || record.contractNumber || "Contract")}</strong>
          <span>${escapeHtml([record.contractNumber, record.installAddress, record.customerPhone].filter(Boolean).join(" | "))}</span>
        </a>
      `;
    }

    const estimateRef = record.estimateId || record.estimateNumber || "";
    const estimateHref = estimateRef
      ? `/estimates/new?estimateId=${encodeURIComponent(estimateRef)}`
      : `/estimates/new?q=${encodeURIComponent(cleanQuery)}`;
    return `
      <a class="dashboard-live-result" href="${estimateHref}">
        <strong>${escapeHtml(record.customer || record.estimateNumber || "Estimate")}</strong>
        <span>${escapeHtml([record.estimateNumber, record.customerAddress, record.customerPhone].filter(Boolean).join(" | "))}</span>
      </a>
    `;
  }).join("");
}

function documentStatusKind(document = {}) {
  const errors = Array.isArray(document.ocrErrors) ? document.ocrErrors : [];
  if (errors.length || document.ocrStatus === "error") return "error";
  if (document.ocrStatus === "complete") return "ready";
  return "review";
}

function setVendorEmailStatus(status, text, countText) {
  if (!vendorEmailStatusCard) return;
  vendorEmailStatusCard.className = `vendor-email-status-card status-${status}`;
  if (vendorEmailStatusText) vendorEmailStatusText.textContent = text;
  if (vendorEmailStatusCount) vendorEmailStatusCount.textContent = countText;
}

async function loadVendorEmailStatus() {
  if (!vendorEmailStatusCard) return;
  setVendorEmailStatus("loading", "Checking incoming document queue...", "--");
  const response = await fetch("/api/preimport");
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    setVendorEmailStatus("error", data.error || "Could not check vendor document queue.", "Error");
    return;
  }

  const documents = Array.isArray(data.documents) ? data.documents : [];
  const errorCount = documents.filter((document) => documentStatusKind(document) === "error").length;
  const readyCount = documents.filter((document) => document.ocrStatus === "complete").length;
  if (errorCount) {
    setVendorEmailStatus("error", `${errorCount} document${errorCount === 1 ? "" : "s"} need attention.`, `${errorCount} Error`);
    return;
  }
  if (documents.length) {
    setVendorEmailStatus("review", `${documents.length} document${documents.length === 1 ? "" : "s"} waiting to review or attach.`, `${documents.length} Waiting`);
    return;
  }
  setVendorEmailStatus("clear", "No vendor documents are waiting.", readyCount ? `${readyCount} Ready` : "Clear");
}

async function scanVendorEmailQueue() {
  if (!dashboardScanVendorEmailsButton) return;
  dashboardScanVendorEmailsButton.disabled = true;
  dashboardScanVendorEmailsButton.textContent = "Checking...";
  try {
    const response = await fetch("/api/document-inbox/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      setVendorEmailStatus("error", data.error || "Could not scan incoming documents.", "Error");
      return;
    }
    await loadVendorEmailStatus();
  } finally {
    dashboardScanVendorEmailsButton.disabled = false;
    dashboardScanVendorEmailsButton.textContent = "Check Now";
  }
}

async function runDashboardSearch(form) {
  const query = form.elements.q.value.trim();
  const type = form.dataset.dashboardSearch;
  if (!query) {
    renderDashboardResults(type, [], "");
    return;
  }

  if (type === "contract") {
    const response = await fetch(`/api/packets/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) return;
    const data = await readJsonResponse(response);
    renderDashboardResults(type, data.results || [], query);
    return;
  }

  if (type === "estimate") {
    const response = await fetch("/api/estimate-module/sync/pull");
    if (!response.ok) return;
    const data = await readJsonResponse(response);
    const key = query.toLowerCase();
    const estimates = (data.estimates || []).filter((estimate) => searchText(estimate).toLowerCase().includes(key));
    renderDashboardResults(type, estimates, query);
  }
}

async function loadDashboard() {
  hydrateDashboardIcons();
  renderStaffNotifications();
  loadVendorEmailStatus().catch(() => setVendorEmailStatus("error", "Could not check vendor document queue.", "Error"));

  const response = await fetch("/api/settings");
  if (response.status === 401) {
    window.location.href = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const settings = await readJsonResponse(response);
  const firstHelpSeen = localStorage.getItem("edgewaterAdminWelcomeSeen") === "1";
  const setupHandled = Boolean(settings.setupComplete || settings.setupDismissed);
  if (!setupHandled && !firstHelpSeen) {
    welcomeHelpPanel.classList.remove("hidden");
  }

}

function markWelcomeSeen() {
  localStorage.setItem("edgewaterAdminWelcomeSeen", "1");
}

startGuidedSetupLink?.addEventListener("click", markWelcomeSeen);

window.addEventListener("portal:tips-shown", () => {
  markWelcomeSeen();
  welcomeHelpPanel.classList.add("hidden");
});

skipSetupButton?.addEventListener("click", async () => {
  markWelcomeSeen();
  const response = await fetch("/api/settings/setup-skip", { method: "POST" });
  if (response.ok) {
    welcomeHelpPanel.classList.add("hidden");
  }
});

logoutButton?.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

dashboardScanVendorEmailsButton?.addEventListener("click", scanVendorEmailQueue);

dashboardSearchForms.forEach((form) => {
  form.elements.q.addEventListener("input", () => {
    window.clearTimeout(dashboardSearchTimers.get(form));
    dashboardSearchTimers.set(form, window.setTimeout(() => runDashboardSearch(form).catch(() => null), 220));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = form.elements.q.value.trim();
    const target = form.dataset.dashboardSearch;
    if (target === "contract") {
      window.location.href = `/contracts${query ? `?q=${encodeURIComponent(query)}` : ""}`;
      return;
    }
    if (target === "estimate") {
      window.location.href = `/estimates/new${query ? `?q=${encodeURIComponent(query)}` : ""}`;
      return;
    }
    form.elements.q.focus();
  });
});

loadDashboard();
