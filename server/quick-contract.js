const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const multer = require("multer");
const nodemailer = require("nodemailer");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { databaseConfigured, query, savePacketRecord } = require("./db");
const { contractPdfFilename } = require("./filenames");
const { publicBaseUrl: securePublicBaseUrl } = require("./public-url");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data", "quick-contracts");
const TEMPLATE_PATH = path.join(ROOT_DIR, "assets", "templates", "CORRECTED ADDRESS customer-packet.pdf");
const FALLBACK_TEMPLATE_PATH = path.join(ROOT_DIR, "assets", "templates", "customer-packet.pdf");
const LOGO_PATH = path.join(ROOT_DIR, "public", "img", "logos", "edgewater-original.png");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 12,
    fileSize: 18 * 1024 * 1024,
  },
});

const CORE_TEMPLATE_PAGES = [
  { page: 4, label: "Florida Legal Disclaimers" },
  { page: 5, label: "Purchase Agreement - Page 1/4" },
  { page: 6, label: "Purchase Agreement - Page 2/4" },
  { page: 7, label: "Purchase Agreement - Page 3/4" },
  { page: 8, label: "Purchase Agreement - Page 4/4" },
];

const INITIAL_FIELDS = [
  { page: 5, x: 505, y: 439 },
  { page: 5, x: 505, y: 327 },
  { page: 5, x: 505, y: 257 },
  { page: 5, x: 505, y: 164 },
  { page: 5, x: 505, y: 86 },
  { page: 6, x: 505, y: 747 },
  { page: 6, x: 505, y: 639 },
  { page: 6, x: 505, y: 519 },
  { page: 6, x: 505, y: 429 },
  { page: 6, x: 505, y: 198 },
  { page: 7, x: 505, y: 747 },
  { page: 7, x: 505, y: 576 },
  { page: 7, x: 505, y: 380 },
  { page: 7, x: 505, y: 263 },
  { page: 7, x: 505, y: 146 },
  { page: 8, x: 505, y: 747 },
];

const SIGNATURE_FIELD = {
  page: 8,
  signature: { x: 158, y: 627, width: 205, height: 34 },
  date: { x: 431, y: 636, width: 110, height: 18 },
  printedName: { x: 140, y: 609, width: 242, height: 18 },
};

const STORE_REP_FIELD = {
  page: 8,
  name: { x: 166, y: 552, width: 205 },
  date: { x: 431, y: 552, width: 110 },
  title: { x: 116, y: 528, width: 220 },
};

const AGREEMENT_CUSTOMER_NAME_FIELD = {
  page: 5,
  x: 136,
  y: 552,
  width: 135,
};

const HEADER_FIELDS = [
  { key: "invoiceNumber", x: 71, y: 746, width: 58 },
  { key: "saleDate", x: 180, y: 746, width: 52 },
  { key: "customerName", x: 283, y: 746, width: 78 },
  { key: "installerName", x: 394, y: 746, width: 69 },
  { key: "installDate", x: 521, y: 746, width: 54 },
];

const QUICK_EXCEPTION_REASON = "payment_taken_before_signature";
const REQUIRED_AGREEMENT_CHECKS = [
  "legalDisclaimers",
  "purchaseAgreement",
  "initialsApplied",
  "signatureApplied",
  "supportingDocuments",
];

function text(value) {
  return String(value ?? "").trim();
}

function pdfText(value) {
  return text(value)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();
}

function safeFilename(value, fallback = "contract") {
  return text(value || fallback)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function customerLastName(customerName) {
  const parts = text(customerName).split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Customer";
}

function customerNameParts(customerName) {
  const parts = text(customerName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function quickPacketForFilename(record = {}) {
  const fields = record.fields || {};
  return {
    createdAt: record.createdAt,
    finalizedAt: record.signedAt || record.updatedAt,
    data: {
      customer: {
        lastName: customerLastName(fields.customerName),
      },
      order: {
        saleDate: fields.preparedDate || fields.saleDate || record.createdAt,
      },
      estimate: {
        estimateNumber: fields.estimateNumber,
      },
    },
  };
}

function quickContractFilename(record, options = {}) {
  return contractPdfFilename(quickPacketForFilename(record), options);
}

function quickRecordPacket(record = {}) {
  const fields = record.fields || {};
  const nameParts = customerNameParts(fields.customerName);
  const status = record.signedAt
    ? "quick_signed_returned"
    : (record.customerEmail?.sentAt || record.customerEmail?.sent)
      ? "quick_waiting_customer_signature"
      : "quick_created_not_sent";

  return {
    id: record.id,
    contractNumber: text(fields.contractNumber || fields.invoiceNumber || record.id),
    revisionBaseContractNumber: text(fields.contractNumber || fields.invoiceNumber || record.id),
    revisionNumber: 0,
    status,
    signablePdfPath: text(record.unsignedPdfPath),
    finalPdfPath: text(record.signedPdfPath),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    finalizedAt: record.signedAt || "",
    completedAt: record.signedAt || "",
    source: "quick_paid_before_signature",
    data: {
      customer: {
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        phone1: text(fields.phone),
        phone2: "",
        email: text(fields.email),
        mailingAddress: text(fields.jobAddress),
        billingAddress: "",
        notes: text(fields.notes),
      },
      order: {
        invoiceNumber: text(fields.invoiceNumber || fields.contractNumber),
        contractNumber: text(fields.contractNumber),
        receiptNumber: text(fields.receiptNumber),
        installAddress: text(fields.jobAddress),
        saleDate: text(fields.saleDate),
        paymentDate: text(fields.paymentDate),
        paymentMethod: text(fields.paymentMethod),
        invoiceAmount: text(fields.invoiceAmount),
        amountPaid: text(fields.amountPaid),
        balanceDue: text(fields.balanceDue),
        storeRep: text(fields.storeRep),
        storeRepDate: text(fields.preparedDate || fields.saleDate),
        storeRepTitle: "Sales Manager",
      },
      estimate: {
        estimateNumber: text(fields.estimateNumber),
      },
      notes: {
        workDescription: text(fields.workDescription),
        customerNotes: text(fields.notes),
      },
      quickContract: {
        exceptionReason: QUICK_EXCEPTION_REASON,
        signUrl: text(record.signUrl),
        customerEmail: record.customerEmail || {},
        signedEmail: record.signedEmail || {},
        documentStatus: documentStatusLines(record),
        files: Array.isArray(record.files)
          ? record.files.map((file) => ({
              group: file.group,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              path: file.path,
            }))
          : [],
        signature: record.signature || null,
      },
    },
  };
}

function todayDisplay() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
}

function publicBaseUrl(req) {
  return securePublicBaseUrl(req, {
    envName: "QUICK_CONTRACT_BASE_URL",
    fallbackEnvName: "PUBLIC_BASE_URL",
  });
}

function smtpCanSend() {
  return Boolean(process.env.SMTP_HOST);
}

function smtpStoreRecipient() {
  return text(process.env.SMTP_TO);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        }
      : undefined,
  });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function recordDir(id) {
  return path.join(DATA_DIR, id);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function readRecord(id) {
  const recordPath = path.join(recordDir(id), "record.json");
  const raw = await fs.readFile(recordPath, "utf8");
  return JSON.parse(raw);
}

async function saveRecord(record) {
  await ensureDir(recordDir(record.id));
  await writeJson(path.join(recordDir(record.id), "record.json"), record);
  await mirrorQuickContractRecord(record);
  await mirrorQuickException(record);
}

function quickExceptionStatus(record = {}) {
  if (record.signedAt) return "signed_returned";
  if (record.customerEmail?.sentAt || record.customerEmail?.sent) return "waiting_customer_signature";
  return "created_not_sent";
}

function quickExceptionPublicRow(record = {}) {
  const fields = record.fields || {};
  return {
    id: record.id,
    status: quickExceptionStatus(record),
    customerName: text(fields.customerName),
    customerEmail: text(fields.email),
    customerPhone: text(fields.phone),
    contractNumber: text(fields.contractNumber),
    invoiceNumber: text(fields.invoiceNumber),
    estimateNumber: text(fields.estimateNumber),
    receiptNumber: text(fields.receiptNumber),
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
    sentAt: record.customerEmail?.sentAt || "",
    signedAt: record.signedAt || "",
    exceptionReason: QUICK_EXCEPTION_REASON,
  };
}

async function ensureQuickExceptionSchema() {
  if (!databaseConfigured()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS quick_contract_exceptions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      contract_number TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL DEFAULT '',
      estimate_number TEXT NOT NULL DEFAULT '',
      receipt_number TEXT NOT NULL DEFAULT '',
      unsigned_pdf_path TEXT NOT NULL DEFAULT '',
      signed_pdf_path TEXT NOT NULL DEFAULT '',
      sign_url TEXT NOT NULL DEFAULT '',
      sent_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      exception_reason TEXT NOT NULL DEFAULT '${QUICK_EXCEPTION_REASON}',
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      record_json JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  return true;
}

async function mirrorQuickException(record = {}) {
  try {
    if (!record.id || !databaseConfigured()) return;
    await ensureQuickExceptionSchema();
    const fields = record.fields || {};
    await query(
      `INSERT INTO quick_contract_exceptions (
        id, status, customer_name, customer_email, customer_phone, contract_number, invoice_number,
        estimate_number, receipt_number, unsigned_pdf_path, signed_pdf_path, sign_url,
        sent_at, signed_at, exception_reason, created_at, updated_at, record_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        customer_name = EXCLUDED.customer_name,
        customer_email = EXCLUDED.customer_email,
        customer_phone = EXCLUDED.customer_phone,
        contract_number = EXCLUDED.contract_number,
        invoice_number = EXCLUDED.invoice_number,
        estimate_number = EXCLUDED.estimate_number,
        receipt_number = EXCLUDED.receipt_number,
        unsigned_pdf_path = EXCLUDED.unsigned_pdf_path,
        signed_pdf_path = EXCLUDED.signed_pdf_path,
        sign_url = EXCLUDED.sign_url,
        sent_at = EXCLUDED.sent_at,
        signed_at = EXCLUDED.signed_at,
        exception_reason = EXCLUDED.exception_reason,
        created_at = COALESCE(quick_contract_exceptions.created_at, EXCLUDED.created_at),
        updated_at = EXCLUDED.updated_at,
        record_json = EXCLUDED.record_json`,
      [
        record.id,
        quickExceptionStatus(record),
        text(fields.customerName),
        text(fields.email),
        text(fields.phone),
        text(fields.contractNumber),
        text(fields.invoiceNumber),
        text(fields.estimateNumber),
        text(fields.receiptNumber),
        text(record.unsignedPdfPath),
        text(record.signedPdfPath),
        text(record.signUrl),
        record.customerEmail?.sentAt || null,
        record.signedAt || null,
        QUICK_EXCEPTION_REASON,
        record.createdAt || new Date().toISOString(),
        record.updatedAt || new Date().toISOString(),
        record,
      ],
    );
  } catch (_error) {
    // Keep the emergency flow alive even if PostgreSQL is temporarily unavailable.
  }
}

async function mirrorQuickContractRecord(record = {}) {
  try {
    if (!record.id || !databaseConfigured()) return;
    await savePacketRecord(quickRecordPacket(record));
  } catch (_error) {
    // Keep the emergency flow alive even if PostgreSQL is temporarily unavailable.
  }
}

async function listFileQuickExceptions(options = {}) {
  const includeAll = Boolean(options.includeAll);
  try {
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const record = await readRecord(entry.name);
        const row = quickExceptionPublicRow(record);
        if (includeAll || row.status === "waiting_customer_signature" || row.status === "signed_returned") rows.push(row);
      } catch (_error) {
        // Ignore incomplete quick-contract folders.
      }
    }
    rows.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    return rows.slice(0, includeAll ? 100 : 25);
  } catch (_error) {
    return [];
  }
}

async function listQuickExceptions(options = {}) {
  const includeAll = Boolean(options.includeAll);
  try {
    if (databaseConfigured()) {
      await ensureQuickExceptionSchema();
      const result = await query(
        `SELECT id, status, customer_name, customer_email, customer_phone, contract_number, invoice_number,
          estimate_number, receipt_number, created_at, updated_at, sent_at, signed_at, exception_reason
         FROM quick_contract_exceptions
         ${includeAll ? "" : "WHERE status IN ('waiting_customer_signature', 'signed_returned')"}
         ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         LIMIT ${includeAll ? 100 : 25}`,
      );
      return result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        contractNumber: row.contract_number,
        invoiceNumber: row.invoice_number,
        estimateNumber: row.estimate_number,
        receiptNumber: row.receipt_number,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
        sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : "",
        signedAt: row.signed_at ? new Date(row.signed_at).toISOString() : "",
        exceptionReason: row.exception_reason,
      }));
    }
  } catch (_error) {
    // Fall back to the file records below.
  }
  return listFileQuickExceptions({ includeAll });
}

function assertAccess(record, token) {
  if (!record || record.token !== text(token)) {
    const error = new Error("Invalid quick contract link.");
    error.status = 401;
    throw error;
  }
}

function money(value) {
  const raw = text(value).replace(/[^0-9.-]/g, "");
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : text(value);
}

function splitLines(font, value, maxWidth, size) {
  const words = pdfText(value).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawText(page, font, value, x, y, options = {}) {
  const size = options.size || 10;
  page.drawText(pdfText(value), {
    x,
    y,
    size,
    font,
    color: options.color || rgb(0.09, 0.14, 0.19),
  });
}

function drawFitText(page, font, value, x, y, width, options = {}) {
  const cleaned = pdfText(value);
  if (!cleaned) return;
  const minSize = options.minSize || 5.5;
  let size = options.size || 9;
  while (size > minSize && font.widthOfTextAtSize(cleaned, size) > width) {
    size -= 0.5;
  }
  drawText(page, font, cleaned, x, y, { ...options, size });
}

function drawWrapped(page, font, value, x, y, width, options = {}) {
  const size = options.size || 10;
  const lineHeight = options.lineHeight || size + 3;
  const maxLines = options.maxLines || 12;
  splitLines(font, value, width, size).slice(0, maxLines).forEach((line, index) => {
    drawText(page, font, line, x, y - (index * lineHeight), { ...options, size });
  });
}

function drawBox(page, x, y, width, height) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.72, 0.78, 0.82),
    borderWidth: 1,
  });
}

async function drawSummaryLogo(pdfDoc, page) {
  try {
    const logo = await pdfDoc.embedPng(await fs.readFile(LOGO_PATH));
    const maxWidth = 96;
    const maxHeight = 42;
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, {
      x: 36,
      y: 724,
      width,
      height,
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function drawSummaryPage(pdfDoc, font, boldFont, fields, documentStatus) {
  const page = pdfDoc.addPage([612, 792]);
  const hasLogo = await drawSummaryLogo(pdfDoc, page);
  const businessX = hasLogo ? 124 : 36;
  drawText(page, boldFont, "Edgewater Cabinet Store, LLC", businessX, 750, { size: 12 });
  drawText(page, font, "2119 S Ridgewood Ave", businessX, 735, { size: 8 });
  drawText(page, font, "Edgewater, FL 32141", businessX, 724, { size: 8 });
  drawText(page, font, "(386) 444-6800 | edgewatercabinetstore@gmail.com", businessX, 713, { size: 8 });
  drawText(page, boldFont, "Customer Contract Summary", 36, 690, { size: 12 });

  let y = 670;
  drawText(page, boldFont, "Customer / Order", 36, y, { size: 10 });
  y -= 18;

  const drawSummaryPair = (left, right) => {
    [[left, 46, 132, 162], [right, 314, 422, 140]].forEach(([item, labelX, valueX, valueWidth]) => {
      if (!item) return;
      const [label, value] = item;
      drawFitText(page, boldFont, label, labelX, y, 98, { size: 8, minSize: 6.5, color: rgb(0.27, 0.35, 0.42) });
      drawFitText(page, font, value || "", valueX, y, valueWidth, { size: 8, minSize: 6, color: rgb(0.09, 0.14, 0.19) });
    });
    y -= 17;
  };

  const drawSummaryTriple = (items) => {
    items.forEach((item, index) => {
      const [label, value] = item;
      const x = 46 + (index * 178);
      drawFitText(page, boldFont, label, x, y, 68, { size: 8, minSize: 6.2, color: rgb(0.27, 0.35, 0.42) });
      drawFitText(page, font, value || "", x + 74, y, 98, { size: 8, minSize: 6, color: rgb(0.09, 0.14, 0.19) });
    });
    y -= 17;
  };

  const drawSummaryWide = (label, value, lines = 1) => {
    drawFitText(page, boldFont, label, 46, y, 98, { size: 8, minSize: 6.5, color: rgb(0.27, 0.35, 0.42) });
    drawWrapped(page, font, value || "", 132, y, 430, { size: 8, lineHeight: 9, maxLines: lines });
    y -= lines > 1 ? 24 : 17;
  };

  drawSummaryPair(["Customer", fields.customerName], ["Phone", fields.phone]);
  drawSummaryWide("Email", fields.email);
  drawSummaryWide("Job address", fields.jobAddress, 2);
  drawSummaryPair(["Sale date", fields.saleDate], ["Payment date", fields.paymentDate]);
  drawSummaryPair(["Contract / order #", fields.contractNumber], ["Payment method", fields.paymentMethod]);
  drawSummaryTriple([["Estimate #", fields.estimateNumber], ["Ack / Invoice #", fields.invoiceNumber], ["Receipt #", fields.receiptNumber]]);
  drawSummaryPair(["Invoice amount", money(fields.invoiceAmount)], ["Amount paid", money(fields.amountPaid)]);
  drawSummaryPair(["Balance due", money(fields.balanceDue)], null);
  drawSummaryWide("Store rep", fields.storeRep);

  y -= 8;
  drawBox(page, 36, y - 70, 540, 86);
  drawText(page, boldFont, "Work / Materials Description", 46, y, { size: 10 });
  drawWrapped(page, font, fields.workDescription || "", 46, y - 16, 520, { size: 8, lineHeight: 10, maxLines: 5 });

  y -= 98;
  drawBox(page, 36, y - 50, 540, 66);
  drawText(page, boldFont, "Notes / Exceptions", 46, y, { size: 10 });
  drawWrapped(page, font, fields.notes || "", 46, y - 16, 520, { size: 8, lineHeight: 10, maxLines: 4 });

  y -= 82;
  const supportTop = y;
  const supportHeight = 88;
  drawBox(page, 36, supportTop - supportHeight, 540, supportHeight + 16);
  drawText(page, boldFont, "Supporting Documents", 46, supportTop, { size: 10 });
  let supportY = supportTop - 18;
  documentStatus.forEach((line) => {
    drawWrapped(page, font, line, 46, supportY, 520, { size: 7.5, lineHeight: 9, maxLines: 2 });
    supportY -= 19;
  });

  drawWrapped(
    page,
    font,
    "This fallback packet uses the actual core Edgewater contract pages: Florida Legal Disclaimers and Purchase Agreement pages 1-4.",
    36,
    52,
    540,
    { size: 7, lineHeight: 9, maxLines: 2, color: rgb(0.28, 0.36, 0.42) },
  );
}

async function appendAttachment(pdfDoc, font, boldFont, fileRecord) {
  const bytes = await fs.readFile(fileRecord.path);
  if (fileRecord.mimetype === "application/pdf") {
    try {
      const source = await PDFDocument.load(bytes);
      const pages = await pdfDoc.copyPages(source, source.getPageIndices());
      pages.forEach((page) => pdfDoc.addPage(page));
      return;
    } catch (_error) {
      // Fall through to a text placeholder page.
    }
  }

  const page = pdfDoc.addPage([612, 792]);
  drawText(page, boldFont, fileRecord.groupLabel, 36, 748, { size: 14 });
  drawText(page, font, fileRecord.originalname, 36, 728, { size: 10 });

  try {
    let image;
    if (fileRecord.mimetype === "image/png") image = await pdfDoc.embedPng(bytes);
    if (fileRecord.mimetype === "image/jpeg" || fileRecord.mimetype === "image/jpg") image = await pdfDoc.embedJpg(bytes);
    if (image) {
      const maxWidth = 540;
      const maxHeight = 660;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: 36 + ((maxWidth - width) / 2),
        y: 58 + ((maxHeight - height) / 2),
        width,
        height,
      });
      return;
    }
  } catch (_error) {
    // Fall through to text.
  }

  drawWrapped(page, font, "This attached file could not be embedded in the PDF preview. Keep the original file with the customer record.", 36, 700, 540, { size: 10 });
}

async function readTemplateBytes() {
  try {
    return await fs.readFile(TEMPLATE_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return fs.readFile(FALLBACK_TEMPLATE_PATH);
  }
}

async function appendTemplatePages(pdfDoc, font, fields, signature = null) {
  const source = await PDFDocument.load(await readTemplateBytes());
  for (const spec of CORE_TEMPLATE_PAGES) {
    const [page] = await pdfDoc.copyPages(source, [spec.page - 1]);
    pdfDoc.addPage(page);
    if (spec.page === 5) {
      HEADER_FIELDS.forEach((field) => {
        const value = field.key === "installerName" || field.key === "installDate" ? "" : fields[field.key];
        if (value) drawFitText(page, font, value, field.x, field.y, field.width, { size: 7, minSize: 5, color: rgb(0.0, 0.27, 0.55) });
      });
      drawFitText(page, font, fields.customerName, AGREEMENT_CUSTOMER_NAME_FIELD.x, AGREEMENT_CUSTOMER_NAME_FIELD.y, AGREEMENT_CUSTOMER_NAME_FIELD.width, { size: 9, minSize: 6, color: rgb(0.0, 0.27, 0.55) });
    }
    if (spec.page === SIGNATURE_FIELD.page) {
      const printedCustomerName = signature?.printedName || fields.customerName;
      const storeRepName = fields.storeRep || "Jamie Edwards";
      const storeRepDate = fields.preparedDate || fields.saleDate || todayDisplay();

      drawFitText(page, font, printedCustomerName, SIGNATURE_FIELD.printedName.x, SIGNATURE_FIELD.printedName.y, SIGNATURE_FIELD.printedName.width, { size: 9, minSize: 6, color: rgb(0.0, 0.27, 0.65) });
      drawFitText(page, font, storeRepName, STORE_REP_FIELD.name.x, STORE_REP_FIELD.name.y, STORE_REP_FIELD.name.width, { size: 9, minSize: 6, color: rgb(0.0, 0.27, 0.65) });
      drawFitText(page, font, storeRepDate, STORE_REP_FIELD.date.x, STORE_REP_FIELD.date.y, STORE_REP_FIELD.date.width, { size: 9, minSize: 6, color: rgb(0.0, 0.27, 0.65) });
      drawFitText(page, font, "Sales Manager", STORE_REP_FIELD.title.x, STORE_REP_FIELD.title.y, STORE_REP_FIELD.title.width, { size: 9, minSize: 6, color: rgb(0.0, 0.27, 0.65) });
    }
    if (signature) {
      const initials = text(signature.initials);
      INITIAL_FIELDS.filter((field) => field.page === spec.page).forEach((field) => {
        drawText(page, font, initials, field.x, field.y, { size: 12, color: rgb(0.0, 0.27, 0.65) });
      });
      if (spec.page === SIGNATURE_FIELD.page) {
        if (signature.signatureDataUrl?.startsWith("data:image/")) {
          const [, base64] = signature.signatureDataUrl.split(",", 2);
          if (base64) {
            const image = await pdfDoc.embedPng(Buffer.from(base64, "base64"));
            page.drawImage(image, {
              x: SIGNATURE_FIELD.signature.x,
              y: SIGNATURE_FIELD.signature.y,
              width: SIGNATURE_FIELD.signature.width,
              height: SIGNATURE_FIELD.signature.height,
            });
          }
        }
        drawText(page, font, signature.signedDate || todayDisplay(), SIGNATURE_FIELD.date.x, SIGNATURE_FIELD.date.y, { size: 9, color: rgb(0.0, 0.27, 0.65) });
      }
    }
  }
}

function fileGroupLabel(group) {
  if (group === "estimate") return "Estimate(s)";
  if (group === "order") return "Ack / Order / Invoice";
  if (group === "receipt") return "Receipt(s)";
  return "Supporting Document";
}

function documentStatusLines(record) {
  return ["estimate", "order", "receipt"].map((group) => {
    const files = record.files.filter((file) => file.group === group).map((file) => file.originalname);
    const status = files.length ? files.join(", ") : (record.docMissing?.[group] ? "Not available or sent separately" : "Not confirmed");
    return `${fileGroupLabel(group)}: ${status}`;
  });
}

async function buildPdf(record, signature = null) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawSummaryPage(pdfDoc, font, boldFont, record.fields, documentStatusLines(record));

  await appendTemplatePages(pdfDoc, font, record.fields, signature);

  for (const file of record.files) {
    await appendAttachment(pdfDoc, font, boldFont, {
      ...file,
      groupLabel: fileGroupLabel(file.group),
    });
  }

  return Buffer.from(await pdfDoc.save());
}

async function sendCustomerEmail(record, signUrl, pdfPath) {
  if (!smtpCanSend()) return { sent: false, reason: "SMTP is not configured. Copy the customer link and email the PDF manually." };
  if (!record.fields.email) return { sent: false, reason: "Customer email is blank." };

  const transporter = createTransporter();
  const label = record.fields.invoiceNumber || record.fields.estimateNumber || record.id;
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: record.fields.email,
    subject: `Edgewater Cabinet Store contract ready - ${label}`,
    text: [
      `Hello ${record.fields.customerName || ""},`,
      "",
      "Your Edgewater Cabinet Store contract PDF is attached.",
      "",
      `Please review the PDF, then sign here: ${signUrl}`,
      "",
      "Thank you.",
    ].join("\n"),
    attachments: [{ filename: quickContractFilename(record), path: pdfPath }],
  });
  return { sent: true, messageId: result.messageId, to: record.fields.email };
}

async function sendSignedEmail(record, signedPdfPath) {
  if (!smtpCanSend()) return { sent: false, reason: "SMTP is not configured. Download the signed PDF manually." };
  const to = smtpStoreRecipient();
  if (!to) return { sent: false, reason: "SMTP_TO is not configured. Download the signed PDF manually." };

  const transporter = createTransporter();
  const label = record.fields.invoiceNumber || record.fields.estimateNumber || record.id;
  const attachments = [{ filename: quickContractFilename(record, { signed: true }), path: signedPdfPath }];
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    cc: record.fields.email || undefined,
    subject: `Signed Edgewater contract - ${record.fields.customerName || "Customer"} - ${label}`,
    text: [
      "A customer signed the quick fallback contract.",
      "",
      `Customer: ${record.fields.customerName || ""}`,
      `Email: ${record.fields.email || ""}`,
      `Phone: ${record.fields.phone || ""}`,
      `Estimate #: ${record.fields.estimateNumber || ""}`,
      `Ack / invoice #: ${record.fields.invoiceNumber || ""}`,
      `Receipt #: ${record.fields.receiptNumber || ""}`,
      "",
      "The signed PDF is attached.",
    ].join("\n"),
    attachments,
  });
  return { sent: true, messageId: result.messageId, to };
}

function fieldsFromBody(body) {
  const keys = [
    "customerName",
    "email",
    "phone",
    "jobAddress",
    "estimateNumber",
    "contractNumber",
    "invoiceNumber",
    "receiptNumber",
    "saleDate",
    "paymentDate",
    "preparedDate",
    "paymentMethod",
    "invoiceAmount",
    "amountPaid",
    "balanceDue",
    "storeRep",
    "workDescription",
    "notes",
  ];
  const fields = {};
  keys.forEach((key) => { fields[key] = text(body[key]); });
  return fields;
}

function docMissingFromBody(body) {
  return {
    estimate: body.estimateMissing === "true",
    order: body.orderMissing === "true",
    receipt: body.receiptMissing === "true",
  };
}

function agreementChecklistFromBody(body) {
  const checklist = body && typeof body.agreementChecklist === "object" && !Array.isArray(body.agreementChecklist)
    ? body.agreementChecklist
    : {};
  return Object.fromEntries(REQUIRED_AGREEMENT_CHECKS.map((key) => [key, checklist[key] === true]));
}

function agreementChecklistComplete(checklist) {
  return REQUIRED_AGREEMENT_CHECKS.every((key) => checklist?.[key] === true);
}

function validateCreate(fields, docMissing, files) {
  if (!fields.customerName) return "Customer name is required.";
  if (!fields.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return "A valid customer email is required.";
  for (const group of ["estimate", "order", "receipt"]) {
    const hasFile = files.some((file) => file.fieldname === group);
    if (!hasFile && !docMissing[group]) return "Attach or confirm the estimate, acknowledgement/order/invoice, and receipt sections.";
  }
  return "";
}

function publicRecord(record, req) {
  const base = publicBaseUrl(req);
  return {
    id: record.id,
    fields: record.fields,
    documentStatus: documentStatusLines(record),
    signedAt: record.signedAt || "",
    pdfUrl: `${base}/api/quick-contracts/${record.id}/pdf?token=${record.token}`,
    signedPdfUrl: record.signedAt ? `${base}/api/quick-contracts/${record.id}/pdf?kind=signed&token=${record.token}` : "",
  };
}

function mountQuickContractRoutes(app) {
  app.post("/api/quick-contracts", upload.fields([
    { name: "estimate", maxCount: 4 },
    { name: "order", maxCount: 4 },
    { name: "receipt", maxCount: 4 },
  ]), async (req, res, next) => {
    try {
      const fields = fieldsFromBody(req.body || {});
      const docMissing = docMissingFromBody(req.body || {});
      const files = Object.values(req.files || {}).flat();
      const error = validateCreate(fields, docMissing, files);
      if (error) return res.status(400).json({ error });

      const id = `quick-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
      const token = crypto.randomBytes(16).toString("hex");
      const dir = recordDir(id);
      await ensureDir(dir);

      const storedFiles = [];
      for (const file of files) {
        const filename = `${storedFiles.length + 1}-${safeFilename(file.originalname, "document")}`;
        const filePath = path.join(dir, filename);
        await fs.writeFile(filePath, file.buffer);
        storedFiles.push({
          group: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: filePath,
        });
      }

      const record = {
        id,
        token,
        fields,
        docMissing,
        files: storedFiles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const unsignedPath = path.join(dir, "contract.pdf");
      await fs.writeFile(unsignedPath, await buildPdf(record));
      record.unsignedPdfPath = unsignedPath;
      const signUrl = `${publicBaseUrl(req)}/QuickPaidContract.html?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
      record.signUrl = signUrl;

      record.customerEmail = {
        sent: false,
        reason: "Not sent yet.",
      };
      await saveRecord(record);

      res.status(201).json({
        ok: true,
        id,
        signUrl,
        pdfUrl: `${publicBaseUrl(req)}/api/quick-contracts/${id}/pdf?token=${token}`,
        email: record.customerEmail,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/quick-contracts/:id/email", async (req, res, next) => {
    try {
      const record = await readRecord(req.params.id);
      assertAccess(record, req.body?.token || req.query.token);
      if (record.signedAt) return res.status(409).json({ error: "This contract has already been signed." });
      const signUrl = record.signUrl || `${publicBaseUrl(req)}/QuickPaidContract.html?id=${encodeURIComponent(record.id)}&token=${encodeURIComponent(record.token)}`;
      const emailResult = await sendCustomerEmail(record, signUrl, record.unsignedPdfPath);
      record.customerEmail = {
        sentAt: new Date().toISOString(),
        ...emailResult,
      };
      record.updatedAt = new Date().toISOString();
      await saveRecord(record);
      res.json({ ok: true, email: emailResult });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/quick-contracts/exceptions/pending", async (_req, res, next) => {
    try {
      res.json({ ok: true, records: await listQuickExceptions() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/quick-contracts/exceptions/all", async (_req, res, next) => {
    try {
      res.json({ ok: true, records: await listQuickExceptions({ includeAll: true }) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/quick-contracts/:id", async (req, res, next) => {
    try {
      const record = await readRecord(req.params.id);
      assertAccess(record, req.query.token);
      res.json(publicRecord(record, req));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/quick-contracts/:id/pdf", async (req, res, next) => {
    try {
      const record = await readRecord(req.params.id);
      assertAccess(record, req.query.token);
      const signed = req.query.kind === "signed";
      const filePath = signed ? record.signedPdfPath : record.unsignedPdfPath;
      if (!filePath) return res.status(404).json({ error: "PDF not found." });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${quickContractFilename(record, { signed }).replace(/"/g, "")}"`);
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/quick-contracts/:id/sign", async (req, res, next) => {
    try {
      const record = await readRecord(req.params.id);
      assertAccess(record, req.body?.token);
      if (record.signedAt) return res.status(409).json({ error: "This contract has already been signed." });

      const signature = {
        printedName: text(req.body?.printedName),
        initials: text(req.body?.initials),
        reviewedAndAccepted: Boolean(req.body?.reviewedAndAccepted),
        agreementChecklist: agreementChecklistFromBody(req.body || {}),
        signatureDataUrl: text(req.body?.signatureDataUrl),
        signedDate: todayDisplay(),
        signedAt: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get("user-agent") || "",
      };
      if (!signature.printedName) return res.status(400).json({ error: "Printed name is required." });
      if (!signature.initials) return res.status(400).json({ error: "Initials are required." });
      if (!agreementChecklistComplete(signature.agreementChecklist)) return res.status(400).json({ error: "Complete the initials and signature checklist." });
      if (!signature.reviewedAndAccepted) return res.status(400).json({ error: "Confirm that you reviewed the PDF and agree to sign electronically." });
      if (!signature.signatureDataUrl.startsWith("data:image/")) return res.status(400).json({ error: "Signature is required." });

      const signedPath = path.join(recordDir(record.id), "SIGNED-contract.pdf");
      await fs.writeFile(signedPath, await buildPdf(record, signature));
      record.signature = { ...signature, signatureDataUrl: "[captured]" };
      record.signedAt = signature.signedAt;
      record.signedPdfPath = signedPath;
      record.updatedAt = new Date().toISOString();
      const emailResult = await sendSignedEmail(record, signedPath);
      record.signedEmail = {
        sentAt: new Date().toISOString(),
        ...emailResult,
      };
      await saveRecord(record);

      res.json({
        ok: true,
        signedPdfUrl: `${publicBaseUrl(req)}/api/quick-contracts/${record.id}/pdf?kind=signed&token=${record.token}`,
        email: emailResult,
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  mountQuickContractRoutes,
};
