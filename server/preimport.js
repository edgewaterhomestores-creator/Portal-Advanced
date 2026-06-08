const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { databaseConfigured, insertLookupRecords, listLookupRecords } = require("./db");
const { extractDocumentText, suggestOcrFields } = require("./ocr");
const { ensureDataDirs } = require("./storage");

const ROOT = path.resolve(__dirname, "..");
const PREIMPORT_DIR = path.join(ROOT, "data", "preimport");
const PREIMPORT_INCOMING_DIR = path.join(PREIMPORT_DIR, "incoming");
const PREIMPORT_OCR_DIR = path.join(PREIMPORT_DIR, "ocr");
const PREIMPORT_PATH = path.join(PREIMPORT_DIR, "prepopulate.json");
const VALID_KINDS = new Set(["customers", "suppliers", "products"]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".zip", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);

const DEFAULT_STORE = {
  customers: [],
  suppliers: [],
  products: [],
  documents: [],
  documentBatches: [],
  importRuns: [],
};

function clean(value) {
  return String(value ?? "").trim();
}

function keyText(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function phoneDigits(value) {
  return clean(value).replace(/\D/g, "").replace(/^1+/, "").slice(0, 10);
}

function boolValue(value, fallback = true) {
  const text = clean(value).toLowerCase();
  if (!text) return fallback;
  if (["yes", "y", "true", "1", "active", "taxable"].includes(text)) return true;
  if (["no", "n", "false", "0", "inactive", "archived", "non-taxable", "nontaxable"].includes(text)) return false;
  return fallback;
}

function decimalValue(value) {
  const parsed = Number(clean(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function computedLineTotal(quantity, price) {
  const qty = decimalValue(quantity);
  const each = decimalValue(price);
  if (qty === null || each === null) return "";
  return (qty * each).toFixed(2);
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function ensurePreimportStore() {
  await ensureDataDirs();
  await fs.mkdir(PREIMPORT_DIR, { recursive: true });
  await fs.mkdir(PREIMPORT_INCOMING_DIR, { recursive: true });
  await fs.mkdir(PREIMPORT_OCR_DIR, { recursive: true });
}

async function readPreimportStore() {
  await ensurePreimportStore();
  try {
    const raw = await fs.readFile(PREIMPORT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      documentBatches: Array.isArray(parsed.documentBatches) ? parsed.documentBatches : [],
      importRuns: Array.isArray(parsed.importRuns) ? parsed.importRuns : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writePreimportStore(DEFAULT_STORE);
    return { ...DEFAULT_STORE };
  }
}

async function writePreimportStore(store) {
  await ensurePreimportStore();
  await fs.writeFile(PREIMPORT_PATH, `${JSON.stringify({
    customers: store.customers || [],
    suppliers: store.suppliers || [],
    products: store.products || [],
    documents: store.documents || [],
    documentBatches: store.documentBatches || [],
    importRuns: store.importRuns || [],
  }, null, 2)}\n`, "utf8");
}

function safeFileName(value) {
  return path.basename(clean(value)).replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").slice(0, 180);
}

function documentTypeFromName(value) {
  const lower = clean(value).toLowerCase();
  if (/ack|acknowledg/.test(lower)) return "acknowledgement";
  if (/receipt|paid|payment/.test(lower)) return "receipt";
  if (/estimate|quote|cabquote|lava/.test(lower)) return "estimate";
  if (/contract|signed|agreement/.test(lower)) return "contract";
  if (/invoice/.test(lower)) return "invoice";
  if (/po|purchase order|order/.test(lower)) return "purchase-order";
  if (/delivery|tracking|ship/.test(lower)) return "delivery";
  if (/product|sku|item/.test(lower)) return "product";
  if (/supplier|vendor/.test(lower)) return "supplier";
  return "review";
}

function estimateSourceFromName(value) {
  const lower = clean(value).toLowerCase();
  if (lower.includes("rfms")) return "RFMS";
  if (lower.includes("cabquote")) return "CabQuotes";
  if (lower.includes("lava")) return "LavaCake";
  if (lower.includes("vision")) return "Vision";
  return "";
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function listIncomingFiles(dir = PREIMPORT_INCOMING_DIR, baseDir = PREIMPORT_INCOMING_DIR) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listIncomingFiles(fullPath, baseDir));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) continue;
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
    files.push({ fullPath, relativePath, ext });
  }
  return files;
}

function readUInt32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readUInt16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

async function listZipEntries(filePath) {
  const buffer = await fs.readFile(filePath);
  const minOffset = Math.max(0, buffer.length - 66000);
  let eocd = -1;
  for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return [];

  const totalEntries = readUInt16LE(buffer, eocd + 10);
  let offset = readUInt32LE(buffer, eocd + 16);
  const entries = [];
  for (let index = 0; index < totalEntries && offset < buffer.length - 46; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const compressedSize = readUInt32LE(buffer, offset + 20);
    const uncompressedSize = readUInt32LE(buffer, offset + 24);
    const nameLength = readUInt16LE(buffer, offset + 28);
    const extraLength = readUInt16LE(buffer, offset + 30);
    const commentLength = readUInt16LE(buffer, offset + 32);
    const fileName = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (fileName && !fileName.endsWith("/")) {
      entries.push({
        fileName,
        compressedSize,
        size: uncompressedSize,
        documentType: documentTypeFromName(fileName),
        estimateSource: estimateSourceFromName(fileName),
      });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function documentRecordForFile(file, actor) {
  const stats = await fs.stat(file.fullPath);
  const hash = await sha256File(file.fullPath);
  const isZip = file.ext === ".zip";
  return {
    id: makeId("doc"),
    fileName: path.basename(file.relativePath),
    relativePath: file.relativePath,
    size: stats.size,
    sha256: hash,
    extension: file.ext.replace(".", ""),
    source: "incoming-folder",
    status: "review",
    documentType: documentTypeFromName(file.relativePath),
    estimateSource: estimateSourceFromName(file.relativePath),
    suggestedCustomer: "",
    suggestedInvoice: "",
    suggestedDate: "",
    notes: "",
    ocrStatus: isZip ? "not-applicable" : "not-run",
    ocrEngine: "",
    ocrApplied: false,
    ocrTextPreview: "",
    ocrOutputRelativePath: "",
    ocrErrors: [],
    archiveEntries: isZip ? await listZipEntries(file.fullPath) : [],
    scannedAt: new Date().toISOString(),
    scannedBy: actorName(actor),
  };
}

function uniqueIncomingFileName(originalName) {
  const cleaned = safeFileName(originalName) || "document";
  const ext = path.extname(cleaned).toLowerCase();
  const stem = path.basename(cleaned, ext).slice(0, 120) || "document";
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${stem}${ext}`;
}

function incomingPathFromRelative(relativePath) {
  const fullPath = path.resolve(PREIMPORT_INCOMING_DIR, clean(relativePath));
  const root = `${path.resolve(PREIMPORT_INCOMING_DIR)}${path.sep}`;
  if (!fullPath.startsWith(root)) return "";
  return fullPath;
}

function ocrRelativePath(filePath) {
  if (!filePath) return "";
  const relativePath = path.relative(PREIMPORT_DIR, filePath).replace(/\\/g, "/");
  return relativePath.startsWith("ocr/") ? relativePath : "";
}

async function savePreimportUploads(files = [], actor = {}) {
  await ensurePreimportStore();
  const store = await readPreimportStore();
  const existingHashes = new Set((store.documents || []).map((document) => document.sha256).filter(Boolean));
  const uploaded = [];
  const skipped = [];

  for (const file of files) {
    const originalName = file?.originalname || "document";
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
      skipped.push({ fileName: originalName, reason: "Unsupported file type." });
      continue;
    }

    const relativePath = uniqueIncomingFileName(originalName);
    const fullPath = path.join(PREIMPORT_INCOMING_DIR, relativePath);
    await fs.writeFile(fullPath, file.buffer);
    const record = await documentRecordForFile({ fullPath, relativePath, ext }, actor);
    if (existingHashes.has(record.sha256)) {
      await fs.rm(fullPath, { force: true });
      skipped.push({ fileName: originalName, reason: "Duplicate file hash already staged." });
      continue;
    }

    existingHashes.add(record.sha256);
    uploaded.push(record);
  }

  store.documents = [...uploaded, ...(store.documents || [])].slice(0, 1000);
  if (uploaded.length) {
    store.documentBatches = [{
      id: makeId("docbatch"),
      sourceName: "Admin upload",
      uploadedAt: new Date().toISOString(),
      uploadedBy: actorName(actor),
      uploadedCount: uploaded.length,
      skippedCount: skipped.length,
    }, ...(store.documentBatches || [])].slice(0, 50);
  }
  await writePreimportStore(store);
  return { uploaded, skipped, documents: store.documents };
}

async function stageIncomingDocumentBuffer({ buffer, originalName, source = "document-upload", metadata = {}, actor = {} }) {
  await ensurePreimportStore();
  const store = await readPreimportStore();
  const existingHashes = new Set((store.documents || []).map((document) => document.sha256).filter(Boolean));
  const safeName = safeFileName(originalName || "document.pdf");
  const ext = path.extname(safeName).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    return { uploaded: [], skipped: [{ fileName: originalName || "document", reason: "Unsupported file type." }], documents: store.documents || [] };
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  if (existingHashes.has(hash)) {
    return { uploaded: [], skipped: [{ fileName: safeName, reason: "Duplicate file hash already staged." }], documents: store.documents || [] };
  }

  const relativePath = uniqueIncomingFileName(safeName);
  const fullPath = path.join(PREIMPORT_INCOMING_DIR, relativePath);
  await fs.writeFile(fullPath, buffer);
  const record = await documentRecordForFile({ fullPath, relativePath, ext }, actor);
  const staged = {
    ...record,
    source,
    emailAccount: clean(metadata.emailAccount),
    emailMessageId: clean(metadata.emailMessageId),
    emailThreadId: clean(metadata.emailThreadId),
    emailAttachmentId: clean(metadata.emailAttachmentId),
    emailFrom: clean(metadata.emailFrom),
    emailSubject: clean(metadata.emailSubject),
    emailReceivedAt: clean(metadata.emailReceivedAt),
    emailSnippet: clean(metadata.emailSnippet),
  };

  store.documents = [staged, ...(store.documents || [])].slice(0, 1000);
  store.documentBatches = [{
    id: makeId("docbatch"),
    sourceName: source === "gmail" ? `Gmail: ${clean(metadata.emailAccount) || "account"}` : source,
    uploadedAt: new Date().toISOString(),
    uploadedBy: actorName(actor),
    uploadedCount: 1,
    skippedCount: 0,
  }, ...(store.documentBatches || [])].slice(0, 50);
  await writePreimportStore(store);
  return { uploaded: [staged], skipped: [], documents: store.documents };
}

async function scanIncomingDocuments(actor = {}) {
  await ensurePreimportStore();
  const store = await readPreimportStore();
  const existingPaths = new Set((store.documents || []).map((document) => document.relativePath).filter(Boolean));
  const existingHashes = new Set((store.documents || []).map((document) => document.sha256).filter(Boolean));
  const scanned = [];
  const skipped = [];
  const files = await listIncomingFiles();

  for (const file of files) {
    if (existingPaths.has(file.relativePath)) {
      skipped.push({ fileName: file.relativePath, reason: "Already staged." });
      continue;
    }
    const record = await documentRecordForFile(file, actor);
    if (existingHashes.has(record.sha256)) {
      skipped.push({ fileName: file.relativePath, reason: "Duplicate file hash already staged." });
      continue;
    }
    existingPaths.add(file.relativePath);
    existingHashes.add(record.sha256);
    scanned.push(record);
  }

  store.documents = [...scanned, ...(store.documents || [])].slice(0, 1000);
  if (scanned.length) {
    store.documentBatches = [{
      id: makeId("docbatch"),
      sourceName: "Incoming folder scan",
      uploadedAt: new Date().toISOString(),
      uploadedBy: actorName(actor),
      uploadedCount: scanned.length,
      skippedCount: skipped.length,
    }, ...(store.documentBatches || [])].slice(0, 50);
  }
  await writePreimportStore(store);
  return { scanned, skipped, documents: store.documents };
}

async function ocrPreimportDocument(documentId, actor = {}) {
  await ensurePreimportStore();
  const store = await readPreimportStore();
  const documents = store.documents || [];
  const index = documents.findIndex((document) => document.id === documentId);
  if (index < 0) {
    const error = new Error("Preimport document not found.");
    error.status = 404;
    throw error;
  }

  const document = documents[index];
  if (document.extension === "zip") {
    const error = new Error("ZIP files must be reviewed/extracted before OCR.");
    error.status = 400;
    throw error;
  }

  const fullPath = incomingPathFromRelative(document.relativePath);
  if (!fullPath) {
    const error = new Error("Preimport document path is not valid.");
    error.status = 400;
    throw error;
  }

  const result = await extractDocumentText({
    filePath: fullPath,
    extension: document.extension,
    outputDir: PREIMPORT_OCR_DIR,
    outputBaseName: document.id,
  });
  const suggestions = suggestOcrFields(result.text, document.fileName || document.relativePath);
  const updated = {
    ...document,
    documentType: suggestions.documentType || document.documentType,
    estimateSource: suggestions.estimateSource || document.estimateSource,
    suggestedCustomer: suggestions.customerName || document.suggestedCustomer || "",
    suggestedPhone: suggestions.phone || document.suggestedPhone || "",
    suggestedEmail: suggestions.email || document.suggestedEmail || "",
    suggestedAddress: suggestions.address || document.suggestedAddress || "",
    suggestedInvoice: suggestions.documentNumber || document.suggestedInvoice || "",
    suggestedDate: suggestions.date || document.suggestedDate || "",
    ocrStatus: result.ok ? "complete" : "needs-review",
    ocrEngine: result.engine,
    ocrApplied: result.ocrApplied,
    ocrTextPreview: result.textPreview,
    ocrOutputRelativePath: ocrRelativePath(result.outputPath),
    ocrErrors: result.errors,
    ocrAt: new Date().toISOString(),
    ocrBy: actorName(actor),
  };

  documents[index] = updated;
  store.documents = documents;
  await writePreimportStore(store);
  return updated;
}

function canonicalHeader(value) {
  return keyText(value);
}

function valueFrom(row, aliases) {
  for (const alias of aliases) {
    const key = canonicalHeader(alias);
    if (Object.prototype.hasOwnProperty.call(row, key) && clean(row[key])) {
      return clean(row[key]);
    }
  }
  return "";
}

function splitName(value) {
  const name = clean(value).replace(/\s+/g, " ");
  if (!name) return { firstName: "", lastName: "" };
  if (name.includes(",")) {
    const [lastName, ...rest] = name.split(",");
    return { firstName: clean(rest.join(", ")), lastName: clean(lastName) };
  }
  const parts = name.split(" ");
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function customerKey(row) {
  const email = keyText(row.email);
  const phone = phoneDigits(row.phone1 || row.phone2);
  const name = keyText(row.name || `${row.firstName} ${row.lastName}`);
  const address = keyText(row.mailingAddress || row.billingAddress);
  if (email && name) return `email:${email}:${name}`;
  if (phone && name) return `phone:${phone}:${name}`;
  if (name && address) return `name-address:${name}:${address}`;
  return "";
}

function supplierKey(row) {
  const name = keyText(row.name);
  const account = keyText(row.accountNumber);
  return name ? `supplier:${name}:${account}` : "";
}

function productKey(row) {
  const supplier = keyText(row.supplier);
  const productCode = keyText(row.productCode || row.sku || row.itemNumber);
  const itemName = keyText(row.itemName || row.name);
  const itemType = keyText(row.itemType || row.category);
  if (supplier && productCode) return `product-code:${supplier}:${productCode}`;
  if (productCode) return `product-code:${productCode}`;
  if (supplier && itemName) return `product-name:${supplier}:${itemName}:${itemType}`;
  if (itemName) return `product-name:${itemName}:${itemType}`;
  return "";
}

function normalizeCustomer(row) {
  const fullName = valueFrom(row, ["name", "customer", "customer name", "full name"]);
  const split = splitName(fullName);
  const firstName = valueFrom(row, ["firstName", "first name", "customer first", "first"]) || split.firstName;
  const lastName = valueFrom(row, ["lastName", "last name", "customer last", "last"]) || split.lastName;
  const normalized = {
    firstName,
    lastName,
    name: clean([firstName, lastName].filter(Boolean).join(" ")) || fullName,
    phone1: valueFrom(row, ["phone1", "phone 1", "primary phone", "phone", "customer phone"]),
    phone2: valueFrom(row, ["phone2", "phone 2", "alternate phone", "alt phone"]),
    email: valueFrom(row, ["email", "customer email", "email address"]),
    mailingAddress: valueFrom(row, ["mailingAddress", "mailing address", "address", "customer address"]),
    billingAddress: valueFrom(row, ["billingAddress", "billing address"]),
    referral: valueFrom(row, ["referral", "heard about us", "source"]),
    textOptIn: valueFrom(row, ["textOptIn", "text opt in", "text messages", "sms"]) || "yes",
    socialMediaTagConsent: valueFrom(row, ["socialMediaTagConsent", "social media tag", "social media tagging", "social media permission"]),
    socialMediaProfile: valueFrom(row, ["socialMediaProfile", "social media", "social media profile", "social media name", "social media handle"]),
    notes: valueFrom(row, ["notes", "customer notes", "note"]),
    active: boolValue(valueFrom(row, ["active", "status"]), true),
  };
  normalized.key = customerKey(normalized);
  normalized.valid = Boolean(normalized.key && (normalized.name || normalized.lastName));
  normalized.reason = normalized.valid ? "" : "Customer needs a name plus phone, email, or address.";
  return normalized;
}

function normalizeSupplier(row) {
  const normalized = {
    name: valueFrom(row, ["name", "supplier", "vendor", "supplier name", "vendor name"]),
    contactName: valueFrom(row, ["contact", "contact name", "rep", "representative"]),
    phone: valueFrom(row, ["phone", "supplier phone", "vendor phone"]),
    email: valueFrom(row, ["email", "supplier email", "vendor email"]),
    website: valueFrom(row, ["website", "site", "login", "login link", "url"]),
    address: valueFrom(row, ["address", "supplier address", "vendor address"]),
    accountNumber: valueFrom(row, ["accountNumber", "account number", "account", "acct"]),
    taxExemptionNumber: valueFrom(row, ["taxExemptionNumber", "tax exemption", "exemption number", "resale number"]),
    categories: valueFrom(row, ["categories", "category", "product categories", "supplies"]),
    notes: valueFrom(row, ["notes", "supplier notes", "vendor notes", "note"]),
    active: boolValue(valueFrom(row, ["active", "status"]), true),
  };
  normalized.key = supplierKey(normalized);
  normalized.valid = Boolean(normalized.key);
  normalized.reason = normalized.valid ? "" : "Supplier needs a supplier/vendor name.";
  return normalized;
}

function normalizeProduct(row) {
  const productCode = valueFrom(row, [
    "productCode", "product code", "code", "item code", "sku", "item sku", "product sku", "itemNumber", "item number", "item no", "number",
  ]);
  const itemName = valueFrom(row, ["itemName", "item name", "name", "product", "product name", "item"]);
  const itemType = valueFrom(row, ["itemType", "item type", "type", "category", "product category"]);
  const itemDescription = valueFrom(row, ["itemDescription", "item description", "description", "product description"]);
  const quantity = valueFrom(row, ["quantity", "qty", "line quantity"]);
  const vendorListPrice = valueFrom(row, [
    "vendorListPrice", "vendor list price", "list price", "catalog price", "book price", "retail list",
  ]);
  const price = valueFrom(row, ["price", "unit price", "sell price", "retail"]);
  const lineTotal = valueFrom(row, ["lineTotal", "line total", "total", "extended", "extended price"]) || computedLineTotal(quantity, price);
  const name = itemName || itemDescription;
  const normalized = {
    productCode,
    itemName,
    itemType,
    itemDescription,
    name,
    category: itemType,
    supplier: valueFrom(row, ["supplier", "vendor", "supplier name", "vendor name"]),
    sku: productCode,
    itemNumber: productCode,
    quantity,
    vendorListPrice,
    unitCost: valueFrom(row, ["unitCost", "unit cost", "cost"]),
    costMultiplier: valueFrom(row, ["costMultiplier", "cost multiplier", "multiplier", "catalog multiplier"]),
    discountPercent: valueFrom(row, ["discountPercent", "discount percent", "discount %", "discount"]),
    markupPercent: valueFrom(row, ["markupPercent", "markup percent", "markup %", "customer markup", "default markup"]),
    price,
    lineTotal,
    taxable: boolValue(valueFrom(row, ["taxable", "sales tax", "tax"]), true),
    active: boolValue(valueFrom(row, ["active", "status"]), true),
    notes: valueFrom(row, ["notes", "product notes", "note"]),
  };
  normalized.key = productKey(normalized);
  normalized.valid = Boolean(normalized.key);
  normalized.reason = normalized.valid ? "" : "Product needs a product code or item name.";
  return normalized;
}

function normalizeByKind(kind, row) {
  if (kind === "customers") return normalizeCustomer(row);
  if (kind === "suppliers") return normalizeSupplier(row);
  if (kind === "products") return normalizeProduct(row);
  throw new Error("Invalid import type.");
}

function normalizeRawRow(row) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[canonicalHeader(key)] = clean(value);
  });
  return normalized;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  const nonEmptyRows = rows.filter((item) => item.some((cell) => clean(cell)));
  if (!nonEmptyRows.length) return [];
  const headers = nonEmptyRows[0].map(canonicalHeader);
  return nonEmptyRows.slice(1).map((cells) => {
    const out = {};
    headers.forEach((header, index) => {
      if (header) out[header] = clean(cells[index]);
    });
    return out;
  });
}

function parseImportContent(kind, content, format = "auto") {
  const raw = clean(content);
  if (!raw) return [];
  const lowerFormat = clean(format).toLowerCase();
  if (lowerFormat === "json" || (lowerFormat === "auto" && /^[{[]/.test(raw))) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeRawRow);
    if (Array.isArray(parsed[kind])) return parsed[kind].map(normalizeRawRow);
    if (Array.isArray(parsed.rows)) return parsed.rows.map(normalizeRawRow);
    return [normalizeRawRow(parsed)];
  }
  return parseCsv(raw).map(normalizeRawRow);
}

function previewRows(kind, rawRows, existingRecords) {
  const existingKeys = new Set(existingRecords.map((record) => record.key).filter(Boolean));
  const seenKeys = new Set();
  return rawRows.map((row, index) => {
    const normalized = normalizeByKind(kind, row);
    let status = "new";
    if (!normalized.valid) status = "invalid";
    else if (existingKeys.has(normalized.key)) status = "duplicate";
    else if (seenKeys.has(normalized.key)) status = "duplicate-in-file";
    if (normalized.valid) seenKeys.add(normalized.key);
    return {
      rowNumber: index + 2,
      status,
      reason: normalized.reason,
      record: normalized,
    };
  });
}

function listDuplicateStats(rows) {
  return rows.reduce((stats, row) => {
    stats.total += 1;
    stats[row.status] = (stats[row.status] || 0) + 1;
    return stats;
  }, { total: 0, new: 0, duplicate: 0, "duplicate-in-file": 0, invalid: 0 });
}

function actorName(actor) {
  return clean(actor?.name || actor?.username || "staff");
}

async function previewPreimport(kind, content, format = "auto") {
  if (!VALID_KINDS.has(kind)) {
    const error = new Error("Choose customers, suppliers, or products.");
    error.status = 400;
    throw error;
  }
  const existingRecords = await listPreimportRecords(kind);
  const rawRows = parseImportContent(kind, content, format);
  const rows = previewRows(kind, rawRows, existingRecords || []);
  return {
    kind,
    storage: databaseConfigured() ? "postgres" : "file",
    rows,
    stats: listDuplicateStats(rows),
  };
}

async function importPreimportRows(kind, rows, actor = {}, sourceName = "") {
  if (!VALID_KINDS.has(kind)) {
    const error = new Error("Choose customers, suppliers, or products.");
    error.status = 400;
    throw error;
  }
  const store = databaseConfigured() ? null : await readPreimportStore();
  const existing = databaseConfigured() ? await listLookupRecords(kind) : store[kind] || [];
  const existingKeys = new Set(existing.map((record) => record.key).filter(Boolean));
  const seenKeys = new Set();
  const importedAt = new Date().toISOString();
  const importedBy = actorName(actor);
  const imported = [];
  const skipped = [];
  const invalid = [];

  rows.forEach((rawRow, index) => {
    const normalized = normalizeByKind(kind, normalizeRawRow(rawRow.record || rawRow));
    if (!normalized.valid) {
      invalid.push({ index, reason: normalized.reason, record: normalized });
      return;
    }
    if (existingKeys.has(normalized.key) || seenKeys.has(normalized.key)) {
      skipped.push({ index, reason: "Duplicate skipped.", record: normalized });
      return;
    }
    seenKeys.add(normalized.key);
    imported.push({
      ...normalized,
      id: makeId(kind.slice(0, -1)),
      importedAt,
      importedBy,
      sourceName: clean(sourceName),
    });
  });

  if (databaseConfigured()) {
    const run = {
      id: makeId("import"),
      kind,
      sourceName: clean(sourceName),
      importedAt,
      importedBy,
      skippedCount: skipped.length,
      invalidCount: invalid.length,
    };
    const inserted = await insertLookupRecords(kind, imported, run);
    const conflictSkipped = Math.max(0, imported.length - inserted.length);
    return {
      kind,
      storage: "postgres",
      importedCount: inserted.length,
      skippedCount: skipped.length + conflictSkipped,
      invalidCount: invalid.length,
      imported: inserted,
      skipped,
      invalid,
    };
  }

  store[kind] = [...imported, ...existing];
  store.importRuns = [{
    id: makeId("import"),
    kind,
    sourceName: clean(sourceName),
    importedAt,
    importedBy,
    importedCount: imported.length,
    skippedCount: skipped.length,
    invalidCount: invalid.length,
  }, ...(store.importRuns || [])].slice(0, 50);
  await writePreimportStore(store);
  return {
    kind,
    storage: "file",
    importedCount: imported.length,
    skippedCount: skipped.length,
    invalidCount: invalid.length,
    imported,
    skipped,
    invalid,
  };
}

async function listPreimportRecords(kind = "") {
  if (databaseConfigured()) {
    const lookup = await listLookupRecords(kind);
    if (kind) return lookup || [];
    const fileStore = await readPreimportStore();
    return {
      ...fileStore,
      ...(lookup || {}),
    };
  }
  const store = await readPreimportStore();
  if (kind) return store[kind] || [];
  return store;
}

module.exports = {
  importPreimportRows,
  listPreimportRecords,
  ocrPreimportDocument,
  previewPreimport,
  savePreimportUploads,
  scanIncomingDocuments,
  stageIncomingDocumentBuffer,
};
