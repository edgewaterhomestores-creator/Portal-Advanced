(function () {
  let nextToggleId = 1;

  function initPasswordToggles(root = document) {
    const inputs = [];
    if (root.matches?.('input[type="password"], input[data-secret-toggle]')) {
      inputs.push(root);
    }
    root.querySelectorAll?.('input[type="password"], input[data-secret-toggle]').forEach((input) => {
      inputs.push(input);
    });

    inputs.forEach((input) => {
      if (input.dataset.passwordToggleReady === "true") return;
      input.dataset.passwordToggleReady = "true";
      const usesCssMask = input.matches("[data-secret-toggle]");

      const wrapper = document.createElement("span");
      wrapper.className = "password-toggle-wrap";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "password-toggle";
      button.textContent = "Show";
      button.setAttribute("aria-label", "Show password");

      const inputId = input.id || `password-field-${nextToggleId}`;
      nextToggleId += 1;
      input.id = inputId;
      button.setAttribute("aria-controls", inputId);

      button.addEventListener("click", () => {
        const showing = usesCssMask ? input.classList.contains("secret-visible") : input.type === "text";
        if (usesCssMask) {
          input.classList.toggle("secret-visible", !showing);
        } else {
          input.type = showing ? "password" : "text";
        }
        button.textContent = showing ? "Show" : "Hide";
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        input.focus();
      });

      wrapper.appendChild(button);
    });
  }

  window.initPasswordToggles = initPasswordToggles;

  initPasswordToggles();

  if ("MutationObserver" in window) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            initPasswordToggles(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}());
