const resetPasswordForm = document.querySelector("#reset-password-form");
const resetPasswordStatus = document.querySelector("#reset-password-status");

function resetToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

const token = resetToken();
if (!token) {
  resetPasswordForm?.classList.add("hidden");
  resetPasswordStatus.textContent = "Password reset link is missing or expired.";
}

resetPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetPasswordStatus.textContent = "";

  const newPassword = resetPasswordForm.elements.newPassword.value;
  const confirmPassword = resetPasswordForm.elements.confirmPassword.value;
  if (newPassword !== confirmPassword) {
    resetPasswordStatus.textContent = "New passwords do not match.";
    return;
  }

  const response = await fetch("/api/account/password-reset/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    resetPasswordStatus.textContent = data.error || "Password could not be changed.";
    return;
  }

  resetPasswordForm.reset();
  resetPasswordForm.classList.add("hidden");
  const destination = data.redirect || "/";
  resetPasswordStatus.classList.remove("error");
  resetPasswordStatus.classList.add("status-list");
  resetPasswordStatus.innerHTML = `Password changed. <a href="${destination}">Log in</a>.`;
});
