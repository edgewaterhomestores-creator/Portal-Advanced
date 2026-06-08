const heading = document.querySelector("#customer-limited-heading");
const subtitle = document.querySelector("#customer-limited-subtitle");
const contactForm = document.querySelector("#customer-limited-contact-form");
const contactStatus = document.querySelector("#customer-contact-status");
const contactPopup = document.querySelector("#customer-contact-popup");
const contactPopupMessage = document.querySelector("#customer-contact-popup-message");
const contactPopupClose = document.querySelector("#customer-contact-popup-close");

function showContactMessage(message, type = "info") {
  contactStatus.textContent = message;
  contactPopupMessage.textContent = message;
  contactPopup.classList.remove("hidden", "form-popup-success", "form-popup-error");
  if (type === "success") contactPopup.classList.add("form-popup-success");
  if (type === "error") contactPopup.classList.add("form-popup-error");
}

function hideContactMessage() {
  contactPopup.classList.add("hidden");
}

async function loadCustomerSession() {
  try {
    const response = await fetch("/api/customer/session");
    const data = await readJsonResponse(response);
    if (!response.ok || !data.authenticated) {
      window.location.href = "/";
      return;
    }
    const name = data.customer?.name || "Customer";
    heading.textContent = name;
    subtitle.textContent = "Your document access is active for this browser session.";
  } catch (error) {
    showContactMessage(error.message || "Could not load customer session.", "error");
  }
}

contactPopupClose.addEventListener("click", hideContactMessage);

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideContactMessage();
  const formData = new FormData(contactForm);
  const message = String(formData.get("message") || "").trim();
  const bestTime = String(formData.get("bestTime") || "").trim();
  const preferredContact = String(formData.get("preferredContact") || "").trim();

  if (!message) {
    showContactMessage("Enter a message before sending.", "error");
    contactForm.elements.message.focus();
    return;
  }

  const fullMessage = [
    message,
    bestTime ? `Best time: ${bestTime}` : "",
  ].filter(Boolean).join("\n\n");

  contactForm.querySelector("button[type='submit']").disabled = true;
  showContactMessage("Sending message...");
  try {
    const response = await fetch("/api/customer/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "customerQuestion",
        preferredContact,
        message: fullMessage,
      }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Message could not be sent.");
    const note = data.sent
      ? "Message sent to Edgewater Cabinet Store."
      : data.reason || "Message saved, but email is not configured on this server.";
    showContactMessage(note, data.sent ? "success" : "info");
    contactForm.reset();
  } catch (error) {
    showContactMessage(error.message, "error");
  } finally {
    contactForm.querySelector("button[type='submit']").disabled = false;
  }
});

loadCustomerSession();
