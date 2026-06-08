const setupStatus = document.querySelector("#setup-status");
const firstRunForm = document.querySelector("#first-run-form");
const setupLogoPreviewWrap = document.querySelector("#setup-logo-preview-wrap");
const setupLogoPreview = document.querySelector("#setup-logo-preview");

let pendingLogoObjectUrl = "";
let zipLookupPromise = null;
let zipLookupMap = null;

const zipLookupUrl = "/estimates-module/USZIPCodes202602.csv";

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "").replace(/^1+/, "").slice(0, 10);
}

function formatPhoneDigits(digits) {
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatPhoneInput(input) {
  input.value = formatPhoneDigits(phoneDigits(input.value));
}

function zipDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function normalizeState(value) {
  return String(value || "").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function zipHeaderKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCaseCity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

async function loadZipLookupMap() {
  if (zipLookupMap) return zipLookupMap;
  if (zipLookupPromise) return zipLookupPromise;

  zipLookupPromise = fetch(zipLookupUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`ZIP lookup unavailable: ${response.status}`);
      return response.text();
    })
    .then((csv) => {
      const lines = csv.split(/\r?\n/).filter((line) => line.trim());
      const header = splitCsvLine(lines.shift() || "").map(zipHeaderKey);
      const indexFor = (names, fallback) => {
        const index = header.findIndex((key) => names.includes(key));
        return index >= 0 ? index : fallback;
      };
      const zipIndex = indexFor(["zipcode", "zip", "postalcode"], 0);
      const cityIndex = indexFor(["city", "place", "placename"], 1);
      const stateIndex = indexFor(["state", "stateabbr", "statecode"], 3);
      const map = new Map();

      lines.forEach((line) => {
        const cells = splitCsvLine(line);
        const zip = zipDigits(cells[zipIndex]);
        const city = titleCaseCity(cells[cityIndex]);
        const state = normalizeState(cells[stateIndex]);
        if (zip && city && state && !map.has(zip)) {
          map.set(zip, { city, state });
        }
      });

      zipLookupMap = map;
      return map;
    })
    .catch(() => {
      zipLookupMap = new Map();
      return zipLookupMap;
    });

  return zipLookupPromise;
}

async function autofillSetupCityState({ overwrite = true } = {}) {
  const zipInput = firstRunForm.elements.addressZip;
  const cityInput = firstRunForm.elements.addressCity;
  const stateInput = firstRunForm.elements.addressState;
  if (!zipInput || !cityInput || !stateInput) return;

  const zip = zipDigits(zipInput.value);
  zipInput.value = zip;
  if (zip.length !== 5) return;

  const lookup = await loadZipLookupMap();
  const match = lookup.get(zip);
  if (!match) return;

  if (overwrite || !cityInput.value.trim()) cityInput.value = match.city;
  if (overwrite || !stateInput.value.trim()) stateInput.value = match.state;
}

function bindBusinessPhoneFormatting() {
  const input = firstRunForm.elements.phone;
  if (!input) return;
  input.maxLength = 14;
  input.pattern = "\\(\\d{3}\\) \\d{3}-\\d{4}";
  input.addEventListener("input", () => formatPhoneInput(input));
  input.addEventListener("blur", () => formatPhoneInput(input));
}

function revokePendingLogoObjectUrl() {
  if (!pendingLogoObjectUrl) return;
  URL.revokeObjectURL(pendingLogoObjectUrl);
  pendingLogoObjectUrl = "";
}

function renderLogoPreview(src) {
  if (!setupLogoPreviewWrap || !setupLogoPreview) return;
  if (!src) {
    setupLogoPreviewWrap.classList.add("hidden");
    setupLogoPreview.removeAttribute("src");
    return;
  }

  setupLogoPreview.src = src;
  setupLogoPreviewWrap.classList.remove("hidden");
}

function bindLogoPreview() {
  const input = firstRunForm.elements.logoFile;
  if (!input) return;
  input.addEventListener("change", () => {
    revokePendingLogoObjectUrl();
    const file = input.files[0];
    if (!file) {
      renderLogoPreview("");
      return;
    }

    pendingLogoObjectUrl = URL.createObjectURL(file);
    renderLogoPreview(pendingLogoObjectUrl);
  });
}

function bindBusinessZipLookup() {
  const input = firstRunForm.elements.addressZip;
  if (!input) return;
  input.maxLength = 5;
  input.inputMode = "numeric";
  input.addEventListener("input", () => {
    input.value = zipDigits(input.value);
    autofillSetupCityState({ overwrite: true });
  });
  input.addEventListener("blur", () => autofillSetupCityState({ overwrite: true }));
}

function validateBusinessPhone() {
  const input = firstRunForm.elements.phone;
  if (!input?.value.trim()) return true;
  if (phoneDigits(input.value).length === 10) {
    formatPhoneInput(input);
    return true;
  }
  input.focus();
  showSetupStatus("Business phone must be 10 digits and cannot start with 1.", true);
  return false;
}

function formatBusinessAddress() {
  const form = firstRunForm.elements;
  const street = form.addressStreet.value.trim();
  const city = form.addressCity.value.trim();
  const state = form.addressState.value.trim().toUpperCase();
  const zip = form.addressZip.value.trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, cityLine].filter(Boolean).join("\n");
}

function showSetupStatus(message, isError = false) {
  setupStatus.innerHTML = `<p class="${isError ? "error" : ""}">${message}</p>`;
  setupStatus.classList.remove("hidden");
}

function fileToDataUrl(file) {
  if (!file) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadSetupStatus() {
  const response = await fetch("/api/setup/status");
  const status = await readJsonResponse(response);

  if (!status.setupRequired) {
    firstRunForm.classList.add("hidden");
    showSetupStatus("Setup is already complete. Use the staff login page.");
    return;
  }

  if (!status.databaseConfigured) {
    showSetupStatus("PostgreSQL is not configured yet. The portal can start in file mode, but shared live use should use DATABASE_URL.", true);
    return;
  }

  if (!status.schemaReady) {
    showSetupStatus(`PostgreSQL is configured but the schema is not ready: ${status.schemaError || "check DATABASE_URL"}`, true);
    return;
  }

  showSetupStatus("Database is connected. Complete this page to create the first store admin.");
}

firstRunForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateBusinessPhone()) return;
  showSetupStatus("Saving first-run setup...");

  const form = firstRunForm.elements;
  const logoDataUrl = await fileToDataUrl(form.logoFile.files[0]).catch(() => "");
  const response = await fetch("/api/setup/first-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business: {
        businessName: form.businessName.value,
        phone: form.phone.value,
        email: form.email.value,
        website: form.website.value,
        address: formatBusinessAddress(),
        salesTaxRate: form.salesTaxRate.value,
        logoDataUrl,
      },
      admin: {
        name: form.adminName.value,
        title: form.adminTitle.value,
        username: form.adminUsername.value,
        password: form.adminPassword.value,
        confirmPassword: form.adminConfirmPassword.value,
      },
    }),
  });

  const data = await readJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    showSetupStatus(data.error || "Could not finish setup.", true);
    return;
  }

  revokePendingLogoObjectUrl();
  window.location.href = data.redirect || "/admin?setup=1";
});

bindBusinessPhoneFormatting();
bindBusinessZipLookup();
bindLogoPreview();
loadSetupStatus().catch((error) => {
  showSetupStatus(error.message || "Could not read setup status.", true);
});
