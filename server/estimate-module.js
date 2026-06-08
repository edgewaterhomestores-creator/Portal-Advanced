const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

const { databaseConfigured, listEstimateRecords, saveEstimateRecords } = require("./db");
const { listInstallers } = require("./installer-directory");
const { loadSettings } = require("./settings");
const { ESTIMATES_DIR, GENERATED_DIR, ensureDataDirs, sha256File } = require("./storage");
const { listPreimportRecords } = require("./preimport");
const { formatDateDisplay, isValidEmailAddress, normalizeEmailAddress } = require("./validation");
const { publicBaseUrl: securePublicBaseUrl } = require("./public-url");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ESTIMATE_PUBLIC_DIR = path.join(PUBLIC_DIR, "estimates-module");
const ESTIMATE_DATA_DIR = path.join(ROOT, "data", "estimate-module");
const ESTIMATE_TEMP_DIR = path.join(GENERATED_DIR, "estimates");
const ESTIMATE_STORE_PATH = path.join(ESTIMATE_DATA_DIR, "estimates.json");

function estimateLibraryDir() {
  return path.resolve(process.env.ESTIMATES_DIR || ESTIMATES_DIR);
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicBaseUrl(req) {
  return securePublicBaseUrl(req);
}

function makeResponseToken() {
  return crypto.randomBytes(24).toString("hex");
}

function safeResponseToken(value) {
  return clean(value).replace(/[^a-f0-9]/gi, "").slice(0, 64);
}

function estimateNumberFallback(dateValue = new Date()) {
  const year = new Date(dateValue).getFullYear();
  const yearCode = Number.isFinite(year) ? Math.max(0, year - 2020) : Math.max(0, new Date().getFullYear() - 2020);
  return `ES${yearCode}05001`;
}

function cleanItemLabel(label) {
  return clean(label)
    .replace(/\s+\((?:T|NT)\)$/i, "")
    .replace(/\s+(?:Taxable|Non[-\s]?Taxable)$/i, "")
    .trim();
}

function addressDisplayLines(value) {
  const text = clean(value).replace(/\r/g, "");
  if (!text) return [];
  const normalizeCityLine = (line) => clean(line).replace(/\s+([A-Z]{2}\s+\d{5}(?:-\d{4})?)$/i, ", $1");
  const hardLines = text.split("\n").map(clean).filter(Boolean);
  if (hardLines.length > 1) return [hardLines[0], normalizeCityLine(hardLines.slice(1).join(" "))];

  const cityPattern = "([A-Z][A-Za-z .'-]+,?\\s+[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)";
  const commaCityMatch = text.match(new RegExp(`^(.+?),\\s*${cityPattern}$`, "i"));
  if (commaCityMatch) return [clean(commaCityMatch[1]), normalizeCityLine(commaCityMatch[2])];

  const suffixes = "Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Circle|Cir|Place|Pl|Trail|Trl|Parkway|Pkwy|Way";
  const cityStateMatch = text.match(new RegExp(`^(.+\\b(?:${suffixes})\\.?)\\s+${cityPattern}$`, "i"));
  if (cityStateMatch) return [clean(cityStateMatch[1]), normalizeCityLine(cityStateMatch[2])];

  const smashedCityMatch = text.match(new RegExp(`^(.+\\b(?:${suffixes})\\.?)([A-Z][A-Za-z .'-]+,?\\s+[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)$`));
  if (smashedCityMatch) return [clean(smashedCityMatch[1]), normalizeCityLine(smashedCityMatch[2])];

  return [text];
}

function cityStateZip(city, state, zip) {
  return [
    clean(city),
    [clean(state), clean(zip)].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function splitAddressParts(value) {
  const lines = addressDisplayLines(value);
  const street = lines[0] || "";
  const cityLine = lines.slice(1).join(" ");
  const match = cityLine.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  return {
    street,
    city: match ? clean(match[1].replace(/,$/, "")) : "",
    state: match ? match[2].toUpperCase() : "",
    zip: match ? match[3] : "",
  };
}

function customerAddressFromParts(parts = {}) {
  const street = clean(parts.street);
  const cityLine = cityStateZip(parts.city, clean(parts.state).toUpperCase(), parts.zip);
  return [street, cityLine].filter(Boolean).join("\n");
}

function customerAddressPartsFromEstimate(estimate = {}) {
  const parsed = splitAddressParts(estimate.customerAddress);
  return {
    street: clean(estimate.customerStreet || parsed.street),
    city: clean(estimate.customerCity || parsed.city),
    state: clean(estimate.customerState || parsed.state).toUpperCase(),
    zip: clean(estimate.customerZip || parsed.zip),
  };
}

function customerAddressDisplayLines(data = {}) {
  const parts = customerAddressPartsFromEstimate(data);
  return [parts.street, cityStateZip(parts.city, parts.state, parts.zip)].filter(Boolean);
}

function boolSetting(name, fallback = false) {
  const value = String(process.env[name] || (fallback ? "true" : "false")).toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function numberValue(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function salesTaxRate(value) {
  const parsed = numberValue(String(value || "").replace(/%/g, ""));
  return parsed >= 0 ? parsed : 6.5;
}

function lookupSaveChoice(item = {}) {
  if (!Object.prototype.hasOwnProperty.call(item, "saveForLookup")) return undefined;
  return item.saveForLookup === true;
}

function normalizeItems(items, fallback = [], taxableFallback = false) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback;
  return source
    .map((item) => ({
      label: cleanItemLabel(item.label || item.name),
      amount: numberValue(item.amount),
      taxable: Object.prototype.hasOwnProperty.call(item, "taxable") ? Boolean(item.taxable) : Boolean(taxableFallback),
      cabinetCount: clean(item.cabinetCount),
      unitPrice: numberValue(item.unitPrice),
      vendorListPrice: clean(item.vendorListPrice || item.listPrice),
      unitCost: clean(item.unitCost),
      costMultiplier: clean(item.costMultiplier),
      discountPercent: clean(item.discountPercent),
      markupPercent: clean(item.markupPercent),
      productCode: clean(item.productCode),
      itemType: clean(item.itemType || item.category),
      itemDescription: clean(item.itemDescription || item.description),
      productSupplier: clean(item.productSupplier || item.supplier),
      lookupSource: clean(item.lookupSource),
      saveForLookup: lookupSaveChoice(item),
      sourceDocumentId: clean(item.sourceDocumentId),
      sourceQuoteNumber: clean(item.sourceQuoteNumber),
    }))
    .filter((item) => item.label || item.amount > 0);
}

function installationItemLabel(item) {
  const details = [
    item.cabinetCount ? `${item.cabinetCount} cabinets` : "",
    item.unitPrice > 0 ? `@ $${formatCurrency(item.unitPrice)}` : "",
  ].filter(Boolean).join(" ");
  return details ? `${item.label} - ${details}` : item.label;
}

function legacyCabinetItems(data) {
  return [
    { label: "Cabinets", amount: data.price },
    { label: "Countertops", amount: data.shipping },
    { label: "Other", amount: data.tariffs },
  ];
}

function legacyInstallationItems(data) {
  return [
    { label: "Cabinet Removal", amount: data.cabinetRemoval, cabinetCount: data.numCabinets || "" },
    { label: "Installation", amount: data.installation, cabinetCount: data.numCabinets || "" },
    { label: "Modification", amount: data.modification, cabinetCount: data.numCabinets || "" },
  ];
}

function estimateInstallationItems(data) {
  const fallback = Array.isArray(data.installationItems) ? [] : legacyInstallationItems(data);
  return normalizeItems(data.installationItems, fallback)
    .filter((item) => item.label && (
      numberValue(item.amount) > 0
      || numberValue(item.unitPrice) > 0
      || clean(item.cabinetCount)
    ));
}

function calculateEstimateTotals(data) {
  const cabinetItems = normalizeItems(data.cabinetItems, legacyCabinetItems(data), data.taxable);
  const installationItems = estimateInstallationItems(data);
  const cabinetSubtotal = cabinetItems.reduce((total, item) => total + numberValue(item.amount), 0);
  const taxableSubtotal = cabinetItems
    .filter((item) => item.taxable)
    .reduce((total, item) => total + numberValue(item.amount), 0);
  const taxRate = salesTaxRate(data.salesTaxRate);
  const salesTax = taxableSubtotal * (taxRate / 100);
  const cabinetTotal = cabinetSubtotal + salesTax;
  const installationTotal = installationItems.reduce((total, item) => total + numberValue(item.amount), 0);
  return {
    cabinetSubtotal,
    taxableSubtotal,
    salesTaxRate: taxRate,
    salesTax,
    cabinetTotal,
    installationTotal,
    grandTotal: cabinetTotal + installationTotal,
  };
}

function validateOfficialEstimate(data) {
  const customerAddress = clean(data.customerAddress) || customerAddressFromParts(customerAddressPartsFromEstimate(data));
  const missing = [
    ["customer", "Customer"],
    ["customerAddress", "Customer Address", customerAddress],
  ].filter(([key, _label, override]) => !clean(override ?? data[key])).map(([, label]) => label);
  const hasCustomerPhone = clean(data.customerPhone).replace(/\D/g, "").replace(/^1+/, "").length === 10;
  const customerEmail = normalizeEmailAddress(data.customerEmail);
  if (!hasCustomerPhone && !customerEmail) missing.push("Customer phone or email");

  if (missing.length) {
    const error = new Error(`Complete required estimate fields: ${missing.join(", ")}.`);
    error.status = 400;
    throw error;
  }
  if (customerEmail && !isValidEmailAddress(customerEmail)) {
    const error = new Error("Enter a valid customer email address.");
    error.status = 400;
    throw error;
  }
}

function formatCurrency(value) {
  return numberValue(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPhoneNumber(phone) {
  const digits = clean(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6, 10)}`;
  }
  return clean(phone);
}

function splitBusinessAddress(address) {
  const lines = clean(address).split(/\r?\n/).map(clean).filter(Boolean);
  const street = lines[0] || "";
  const cityLine = lines.slice(1).join(" ");
  const match = cityLine.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  return {
    address: street,
    city: match ? clean(match[1].replace(/,$/, "")) : "",
    state: match ? match[2].toUpperCase() : "",
    zip: match ? match[3] : "",
  };
}

function estimateSettingsPayload(settings) {
  const parsedAddress = splitBusinessAddress(settings.address);
  return {
    logoPath: settings.logoDataUrl || "/estimates-module/defaultLogo.png",
    businessName: settings.businessName || "Edgewater Cabinet Store, LLC",
    address: parsedAddress.address || "2119 S Ridgewood Ave",
    city: parsedAddress.city || "Edgewater",
    state: parsedAddress.state || "FL",
    zip: parsedAddress.zip || "32141",
    phone: settings.phone || "(386) 444-6800",
    email: settings.email || "edgewatercabinetstore@gmail.com",
    website: settings.website || "https://cabinets.edgewaterhomestores.com",
    salesTaxRate: salesTaxRate(settings.salesTaxRate),
  };
}

async function currentDataResetId() {
  const settings = await loadSettings();
  return clean(settings.dataResetId) || "initial";
}

async function applyBusinessSettings(data) {
  const settings = estimateSettingsPayload(await loadSettings());
  return {
    ...data,
    ...settings,
  };
}

function normalizeEstimateForStorage(data) {
  const now = new Date().toISOString();
  const totals = calculateEstimateTotals(data);
  const cabinetItems = normalizeItems(data.cabinetItems, legacyCabinetItems(data), data.taxable);
  const estimateNumber = clean(data.estimateNumber || data.estimateId) || estimateNumberFallback(data.estimateDate || now);
  const customerAddressParts = customerAddressPartsFromEstimate(data);
  return {
    ...data,
    estimateId: clean(data.estimateId) || estimateNumber,
    estimateNumber,
    createdAt: clean(data.createdAt) || now,
    updatedAt: clean(data.updatedAt) || now,
    customerStreet: customerAddressParts.street,
    customerCity: customerAddressParts.city,
    customerState: customerAddressParts.state,
    customerZip: customerAddressParts.zip,
    customerAddress: customerAddressFromParts(customerAddressParts),
    cabinetItems,
    installationItems: estimateInstallationItems(data),
    taxable: cabinetItems.some((item) => item.taxable),
    salesTaxRate: salesTaxRate(data.salesTaxRate),
    cabinetTotal: totals.cabinetTotal,
    installationTotal: totals.installationTotal,
    grandTotal: totals.grandTotal,
    deleted: Boolean(data.deleted),
  };
}

function normalizeLookupKey(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function customerRecordFromEstimate(estimate) {
  const name = clean(estimate.customer);
  if (!name) return null;
  return {
    key: normalizeLookupKey(name),
    name,
    address: customerAddressFromParts(customerAddressPartsFromEstimate(estimate)),
    phone: clean(estimate.customerPhone),
    email: clean(estimate.customerEmail),
    lastUsedAt: clean(estimate.updatedAt || estimate.createdAt),
  };
}

function mergeCustomer(customers, record) {
  if (!record?.key) return;
  const existing = customers.get(record.key);
  if (!existing || clean(record.lastUsedAt) >= clean(existing.lastUsedAt)) {
    customers.set(record.key, { ...existing, ...record });
  }
}

async function ensureEstimateDataDirs() {
  await ensureDataDirs();
  await fs.mkdir(ESTIMATE_DATA_DIR, { recursive: true });
  await fs.mkdir(ESTIMATE_TEMP_DIR, { recursive: true });
  await fs.mkdir(estimateLibraryDir(), { recursive: true });
}

async function readEstimateStore() {
  await ensureEstimateDataDirs();
  const estimatesById = new Map();
  let dbEstimates = [];
  if (databaseConfigured()) {
    try {
      dbEstimates = await listEstimateRecords() || [];
      dbEstimates.forEach((estimate) => {
        if (estimate?.estimateId) estimatesById.set(estimate.estimateId, estimate);
      });
    } catch (error) {
      console.error(`PostgreSQL estimate list failed: ${error.message}`);
    }
  }

  try {
    const parsed = JSON.parse(await fs.readFile(ESTIMATE_STORE_PATH, "utf8"));
    const fileEstimates = Array.isArray(parsed.estimates) ? parsed.estimates : [];
    fileEstimates.forEach((estimate) => {
      if (!estimate?.estimateId || estimatesById.has(estimate.estimateId)) return;
      estimatesById.set(estimate.estimateId, estimate);
    });
    const estimates = [...estimatesById.values()];
    if (databaseConfigured() && fileEstimates.length) {
      try {
        await saveEstimateRecords(estimates);
      } catch (error) {
        console.error(`PostgreSQL estimate backfill failed: ${error.message}`);
      }
    }
    return {
      estimates,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { estimates: dbEstimates, customers: [] };
  }
}

async function writeEstimateStore(store) {
  await ensureEstimateDataDirs();
  await fs.writeFile(ESTIMATE_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  if (databaseConfigured()) {
    try {
      await saveEstimateRecords(store.estimates || []);
    } catch (error) {
      console.error(`PostgreSQL estimate mirror failed: ${error.message}`);
    }
  }
}

function preserveEstimateResponseFields(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...incoming,
    responseToken: clean(incoming.responseToken || existing.responseToken),
    responseTokenCreatedAt: clean(incoming.responseTokenCreatedAt || existing.responseTokenCreatedAt),
    responseTokenSentTo: clean(incoming.responseTokenSentTo || existing.responseTokenSentTo),
    responseTokenLastSentAt: clean(incoming.responseTokenLastSentAt || existing.responseTokenLastSentAt),
    estimateStatus: clean(existing.estimateStatus) && !clean(incoming.estimateStatus) ? existing.estimateStatus : incoming.estimateStatus,
    acceptedAt: clean(incoming.acceptedAt || existing.acceptedAt),
    acceptedByName: clean(incoming.acceptedByName || existing.acceptedByName),
    declinedAt: clean(incoming.declinedAt || existing.declinedAt),
    declinedByName: clean(incoming.declinedByName || existing.declinedByName),
    declineNotes: clean(incoming.declineNotes || existing.declineNotes),
    estimateResponses: Array.isArray(existing.estimateResponses)
      ? existing.estimateResponses
      : Array.isArray(incoming.estimateResponses)
        ? incoming.estimateResponses
        : [],
    estimateEmailEvents: [
      ...(Array.isArray(existing.estimateEmailEvents) ? existing.estimateEmailEvents : []),
      ...(Array.isArray(incoming.estimateEmailEvents) ? incoming.estimateEmailEvents : []),
    ].slice(-25),
  };
}

function publicEstimateSummary(estimate, token) {
  const totals = calculateEstimateTotals(estimate);
  return {
    estimateId: estimate.estimateId || "",
    estimateNumber: estimate.estimateNumber || estimate.estimateId || "",
    estimateDate: formatDateDisplay(estimate.estimateDate),
    customer: estimate.customer || "",
    customerEmail: estimate.customerEmail || "",
    customerPhone: formatPhoneNumber(estimate.customerPhone),
    customerAddress: customerAddressDisplayLines(estimate).join("\n"),
    grandTotal: totals.grandTotal,
    grandTotalDisplay: `$${formatCurrency(totals.grandTotal)}`,
    status: estimate.estimateStatus || "sent",
    alreadyResponded: ["accepted", "declined"].includes(clean(estimate.estimateStatus)),
    pdfUrl: `/api/estimate-module/public/${encodeURIComponent(token)}/pdf`,
  };
}

async function findEstimateByResponseToken(token) {
  const safeToken = safeResponseToken(token);
  if (!safeToken) return { store: null, estimate: null, index: -1, token: "" };
  const store = await readEstimateStore();
  const index = (store.estimates || []).findIndex((estimate) => (
    !estimate.deleted && safeResponseToken(estimate.responseToken) === safeToken
  ));
  return { store, estimate: index >= 0 ? store.estimates[index] : null, index, token: safeToken };
}

async function recordEstimateResponse(token, body, req) {
  const found = await findEstimateByResponseToken(token);
  const estimate = found.estimate;
  if (!estimate) {
    const error = new Error("Estimate response link was not found.");
    error.status = 404;
    throw error;
  }

  if (["accepted", "declined"].includes(clean(estimate.estimateStatus))) {
    const error = new Error("This estimate already has a customer response. Please contact the store for changes.");
    error.status = 409;
    throw error;
  }

  const action = clean(body?.action).toLowerCase();
  if (!["accept", "decline"].includes(action)) {
    const error = new Error("Choose accept or decline.");
    error.status = 400;
    throw error;
  }

  const typedName = clean(body?.typedName);
  const notes = clean(body?.notes);
  const now = new Date().toISOString();
  if (action === "accept") {
    if (!typedName) {
      const error = new Error("Type your name before accepting the estimate.");
      error.status = 400;
      throw error;
    }
    if (body?.accepted !== true) {
      const error = new Error("Confirm that you reviewed and accept the estimate.");
      error.status = 400;
      throw error;
    }
  }

  const event = {
    action: action === "accept" ? "accepted" : "declined",
    typedName,
    notes,
    respondedAt: now,
    recipientEmail: estimate.responseTokenSentTo || "",
    ip: req.ip,
    userAgent: clean(req.get("user-agent")),
  };

  const updated = {
    ...estimate,
    estimateStatus: event.action,
    updatedAt: now,
    estimateResponses: [...(Array.isArray(estimate.estimateResponses) ? estimate.estimateResponses : []), event],
  };

  if (action === "accept") {
    updated.acceptedAt = now;
    updated.acceptedByName = typedName;
  } else {
    updated.declinedAt = now;
    updated.declinedByName = typedName;
    updated.declineNotes = notes;
  }

  found.store.estimates[found.index] = updated;
  const customers = new Map((found.store.customers || []).map((customer) => [customer.key || normalizeLookupKey(customer.name), customer]));
  found.store.estimates.forEach((item) => mergeCustomer(customers, customerRecordFromEstimate(item)));
  await writeEstimateStore({
    estimates: found.store.estimates.sort((a, b) => clean(b.updatedAt).localeCompare(clean(a.updatedAt))),
    customers: [...customers.values()].sort((a, b) => clean(a.name).localeCompare(clean(b.name))),
  });
  return { estimate: updated, event };
}

async function notifyEstimateResponse(estimate, event) {
  const smtp = loadSmtpSettings();
  if (!smtp.host || !smtp.auth.user || !smtp.auth.pass || !smtp.notificationEmail) return;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });
  await transporter.sendMail({
    from: smtp.from,
    to: smtp.notificationEmail,
    subject: `Estimate ${event.action} - ${estimate.estimateNumber || estimate.estimateId || "Estimate"}`,
    html: `
      <h2>Estimate Response</h2>
      <p><strong>Status:</strong> ${escapeHtml(event.action)}</p>
      <p><strong>Estimate:</strong> ${escapeHtml(estimate.estimateNumber || estimate.estimateId)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(estimate.customer)}</p>
      <p><strong>Typed name:</strong> ${escapeHtml(event.typedName || "Not provided")}</p>
      ${event.notes ? `<p><strong>Notes:</strong> ${escapeHtml(event.notes)}</p>` : ""}
      <p><strong>Responded:</strong> ${escapeHtml(event.respondedAt)}</p>
    `,
  });
}

function storeEntities(estimates) {
  const map = new Map();
  estimates.filter((estimate) => !estimate.deleted).forEach((estimate) => {
    [
      ["customer", estimate.customer],
      ["supplier", estimate.supplier],
      ["installer", estimate.installer],
    ].forEach(([type, name]) => {
      const key = `${type}:${normalizeLookupKey(name)}`;
      if (!clean(name)) return;
      map.set(key, { type, name: clean(name), lastUsedAt: clean(estimate.updatedAt || estimate.createdAt) });
    });
  });
  return [...map.values()].sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
}

function resolveLogoSource(logoPath) {
  const logo = clean(logoPath);
  const match = logo.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (match) return Buffer.from(match[1], "base64");
  if (!logo || logo === "/defaultLogo.png" || logo === "defaultLogo.png" || logo === "/estimates-module/defaultLogo.png") {
    return path.join(ESTIMATE_PUBLIC_DIR, "defaultLogo.png");
  }
  return null;
}

function ensurePdfSpace(doc, yPosition, neededHeight) {
  const bottom = doc.page.height - 70;
  if (yPosition + neededHeight <= bottom) return yPosition;
  doc.addPage();
  return 50;
}

function drawAmountLine(doc, labelX, valueX, dollarX, yPosition, label, amount, options = {}) {
  const font = options.bold ? "Helvetica-Bold" : "Helvetica";
  doc.fontSize(options.fontSize || 10).font(font).fillColor("#000000");
  doc.text(label, labelX, yPosition, { width: valueX - labelX - 20 });
  doc.text("$", dollarX, yPosition);
  doc.text(formatCurrency(amount), valueX, yPosition, { width: 90, align: "right" });
  if (options.taxCode) {
    doc.fontSize(7).font("Helvetica").text(options.taxCode, valueX + 94, yPosition + 2, { width: 22, align: "left" });
  }
}

function drawSectionHeader(doc, yPosition, leftMargin, rightMargin, pageWidth, title) {
  yPosition = ensurePdfSpace(doc, yPosition, 55);
  doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
  yPosition += 10;
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text(title, leftMargin, yPosition, { width: pageWidth, align: "center" });
  yPosition += 20;
  doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
  return yPosition + 15;
}

function generateEstimatePDF(doc, data) {
  const pageWidth = doc.page.width - 100;
  const leftMargin = 50;
  const rightMargin = 550;
  const labelX = leftMargin;
  const valueX = rightMargin - 90;
  const dollarX = valueX - 15;
  const totals = calculateEstimateTotals(data);
  let yPosition = 50;

  const logoSource = resolveLogoSource(data.logoPath);
  let logoRendered = false;
  if (logoSource) {
    try {
      if (Buffer.isBuffer(logoSource) || fsSync.existsSync(logoSource)) {
        doc.image(logoSource, leftMargin, yPosition, { width: 100, fit: [100, 90] });
        logoRendered = true;
      }
    } catch (_error) {
      logoRendered = false;
    }
  }

  const headerTextX = logoRendered ? leftMargin + 120 : leftMargin;
  const headerWidth = rightMargin - headerTextX - 110;
  doc.fontSize(12).font("Helvetica-Bold").text(data.businessName || "Edgewater Cabinet Store, LLC", headerTextX, yPosition, { width: headerWidth });

  let contactY = yPosition + 16;
  const addressLine = [data.address, cityStateZip(data.city, data.state, data.zip)].filter(Boolean).join("\n");
  if (addressLine) {
    doc.fontSize(8.5).font("Helvetica").text(addressLine, headerTextX, contactY, { width: headerWidth });
    contactY += addressLine.includes("\n") ? 24 : 12;
  }
  if (data.phone) {
    doc.text(`Phone: ${formatPhoneNumber(data.phone)}`, headerTextX, contactY, { width: headerWidth });
    contactY += 12;
  }
  if (data.email) {
    doc.text(data.email, headerTextX, contactY, { width: headerWidth });
    contactY += 12;
  }
  if (data.website) {
    doc.text(data.website, headerTextX, contactY, { width: headerWidth });
    contactY += 12;
  }

  doc.fontSize(20).font("Helvetica-Bold").text("ESTIMATE", rightMargin - 120, yPosition + 14, { width: 120, align: "right" });
  if (data.estimateNumber) {
    doc.fontSize(10).font("Helvetica-Bold").text(data.estimateNumber, rightMargin - 120, yPosition + 37, { width: 120, align: "right" });
  }
  doc.fontSize(9).font("Helvetica").text(formatDateDisplay(data.estimateDate), rightMargin - 120, yPosition + (data.estimateNumber ? 52 : 40), { width: 120, align: "right" });
  yPosition = Math.max(yPosition + 105, contactY + 10);

  doc.fontSize(10).font("Helvetica");
  const customerLines = [
    data.customer ? `Customer: ${data.customer}` : "",
    data.customerEmail ? `Email: ${data.customerEmail}` : "",
    data.customerPhone ? `Phone: ${formatPhoneNumber(data.customerPhone)}` : "",
  ].filter(Boolean);
  const addressLines = customerAddressDisplayLines(data);
  const customerBlockHeight = Math.max(30, customerLines.length * 12 + 12, addressLines.length * 12 + 12);
  doc.save()
    .rect(leftMargin - 5, yPosition - 6, rightMargin - leftMargin + 5, customerBlockHeight)
    .fill("#E8F4F8")
    .restore();
  doc.fillColor("#000000");
  customerLines.forEach((line, index) => {
    doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica")
      .text(line, leftMargin, yPosition + (index * 12), { width: pageWidth - 190 });
  });
  addressLines.forEach((line, index) => {
    doc.font("Helvetica").text(line, rightMargin - 180, yPosition + (index * 12), { width: 180, align: "right" });
  });
  yPosition += customerBlockHeight + 4;

  yPosition = drawSectionHeader(doc, yPosition, leftMargin, rightMargin, pageWidth, "CABINETS / COUNTERTOPS");

  doc.fontSize(9).font("Helvetica");
  if (data.supplier || data.styleDescription) {
    if (data.supplier) doc.text(`Supplier: ${data.supplier}`, leftMargin, yPosition, { width: 180 });
    if (data.styleDescription) {
      doc.text(`Style/Description: ${data.styleDescription}`, leftMargin + 190, yPosition, { width: rightMargin - leftMargin - 190, align: "right" });
    }
    yPosition += 24;
  }

  normalizeItems(data.cabinetItems, legacyCabinetItems(data), data.taxable).forEach((item) => {
    yPosition = ensurePdfSpace(doc, yPosition, 18);
    drawAmountLine(doc, labelX, valueX, dollarX, yPosition, item.label, item.amount, { taxCode: item.taxable ? "T" : "NT" });
    yPosition += 18;
  });

  doc.moveTo(labelX, yPosition).lineTo(rightMargin, yPosition).stroke();
  yPosition += 8;
  drawAmountLine(doc, labelX, valueX, dollarX, yPosition, "Subtotal:", totals.cabinetSubtotal, { bold: true });
  yPosition += 16;
  drawAmountLine(doc, labelX, valueX, dollarX, yPosition, "Sales Tax:", totals.salesTax);
  yPosition += 18;

  doc.moveTo(labelX, yPosition).lineTo(rightMargin, yPosition).stroke();
  yPosition += 2;
  doc.rect(labelX - 5, yPosition, rightMargin - labelX + 5, 16).fill("#E8F4F8");
  drawAmountLine(doc, labelX, valueX, dollarX, yPosition + 2, "Total:", totals.cabinetTotal, { bold: true, fontSize: 12 });
  yPosition += 25;

  const installationItems = estimateInstallationItems(data);
  if (installationItems.length || data.installer) {
    yPosition = drawSectionHeader(doc, yPosition, leftMargin, rightMargin, pageWidth, "INSTALLATION");

    doc.fontSize(10).font("Helvetica");
    if (data.installer) {
      doc.text(`Installer: ${data.installer}`, leftMargin, yPosition);
      yPosition += 18;
    }

    installationItems.forEach((item) => {
      yPosition = ensurePdfSpace(doc, yPosition, 18);
      drawAmountLine(doc, labelX, valueX, dollarX, yPosition, installationItemLabel(item), item.amount);
      yPosition += 18;
    });

    if (installationItems.length) {
      doc.moveTo(labelX, yPosition).lineTo(rightMargin, yPosition).stroke();
      yPosition += 2;
      doc.rect(labelX - 5, yPosition, rightMargin - labelX + 5, 16).fill("#E8F4F8");
      drawAmountLine(doc, labelX, valueX, dollarX, yPosition + 2, "Licensed & Insured Independent Installer Subtotal:", totals.installationTotal, { bold: true, fontSize: 12 });
      yPosition += 22;

      doc.fontSize(8).font("Helvetica-Oblique").fillColor("#000000")
        .text("* Installation work is performed by a licensed & insured independent installer unless special arrangements are made.",
          leftMargin, yPosition, { width: pageWidth, align: "left" });
      yPosition += 28;
    }
  }

  yPosition = ensurePdfSpace(doc, yPosition, 32);
  doc.rect(labelX - 5, yPosition, rightMargin - labelX + 5, 18).fill("#E8F4F8");
  drawAmountLine(doc, labelX, valueX, dollarX, yPosition + 3, "ESTIMATED COMBINED TOTAL (subject to change):", totals.grandTotal, { bold: true, fontSize: 12 });
  yPosition += 28;

  if (data.notes) {
    yPosition = ensurePdfSpace(doc, yPosition, 60);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text("NOTES:", leftMargin, yPosition);
    yPosition += 16;
    doc.fontSize(9).font("Helvetica").text(data.notes, leftMargin, yPosition, { width: pageWidth });
  }

  const footerY = doc.page.height - 65;
  doc.fontSize(8).font("Helvetica").fillColor("#000000");
  const footerText = [
    data.businessName,
    data.address,
    [data.city, data.state, data.zip].filter(Boolean).join(", "),
  ].filter(Boolean).join(" | ");
  if (footerText) {
    doc.text(footerText, leftMargin, footerY, { width: pageWidth, align: "center" });
  }
}

function loadSmtpSettings() {
  const user = clean(process.env.SMTP_USER);
  return {
    host: clean(process.env.SMTP_HOST || "smtp.hostinger.com"),
    port: Number(process.env.SMTP_PORT || 465),
    secure: boolSetting("SMTP_SECURE", true),
    auth: {
      user,
      pass: clean(process.env.SMTP_PASS || process.env.SMTP_PASSWORD),
    },
    from: clean(process.env.SMTP_FROM) || (user ? `"Edgewater Cabinet Store" <${user}>` : ""),
    notificationEmail: clean(process.env.SMTP_NOTIFICATION_EMAIL || process.env.SMTP_TO || "edgewatercabinetstore@gmail.com"),
    copyEmail: clean(process.env.SMTP_COPY_EMAIL || user),
  };
}

function splitEmailList(value) {
  return clean(value)
    .split(/[,\n;]/)
    .map(normalizeEmailAddress)
    .filter((email, index, list) => email && isValidEmailAddress(email) && list.indexOf(email) === index);
}

async function sendInternalEstimateCopy(transporter, smtp, { pdf, estimateData, recipientEmail, customerName, estimateNumber, formattedDate }) {
  const recipients = splitEmailList(smtp.copyEmail).filter((email) => email !== recipientEmail);
  if (!recipients.length) return { sent: false, reason: "No internal estimate copy recipient configured." };

  await transporter.sendMail({
    from: smtp.from,
    to: recipients,
    subject: `Estimate Copy ${estimateNumber ? `${estimateNumber} ` : ""}- ${customerName}`,
    text: [
      "Estimate copy attached.",
      "",
      `Customer: ${customerName}`,
      `Customer recipient: ${recipientEmail}`,
      `Estimate: ${estimateNumber}`,
      `Estimate date: ${formattedDate}`,
    ].join("\n"),
    html: `
      <p>Estimate copy attached.</p>
      <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
      <p><strong>Customer recipient:</strong> ${escapeHtml(recipientEmail)}</p>
      <p><strong>Estimate:</strong> ${escapeHtml(estimateNumber)}</p>
      <p><strong>Estimate date:</strong> ${escapeHtml(formattedDate)}</p>
    `,
    attachments: [{
      filename: pdf.filename,
      path: pdf.filepath,
    }],
  });

  return { sent: true, to: recipients };
}

function safePdfFilename(filename) {
  const base = path.basename(clean(filename)).replace(/[^a-z0-9._-]/gi, "");
  return base && base.toLowerCase().endsWith(".pdf") ? base : "";
}

function safeFilenamePart(value, fallback = "Customer") {
  const cleaned = clean(value)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return cleaned || fallback;
}

function estimateDateStamp(value) {
  const raw = clean(value);
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}${match[1].padStart(2, "0")}${match[2].padStart(2, "0")}`;
  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}${match[2].padStart(2, "0")}${match[3].padStart(2, "0")}`;
  return raw.replace(/\D/g, "") || new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function estimatePdfFilename(data) {
  const customer = safeFilenamePart(data.customer || "Customer");
  const date = estimateDateStamp(data.estimateDate || formatDateDisplay(new Date()));
  const number = safeFilenamePart(data.estimateNumber || data.estimateId || "Estimate", "Estimate");
  return `${number}-${customer}-${date}.pdf`;
}

async function writeEstimatePdf(data, { library = true } = {}) {
  await ensureEstimateDataDirs();
  const filename = library ? estimatePdfFilename(data) : `estimate-${Date.now()}.pdf`;
  const filepath = path.join(library ? estimateLibraryDir() : ESTIMATE_TEMP_DIR, filename);
  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fsSync.createWriteStream(filepath);
  doc.pipe(writeStream);
  generateEstimatePDF(doc, data);
  doc.end();
  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
  return { filename, filepath, sha256: await sha256File(filepath) };
}

async function saveEstimatePdfMetadata(data, pdf) {
  const estimate = normalizeEstimateForStorage({
    ...data,
    pdfFilename: pdf.filename,
    pdfPath: pdf.filepath,
    pdfSha256: pdf.sha256,
    generatedPdfFilename: pdf.filename,
    generatedPdfPath: pdf.filepath,
    generatedPdfSha256: pdf.sha256,
  });
  const store = await readEstimateStore();
  const byId = new Map(store.estimates.map((item) => [item.estimateId, item]));
  const existing = byId.get(estimate.estimateId);
  byId.set(estimate.estimateId, preserveEstimateResponseFields(existing, {
    ...(existing || {}),
    ...estimate,
  }));
  const customers = new Map((store.customers || []).map((customer) => [customer.key || normalizeLookupKey(customer.name), customer]));
  byId.forEach((item) => mergeCustomer(customers, customerRecordFromEstimate(item)));
  await writeEstimateStore({
    estimates: [...byId.values()].sort((a, b) => clean(b.updatedAt).localeCompare(clean(a.updatedAt))),
    customers: [...customers.values()].sort((a, b) => clean(a.name).localeCompare(clean(b.name))),
  });
  return estimate;
}

async function listEstimateCustomers() {
  const store = await readEstimateStore();
  const customers = new Map((store.customers || [])
    .map((customer) => [customer.key || normalizeLookupKey(customer.name), customer]));

  (store.estimates || []).forEach((estimate) => {
    mergeCustomer(customers, customerRecordFromEstimate(estimate));
  });

  return [...customers.values()]
    .filter((customer) => customer?.key && customer?.name)
    .sort((a, b) => clean(b.lastUsedAt).localeCompare(clean(a.lastUsedAt)) || clean(a.name).localeCompare(clean(b.name)));
}

function drawBlankEstimateRows(doc, yPosition, leftMargin, rightMargin, title, rowCount = 8) {
  const descriptionX = leftMargin;
  const qtyX = rightMargin - 190;
  const unitX = rightMargin - 130;
  const totalX = rightMargin - 65;
  const rowHeight = 18;

  yPosition = drawSectionHeader(doc, yPosition, leftMargin, rightMargin, rightMargin - leftMargin, title);
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#000000");
  doc.text("Description", descriptionX, yPosition, { width: qtyX - descriptionX - 8 });
  doc.text("Qty", qtyX, yPosition, { width: 45, align: "right" });
  doc.text("Unit", unitX, yPosition, { width: 55, align: "right" });
  doc.text("Total", totalX, yPosition, { width: 65, align: "right" });
  yPosition += 10;

  doc.font("Helvetica").lineWidth(0.5);
  for (let row = 0; row < rowCount; row += 1) {
    doc.moveTo(leftMargin, yPosition + rowHeight).lineTo(rightMargin, yPosition + rowHeight).stroke();
    doc.moveTo(qtyX - 8, yPosition).lineTo(qtyX - 8, yPosition + rowHeight).stroke();
    doc.moveTo(unitX - 8, yPosition).lineTo(unitX - 8, yPosition + rowHeight).stroke();
    doc.moveTo(totalX - 8, yPosition).lineTo(totalX - 8, yPosition + rowHeight).stroke();
    yPosition += rowHeight;
  }
  return yPosition + 12;
}

async function writeBlankEstimatePdf(data) {
  await ensureEstimateDataDirs();
  const filename = `blank-estimate-${Date.now()}.pdf`;
  const filepath = path.join(ESTIMATE_TEMP_DIR, filename);
  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const writeStream = fsSync.createWriteStream(filepath);
  doc.pipe(writeStream);

  const leftMargin = 50;
  const rightMargin = 550;
  const pageWidth = rightMargin - leftMargin;
  let yPosition = 42;

  const logoSource = resolveLogoSource(data.logoPath);
  if (logoSource) {
    try {
      if (Buffer.isBuffer(logoSource) || fsSync.existsSync(logoSource)) {
        doc.image(logoSource, leftMargin, yPosition, { width: 82, fit: [82, 62] });
      }
    } catch (_error) {
      // Blank print form can continue without a logo.
    }
  }

  doc.fontSize(11).font("Helvetica-Bold").text(data.businessName || "Edgewater Cabinet Store, LLC", leftMargin + 100, yPosition, { width: 260 });
  doc.fontSize(8).font("Helvetica");
  doc.text([data.address, cityStateZip(data.city, data.state, data.zip)].filter(Boolean).join("\n"), leftMargin + 100, yPosition + 15, { width: 260 });
  doc.text([formatPhoneNumber(data.phone), data.email].filter(Boolean).join(" | "), leftMargin + 100, yPosition + 42, { width: 260 });
  doc.fontSize(18).font("Helvetica-Bold").text("ESTIMATE", rightMargin - 130, yPosition + 10, { width: 130, align: "right" });

  yPosition += 78;
  doc.moveTo(leftMargin, yPosition).lineTo(rightMargin, yPosition).stroke();
  yPosition += 16;

  doc.fontSize(8).font("Helvetica-Bold");
  doc.text("Customer", leftMargin, yPosition);
  doc.moveTo(leftMargin + 58, yPosition + 10).lineTo(leftMargin + 255, yPosition + 10).stroke();
  doc.text("Phone", leftMargin + 270, yPosition);
  doc.moveTo(leftMargin + 312, yPosition + 10).lineTo(rightMargin, yPosition + 10).stroke();
  yPosition += 24;
  doc.text("Address", leftMargin, yPosition);
  doc.moveTo(leftMargin + 58, yPosition + 10).lineTo(rightMargin, yPosition + 10).stroke();
  yPosition += 22;

  yPosition = drawBlankEstimateRows(doc, yPosition, leftMargin, rightMargin, "CABINETS / COUNTERTOPS", 8);
  yPosition = drawBlankEstimateRows(doc, yPosition, leftMargin, rightMargin, "INSTALLATION", 8);

  doc.fontSize(8).font("Helvetica-Bold");
  ["Subtotal", "Sales Tax", "Estimated Combined Total"].forEach((label) => {
    doc.text(label, rightMargin - 245, yPosition, { width: 145, align: "right" });
    doc.moveTo(rightMargin - 90, yPosition + 10).lineTo(rightMargin, yPosition + 10).stroke();
    yPosition += 18;
  });

  doc.fontSize(7.5).font("Helvetica-Oblique").text("Installation work is performed by a licensed & insured independent installer unless special arrangements are made.", leftMargin, 742, { width: pageWidth, align: "center" });
  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
  return { filename, filepath };
}

function registerEstimateModule(app, { requireAuth }) {
  app.get("/estimates", requireAuth, (_req, res) => {
    res.redirect("/estimates/new");
  });

  app.get("/estimates/new", requireAuth, (_req, res) => {
    res.sendFile(path.join(ESTIMATE_PUBLIC_DIR, "index.html"));
  });

  app.get("/estimate-response/:token", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "estimate-response.html"));
  });

  app.get("/api/estimate-module/public/:token", async (req, res, next) => {
    try {
      const found = await findEstimateByResponseToken(req.params.token);
      if (!found.estimate) {
        return res.status(404).json({ error: "Estimate response link was not found." });
      }
      res.json(publicEstimateSummary(found.estimate, found.token));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/estimate-module/public/:token/pdf", async (req, res, next) => {
    try {
      const found = await findEstimateByResponseToken(req.params.token);
      const estimate = found.estimate;
      if (!estimate) {
        return res.status(404).json({ error: "Estimate response link was not found." });
      }
      const filename = safePdfFilename(estimate.pdfFilename || estimate.generatedPdfFilename);
      if (!filename) {
        return res.status(404).json({ error: "Estimate PDF not found." });
      }
      const libraryDir = estimateLibraryDir();
      const filepath = path.join(libraryDir, filename);
      const relative = path.relative(libraryDir, path.resolve(filepath));
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return res.status(404).json({ error: "Estimate PDF not found." });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
      res.sendFile(filepath, (error) => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/estimate-module/public/:token/respond", async (req, res, next) => {
    try {
      const result = await recordEstimateResponse(req.params.token, req.body || {}, req);
      notifyEstimateResponse(result.estimate, result.event).catch((error) => {
        console.error(`Estimate response notification failed: ${error.message}`);
      });
      res.json({
        ok: true,
        status: result.estimate.estimateStatus,
        estimate: publicEstimateSummary(result.estimate, safeResponseToken(req.params.token)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/estimate-module/settings", requireAuth, async (_req, res, next) => {
    try {
      res.json(estimateSettingsPayload(await loadSettings()));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/estimate-module/session", requireAuth, (_req, res) => {
    res.json({ authRequired: false, authorized: true });
  });

  app.post("/api/estimate-module/session", requireAuth, (_req, res) => {
    res.json({ authRequired: false, token: "", expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
  });

  app.get("/api/estimate-module/sync/status", requireAuth, (_req, res) => {
    res.json({ online: true, configured: true, authRequired: false });
  });

  app.get("/api/estimate-module/sync/pull", requireAuth, async (req, res, next) => {
    try {
      const since = clean(req.query.since);
      const dataResetId = await currentDataResetId();
      const store = await readEstimateStore();
      const importedCustomers = await listPreimportRecords("customers");
      const importedSuppliers = await listPreimportRecords("suppliers");
      const importedProducts = await listPreimportRecords("products");
      const installers = await listInstallers();
      const estimates = since
        ? store.estimates.filter((estimate) => clean(estimate.updatedAt) > since)
        : store.estimates;
      res.json({
        dataResetId,
        estimates,
        entities: [
          ...storeEntities(store.estimates),
          ...installers.map((installer) => ({
            type: "installer",
            name: clean(installer.name),
            installerId: clean(installer.id),
            storeDepartment: clean(installer.storeDepartment),
            lastUsedAt: clean(installer.updatedAt || installer.createdAt),
          })).filter((installer) => installer.name),
          ...importedSuppliers.map((supplier) => ({
            type: "supplier",
            name: clean(supplier.name),
            lastUsedAt: clean(supplier.importedAt),
          })).filter((supplier) => supplier.name),
          ...importedProducts.map((product) => ({
            type: "product",
            name: clean(product.name),
            productCode: clean(product.productCode || product.sku || product.itemNumber),
            itemName: clean(product.itemName || product.name),
            itemType: clean(product.itemType || product.category),
            itemDescription: clean(product.itemDescription || product.notes),
            supplier: clean(product.supplier),
            price: clean(product.price),
            vendorListPrice: clean(product.vendorListPrice),
            unitCost: clean(product.unitCost),
            costMultiplier: clean(product.costMultiplier),
            discountPercent: clean(product.discountPercent),
            markupPercent: clean(product.markupPercent),
            taxable: product.taxable !== false,
            lastUsedAt: clean(product.importedAt),
          })).filter((product) => product.name),
        ],
        customers: [
          ...store.customers,
          ...importedCustomers.map((customer) => ({
            key: normalizeLookupKey(customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" ")),
            name: clean(customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" ")),
            address: clean(customer.mailingAddress || customer.billingAddress),
            phone: clean(customer.phone1 || customer.phone2),
            email: clean(customer.email),
            lastUsedAt: clean(customer.importedAt),
          })).filter((customer) => customer.key),
        ],
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/estimate-module/sync/push", requireAuth, async (req, res, next) => {
    try {
      const payload = req.body || {};
      const incoming = Array.isArray(payload.estimates) ? payload.estimates : [];
      const incomingCustomers = Array.isArray(payload.customers) ? payload.customers : [];
      const lastSync = clean(payload.lastSync);
      const forcePush = Boolean(payload.forcePush);
      const dataResetId = await currentDataResetId();
      const clientDataResetId = clean(payload.dataResetId);
      if (dataResetId !== "initial" && clientDataResetId !== dataResetId) {
        return res.status(409).json({
          resetRequired: true,
          dataResetId,
          error: "This browser has old local estimate data from before the latest server reset. Refresh the page before syncing.",
        });
      }
      const store = await readEstimateStore();
      const byId = new Map(store.estimates.map((estimate) => [estimate.estimateId, estimate]));
      const conflicts = [];
      let merged = 0;
      let skipped = 0;

      incoming.forEach((rawEstimate) => {
        const estimate = normalizeEstimateForStorage(rawEstimate || {});
        if (!estimate.estimateId) return;
        const existing = byId.get(estimate.estimateId);
        const remoteUpdatedAt = clean(existing?.updatedAt);
        const localUpdatedAt = clean(estimate.updatedAt);
        const hasConflict = existing
          && !forcePush
          && lastSync
          && remoteUpdatedAt > lastSync
          && localUpdatedAt > lastSync
          && remoteUpdatedAt !== localUpdatedAt;

        if (hasConflict) {
          conflicts.push({
            estimateId: estimate.estimateId,
            customer: estimate.customer || "",
            localUpdatedAt,
            remoteUpdatedAt,
          });
          skipped += 1;
          return;
        }

        if (!existing || forcePush || localUpdatedAt >= remoteUpdatedAt) {
          byId.set(estimate.estimateId, preserveEstimateResponseFields(existing, estimate));
          merged += 1;
        } else {
          skipped += 1;
        }
      });

      const customers = new Map((store.customers || []).map((customer) => [customer.key || normalizeLookupKey(customer.name), customer]));
      byId.forEach((estimate) => mergeCustomer(customers, customerRecordFromEstimate(estimate)));
      incomingCustomers.forEach((customer) => mergeCustomer(customers, {
        key: clean(customer.key) || normalizeLookupKey(customer.name),
        name: clean(customer.name),
        address: clean(customer.address),
        phone: clean(customer.phone),
        email: clean(customer.email),
        lastUsedAt: clean(customer.lastUsedAt),
      }));

      await writeEstimateStore({
        estimates: [...byId.values()].sort((a, b) => clean(b.updatedAt).localeCompare(clean(a.updatedAt))),
        customers: [...customers.values()].sort((a, b) => clean(a.name).localeCompare(clean(b.name))),
      });
      res.json({ merged, skipped, conflicts, dataResetId });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/estimate-module/generate-pdf", requireAuth, async (req, res, next) => {
    try {
      const data = await applyBusinessSettings(req.body || {});
      validateOfficialEstimate(data);
      const pdf = await writeEstimatePdf(data);
      await saveEstimatePdfMetadata(data, pdf);
      res.json({ success: true, filename: pdf.filename, sha256: pdf.sha256 });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/estimate-module/blank-pdf", requireAuth, async (_req, res, next) => {
    try {
      const data = await applyBusinessSettings({});
      const { filepath } = await writeBlankEstimatePdf(data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=\"Blank-Estimate.pdf\"");
      res.sendFile(filepath, (error) => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/estimate-module/download-pdf/:filename", requireAuth, (req, res, next) => {
    const filename = safePdfFilename(req.params.filename);
    if (!filename) return res.status(404).json({ error: "Estimate PDF not found." });
    const libraryDir = estimateLibraryDir();
    const filepath = path.join(libraryDir, filename);
    const relative = path.relative(libraryDir, path.resolve(filepath));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return res.status(404).json({ error: "Estimate PDF not found." });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    res.sendFile(filepath, (error) => {
      if (error) next(error);
    });
  });

  app.post("/api/estimate-module/email-estimate", requireAuth, async (req, res, next) => {
    try {
      const recipientEmail = normalizeEmailAddress(req.body?.recipientEmail);
      if (!isValidEmailAddress(recipientEmail)) {
        return res.status(400).json({ success: false, message: "Enter a valid recipient email address." });
      }

      const smtp = loadSmtpSettings();
      if (!smtp.host || !smtp.auth.user || !smtp.auth.pass) {
        return res.status(503).json({ success: false, message: "SMTP is not configured." });
      }

      const estimateData = await applyBusinessSettings(req.body?.estimateData || {});
      validateOfficialEstimate(estimateData);
      const normalizedEstimate = normalizeEstimateForStorage(estimateData);
      const existingStore = await readEstimateStore();
      const existingEstimate = existingStore.estimates.find((estimate) => estimate.estimateId === normalizedEstimate.estimateId);
      const responseToken = safeResponseToken(existingEstimate?.responseToken) || makeResponseToken();
      const sentAt = new Date().toISOString();
      Object.assign(estimateData, {
        estimateId: normalizedEstimate.estimateId,
        estimateNumber: normalizedEstimate.estimateNumber,
        updatedAt: sentAt,
        responseToken,
        responseTokenCreatedAt: clean(existingEstimate?.responseTokenCreatedAt) || sentAt,
        responseTokenSentTo: recipientEmail,
        responseTokenLastSentAt: sentAt,
        estimateStatus: ["accepted", "declined"].includes(clean(existingEstimate?.estimateStatus))
          ? existingEstimate.estimateStatus
          : "sent",
        estimateEmailEvents: [{
          sentAt,
          to: recipientEmail,
          pdfFilename: "",
        }],
      });
      const pdf = await writeEstimatePdf(estimateData);
      estimateData.estimateEmailEvents[0].pdfFilename = pdf.filename;
      const savedEstimate = await saveEstimatePdfMetadata(estimateData, pdf);
      const formattedDate = formatDateDisplay(estimateData.estimateDate) || formatDateDisplay(new Date());
      const customerName = clean(estimateData.customer) || "Valued Customer";
      const estimateNumber = clean(estimateData.estimateNumber || estimateData.estimateId);
      const acceptUrl = `${publicBaseUrl(req)}/estimate-response/${responseToken}?action=accept`;
      const declineUrl = `${publicBaseUrl(req)}/estimate-response/${responseToken}?action=decline`;
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth,
      });

      await transporter.sendMail({
        from: smtp.from,
        to: recipientEmail,
        subject: `Estimate ${estimateNumber ? `${estimateNumber} ` : ""}- ${customerName}`,
        text: [
          `Dear ${customerName},`,
          "",
          "Please review the attached estimate from Edgewater Cabinet Store.",
          "",
          `Accept Estimate: ${acceptUrl}`,
          `Decline Estimate: ${declineUrl}`,
          "",
          "The estimate is not accepted until you open the link, type your name, confirm acceptance, and submit the response.",
          "",
          "If you have any questions, please contact us.",
        ].join("\n"),
        html: `
          <p>Dear ${escapeHtml(customerName)},</p>
          <p>Please review the attached estimate from Edgewater Cabinet Store.</p>
          <p style="margin: 20px 0;">
            <a href="${acceptUrl}" style="display:inline-block;background:#20323f;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:4px;font-weight:700;margin-right:8px;">Accept Estimate</a>
            <a href="${declineUrl}" style="display:inline-block;background:#ffffff;color:#20323f;text-decoration:none;padding:11px 18px;border:1px solid #20323f;border-radius:4px;font-weight:700;">Decline Estimate</a>
          </p>
          <p>The estimate is not accepted until you open the link, type your name, confirm acceptance, and submit the response.</p>
          <p>If you have any questions, please contact us.</p>
          <p>Best regards,<br>
          ${escapeHtml(estimateData.businessName || "Edgewater Cabinet Store")}<br>
          ${escapeHtml(clean(estimateData.phone))}<br>
          ${escapeHtml(clean(estimateData.email))}</p>
        `,
        attachments: [{
          filename: pdf.filename,
          path: pdf.filepath,
        }],
      });

      let internalCopy = { sent: false, reason: "No internal estimate copy recipient configured." };
      try {
        internalCopy = await sendInternalEstimateCopy(transporter, smtp, {
          pdf,
          estimateData,
          recipientEmail,
          customerName,
          estimateNumber,
          formattedDate,
        });
      } catch (error) {
        console.error(`Estimate internal copy failed: ${error.message}`);
        internalCopy = { sent: false, reason: `Internal estimate copy failed: ${error.message}` };
      }

      if (smtp.notificationEmail) {
        await transporter.sendMail({
          from: smtp.from,
          to: smtp.notificationEmail,
          subject: `Estimate Successfully Sent - ${formattedDate}`,
          html: `
            <h2>Estimate Delivery Notification</h2>
            <p><strong>Status:</strong> SUCCESS</p>
            <p><strong>Recipient:</strong> ${escapeHtml(recipientEmail)}</p>
            <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
            <p><strong>Estimate:</strong> ${escapeHtml(estimateNumber)}</p>
            <p><strong>Estimate Date:</strong> ${escapeHtml(formattedDate)}</p>
          `,
        });
      }

      res.json({
        success: true,
        documentType: "estimate",
        message: "Estimate email sent successfully.",
        estimateNumber,
        filename: pdf.filename,
        sha256: pdf.sha256,
        estimate: savedEstimate,
        internalCopy,
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  listEstimateCustomers,
  registerEstimateModule,
};
