const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const EXTRACT_SCRIPT = path.join(ROOT, "scripts", "extract_pdf_text.py");
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 180000);
const OCR_MAX_BUFFER = 30 * 1024 * 1024;

function clean(value) {
  return String(value ?? "").trim();
}

function shortError(error) {
  return clean(error?.stderr || error?.message || error).slice(0, 800);
}

async function runCommand(command, args, options = {}) {
  return execFileAsync(command, args, {
    timeout: OCR_TIMEOUT_MS,
    maxBuffer: OCR_MAX_BUFFER,
    windowsHide: true,
    ...options,
  });
}

async function extractPdfTextWithPython(filePath) {
  const python = process.env.PYTHON_BIN || "python";
  const { stdout } = await runCommand(python, [EXTRACT_SCRIPT, filePath]);
  return clean(stdout);
}

async function extractPdfTextWithPdftotext(filePath) {
  const { stdout } = await runCommand(process.env.PDFTOTEXT_BIN || "pdftotext", ["-layout", filePath, "-"]);
  return clean(stdout);
}

async function extractPdfText(filePath) {
  const errors = [];
  try {
    const text = await extractPdfTextWithPython(filePath);
    if (text) return { text, engine: "pypdf", errors };
  } catch (error) {
    errors.push(`pypdf: ${shortError(error)}`);
  }

  try {
    const text = await extractPdfTextWithPdftotext(filePath);
    if (text) return { text, engine: "pdftotext", errors };
  } catch (error) {
    errors.push(`pdftotext: ${shortError(error)}`);
  }

  return { text: "", engine: "", errors };
}

async function ocrPdf(filePath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
  const command = process.env.OCRMYPDF_BIN || "ocrmypdf";
  await runCommand(command, [
    "--skip-text",
    "--rotate-pages",
    "--deskew",
    "--optimize",
    "1",
    "--output-type",
    "pdf",
    filePath,
    outputPath,
  ]);
  return outputPath;
}

async function ocrImage(filePath) {
  const command = process.env.TESSERACT_BIN || "tesseract";
  const { stdout } = await runCommand(command, [filePath, "stdout", "-l", process.env.OCR_LANGUAGE || "eng"]);
  return clean(stdout);
}

function textPreview(text) {
  return clean(text).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").slice(0, 5000);
}

async function extractDocumentText({ filePath, extension, outputDir, outputBaseName }) {
  const ext = clean(extension).replace(/^\./, "").toLowerCase();
  const errors = [];

  if (ext === "pdf") {
    const direct = await extractPdfText(filePath);
    errors.push(...direct.errors);
    if (direct.text.length > 80) {
      return {
        ok: true,
        text: direct.text,
        textPreview: textPreview(direct.text),
        engine: direct.engine,
        ocrApplied: false,
        outputPath: "",
        errors,
      };
    }

    const outputPath = path.join(outputDir, `${outputBaseName || path.basename(filePath, path.extname(filePath))}-ocr.pdf`);
    try {
      await ocrPdf(filePath, outputPath);
      const extracted = await extractPdfText(outputPath);
      errors.push(...extracted.errors);
      return {
        ok: Boolean(extracted.text),
        text: extracted.text,
        textPreview: textPreview(extracted.text),
        engine: extracted.engine ? `ocrmypdf + ${extracted.engine}` : "ocrmypdf",
        ocrApplied: true,
        outputPath,
        errors,
      };
    } catch (error) {
      errors.push(`ocrmypdf: ${shortError(error)}`);
      return {
        ok: false,
        text: direct.text,
        textPreview: textPreview(direct.text),
        engine: direct.engine,
        ocrApplied: false,
        outputPath: "",
        errors,
      };
    }
  }

  if (["png", "jpg", "jpeg", "webp", "tif", "tiff"].includes(ext)) {
    try {
      const text = await ocrImage(filePath);
      return {
        ok: Boolean(text),
        text,
        textPreview: textPreview(text),
        engine: "tesseract",
        ocrApplied: true,
        outputPath: "",
        errors,
      };
    } catch (error) {
      return {
        ok: false,
        text: "",
        textPreview: "",
        engine: "",
        ocrApplied: false,
        outputPath: "",
        errors: [`tesseract: ${shortError(error)}`],
      };
    }
  }

  return {
    ok: false,
    text: "",
    textPreview: "",
    engine: "",
    ocrApplied: false,
    outputPath: "",
    errors: [`Unsupported OCR file type: ${ext || "unknown"}`],
  };
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, "").replace(/^1+/, "").slice(0, 10);
  if (digits.length !== 10) return "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeDate(value) {
  const text = clean(value);
  let match = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`;
  }
  match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return `${match[2].padStart(2, "0")}/${match[3].padStart(2, "0")}/${match[1]}`;
  return "";
}

function relevantLines(text) {
  return clean(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function firstMatch(lines, regex) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return clean(match[1] || match[0]);
  }
  return "";
}

function guessCustomerName(lines) {
  const labelRegex = /\b(?:customer|bill to|sold to|ship to|name)\b\s*:?\s*(.+)$/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labeled = line.match(labelRegex);
    if (labeled && clean(labeled[1]).length > 2) return clean(labeled[1]);
    if (/^(customer|bill to|sold to|ship to)$/i.test(line) && lines[index + 1]) return lines[index + 1];
  }
  return "";
}

function guessAddress(lines) {
  const street = /\b(\d{2,6}\s+[A-Za-z0-9 .'-]+(?:Ave|Avenue|Blvd|Boulevard|Cir|Circle|Ct|Court|Dr|Drive|Hwy|Highway|Ln|Lane|Pkwy|Parkway|Pl|Place|Rd|Road|St|Street|Ter|Terrace|Way)\b[^\n,]*(?:,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5})?)/i;
  return firstMatch(lines, street);
}

function suggestOcrFields(text, fileName = "") {
  const lines = relevantLines(text);
  const joined = lines.join("\n");
  const email = firstMatch(lines, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const phone = normalizePhone(firstMatch(lines, /\b(?:\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/));
  const documentNumber = firstMatch(lines, /\b(?:invoice|inv|estimate|quote|order|contract|document|po)\s*(?:#|number|no\.?)?\s*[:=-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})\b/i);
  const date = normalizeDate(firstMatch(lines, /\b\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}\b/));

  return {
    documentType: documentTypeFromText(`${fileName}\n${joined}`),
    estimateSource: estimateSourceFromText(`${fileName}\n${joined}`),
    customerName: guessCustomerName(lines),
    phone,
    email,
    address: guessAddress(lines),
    documentNumber,
    date,
  };
}

function documentTypeFromText(value) {
  const lower = clean(value).toLowerCase();
  if (/ack|acknowledg/.test(lower)) return "acknowledgement";
  if (/receipt|paid|payment/.test(lower)) return "receipt";
  if (/estimate|quote|cabquote|lava/.test(lower)) return "estimate";
  if (/contract|signed|agreement/.test(lower)) return "contract";
  if (/invoice/.test(lower)) return "invoice";
  if (/\bpo\b|purchase order|\border\b/.test(lower)) return "purchase-order";
  if (/delivery|tracking|ship/.test(lower)) return "delivery";
  if (/product|sku|item/.test(lower)) return "product";
  if (/supplier|vendor/.test(lower)) return "supplier";
  return "review";
}

function estimateSourceFromText(value) {
  const lower = clean(value).toLowerCase();
  if (lower.includes("rfms")) return "RFMS";
  if (lower.includes("cabquote")) return "CabQuotes";
  if (lower.includes("lava")) return "LavaCake";
  if (lower.includes("vision")) return "Vision";
  return "";
}

module.exports = {
  extractDocumentText,
  suggestOcrFields,
};
