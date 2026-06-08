const statusEl = document.querySelector("#estimate-response-status");
const contentEl = document.querySelector("#estimate-response-content");
const form = document.querySelector("#estimate-response-form");
const submitButton = document.querySelector("#estimate-response-submit");
const acceptFields = document.querySelector("#accept-fields");
const declineFields = document.querySelector("#decline-fields");
const actionInput = form.elements.action;

function estimateToken() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

function requestedAction() {
  const action = new URLSearchParams(window.location.search).get("action");
  return action === "decline" ? "decline" : "accept";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", Boolean(isError));
}

function setAction(action) {
  actionInput.value = action === "decline" ? "decline" : "accept";
  const declining = actionInput.value === "decline";
  acceptFields.classList.toggle("hidden", declining);
  declineFields.classList.toggle("hidden", !declining);
  submitButton.textContent = declining ? "Submit Decline" : "Confirm Acceptance";
  document.querySelectorAll("[data-response-action]").forEach((button) => {
    button.classList.toggle("primary", button.dataset.responseAction === actionInput.value);
    button.classList.toggle("ghost", button.dataset.responseAction !== actionInput.value);
  });
}

function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function loadEstimate() {
  const token = estimateToken();
  if (!token) {
    setStatus("Estimate response link is missing.", true);
    return;
  }

  const response = await fetch(`/api/estimate-module/public/${encodeURIComponent(token)}`);
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    setStatus(data.error || "Estimate response link was not found.", true);
    return;
  }

  document.querySelector("#response-estimate-number").textContent = data.estimateNumber || data.estimateId || "Estimate";
  document.querySelector("#response-customer").textContent = data.customer || "Customer";
  document.querySelector("#response-total").textContent = data.grandTotalDisplay || money(data.grandTotal);
  document.querySelector("#response-pdf-frame").src = data.pdfUrl || "";

  if (data.alreadyResponded) {
    form.classList.add("hidden");
    setStatus(`This estimate was already ${data.status}. Please contact the store if you need changes.`);
  } else {
    setStatus("");
  }

  contentEl.classList.remove("hidden");
  setAction(requestedAction());
}

document.querySelectorAll("[data-response-action]").forEach((button) => {
  button.addEventListener("click", () => setAction(button.dataset.responseAction));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const action = actionInput.value === "decline" ? "decline" : "accept";
  const typedName = action === "decline"
    ? form.elements.declineName.value.trim()
    : form.elements.typedName.value.trim();
  const accepted = form.elements.accepted.checked;
  const notes = form.elements.notes.value.trim();

  if (action === "accept" && !typedName) {
    setStatus("Type your name before accepting the estimate.", true);
    form.elements.typedName.focus();
    return;
  }
  if (action === "accept" && !accepted) {
    setStatus("Check the acceptance statement before confirming.", true);
    form.elements.accepted.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = action === "decline" ? "Submitting..." : "Accepting...";
  try {
    const response = await fetch(`/api/estimate-module/public/${encodeURIComponent(estimateToken())}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, typedName, accepted, notes }),
    });
    const data = await readJsonResponse(response).catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "Could not submit the estimate response.", true);
      return;
    }
    form.classList.add("hidden");
    setStatus(action === "decline"
      ? "Your response was submitted. Thank you."
      : "Estimate accepted. Thank you.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = action === "decline" ? "Submit Decline" : "Confirm Acceptance";
  }
});

loadEstimate().catch((error) => setStatus(error.message || "Could not load estimate.", true));
