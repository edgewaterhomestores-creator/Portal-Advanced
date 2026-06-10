(function () {
  if (document.querySelector(".portal-nav")) return;

  const helpContent = [
    {
      match: (path) => path === "/portal",
      title: "Contracts Page Help",
      tips: [
        "Create Contract starts a new packet.",
        "View Contract opens existing records for viewing, sending, printing, or editing.",
        "Print Contract Pages opens blank pages for handwritten signatures or paper files.",
      ],
    },
    {
      match: (path) => path.startsWith("/contract/") || path === "/contract/new",
      title: "Create Contract Help",
      tips: [
        "Start with customer details, then move through the contract sections.",
        "Attach an estimate PDF when one is ready.",
        "Saving someone else's draft asks for confirmation and notifies the owner.",
      ],
    },
    {
      match: (path) => path === "/contracts",
      title: "View Contract Help",
      tips: [
        "Search by customer name, phone, address, invoice, or contract number.",
        "View details shows the password, documents, signatures, and history.",
        "Staff can send links and PDFs even when another staff member owns the draft.",
      ],
    },
    {
      match: (path) => path === "/admin",
      title: "Admin Menu Help",
      tips: [
        "Business details control store name, phone, email, address, and logo.",
        "Staff users can be selected as sales reps and can have saved signatures.",
        "Signature images are optional; printed signatures still work.",
      ],
    },
    {
      match: (path) => path === "/print-pages",
      title: "Print Pages Help",
      tips: [
        "Choose only the blank packet pages needed for the paper file.",
        "Initial contract set selects the common first-signing pages.",
        "All pages selects the full blank packet.",
      ],
    },
    {
      match: (path) => path.startsWith("/estimates"),
      title: "Estimate Entry Help",
      tips: [
        "Search existing estimate records before starting a new estimate.",
        "Save Record keeps the estimate in the portal.",
        "Download / Print creates the customer-facing estimate PDF.",
      ],
    },
    {
      match: (path) => path === "/documents",
      title: "Document Inbox Help",
      tips: [
        "Check Vendor Emails to Attach scans the incoming document queue.",
        "Upload Document adds scanned PDFs or images to the same review list.",
        "OCR suggestions are review-only until staff attaches the document.",
      ],
    },
    {
      match: (path) => path.startsWith("/customer"),
      title: "Customer Portal Help",
      tips: [
        "Customers see contracts that match their last name plus phone or email.",
        "They can open packets, download signed PDFs, and message Edgewater.",
        "First-contract users can create a registered login for future visits.",
      ],
    },
    {
      match: (path) => path.startsWith("/sign/"),
      title: "Signing Help",
      tips: [
        "The customer opens the packet with the store-provided packet password.",
        "They can review step by step or open the full document.",
        "After signing, the portal saves the final signed packet.",
      ],
    },
  ];

  function currentHelp() {
    const path = window.location.pathname;
    return helpContent.find((item) => item.match(path)) || {
      title: "Portal Help",
      tips: [
        "Back and Forward follow browser history.",
        "Home returns to the staff dashboard when logged in, or the portal entry page when logged out.",
        "Logout signs out when the current page has a staff login session.",
      ],
    };
  }

  function openHelp() {
    const help = currentHelp();
    let modal = document.querySelector("#portal-help-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "portal-help-modal";
      modal.className = "portal-help-modal hidden";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `
        <section class="portal-help-card">
          <div class="section-head">
            <h2 id="portal-help-title"></h2>
            <button type="button" class="ghost form-popup-close" data-close-help>Close</button>
          </div>
          <ul class="portal-help-list"></ul>
        </section>
      `;
      document.body.append(modal);
      modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("[data-close-help]")) {
          modal.classList.add("hidden");
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") modal.classList.add("hidden");
      });
    }

    modal.querySelector("#portal-help-title").textContent = help.title;
    modal.querySelector(".portal-help-list").innerHTML = help.tips.map((tip) => `<li>${tip}</li>`).join("");
    modal.classList.remove("hidden");
    modal.querySelector("[data-close-help]").focus();
  }

  function openTips() {
    window.dispatchEvent(new CustomEvent("portal:tips-shown"));
    openHelp();
  }

  function refreshStaffSession() {
    if (document.visibilityState !== "visible") return;
    fetch(`/api/session?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
    }).catch(() => null);
  }

  function pageContext() {
    const path = window.location.pathname;
    if (path === "/") {
      return {
        title: "Contract Portal",
        actions: [
          { href: "/QuickPaidContract.html", label: "Quick Contracts" },
        ],
      };
    }
    if (path === "/login") {
      return {
        title: "Contract Portal",
      };
    }
    if (path === "/change-password") {
      return {
        title: "Change Password",
        actions: [
          { href: "/contracts", label: "Contracts Page" },
        ],
      };
    }
    if (path === "/portal") {
      return {
        title: "Contracts Page",
      };
    }
    if (path === "/documents") {
      return {
        title: "Document Inbox",
        actions: [
          { href: "/contracts", label: "Contracts Page" },
          { href: "/admin?tab=preimport", label: "Admin Tools" },
        ],
      };
    }
    if (path === "/installer-photos") {
      return {
        title: "Installer Photos",
        actions: [
          { href: "/contracts", label: "Contracts Page" },
        ],
      };
    }
    if (path === "/admin") {
      return {
        title: "Admin Menu",
      };
    }
    if (path === "/print-pages") {
      return {
        title: "Print Contract Pages",
      };
    }
    if (path === "/contract/new" || path.startsWith("/contract/")) {
      return {
        title: "Contract Portal",
        actions: [
          { href: "/contracts", label: "Contracts Page" },
        ],
      };
    }
    if (path === "/contracts") {
      return {
        title: "View Contract",
        actions: [
          { href: "/contract/new", label: "Create Contract" },
        ],
      };
    }
    if (path.startsWith("/estimates")) {
      return {
        title: "Estimate Entry",
        actions: [
          { href: "/contracts", label: "Contracts Page" },
        ],
      };
    }
    if (path.startsWith("/customer")) {
      return {
        title: "Customer Portal",
      };
    }
    if (path.startsWith("/sign/")) {
      return {
        title: "Sign Contract",
      };
    }
    return null;
  }

  function isStaffPage() {
    const path = window.location.pathname;
    return !(
      path === "/"
      || path === "/login"
      || path.startsWith("/customer")
      || path.startsWith("/sign/")
    );
  }

  function brandInitials(value) {
    if (/edgewater\s+cabinet\s+store/i.test(String(value || ""))) return "EWCS";
    const words = String(value || "")
      .replace(/\b(llc|inc|corp|co|company)\b/gi, "")
      .match(/[a-z0-9]+/gi) || [];
    return words.slice(0, 3).map((word) => word[0].toUpperCase()).join("") || "CP";
  }

  async function loadNavLogo() {
    const logo = nav.querySelector("[data-portal-nav-logo]");
    const fallback = nav.querySelector("[data-portal-nav-fallback]");
    if (!logo) return;

    logo.classList.add("hidden");
    fallback?.classList.add("hidden");

    try {
      const response = await fetch("/api/public-branding");
      if (!response.ok) throw new Error("Branding not available");
      const branding = await readJsonResponse(response);
      const businessName = branding.businessName || "Contract Portal";
      if (branding.logoDataUrl) {
        logo.src = branding.logoDataUrl;
        logo.alt = `${businessName} logo`;
        logo.classList.remove("hidden");
        return;
      }
      if (/edgewater\s+cabinet\s+store/i.test(businessName)) {
        logo.src = "/img/logos/edgewater-original.png";
        logo.alt = `${businessName} logo`;
        logo.classList.remove("hidden");
        return;
      }
      if (fallback) {
        fallback.textContent = brandInitials(businessName);
        fallback.classList.remove("hidden");
      }
    } catch (_error) {
      if (fallback) {
        fallback.textContent = "CP";
        fallback.classList.remove("hidden");
      }
    }
  }

  async function loadVersionLink() {
    const link = nav.querySelector("[data-portal-version]");
    if (!link) return;
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) throw new Error("Version not available");
      const version = await readJsonResponse(response);
      const label = version.packageLabel || (version.commit ? `Commit ${version.commit}` : "");
      if (!label) return;
      link.textContent = label;
      link.title = [
        version.packageLabel ? `Package: ${version.packageLabel}` : "",
        version.commit ? `Commit: ${version.commit}` : "",
        version.builtAt ? `Built: ${version.builtAt}` : "",
      ].filter(Boolean).join("\n") || "Open version details";
      link.classList.remove("hidden");
    } catch (_error) {
      link.classList.add("hidden");
    }
  }

  const context = pageContext();
  const staffPage = isStaffPage();
  const path = window.location.pathname;
  const exitId = staffPage ? 'id="logout"' : window.location.pathname.startsWith("/customer") ? 'id="customer-logout"' : "";
  const exitLabel = staffPage ? "Logout" : "Exit";
  const nav = document.createElement("nav");
  nav.className = `portal-nav${path === "/admin" ? " portal-nav-admin-active" : ""}`;
  nav.setAttribute("aria-label", "Portal navigation");
  const homeHref = staffPage ? "/portal" : (path.startsWith("/customer") || path.startsWith("/sign/") ? "/customer" : "/");
  nav.innerHTML = `
    <div class="portal-nav-left">
      <a class="portal-nav-logo-link" href="${homeHref}" aria-label="Portal home" data-portal-home-link>
        <img class="portal-nav-logo hidden" data-portal-nav-logo alt="Business logo" />
        <span class="portal-nav-brand-fallback hidden" data-portal-nav-fallback>CP</span>
      </a>
      <div class="portal-nav-controls">
        <button type="button" class="ghost portal-back-button" data-portal-back>Back</button>
        <button type="button" class="ghost" data-portal-forward>Forward</button>
        <a class="button-link" href="${homeHref}" data-portal-home-link>Home</a>
        <a class="button-link hidden" href="/portal" data-store-functions>Store Functions</a>
      </div>
    </div>
    ${context ? `
      <div class="portal-nav-context">
        <strong>${context.title}</strong>
      </div>
    ` : ""}
    <div class="portal-nav-controls portal-nav-right">
      ${context?.actions?.map((action) => `<a class="button-link" href="${action.href}">${action.label}</a>`).join("") || ""}
      ${staffPage ? '<a class="button-link" href="/QuickPaidContract.html">Quick Contracts</a>' : ""}
      ${staffPage ? `<a class="button-link portal-icon-link${path === "/admin" ? " active" : ""}" href="/admin" aria-label="Admin Menu" title="Admin Menu"><span aria-hidden="true">&#9881;</span><span>${path === "/admin" ? "Admin Menu" : "Admin"}</span></a>` : ""}
      ${staffPage ? '<a class="portal-version-link hidden" href="/api/version" target="_blank" rel="noopener" data-portal-version>Version</a>' : ""}
      ${context ? '<button type="button" class="ghost portal-tips-button" data-portal-tips>Show Tips</button>' : ""}
      <button type="button" class="ghost portal-help-button" data-portal-help aria-label="Help">?</button>
      <button type="button" class="ghost" ${exitId} data-portal-exit>${exitLabel}</button>
    </div>
  `;

  document.body.prepend(nav);
  window.dispatchEvent(new CustomEvent("portal:nav-ready", { detail: { nav, staffPage, context, path } }));

  loadNavLogo();
  loadVersionLink();
  if (staffPage) {
    refreshStaffSession();
    window.setInterval(refreshStaffSession, 60000);
    document.addEventListener("visibilitychange", refreshStaffSession);
  }
  if (!staffPage) {
    fetch("/api/session")
      .then((response) => (response.ok ? readJsonResponse(response) : null))
      .then((session) => {
        if (session?.authenticated) {
          nav.querySelectorAll("[data-portal-home-link]").forEach((link) => {
            link.href = "/portal";
          });
          nav.querySelector("[data-store-functions]")?.classList.remove("hidden");
        }
      })
      .catch(() => null);
  }
  nav.querySelector("[data-portal-back]").addEventListener("click", () => window.history.back());
  nav.querySelector("[data-portal-forward]").addEventListener("click", () => window.history.forward());
  nav.querySelector("[data-portal-help]").addEventListener("click", openHelp);
  nav.querySelector("[data-portal-tips]")?.addEventListener("click", openTips);
  window.addEventListener("portal:open-help", openHelp);
  nav.querySelector("[data-portal-exit]").addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const path = window.location.pathname;
    const message = path.startsWith("/customer")
      ? "Exit and log out of the customer portal?"
      : path.startsWith("/sign/")
        ? "Exit signing and return to the portal entry page? If the packet is not finalized, signature progress will be lost."
        : staffPage
          ? "Log out of the staff portal? Unsaved page changes may be lost."
          : "Exit to the portal entry page?";
    if (!window.confirm(message)) return;
    const logoutUrl = path.startsWith("/customer") || path.startsWith("/sign/") ? "/api/customer/logout" : path === "/" ? "" : "/api/logout";
    if (logoutUrl) {
      await fetch(logoutUrl, { method: "POST" }).catch(() => null);
    }
    window.location.href = staffPage ? "https://edgefam.com" : "/";
  });
}());
