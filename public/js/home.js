const customerLoginForm = document.querySelector("#customer-login-form");
const customerLoginError = document.querySelector("#customer-login-error");
const registeredCustomerLoginForm = document.querySelector("#registered-customer-login-form");
const registeredCustomerLoginError = document.querySelector("#registered-customer-login-error");
const registeredForgotPasswordButton = document.querySelector("#registered-forgot-password");
const registeredResetForm = document.querySelector("#registered-reset-form");
const registeredResetCancelButton = document.querySelector("#registered-reset-cancel");
const clearOnLoadInputs = document.querySelectorAll("[data-clear-on-load]");
let userEditedEntryField = false;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function redirectToPortal(data) {
  window.location.href = data.portalUrl || "/customer";
}

function requestedStaffPage() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "";
}

async function staffSession() {
  const response = await fetch(`/api/session?_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) return {};
  return readJsonResponse(response).catch(() => ({}));
}

async function confirmedStaffSession() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await staffSession().catch(() => ({}));
    if (session.authenticated) return session;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return {};
}

async function redirectIfStaffAlreadyLoggedIn() {
  const session = await staffSession().catch(() => ({}));
  if (session.authenticated) {
    window.location.href = session.mustChangePassword ? "/change-password" : (requestedStaffPage() || "/portal");
  }
}

function clearEntryFields() {
  if (userEditedEntryField) return;
  registeredCustomerLoginForm.reset();
  customerLoginForm.reset();
  clearOnLoadInputs.forEach((input) => {
    input.value = "";
    input.defaultValue = "";
  });
}

clearOnLoadInputs.forEach((input) => {
  input.addEventListener("input", () => {
    userEditedEntryField = true;
  }, { once: true });
});

[0, 50, 250, 750].forEach((delay) => {
  window.setTimeout(clearEntryFields, delay);
});

async function tryStaffLogin(loginName, password, reclaimExistingUser = false) {
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: loginName,
      password,
      next: requestedStaffPage() || "/portal",
      reclaimExistingUser,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) {
    const session = await confirmedStaffSession();
    if (!session.authenticated) {
      registeredCustomerLoginError.textContent = "Staff login was accepted, but this browser did not keep the login session. Enable cookies for this site and try again.";
      return true;
    }
    if (Array.isArray(data.notifications) && data.notifications.length) {
      sessionStorage.setItem("edgewaterStaffNotifications", JSON.stringify(data.notifications));
    }
    window.location.href = data.redirect || (data.mustChangePassword ? "/change-password" : "/portal");
    return true;
  }

  if (!reclaimExistingUser && data.staffSessionLimit && data.canReclaimExistingUser) {
    const staffName = data.staffName || data.username || "this staff user";
    const proceed = window.confirm(
      `${staffName} already has an active login. If this is you, click OK to close the old login and continue.`,
    );
    if (proceed) {
      return tryStaffLogin(loginName, password, true);
    }
    registeredCustomerLoginError.textContent = data.error || "Staff login was not completed.";
    return true;
  }

  if (data.staffSessionLimit) {
    registeredCustomerLoginError.textContent = data.error || "Staff login was not completed.";
    return true;
  }

  if (data.setupRequired && data.redirect) {
    window.location.href = data.redirect;
    return true;
  }

  if (data.staffLoginAttempted || data.staffLoginStatus === "bad_password" || data.staffLoginStatus === "disabled") {
    registeredCustomerLoginError.textContent = data.error || "Staff login failed.";
    return true;
  }

  return false;
}

registeredCustomerLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registeredCustomerLoginError.textContent = "";
  const loginName = registeredCustomerLoginForm.elements.registeredLoginName.value.trim();
  const password = registeredCustomerLoginForm.elements.registeredLoginPassword.value;
  if (!loginName) {
    registeredCustomerLoginError.textContent = "Enter a username or email.";
    registeredCustomerLoginForm.elements.registeredLoginName.focus();
    return;
  }

  const staffLoggedIn = await tryStaffLogin(loginName, password);
  if (staffLoggedIn) return;

  if (!isValidEmail(loginName)) {
    registeredCustomerLoginError.textContent = "Staff login was not found. Customers must use a registered email address.";
    registeredCustomerLoginForm.elements.registeredLoginName.focus();
    return;
  }

  const response = await fetch("/api/customer/account/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: loginName,
      password,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) {
    redirectToPortal(data);
    return;
  }

  registeredCustomerLoginError.textContent = data.error || "Customer account login failed.";
});

registeredCustomerLoginForm.addEventListener("reset", () => {
  registeredCustomerLoginError.textContent = "";
  registeredResetForm.classList.add("hidden");
});

registeredForgotPasswordButton.addEventListener("click", () => {
  registeredCustomerLoginError.textContent = "";
  registeredResetForm.classList.toggle("hidden");
  if (!registeredResetForm.classList.contains("hidden")) {
    const loginName = registeredCustomerLoginForm.elements.registeredLoginName.value.trim();
    registeredResetForm.elements.resetEmail.value = isValidEmail(loginName) ? loginName : "";
    registeredResetForm.elements.resetEmail.focus();
  }
});

registeredResetCancelButton.addEventListener("click", () => {
  registeredResetForm.classList.add("hidden");
  registeredCustomerLoginError.textContent = "";
});

registeredResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = registeredResetForm.elements.resetEmail.value.trim();
  if (!isValidEmail(email)) {
    registeredCustomerLoginError.textContent = "Enter the registered email address.";
    registeredResetForm.elements.resetEmail.focus();
    return;
  }

  registeredCustomerLoginError.textContent = "Sending reset request...";
  const response = await fetch("/api/account/password-reset/request", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      lastName: registeredResetForm.elements.resetLastName.value.trim(),
    }),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    registeredCustomerLoginError.textContent = data.error || "Reset request could not be sent.";
    return;
  }

  registeredResetForm.reset();
  registeredResetForm.classList.add("hidden");
  registeredCustomerLoginError.textContent = data.message || data.reason || "If an account exists for that email, a reset link will be sent.";
});

customerLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  customerLoginError.textContent = "";

  const response = await fetch("/api/customer/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lastName: customerLoginForm.elements.contractLookupLastName.value.trim(),
      password: customerLoginForm.elements.contractLookupCode.value.trim(),
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) {
    redirectToPortal(data);
    return;
  }

  customerLoginError.textContent = data.error || "Customer login failed.";
});

customerLoginForm.addEventListener("reset", () => {
  customerLoginError.textContent = "";
});

window.addEventListener("pageshow", () => {
  userEditedEntryField = false;
  window.setTimeout(clearEntryFields, 0);
  redirectIfStaffAlreadyLoggedIn().catch(() => {});
});

redirectIfStaffAlreadyLoggedIn().catch(() => {});
