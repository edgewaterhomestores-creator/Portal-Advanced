const changePasswordForm = document.querySelector("#change-password-form");
const changePasswordError = document.querySelector("#change-password-error");

changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  changePasswordError.textContent = "";

  const currentPassword = changePasswordForm.elements.currentPassword.value;
  const newPassword = changePasswordForm.elements.newPassword.value;
  const confirmPassword = changePasswordForm.elements.confirmPassword.value;

  if (newPassword !== confirmPassword) {
    changePasswordError.textContent = "New passwords do not match.";
    return;
  }

  const response = await fetch("/api/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (response.ok) {
    window.location.href = data.redirect || "/portal";
    return;
  }

  changePasswordError.textContent = data.error || "Password could not be changed.";
});
