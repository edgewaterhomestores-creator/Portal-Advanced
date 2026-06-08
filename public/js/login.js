const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginDestination = document.querySelector("#login-destination");
const staffForgotPasswordButton = document.querySelector("#staff-forgot-password");
const staffResetForm = document.querySelector("#staff-reset-form");
const staffResetCancelButton = document.querySelector("#staff-reset-cancel");
const clearOnLoadInputs = document.querySelectorAll("[data-clear-on-load]");
let userEditedLoginField = false;

function clearLoginFields() {
  if (userEditedLoginField) return;
  loginForm.reset();
  clearOnLoadInputs.forEach((input) => {
    input.value = "";
    input.defaultValue = "";
  });
}

clearOnLoadInputs.forEach((input) => {
  input.addEventListener("input", () => {
    userEditedLoginField = true;
  }, { once: true });
});

[0, 50, 250, 750].forEach((delay) => {
  window.setTimeout(clearLoginFields, delay);
});

function requestedStaffPage() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "";
}

function staffPageLabel(path) {
  if (path === "/installer-photos") return "Installer Photos";
  if (path === "/documents") return "Document Inbox";
  if (path === "/admin") return "Admin Menu";
  if (path === "/contracts") return "View Contracts";
  if (path.startsWith("/estimates")) return "Estimate Entry";
  if (path.startsWith("/contract/") || path === "/contract/new") return "Contract";
  return "";
}

function showLoginDestination() {
  const label = staffPageLabel(requestedStaffPage());
  if (!loginDestination || !label) return;
  loginDestination.textContent = `Log in to continue to ${label}.`;
  loginDestination.classList.remove("hidden");
}

async function redirectToSetupWhenNeeded() {
  const response = await fetch("/api/setup/status");
  if (!response.ok) return;
  const status = await readJsonResponse(response);
  if (status.setupRequired) {
    window.location.href = "/setup";
  }
}

window.addEventListener("pageshow", () => {
  userEditedLoginField = false;
  window.setTimeout(clearLoginFields, 0);
});

redirectToSetupWhenNeeded().catch(() => null);
showLoginDestination();

async function submitStaffLogin(reclaimExistingUser = false) {
  loginError.textContent = "";

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: loginForm.elements.staffLoginName.value.trim(),
      password: loginForm.elements.staffLoginSecret.value,
      next: requestedStaffPage(),
      reclaimExistingUser,
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) {
    if (Array.isArray(data.notifications) && data.notifications.length) {
      sessionStorage.setItem("edgewaterStaffNotifications", JSON.stringify(data.notifications));
    }
    window.location.href = data.redirect || (data.mustChangePassword ? "/change-password" : "/portal");
    return;
  }

  if (data.setupRequired && data.redirect) {
    window.location.href = data.redirect;
    return;
  }

  if (!reclaimExistingUser && data.staffSessionLimit && data.canReclaimExistingUser) {
    const staffName = data.staffName || data.username || "this staff user";
    const proceed = window.confirm(
      `${staffName} already has an active login. If this is you, click OK to close the old login and continue.`,
    );
    if (proceed) {
      await submitStaffLogin(true);
      return;
    }
  }

  loginError.textContent = data.error || "Login failed.";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitStaffLogin(false);
});

staffForgotPasswordButton?.addEventListener("click", () => {
  loginError.textContent = "";
  staffResetForm?.classList.toggle("hidden");
  if (staffResetForm && !staffResetForm.classList.contains("hidden")) {
    const loginName = loginForm.elements.staffLoginName.value.trim();
    staffResetForm.elements.resetEmail.value = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginName) ? loginName : "";
    staffResetForm.elements.resetEmail.focus();
  }
});

staffResetCancelButton?.addEventListener("click", () => {
  staffResetForm?.classList.add("hidden");
  loginError.textContent = "";
});

staffResetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = staffResetForm.elements.resetEmail.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    loginError.textContent = "Enter the email address saved on the account.";
    staffResetForm.elements.resetEmail.focus();
    return;
  }

  const response = await fetch("/api/account/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    loginError.textContent = data.error || "Could not send reset link.";
    return;
  }
  staffResetForm.reset();
  staffResetForm.classList.add("hidden");
  loginError.textContent = data.message || data.reason || "If an account exists for that email, a reset link will be sent.";
});
