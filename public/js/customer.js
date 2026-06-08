const customerHeading = document.querySelector("#customer-heading");
const customerSubtitle = document.querySelector("#customer-subtitle");
const orderList = document.querySelector("#order-list");
const deliveryReleasePanel = document.querySelector("#delivery-release-panel");
const deliveryReleaseList = document.querySelector("#delivery-release-list");
const logoutButton = document.querySelector("#customer-logout");
const contactForm = document.querySelector("#customer-contact-form");
const contactOrderLabel = document.querySelector("#contact-order-label");
const contactOrderSelect = document.querySelector("#contact-order-select");
const contactStatus = document.querySelector("#customer-contact-status");
const contactPopup = document.querySelector("#customer-contact-popup");
const contactPopupMessage = document.querySelector("#customer-contact-popup-message");
const contactPopupClose = document.querySelector("#customer-contact-popup-close");
const customerAccountPanel = document.querySelector("#customer-account-panel");
const customerProfileForm = document.querySelector("#customer-profile-form");
const customerProfileStatus = document.querySelector("#customer-profile-status");
const customerPasswordForm = document.querySelector("#customer-password-form");
const customerPasswordStatus = document.querySelector("#customer-password-status");
const customerRegistrationPanel = document.querySelector("#customer-registration-panel");
const openCustomerRegisterButton = document.querySelector("#open-customer-register-modal");
const closeCustomerRegisterButton = document.querySelector("#close-customer-register-modal");
const customerRegisterModal = document.querySelector("#customer-register-modal");
const customerRegisterForm = document.querySelector("#customer-register-form");
const customerRegisterStatus = document.querySelector("#customer-register-status");

let orders = [];
let customerAccountRegistered = false;
let customerSuggestedEmail = "";
let currentCustomer = {};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneyOrBlank(value) {
  return value ? escapeHtml(value) : "Not listed";
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "Not listed";
  const display = String(value).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (display) return `${pad2(display[1])}/${pad2(display[2])}/${display[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function phoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const withoutCountry = digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;
  return withoutCountry.slice(0, 10);
}

function formatPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function looksLikePhoneEntry(value) {
  const text = String(value || "");
  return /\d/.test(text) && !text.includes("@") && !/[a-z]/i.test(text);
}

function statusLabel(status) {
  if (status === "completed") return "Completed";
  if (status === "signed") return "Signed, final copy ready";
  return "Ready for review/signature";
}

function passwordDisplayHtml(password) {
  if (!password) return '<p><strong>Packet password:</strong> Ask the store rep</p>';
  return `
    <p class="password-display">
      <strong>Packet password:</strong>
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

function paymentRowsHtml(order) {
  const rows = (order.payments?.rows || []).filter((row) => row.amount || row.dueDate || row.paidAmountDate);
  if (!rows.length) return "<p>No payment schedule is listed yet.</p>";

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Amount</th>
            <th>Due date</th>
            <th>Paid initials</th>
            <th>Paid amount/date</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.amount)}</td>
              <td>${formatDate(row.dueDate)}</td>
              <td>${escapeHtml(row.paidInitials)}</td>
              <td>${formatDate(row.paidAmountDate)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function documentsHtml(order) {
  const sections = order.sections || [];
  if (!sections.length) return "";

  return `
    <div class="customer-doc-list" aria-label="Customer documents">
      ${sections.map((section) => `
        <span class="customer-doc-chip">
          <strong>${escapeHtml(section.label)}</strong>
          <small>${escapeHtml(section.status)}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function deliveryStatusText(status) {
  if (status === "ready_for_delivery") return "Ready for delivery signature";
  if (status === "ready_for_pickup") return "Ready for pickup release signature";
  if (status === "completed") return "Material release completed";
  if (status === "store_received") return "Received by Edgewater, waiting for delivery/pickup";
  return "Not ready yet";
}

function showContactPopup(message, type = "info") {
  contactStatus.textContent = message;
  contactPopupMessage.textContent = message;
  contactPopup.classList.remove("hidden", "form-popup-success", "form-popup-error");
  if (type === "success") contactPopup.classList.add("form-popup-success");
  if (type === "error") contactPopup.classList.add("form-popup-error");
}

function hideContactPopup() {
  contactPopup.classList.add("hidden");
}

function setCustomerRegisterModal(open) {
  customerRegisterModal.classList.toggle("hidden", !open);
  document.body.classList.toggle("modal-open", open);
  if (open) {
    customerRegisterStatus.textContent = "";
    if (!customerRegisterForm.elements.email.value && customerSuggestedEmail) {
      customerRegisterForm.elements.email.value = customerSuggestedEmail;
    }
    customerRegisterForm.elements.email.focus();
  } else if (!customerRegistrationPanel.classList.contains("hidden")) {
    openCustomerRegisterButton.focus();
  }
}

function renderDeliveryReleases() {
  const visibleOrders = orders.filter((order) => order.deliveryRelease?.visible);
  if (!visibleOrders.length) {
    deliveryReleasePanel.classList.add("hidden");
    return;
  }

  deliveryReleasePanel.classList.remove("hidden");
  deliveryReleaseList.innerHTML = visibleOrders.map((order) => {
    const release = order.deliveryRelease || {};
    const ready = release.status === "ready_for_delivery" || release.status === "ready_for_pickup";

    return `
      <article class="order-card release-card">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(order.invoiceNumber || "Order")}</h2>
            <p>${deliveryStatusText(release.status)}</p>
          </div>
        </div>
        <div class="release-layout">
          <div class="record-view">
            <p><strong>Chain of custody:</strong> ${release.chainOfCustodyAvailable ? "Available" : "Waiting for store/driver update"}</p>
            <p><strong>Customer material release:</strong> ${release.customerReleaseRequired ? "Required at delivery or pickup" : "Not required"}</p>
          </div>
          <div class="release-actions">
            <button type="button" disabled>${ready ? "Release signing coming next" : "Available when delivery is ready"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderOrders() {
  if (!orders.length) {
    orderList.innerHTML = "<p>No orders were found yet.</p>";
    deliveryReleasePanel.classList.add("hidden");
    return;
  }

  orderList.innerHTML = orders.map((order) => `
    <article class="order-card">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(order.invoiceNumber || "Order")}</h2>
          <p>${statusLabel(order.status)}</p>
        </div>
        <div class="result-actions">
          ${order.finalPdfUrl ? `<a href="${order.finalPdfUrl}" target="_blank" rel="noreferrer">Open packet</a>` : ""}
          ${!order.finalPdfUrl && order.signUrl ? `<a href="${order.signUrl}" target="_blank" rel="noreferrer">Open packet</a>` : ""}
          ${order.estimate?.viewUrl ? `<a href="${order.estimate.viewUrl}" target="_blank" rel="noreferrer">View estimate</a>` : ""}
          ${order.finalPdfUrl ? `<a href="${order.finalPdfUrl}" target="_blank" rel="noreferrer">Download signed PDF</a>` : ""}
        </div>
      </div>
      <div class="order-facts">
        <p><strong>Sale date:</strong> ${formatDate(order.saleDate)}</p>
        <p><strong>Invoice amount:</strong> ${moneyOrBlank(order.invoiceAmount)}</p>
        ${order.estimate?.available ? `<p><strong>Estimate:</strong> ${escapeHtml(order.estimate.estimateNumber || order.estimate.fileName || "Available")}</p>` : ""}
        <p><strong>Total payment amount:</strong> ${moneyOrBlank(order.payments?.totalInvoiceAmount)}</p>
        ${passwordDisplayHtml(order.password)}
      </div>
      ${order.status === "signed" || order.status === "completed" ? '<p class="notice">Signed documents are view-only. Changes require a new signed edit or addendum from the store.</p>' : ""}
      ${documentsHtml(order)}
      ${paymentRowsHtml(order)}
    </article>
  `).join("");

  contactOrderSelect.innerHTML = orders.map((order) => `
    <option value="${escapeHtml(order.id)}">${escapeHtml(order.invoiceNumber || order.id)}</option>
  `).join("");
  renderDeliveryReleases();
}

async function loadOrders() {
  const response = await fetch("/api/customer/orders");
  if (response.status === 401) {
    window.location.href = "/";
    return;
  }

  const data = await readJsonResponse(response);
  orders = data.orders || [];
  currentCustomer = data.customer || {};
  customerAccountRegistered = Boolean(data.customer?.accountId);
  customerSuggestedEmail = data.customer?.suggestedEmail || "";
  customerHeading.textContent = `${data.customer?.name || "Customer"} Orders`;
  customerSubtitle.textContent = customerAccountRegistered
    ? `Signed in as ${data.customer.email || "registered customer"}.`
    : "Current and past packet records connected to this first-contract login.";
  if (!customerRegisterForm.elements.email.value && customerSuggestedEmail) {
    customerRegisterForm.elements.email.value = customerSuggestedEmail;
  }
  customerAccountPanel.classList.toggle("hidden", !customerAccountRegistered);
  customerRegistrationPanel.classList.toggle("hidden", customerAccountRegistered);
  if (customerAccountRegistered) {
    customerProfileForm.elements.name.value = currentCustomer.name || "";
    customerProfileForm.elements.email.value = currentCustomer.email || customerSuggestedEmail || "";
    customerProfileForm.elements.phoneLast4.value = currentCustomer.phoneLast4 || "";
  }
  renderOrders();
}

contactForm.elements.topic.addEventListener("change", () => {
  contactOrderLabel.classList.toggle("hidden", contactForm.elements.topic.value !== "existingConcern");
});

contactForm.elements.preferredContact.addEventListener("input", () => {
  const input = contactForm.elements.preferredContact;
  if (looksLikePhoneEntry(input.value)) {
    input.value = formatPhone(input.value);
  }
});

orderList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-password]");
  if (button) toggleMaskedPassword(button);
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showContactPopup("Sending message...", "info");
  let preferredContact = contactForm.elements.preferredContact.value.trim();
  const bestTime = contactForm.elements.bestTime.value;
  if (preferredContact.includes("@") && !isValidEmail(preferredContact)) {
    showContactPopup("Enter a valid email address, or use a phone number/best time instead.", "error");
    contactForm.elements.preferredContact.focus();
    return;
  }
  if (looksLikePhoneEntry(preferredContact)) {
    const digits = phoneDigits(preferredContact);
    if (digits.length !== 10) {
      showContactPopup("Enter a 10-digit phone number, or use an email address.", "error");
      contactForm.elements.preferredContact.focus();
      return;
    }
    preferredContact = formatPhone(digits);
    contactForm.elements.preferredContact.value = preferredContact;
  } else if (preferredContact && !preferredContact.includes("@")) {
    showContactPopup("Use phone or email for Preferred contact. Put time preferences in Best time.", "error");
    contactForm.elements.preferredContact.focus();
    return;
  }

  const messageParts = [contactForm.elements.message.value.trim()];
  if (bestTime) messageParts.push(`Best time: ${bestTime}`);

  const response = await fetch("/api/customer/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: contactForm.elements.topic.value,
      packetId: contactForm.elements.packetId.value,
      preferredContact,
      message: messageParts.join("\n\n"),
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok || !data.sent) {
    showContactPopup(data.reason || data.error || "Message could not be sent.", "error");
    return;
  }

  contactForm.reset();
  contactOrderLabel.classList.add("hidden");
  showContactPopup("Message sent. Edgewater has the sale number if this was about an existing sale.", "success");
});

contactPopupClose.addEventListener("click", hideContactPopup);

openCustomerRegisterButton.addEventListener("click", () => {
  setCustomerRegisterModal(true);
});

closeCustomerRegisterButton.addEventListener("click", () => {
  setCustomerRegisterModal(false);
});

customerRegisterModal.addEventListener("click", (event) => {
  if (event.target === customerRegisterModal) setCustomerRegisterModal(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !customerRegisterModal.classList.contains("hidden")) {
    setCustomerRegisterModal(false);
  }
});

customerRegisterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  customerRegisterStatus.textContent = "";
  const email = customerRegisterForm.elements.email.value.trim();

  if (!isValidEmail(email)) {
    customerRegisterStatus.textContent = "Enter a valid email address.";
    customerRegisterForm.elements.email.focus();
    return;
  }

  if (customerRegisterForm.elements.personalPassword.value !== customerRegisterForm.elements.confirmPassword.value) {
    customerRegisterStatus.textContent = "The two personal password entries do not match.";
    return;
  }

  const response = await fetch("/api/customer/account/register-current", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      personalPassword: customerRegisterForm.elements.personalPassword.value,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    customerRegisterStatus.textContent = data.error || "Portal login could not be created.";
    return;
  }

  customerRegisterForm.reset();
  customerRegisterStatus.textContent = "Portal login created.";
  await loadOrders();
  setCustomerRegisterModal(false);
});

customerProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  customerProfileStatus.textContent = "Saving account details...";
  const email = customerProfileForm.elements.email.value.trim();
  const phoneLast4 = phoneDigits(customerProfileForm.elements.phoneLast4.value).slice(-4);

  if (!isValidEmail(email)) {
    customerProfileStatus.textContent = "Enter a valid email address.";
    customerProfileForm.elements.email.focus();
    return;
  }

  if (customerProfileForm.elements.phoneLast4.value.trim() && phoneLast4.length !== 4) {
    customerProfileStatus.textContent = "Phone last 4 should be four digits.";
    customerProfileForm.elements.phoneLast4.focus();
    return;
  }

  const response = await fetch("/api/customer/account/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: customerProfileForm.elements.name.value,
      email,
      phoneLast4,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    customerProfileStatus.textContent = data.error || "Account details could not be saved.";
    return;
  }

  customerProfileStatus.textContent = "Account details saved.";
  await loadOrders();
});

customerPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  customerPasswordStatus.textContent = "Saving password...";

  const response = await fetch("/api/customer/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPassword: customerPasswordForm.elements.currentPassword.value,
      newPassword: customerPasswordForm.elements.newPassword.value,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    customerPasswordStatus.textContent = data.error || "Password could not be changed.";
    return;
  }

  customerPasswordForm.reset();
  customerPasswordStatus.textContent = "Password changed.";
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/customer/logout", { method: "POST" });
  window.location.href = "/";
});

loadOrders();
