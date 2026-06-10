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
const openCustomerSignatureButton = document.querySelector("#open-customer-signature");
const customerSignatureSummary = document.querySelector("#customer-signature-summary");
const customerSignatureModal = document.querySelector("#customer-signature-modal");
const customerSignatureClose = document.querySelector("#customer-signature-close");
const customerSignatureCancel = document.querySelector("#customer-signature-cancel");
const customerSignatureSave = document.querySelector("#customer-signature-save");
const customerSignatureStatus = document.querySelector("#customer-signature-status");
const customerSignaturePrintedName = document.querySelector("#customer-signature-printed-name");
const customerSignatureInitials = document.querySelector("#customer-signature-initials");
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
let signatureDetailsSaved = false;

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
  signatureDetailsSaved = false;
  updateCustomerSignatureSummary();
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

function clearSignatureCanvas() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  hasSignature = false;
  signatureDetailsSaved = false;
  updateCustomerSignatureSummary();
}

function setCustomerSignatureStatus(message = "", isError = false) {
  if (!customerSignatureStatus) return;
  customerSignatureStatus.textContent = message;
  customerSignatureStatus.classList.toggle("error", Boolean(isError));
}

function updateCustomerSignatureSummary() {
  if (!customerSignatureSummary) return;
  const printedName = signForm.elements.printedName.value.trim();
  const initials = signForm.elements.customerInitials.value.trim();
  customerSignatureSummary.textContent = signatureDetailsSaved
    ? `Saved: ${printedName || "Printed name"} / ${initials || "initials"}`
    : "Enter printed name, initials, and signature.";
}

function openCustomerSignatureModal() {
  if (!customerSignatureModal) return;
  customerSignaturePrintedName.value = signForm.elements.printedName.value.trim();
  customerSignatureInitials.value = signForm.elements.customerInitials.value.trim();
  setCustomerSignatureStatus("Printed name and initials will be applied to the printed signature and initial areas of the contract.");
  customerSignatureModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    resizeCanvasForDisplay();
    customerSignaturePrintedName.focus();
  });
}

function closeCustomerSignatureModal() {
  if (!customerSignatureModal) return;
  customerSignatureModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function saveCustomerSignatureDetails() {
  const printedName = customerSignaturePrintedName.value.trim();
  const initials = customerSignatureInitials.value.trim();
  if (!printedName || !initials) {
    setCustomerSignatureStatus("Enter printed name and initials before saving.", true);
    return false;
  }
  if (!hasSignature) {
    setCustomerSignatureStatus("Draw the customer signature before saving.", true);
    return false;
  }
  signForm.elements.printedName.value = printedName;
  signForm.elements.customerInitials.value = initials;
  signatureDetailsSaved = true;
  setCustomerSignatureStatus("");
  updateCustomerSignatureSummary();
  closeCustomerSignatureModal();
  return true;
}

clearButton.addEventListener("click", clearSignatureCanvas);
openCustomerSignatureButton.addEventListener("click", openCustomerSignatureModal);
customerSignatureClose.addEventListener("click", closeCustomerSignatureModal);
customerSignatureCancel.addEventListener("click", closeCustomerSignatureModal);
customerSignatureSave.addEventListener("click", saveCustomerSignatureDetails);
customerSignatureModal.addEventListener("click", (event) => {
  if (event.target === customerSignatureModal) closeCustomerSignatureModal();
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
    openCustomerSignatureModal();
  } catch (error) {
    reviewStatus.textContent = error.message;
    updateReviewConfirmButton();
  } finally {
    reviewModalSave.textContent = "Continue to signatures";
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
    signForm.elements.customerInitials.value = "";
    clearSignatureCanvas();
    closeCustomerSignatureModal();
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

  const printedName = signForm.elements.printedName.value.trim();
  const customerInitials = signForm.elements.customerInitials.value.trim();

  if (!signatureDetailsSaved || !printedName || !customerInitials || !hasSignature) {
    donePanel.innerHTML = '<p class="error">Save the customer printed name, initials, and drawn signature before finalizing.</p>';
    donePanel.classList.remove("hidden");
    openCustomerSignatureModal();
    return;
  }

  if (!signForm.elements.digitalSignatureAccepted.checked) {
    donePanel.innerHTML = '<p class="error">You must agree to sign electronically before finalizing. If you do not agree, contact Edgewater or sign in store.</p>';
    donePanel.classList.remove("hidden");
    return;
  }

  const submit = signForm.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "Saving signatures...";

  try {
    const response = await fetch(`/api/packets/${packetId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        printedName,
        customerInitials,
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
      ? "A copy has been sent to Edgewater. We will reach out soon."
      : data.email?.reason || "Your signed contract was saved for Edgewater. We will reach out soon.";

    donePanel.innerHTML = postSignActionHtml(emailText);
    donePanel.classList.remove("hidden");
    signPanel.classList.add("hidden");
    wirePostSignActions();
  } catch (error) {
    donePanel.innerHTML = `<p class="error">${error.message}</p>`;
    donePanel.classList.remove("hidden");
  } finally {
    submit.disabled = false;
    submit.textContent = "Save and Confirm Signatures";
  }
});

window.addEventListener("resize", resizeCanvasForDisplay);

function postSignActionHtml(emailText) {
  return `
    <p><strong>Thank you.</strong></p>
    <p>${escapeHtml(emailText)}</p>
    <p><strong>Signed date:</strong> ${formatDateOnly()}</p>
    <p>If you want a copy for yourself, download and save it or print it here.</p>
    <div class="result-actions">
      <button type="button" id="download-signed-pdf" class="primary">Download and save</button>
      <button type="button" id="print-signed-pdf">Print</button>
      <a href="${finalPdfUrl}" target="_blank" rel="noreferrer">View signed PDF</a>
      <button type="button" id="run-after-actions" class="ghost">Done</button>
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
  document.querySelector("#download-signed-pdf")?.addEventListener("click", () => {
    try {
      triggerDownload();
      setActionStatus(["Customer copy download started."]);
    } catch (error) {
      setActionStatus([`Download failed - ${error.message}`]);
    }
  });

  document.querySelector("#print-signed-pdf")?.addEventListener("click", () => {
    if (triggerPrint()) {
      setActionStatus(["Print view opened."]);
    } else {
      setActionStatus(["The browser blocked the print window. Click View signed PDF, then use the browser print button."]);
    }
  });

  document.querySelector("#run-after-actions").addEventListener("click", async () => {
    const selected = ["signed"];
    const statuses = ["Customer finished the signing page."];
    const button = document.querySelector("#run-after-actions");
    button.disabled = true;
    button.textContent = "Closing...";

    try {
      const response = await fetch(`/api/packets/${packetId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, selected, statuses }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Could not close signing link.");
      statuses.push("Done.");
      setActionStatus(statuses);
      button.textContent = "Done";
      showAccountPrompt(data.portalUrl || "/customer");
    } catch (error) {
      statuses.push(`Done: failed - ${error.message}`);
      setActionStatus(statuses);
      button.disabled = false;
      button.textContent = "Try Done again";
    }
  });
}
