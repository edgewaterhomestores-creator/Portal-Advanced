const packetId = window.location.pathname.split("/").filter(Boolean).pop();
const verifyPanel = document.querySelector("#verify-panel");
const verifyForm = document.querySelector("#verify-form");
const verifyError = document.querySelector("#verify-error");
const signPanel = document.querySelector("#sign-panel");
const signForm = document.querySelector("#sign-form");
const donePanel = document.querySelector("#done-panel");
const packetTitle = document.querySelector("#packet-title");
const packetSubtitle = document.querySelector("#packet-subtitle");
const sectionList = document.querySelector("#section-list");
const downloadSignable = document.querySelector("#download-signable");
const guidedReviewButton = document.querySelector("#guided-review");
const fullReviewButton = document.querySelector("#full-review");
const fullDocumentPanel = document.querySelector("#full-document-panel");
const fullDocumentReviewArea = document.querySelector("#full-document-review-area");
const fullDocumentFrame = document.querySelector("#full-document-frame");
const reviewEndMarker = document.querySelector("#review-end-marker");
const reviewRequiredNotice = document.querySelector("#review-required-notice");
const reviewStatus = document.querySelector("#review-status");
const reviewConfirmButton = document.querySelector("#review-confirm");
const reviewConfirmModal = document.querySelector("#review-confirm-modal");
const reviewUnderstoodCheck = document.querySelector("#review-understood-check");
const reviewModalCancel = document.querySelector("#review-modal-cancel");
const reviewModalSave = document.querySelector("#review-modal-save");
const openContractNewTab = document.querySelector("#open-contract-new-tab");
const canvas = document.querySelector("#signature-canvas");
const clearButton = document.querySelector("#clear-signature");
const ctx = canvas.getContext("2d");

let password = "";
let drawing = false;
let hasSignature = false;
let reviewComplete = false;
let reviewOpened = false;
let reviewEndReached = false;
let customerEmail = "";
let finalPdfUrl = "";
let pdfDownloadFilename = "CONTRACT.pdf";
let customerAccountRegistered = false;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function resizeCanvasForDisplay() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const data = hasSignature ? canvas.toDataURL("image/png") : null;

  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#1d4ed8";

  if (data) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = data;
  }
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

canvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  hasSignature = true;
  canvas.setPointerCapture(event.pointerId);
  const point = pointFromEvent(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  const point = pointFromEvent(event);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
});

function stopDrawing() {
  drawing = false;
}

canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);

clearButton.addEventListener("click", () => {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  hasSignature = false;
});

function setReviewState(complete) {
  reviewComplete = Boolean(complete);
  reviewStatus.textContent = reviewComplete
    ? "Contract review confirmed. The signature form is unlocked."
    : "Waiting for contract review.";
  reviewRequiredNotice.classList.toggle("signing-review-required", !reviewComplete);
  signForm.classList.toggle("hidden", !reviewComplete);
  signForm.querySelector("button[type='submit']").disabled = !reviewComplete;
  updateReviewConfirmButton();
}

function updateReviewConfirmButton() {
  if (reviewComplete) {
    reviewConfirmButton.disabled = true;
    reviewConfirmButton.textContent = "Review confirmed";
    return;
  }

  reviewConfirmButton.disabled = !reviewEndReached;
  reviewConfirmButton.textContent = reviewEndReached
    ? "Confirm read and understood"
    : "Scroll to the end to confirm";
}

function markerIsVisible(container, marker) {
  const containerRect = container.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  return markerRect.top < containerRect.bottom && markerRect.bottom <= containerRect.bottom + 2;
}

function checkReviewEndReached() {
  if (!reviewOpened || reviewComplete || reviewEndReached) return;
  if (!markerIsVisible(fullDocumentReviewArea, reviewEndMarker)) return;
  reviewEndReached = true;
  reviewStatus.textContent = "End of review area reached. Confirm that you read and understand the contract.";
  updateReviewConfirmButton();
}

function openReviewConfirmModal() {
  reviewUnderstoodCheck.checked = false;
  reviewModalSave.disabled = true;
  reviewConfirmModal.classList.remove("hidden");
  reviewUnderstoodCheck.focus();
}

function closeReviewConfirmModal() {
  reviewConfirmModal.classList.add("hidden");
}

function signablePdfReviewUrl() {
  if (!downloadSignable.href || downloadSignable.href.endsWith("#")) return "";
  return `${downloadSignable.href}${downloadSignable.href.includes("#") ? "" : "#toolbar=0&navpanes=0&view=FitH"}`;
}

guidedReviewButton.addEventListener("click", () => {
  sectionList.scrollIntoView({ behavior: "smooth", block: "start" });
});

fullReviewButton.addEventListener("click", () => {
  const reviewUrl = signablePdfReviewUrl();
  if (!reviewUrl) return;
  reviewOpened = true;
  reviewEndReached = false;
  fullDocumentFrame.src = reviewUrl;
  openContractNewTab.href = downloadSignable.href;
  fullDocumentPanel.classList.remove("hidden");
  fullDocumentReviewArea.scrollTop = 0;
  reviewStatus.textContent = "Contract PDF opened. Review all pages, then scroll to the end of the review area.";
  updateReviewConfirmButton();
  fullDocumentPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  requestAnimationFrame(checkReviewEndReached);
});

fullDocumentReviewArea.addEventListener("scroll", checkReviewEndReached);

reviewConfirmButton.addEventListener("click", () => {
  if (!fullDocumentFrame.src) {
    reviewStatus.textContent = "Open the contract PDF before confirming review.";
    return;
  }

  if (!reviewEndReached) {
    reviewStatus.textContent = "Scroll to the end of the contract review area before confirming.";
    return;
  }

  openReviewConfirmModal();
});

reviewUnderstoodCheck.addEventListener("change", () => {
  reviewModalSave.disabled = !reviewUnderstoodCheck.checked;
});

reviewModalCancel.addEventListener("click", closeReviewConfirmModal);

reviewModalSave.addEventListener("click", async () => {
  if (!reviewUnderstoodCheck.checked) return;

  reviewConfirmButton.disabled = true;
  reviewConfirmButton.textContent = "Saving review...";
  reviewModalSave.disabled = true;
  reviewModalSave.textContent = "Saving...";
  try {
    const response = await fetch(`/api/packets/${packetId}/reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        reviewMode: "full_document",
        reviewedThroughEnd: true,
        readAndUnderstood: true,
      }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Could not confirm review.");
    closeReviewConfirmModal();
    setReviewState(true);
    signForm.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    reviewStatus.textContent = error.message;
    updateReviewConfirmButton();
  } finally {
    reviewModalSave.textContent = "Confirm and unlock signature";
    reviewModalSave.disabled = !reviewUnderstoodCheck.checked;
  }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  verifyError.textContent = "";
  password = verifyForm.elements.password.value.trim().toUpperCase();

  try {
    const response = await fetch(`/api/packets/${packetId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Could not open packet.");

    if (data.completed) {
      customerEmail = data.customerEmail || "";
      customerAccountRegistered = Boolean(data.customerAccountRegistered);
      finalPdfUrl = data.finalPdfUrl || "";
      pdfDownloadFilename = data.downloadFilename || pdfDownloadFilename;
      donePanel.innerHTML = `
        <p><strong>This packet is already complete.</strong></p>
        ${data.finalPdfUrl ? `<div class="result-actions"><a href="${data.finalPdfUrl}" target="_blank" rel="noreferrer">Open signed PDF</a></div>` : ""}
        <div id="post-sign-account-panel"></div>
      `;
      donePanel.classList.remove("hidden");
      verifyPanel.classList.add("hidden");
      showAccountPrompt(data.portalUrl || "/customer");
      return;
    }

    if (data.signed) {
      finalPdfUrl = data.finalPdfUrl;
      customerEmail = data.customerEmail || "";
      customerAccountRegistered = Boolean(data.customerAccountRegistered);
      pdfDownloadFilename = data.downloadFilename || pdfDownloadFilename;
      donePanel.innerHTML = postSignActionHtml("This packet has already been signed. Finish the selected actions below to close this signing link.");
      donePanel.classList.remove("hidden");
      verifyPanel.classList.add("hidden");
      wirePostSignActions();
      return;
    }

    packetTitle.textContent = data.customerName || "Customer packet";
    packetSubtitle.textContent = data.invoiceNumber ? `Invoice ${data.invoiceNumber}` : "";
    customerEmail = data.customerEmail || "";
    customerAccountRegistered = Boolean(data.customerAccountRegistered);
    pdfDownloadFilename = data.downloadFilename || pdfDownloadFilename;
    downloadSignable.href = data.signablePdfUrl;
    signForm.elements.printedName.value = data.customerName || "";
    reviewOpened = false;
    reviewEndReached = false;
    setReviewState(false);
    fullDocumentPanel.classList.add("hidden");
    fullDocumentFrame.removeAttribute("src");
    openContractNewTab.href = data.signablePdfUrl;
    sectionList.innerHTML = `
      <strong>Signature sections</strong>
      ${data.sections.map((section) => `<p>${section.label}</p>`).join("")}
    `;

    verifyPanel.classList.add("hidden");
    signPanel.classList.remove("hidden");
    requestAnimationFrame(resizeCanvasForDisplay);
  } catch (error) {
    verifyError.textContent = error.message;
  }
});

signForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!reviewComplete) {
    donePanel.innerHTML = '<p class="error">Open and review the contract PDF before signing.</p>';
    donePanel.classList.remove("hidden");
    fullReviewButton.focus();
    return;
  }

  if (!hasSignature) {
    donePanel.innerHTML = '<p class="error">A signature is required.</p>';
    donePanel.classList.remove("hidden");
    return;
  }

  if (!signForm.elements.digitalSignatureAccepted.checked) {
    donePanel.innerHTML = '<p class="error">You must agree to sign electronically before finalizing. If you do not agree, contact Edgewater or sign in store.</p>';
    donePanel.classList.remove("hidden");
    return;
  }

  const submit = signForm.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "Finalizing...";

  try {
    const response = await fetch(`/api/packets/${packetId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        printedName: signForm.elements.printedName.value.trim(),
        customerInitials: signForm.elements.customerInitials.value.trim(),
        customerNotes: signForm.elements.customerNotes.value.trim(),
        digitalSignatureAccepted: signForm.elements.digitalSignatureAccepted.checked,
        communicationConsent: {
          accountEmailAccepted: signForm.elements.accountEmailAccepted.checked,
          marketingEmailConsent: signForm.elements.marketingEmailConsent.checked,
          accountTextConsent: signForm.elements.accountTextConsent.checked,
          marketingTextConsent: signForm.elements.marketingTextConsent.checked,
          socialMediaTagConsent: signForm.elements.socialMediaTagConsent.checked,
          socialMediaProfile: signForm.elements.socialMediaProfile.value.trim(),
        },
        signatureDataUrl: canvas.toDataURL("image/png"),
      }),
    });

    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || data.detail || "Could not finalize packet.");

    finalPdfUrl = data.finalPdfUrl;
    customerEmail = data.customerEmail || customerEmail;
    customerAccountRegistered = Boolean(data.customerAccountRegistered);
    pdfDownloadFilename = data.downloadFilename || pdfDownloadFilename;

    const emailText = data.email?.sent
      ? "The final packet was emailed to Edgewater."
      : data.email?.reason || "The final packet was saved.";

    donePanel.innerHTML = postSignActionHtml(emailText);
    donePanel.classList.remove("hidden");
    signPanel.classList.add("hidden");
    wirePostSignActions();
  } catch (error) {
    donePanel.innerHTML = `<p class="error">${error.message}</p>`;
    donePanel.classList.remove("hidden");
  } finally {
    submit.disabled = false;
    submit.textContent = "Finalize signed PDF";
  }
});

window.addEventListener("resize", resizeCanvasForDisplay);

function postSignActionHtml(emailText) {
  return `
    <p><strong>Signed packet finalized.</strong> ${emailText}</p>
    <p><strong>Signed date:</strong> ${formatDateOnly()}</p>
    <div class="signature-list action-list">
      <strong>What would you like to do now?</strong>
      <label><input type="checkbox" name="afterAction" value="download" checked /> Download/save signed PDF</label>
      <label><input type="checkbox" name="afterAction" value="print" /> Open print view for signed PDF</label>
      <label><input type="checkbox" name="afterAction" value="email" /> Email signed PDF to me</label>
      <label>Email address<input id="customer-final-email" type="email" value="${escapeHtml(customerEmail)}" /></label>
    </div>
    <div class="result-actions">
      <button type="button" id="run-after-actions">Done</button>
      <a href="${finalPdfUrl}" target="_blank" rel="noreferrer">Open signed PDF</a>
    </div>
    <div id="post-sign-account-panel"></div>
    <div id="after-action-status" class="status-list"></div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setActionStatus(items) {
  const status = document.querySelector("#after-action-status");
  status.innerHTML = items.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function accountPromptHtml(portalUrl = "/customer") {
  if (customerAccountRegistered) {
    return `
      <section class="signature-list">
        <strong>Customer portal account</strong>
        <p>Your login is saved for future customer access. Full customer account history may not be available yet.</p>
        <div class="result-actions">
          <a class="button-link" href="${portalUrl}">Continue</a>
          <button type="button" class="ghost" id="finish-signing-logout">Done and log out</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="signature-list">
      <strong>Create a portal login?</strong>
      <p>Create a personal login for future customer access. The email on this document is used as the starting account email.</p>
      <form id="post-sign-register-form" class="grid account-create-grid" autocomplete="off">
        <label>Email<input name="email" type="email" autocomplete="email" value="${escapeHtml(customerEmail)}" required /></label>
        <label>New personal password<input name="personalPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <label>Confirm personal password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <div class="entry-form-actions account-create-actions wide">
          <button class="primary" type="submit">Create portal login</button>
          <button class="ghost" type="button" id="skip-post-sign-register">Skip and log out</button>
        </div>
      </form>
      <p id="post-sign-register-status" class="status-list"></p>
    </section>
  `;
}

function showAccountPrompt(portalUrl = "/customer") {
  const panel = document.querySelector("#post-sign-account-panel");
  if (!panel) return;
  panel.innerHTML = accountPromptHtml(portalUrl);

  document.querySelector("#finish-signing-logout")?.addEventListener("click", logoutCustomer);
  document.querySelector("#skip-post-sign-register")?.addEventListener("click", logoutCustomer);

  const registerForm = document.querySelector("#post-sign-register-form");
  if (!registerForm) return;
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#post-sign-register-status");
    const email = registerForm.elements.email.value.trim();
    const passwordValue = registerForm.elements.personalPassword.value;
    const confirmValue = registerForm.elements.confirmPassword.value;
    if (!isValidEmail(email)) {
      status.textContent = "Enter a valid email address.";
      registerForm.elements.email.focus();
      return;
    }
    if (passwordValue !== confirmValue) {
      status.textContent = "Passwords do not match.";
      return;
    }
    try {
      const response = await fetch("/api/customer/account/register-current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, personalPassword: passwordValue }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Could not create portal login.");
      customerAccountRegistered = true;
      status.textContent = "Portal login created.";
      setTimeout(() => {
        window.location.href = data.portalUrl || portalUrl;
      }, 500);
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function logoutCustomer() {
  await fetch("/api/customer/logout", { method: "POST" }).catch(() => null);
  window.location.href = "/";
}

function triggerDownload() {
  const link = document.createElement("a");
  link.href = finalPdfUrl;
  link.download = pdfDownloadFilename;
  document.body.append(link);
  link.click();
  link.remove();
}

function triggerPrint() {
  const printWindow = window.open(finalPdfUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    return false;
  }
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (_error) {
      // Some PDF viewers block scripted print. The opened PDF can still be printed manually.
    }
  }, 900);
  return true;
}

function wirePostSignActions() {
  document.querySelector("#run-after-actions").addEventListener("click", async () => {
    const selected = [...document.querySelectorAll('[name="afterAction"]:checked')].map((input) => input.value);
    const statuses = [];
    const button = document.querySelector("#run-after-actions");
    button.disabled = true;
    button.textContent = "Working...";

    if (!selected.length) {
      statuses.push("No download, print, or email action selected.");
      setActionStatus(statuses);
    }

    if (selected.includes("download")) {
      try {
        triggerDownload();
        statuses.push("Download/save: started.");
      } catch (error) {
        statuses.push(`Download/save: failed - ${error.message}`);
      }
      setActionStatus(statuses);
    }

    if (selected.includes("print")) {
      try {
        if (triggerPrint()) {
          statuses.push("Print: opened the signed PDF for printing.");
        } else {
          statuses.push("Print: browser blocked the automatic print window. Click Open signed PDF, then use the browser print button.");
        }
      } catch (error) {
        statuses.push(`Print: failed - ${error.message}`);
      }
      setActionStatus(statuses);
    }

    if (selected.includes("email")) {
      try {
        const email = document.querySelector("#customer-final-email").value.trim();
        if (!isValidEmail(email)) {
          throw new Error("Enter a valid email address before sending.");
        }
        const response = await fetch(`/api/packets/${packetId}/email-final-to-customer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, email }),
        });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.sent) {
          throw new Error(data.reason || data.error || "Email was not sent.");
        }
        statuses.push(`Email: sent to ${data.to || email}.`);
      } catch (error) {
        statuses.push(`Email: failed - ${error.message}`);
      }
      setActionStatus(statuses);
    }

    try {
      const response = await fetch(`/api/packets/${packetId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, selected, statuses }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Could not close signing link.");
      statuses.push("Done: signing link closed.");
      setActionStatus(statuses);
      button.textContent = "Completed";
      showAccountPrompt(data.portalUrl || "/customer");
    } catch (error) {
      statuses.push(`Done: failed - ${error.message}`);
      setActionStatus(statuses);
      button.disabled = false;
      button.textContent = "Try Done again";
    }
  });
}
