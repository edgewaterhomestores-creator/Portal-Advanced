const pageOptions = document.querySelector("#blank-page-options");
const printButton = document.querySelector("#print-selected-pages");
const clearButton = document.querySelector("#clear-selected-pages");
const helpButton = document.querySelector("#print-save-help");
const initialButton = document.querySelector("#blank-pages-initial");
const allButton = document.querySelector("#blank-pages-all");
const statusEl = document.querySelector("#print-pages-status");
const logoutButton = document.querySelector("#logout");

const blankPages = [
  { page: 1, label: "Customer Information Sheet" },
  { page: 2, label: "Quick Measurement Form" },
  { page: 3, label: "Sales Estimate" },
  { page: 4, label: "Florida Legal Disclaimers" },
  { page: 5, label: "Purchase Agreement 1" },
  { page: 6, label: "Purchase Agreement 2" },
  { page: 7, label: "Purchase Agreement 3" },
  { page: 8, label: "Agreement Signatures" },
  { page: 9, label: "Split Payment Addendum" },
  { page: 10, label: "POS Acknowledgements / Receipts" },
  { page: 11, label: "Job Orders to Vendors" },
  { page: 12, label: "Additional Notes" },
  { page: 13, label: "Material / Receiving Lines" },
  { page: 14, label: "Chain-of-Custody Release" },
  { page: 15, label: "Installer Job Agreement" },
  { page: 16, label: "Delivery/Installation Checklist" },
  { page: 17, label: "Delivery Signoff Summary" },
  { page: 18, label: "Customer Pickup Release" },
];
const initialPages = new Set([3, 4, 5, 6, 7, 8]);

function renderPages() {
  pageOptions.innerHTML = blankPages.map((item) => `
    <label>
      <input type="checkbox" name="blankPage" value="${item.page}" ${initialPages.has(item.page) ? "checked" : ""} />
      ${item.label} (template p. ${item.page})
    </label>
  `).join("");
}

function setSelectedPages(pages) {
  const selected = new Set(pages.map(String));
  pageOptions.querySelectorAll('[name="blankPage"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function selectedPages() {
  return [...pageOptions.querySelectorAll('[name="blankPage"]:checked')].map((input) => input.value);
}

printButton.addEventListener("click", () => {
  const pages = selectedPages();
  if (!pages.length) {
    statusEl.textContent = "Select at least one page.";
    return;
  }

  statusEl.textContent = "Opening selected blank pages. Use the browser print button to print or choose Save as PDF.";
  window.open(`/api/template-pages.pdf?pages=${encodeURIComponent(pages.join(","))}`, "_blank", "noopener,noreferrer");
});

helpButton.addEventListener("click", () => {
  statusEl.textContent = "After the PDF opens, press Ctrl+P or use the browser print icon. Choose your printer, or choose Save as PDF.";
});

clearButton.addEventListener("click", () => setSelectedPages([]));
initialButton.addEventListener("click", () => setSelectedPages([...initialPages]));
allButton.addEventListener("click", () => setSelectedPages(blankPages.map((item) => item.page)));

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

renderPages();
