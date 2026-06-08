const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const {
  HEADER_FIELDS,
  HEADER_PAGES,
  INITIAL_FIELDS,
  PAGE_LABELS,
  PAGE_2_CHECKS,
  SIGNATURE_SECTIONS,
} = require("./fieldMap");
const { generatedPath, sha256File } = require("./storage");
const { formatDateDisplay } = require("./validation");

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "assets", "templates", "customer-packet.pdf");
const ENCRYPT_SCRIPT = path.join(ROOT, "scripts", "encrypt_pdf.py");
const REQUIRED_PAGES = [4];
const CUSTOMER_HIDDEN_PAGES = [11, 13];
const PAIRED_CUSTOMER_PAGES = {
  15: 16,
};

function clean(value) {
  return String(value ?? "").trim();
}

function singleLine(value) {
  return clean(value).replace(/\s+/g, " ");
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

function addressDisplayText(value) {
  return addressDisplayLines(value).join("\n");
}

function compactPhone(value) {
  return clean(value).replace(/\D/g, "");
}

function customerFullName(data) {
  return [data.customer.firstName, data.customer.lastName].map(clean).filter(Boolean).join(" ");
}

function installationAddress(data) {
  return clean(data.order?.installAddress || data.project?.installAddress || data.customer?.installAddress || data.customer?.mailingAddress);
}

function hasEstimateAttachment(data) {
  return Boolean(clean(data.estimate?.dataUrl));
}

function includedPageNumbers(data) {
  const allPages = PAGE_LABELS.map((item) => item.page);
  const selected = Array.isArray(data.pages?.included) ? data.pages.included : allPages;
  let valid = selected
    .map(Number)
    .filter((page) => Number.isInteger(page) && allPages.includes(page) && !CUSTOMER_HIDDEN_PAGES.includes(page));

  if (hasEstimateAttachment(data)) {
    valid.push(3);
  } else {
    valid = valid.filter((page) => page !== 3);
  }

  Object.entries(PAIRED_CUSTOMER_PAGES).forEach(([source, paired]) => {
    if (valid.includes(Number(source))) {
      valid.push(Number(paired));
    }
  });

  let effective = valid.length ? valid : allPages;
  if (hasEstimateAttachment(data)) {
    effective = [...effective, 3];
  } else {
    effective = effective.filter((page) => page !== 3);
  }

  return [...new Set([...effective, ...REQUIRED_PAGES])].sort((a, b) => a - b);
}

function includedPageSet(data) {
  return new Set(includedPageNumbers(data));
}

function generatedPassword(data) {
  const firstInitial = clean(data.customer.firstName).replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase();
  const lastInitial = clean(data.customer.lastName).replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase();
  const initials = `${firstInitial}${lastInitial}`;
  const address = clean(data.order?.installAddress || data.customer?.mailingAddress || data.customer?.billingAddress);
  const addressDigits = (address.match(/\d{1,6}/) || [""])[0];
  const phone = compactPhone(data.customer.phone1 || data.customer.phone2).slice(-4);
  const emailToken = clean(data.customer.email).split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  const contactToken = phone.length === 4 ? phone : emailToken;

  if (initials.length < 2 || !addressDigits || !contactToken) {
    throw new Error("Customer first and last name initials, address number, and either a phone number or email are required for PDF password protection.");
  }

  return `${initials}${addressDigits}${contactToken}`;
}

function selectedSignatureSections(data) {
  const requested = Array.isArray(data.signing?.sections) ? data.signing.sections : ["mainAgreement"];
  const sections = new Set(requested);
  sections.add("mainAgreement");

  if (data.payments?.splitPaymentApproved) {
    sections.add("splitPayment");
  }

  const included = includedPageSet(data);
  return [...sections].filter((key) => {
    const section = SIGNATURE_SECTIONS[key];
    return section && included.has(section.signature.page);
  });
}

function fitText(text, font, maxWidth, initialSize = 9, minSize = 6) {
  let size = initialSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawValue(page, font, value, x, y, width, options = {}) {
  const text = singleLine(value);
  if (!text) return;

  const size = fitText(text, font, width, options.size || 9.5, options.minSize || 6);
  const height = options.height || size + 5;

  page.drawRectangle({
    x: x - 1,
    y: y - 2,
    width: width + 2,
    height,
    color: rgb(1, 1, 1),
    opacity: options.opacity ?? 0.92,
  });

  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: options.color || rgb(0.07, 0.11, 0.11),
  });
}

function drawTextReplacement(page, font, text, x, y, width, height, options = {}) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
    opacity: options.opacity ?? 1,
  });

  page.drawText(text, {
    x: options.textX ?? x,
    y: options.textY ?? y + 3,
    size: options.size || 10,
    font: options.font || font,
    color: rgb(0.07, 0.11, 0.11),
  });
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  const hardLines = clean(text).split(/\r?\n/).map(clean).filter(Boolean);

  hardLines.forEach((hardLine) => {
    const words = hardLine.split(/\s+/).filter(Boolean);
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }

    if (line) lines.push(line);
  });

  return lines;
}

function drawMultilineValue(page, font, value, x, y, width, height, options = {}) {
  const text = clean(value);
  if (!text) return;

  const size = options.size || 9;
  const lineHeight = options.lineHeight || size + 3;
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const lines = wrapText(text, font, size, width).slice(0, maxLines);

  page.drawRectangle({
    x: x - 2,
    y: y - height + 2,
    width: width + 4,
    height,
    color: rgb(1, 1, 1),
    opacity: options.opacity ?? 0.9,
  });

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: rgb(0.07, 0.11, 0.11),
    });
  });
}

function drawCheck(page, x, y) {
  page.drawText("X", {
    x: x + 1.5,
    y: y - 0.5,
    size: 10,
    color: rgb(0.02, 0.25, 0.22),
  });
}

function drawHeader(page, font, data) {
  const values = {
    invoiceNumber: data.order.invoiceNumber,
    saleDate: data.order.saleDate,
    customerHeader: customerFullName(data),
    installerName: data.order.installerName,
    installDate: data.order.installDate,
  };

  HEADER_FIELDS.forEach((field) => {
    drawValue(page, font, values[field.key], field.x, field.y, field.width, { size: 8.5 });
  });
}

function drawPageOne(page, font, data) {
  const customer = data.customer;
  const textOptIn = clean(customer.textOptIn).toLowerCase();

  drawCheck(page, textOptIn === "yes" ? 544 : 686, 695);
  drawValue(page, font, customerFullName(data), 150, 683, 180);
  drawValue(page, font, customer.phone1, 430, 683, 135);
  drawValue(page, font, customer.referral, 150, 650, 180);
  drawValue(page, font, customer.phone2, 430, 650, 135);
  drawValue(page, font, customer.email, 150, 617, 300);
  drawMultilineValue(page, font, addressDisplayText(customer.mailingAddress), 150, 584, 370, 35);
  drawMultilineValue(page, font, addressDisplayText(installationAddress(data)), 150, 540, 370, 35);
  drawMultilineValue(page, font, data.notes.companyNotes || customer.notes, 36, 500, 520, 115);
}

function drawPageTwo(page, font, data) {
  const { customer, order, project } = data;

  drawValue(page, font, order.salesRep, 446, 743, 105, { size: 8.5 });
  drawValue(page, font, order.measurementDate || order.saleDate, 446, 723, 105, { size: 8.5 });
  drawValue(page, font, customerFullName(data), 124, 652, 140);
  drawValue(page, font, installationAddress(data), 358, 652, 205, { size: 8 });
  drawValue(page, font, customer.phone1, 73, 626, 135);
  drawValue(page, font, customer.email, 259, 626, 300, { size: 8 });

  const checks = [
    ["roomType", project.roomType],
    ["projectType", project.projectType],
    ["hasIsland", project.hasIsland],
    ["dishwasher", project.dishwasher],
    ["cabinetStyle", project.cabinetStyle],
    ["finish", project.finish],
    ["budgetRange", project.budgetRange],
  ];

  checks.forEach(([group, rawValue]) => {
    const value = clean(rawValue).toLowerCase();
    const target = PAGE_2_CHECKS[group]?.[value] || PAGE_2_CHECKS[group]?.[rawValue];
    if (target) drawCheck(page, target.x, target.y);
  });

  drawValue(page, font, project.roomTypeOther, 316, 558, 245);
  drawValue(page, font, project.desiredTimeline, 125, 507, 430);
  drawValue(page, font, project.totalWallLength, 191, 454, 365);
  drawValue(page, font, project.ceilingHeight, 111, 428, 445);
  drawValue(page, font, project.islandSize, 252, 402, 300);
  drawValue(page, font, project.refrigeratorWidth, 136, 349, 415);
  drawValue(page, font, project.rangeCooktopSize, 153, 323, 400);
  drawValue(page, font, project.dishwasherOther, 207, 282, 250);
  drawMultilineValue(page, font, project.projectNotes, 36, 126, 520, 86);
}

function drawAgreementPages(pages, font, data) {
  HEADER_PAGES.forEach((pageNumber) => drawHeader(pages[pageNumber - 1], font, data));
  drawValue(pages[4], font, customerFullName(data), 136, 552, 135, { size: 9 });
}

async function drawStoreSignature(pdfDoc, page, font, data) {
  drawValue(page, font, data.order.storeRep, 166, 547, 170);
  drawValue(page, font, data.order.storeRepDate || data.order.saleDate, 395, 547, 110);
  drawValue(page, font, data.order.storeRepTitle, 68, 517, 250);

  if (data.order.storeSignatureDataUrl) {
    await drawSignatureImage(pdfDoc, page, data.order.storeSignatureDataUrl, 166, 531, 170, 34);
  }
}

function drawSplitPayment(page, font, data) {
  if (!data.payments?.splitPaymentApproved) return;

  drawValue(page, font, data.payments.totalInvoiceAmount || data.order.invoiceAmount, 166, 565, 140);

  const rows = data.payments.rows || [];
  [510, 483, 456].forEach((y, index) => {
    const row = rows[index] || {};
    drawValue(page, font, row.amount, 135, y, 82);
    drawValue(page, font, row.dueDate, 234, y, 76);
    drawValue(page, font, row.paidInitials, 333, y, 62);
    drawValue(page, font, row.paidAmountDate, 432, y, 95);
  });
}

function drawJobOrders(page, font, data) {
  drawValue(page, font, customerFullName(data), 160, 636, 180);
  drawValue(page, font, data.order.invoiceNumber, 160, 613, 150);
  drawValue(page, font, data.order.invoiceAmount, 160, 590, 150);
  drawValue(page, font, data.order.customerAcceptedDate || data.order.saleDate, 160, 567, 150);

  const rows = data.vendors || [];
  [518, 394, 269, 144].forEach((startY, index) => {
    const row = rows[index] || {};
    const estimateOrderNumber = [
      row.vendorEstimateNumber && `Est ${row.vendorEstimateNumber}`,
      row.vendorOrderNumber && `Order ${row.vendorOrderNumber}`,
    ].filter(Boolean).join(" / ");
    const materialDates = [
      row.expectedMaterialDate && `Expected ${row.expectedMaterialDate}`,
      row.actualMaterialDate && `Delivered ${row.actualMaterialDate}`,
    ].filter(Boolean).join(" / ");
    drawValue(page, font, row.customerPayment, 165, startY, 145);
    drawValue(page, font, row.vendor, 430, startY, 145);
    drawValue(page, font, row.customerPaymentDate, 165, startY - 23, 145);
    drawValue(page, font, estimateOrderNumber, 430, startY - 23, 145, { size: 7.5, minSize: 5.5 });
    drawValue(page, font, row.vendorEstimateAmount, 165, startY - 46, 145);
    drawValue(page, font, row.vendorOrderDate, 430, startY - 46, 145);
    drawValue(page, font, materialDates, 165, startY - 69, 145, { size: 7.5, minSize: 5.5 });
  });
}

function pageForOriginalNumber(pages, originalPageNumbers, pageNumber) {
  const index = Array.isArray(originalPageNumbers)
    ? originalPageNumbers.indexOf(pageNumber)
    : pageNumber - 1;
  return index >= 0 ? pages[index] : null;
}

function applyEstimateWordingOverlays(pages, font, boldFont, originalPageNumbers = PAGE_LABELS.map((item) => item.page)) {
  const estimatePage = pageForOriginalNumber(pages, originalPageNumbers, 3);
  if (estimatePage) {
    drawTextReplacement(estimatePage, boldFont, "POS ESTIMATE", 220, 678, 190, 28, {
      textX: 230,
      textY: 687,
      size: 23,
      font: boldFont,
    });
  }

  const agreementPage = pageForOriginalNumber(pages, originalPageNumbers, 6);
  if (agreementPage) {
    drawTextReplacement(agreementPage, font, "estimate", 48, 358, 66, 18, {
      textX: 51,
      textY: 363,
      size: 11,
    });
  }

  const jobOrdersPage = pageForOriginalNumber(pages, originalPageNumbers, 11);
  if (jobOrdersPage) {
    [495, 370, 246, 121].forEach((y) => {
      drawTextReplacement(jobOrdersPage, font, "Vendor Estimate", 335, y - 4, 94, 17, {
        textX: 337,
        textY: y,
        size: 9.7,
      });
    });

    [472, 347, 222, 98].forEach((y) => {
      drawTextReplacement(jobOrdersPage, font, "Vendor Estimate Amount:", 300, y - 4, 130, 17, {
        textX: 303,
        textY: y,
        size: 9.2,
      });
    });
  }
}

function drawMaterialRows(page, font, data) {
  const rows = (data.materialRows || []).slice(0, 10);
  const columns = [
    ["date", 38, 74],
    ["productCode", 78, 55],
    ["poNumber", 134, 48],
    ["supplier", 184, 74],
    ["itemName", 260, 112],
    ["styleColor", 374, 68],
    ["unitCount", 444, 45],
    ["unitCost", 490, 48],
    ["total", 540, 45],
    ["freight", 584, 28],
  ];

  rows.forEach((row, index) => {
    const y = 690 - index * 45;
    columns.forEach(([key, x, width]) => {
      drawValue(page, font, row[key], x, y, width, { size: 7.5, minSize: 5.5 });
    });
  });
}

function drawAdditionalNotes(page, font, boldFont, data) {
  const notes = [
    data.notes.companyNotes && `Company notes: ${data.notes.companyNotes}`,
    data.notes.customerNotes && `Customer notes: ${data.notes.customerNotes}`,
    data.notes.internalNotes && `Internal notes: ${data.notes.internalNotes}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!notes) return;

  page.drawText("Additional Notes", {
    x: 36,
    y: 730,
    size: 16,
    font: boldFont,
    color: rgb(0.07, 0.11, 0.11),
  });
  drawMultilineValue(page, font, notes, 36, 700, 520, 610, { size: 10, lineHeight: 14, opacity: 1 });
}

function fieldName(prefix, specKey) {
  return `${prefix}_${specKey}`.replace(/[^a-z0-9_]/gi, "_");
}

function addTextField(form, page, name, x, y, width, height, options = {}) {
  const field = form.createTextField(name);
  if (options.multiline) field.enableMultiline();
  field.addToPage(page, {
    x,
    y,
    width,
    height,
    borderWidth: 0.6,
    borderColor: rgb(0.2, 0.48, 0.44),
    backgroundColor: rgb(0.98, 1, 0.99),
    textColor: rgb(0.07, 0.11, 0.11),
  });
  return field;
}

function addSignableFields(pdfDoc, data) {
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const included = includedPageSet(data);

  if (included.has(1)) {
    addTextField(form, pages[0], "customer_notes", 36, 360, 520, 120, { multiline: true });
  }

  INITIAL_FIELDS.forEach((spec, index) => {
    if (!included.has(spec.page)) return;
    addTextField(form, pages[spec.page - 1], `customer_initials_${index + 1}`, spec.x, spec.y, 48, 17);
  });

  Object.entries(SIGNATURE_SECTIONS).forEach(([key, section]) => {
    const sig = section.signature;
    if (!included.has(sig.page)) return;
    addTextField(form, pages[sig.page - 1], fieldName("signature", key), sig.x, sig.y, sig.width, sig.height);

    if (section.date && included.has(section.date.page)) {
      const date = section.date;
      addTextField(form, pages[date.page - 1], fieldName("date", key), date.x, date.y, date.width, date.height);
    }

    if (section.printedName && included.has(section.printedName.page)) {
      const printed = section.printedName;
      addTextField(form, pages[printed.page - 1], "customer_printed_name", printed.x, printed.y, printed.width, printed.height);
    }
  });
}

async function drawSignatureImage(pdfDoc, page, dataUrl, x, y, width, height) {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return false;

  const [meta, base64] = dataUrl.split(",", 2);
  if (!base64) return false;

  const bytes = Buffer.from(base64, "base64");
  const image = meta.includes("jpeg") || meta.includes("jpg")
    ? await pdfDoc.embedJpg(bytes)
    : await pdfDoc.embedPng(bytes);

  page.drawImage(image, { x, y, width, height });
  return true;
}

function dataUrlBytes(dataUrl) {
  const [meta, base64] = clean(dataUrl).split(",", 2);
  if (!meta || !base64) return null;

  return {
    meta,
    bytes: Buffer.from(base64, "base64"),
  };
}

function scaledBox(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}

async function applyEstimateAttachment(pdfDoc, data) {
  if (!includedPageSet(data).has(3)) return;

  const attachment = dataUrlBytes(data.estimate?.dataUrl);
  if (!attachment) return;

  if (attachment.meta.includes("application/pdf")) {
    const estimatePdf = await PDFDocument.load(attachment.bytes);
    const [estimatePage] = await pdfDoc.copyPages(estimatePdf, [0]);
    pdfDoc.removePage(2);
    pdfDoc.insertPage(2, estimatePage);
    return;
  }

  if (attachment.meta.startsWith("data:image/")) {
    const page = pdfDoc.getPages()[2];
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: rgb(1, 1, 1),
    });

    const image = attachment.meta.includes("jpeg") || attachment.meta.includes("jpg")
      ? await pdfDoc.embedJpg(attachment.bytes)
      : await pdfDoc.embedPng(attachment.bytes);
    const box = scaledBox(image.width, image.height, width - 36, height - 36);
    page.drawImage(image, {
      x: 18 + box.x,
      y: 18 + box.y,
      width: box.width,
      height: box.height,
    });
  }
}

async function drawFinalSignaturePack(pdfDoc, font, data, signature) {
  const pages = pdfDoc.getPages();
  const initials = clean(signature.customerInitials);
  const signedDate = clean(signature.signedDate) || formatDateDisplay(new Date());
  const printedName = clean(signature.printedName) || customerFullName(data);
  const included = includedPageSet(data);

  INITIAL_FIELDS.forEach((spec) => {
    if (!included.has(spec.page)) return;
    drawValue(pages[spec.page - 1], font, initials, spec.x, spec.y, 48, { size: 10, color: rgb(0.11, 0.31, 0.85) });
  });

  const sections = selectedSignatureSections(data);

  for (const key of sections) {
    const section = SIGNATURE_SECTIONS[key];
    const sig = section.signature;
    if (!included.has(sig.page)) continue;
    await drawSignatureImage(pdfDoc, pages[sig.page - 1], signature.signatureDataUrl, sig.x, sig.y, sig.width, sig.height);

    if (section.date && included.has(section.date.page)) {
      const date = section.date;
      drawValue(pages[date.page - 1], font, signedDate, date.x, date.y, date.width, { size: 9, color: rgb(0.11, 0.31, 0.85) });
    }

    if (section.printedName && included.has(section.printedName.page)) {
      const printed = section.printedName;
      drawValue(pages[printed.page - 1], font, printedName, printed.x, printed.y, printed.width, { size: 9, color: rgb(0.11, 0.31, 0.85) });
    }
  }

  if (signature.customerNotes && included.has(1)) {
    drawMultilineValue(pages[0], font, signature.customerNotes, 36, 360, 520, 120, { size: 9 });
    data.notes.customerNotes = signature.customerNotes;
  }
}

function removeExcludedPages(pdfDoc, data) {
  const included = includedPageSet(data);
  for (let index = pdfDoc.getPageCount() - 1; index >= 0; index -= 1) {
    if (!included.has(index + 1)) {
      pdfDoc.removePage(index);
    }
  }
}

async function buildUnencryptedPdf(data, outputPath, mode, signature = null) {
  const templateBytes = await fs.readFile(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  if (mode === "final" && signature?.customerNotes) {
    data.notes.customerNotes = signature.customerNotes;
  }

  drawPageOne(pages[0], font, data);
  drawPageTwo(pages[1], font, data);
  drawAgreementPages(pages, font, data);
  await drawStoreSignature(pdfDoc, pages[7], font, data);
  drawSplitPayment(pages[8], font, data);
  drawJobOrders(pages[10], font, data);
  drawAdditionalNotes(pages[11], font, boldFont, data);
  drawMaterialRows(pages[12], font, data);
  applyEstimateWordingOverlays(pages, font, boldFont);
  await applyEstimateAttachment(pdfDoc, data);

  if (mode === "signable") {
    addSignableFields(pdfDoc, data);
    pdfDoc.getForm().updateFieldAppearances(font);
  }

  if (mode === "final" && signature) {
    await drawFinalSignaturePack(pdfDoc, font, data, signature);
  }

  removeExcludedPages(pdfDoc, data);

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  await fs.writeFile(outputPath, bytes);
}

async function encryptPdf(inputPath, outputPath, password) {
  const python = process.env.PYTHON_BIN || "python";
  await execFileAsync(python, [ENCRYPT_SCRIPT, inputPath, outputPath, password], {
    windowsHide: true,
    timeout: 60000,
  });
}

async function generatePdf(packet, kind, signature = null) {
  const password = generatedPassword(packet.data);
  const tmpPath = generatedPath(packet.id, kind, false);
  const finalPath = generatedPath(packet.id, kind, true);

  await buildUnencryptedPdf(packet.data, tmpPath, kind, signature);
  await encryptPdf(tmpPath, finalPath, password);
  await fs.rm(tmpPath, { force: true });

  return {
    path: finalPath,
    sha256: await sha256File(finalPath),
    password,
  };
}

async function generateBlankTemplatePages(pageNumbers) {
  const sourceBytes = await fs.readFile(TEMPLATE_PATH);
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const outputPdf = await PDFDocument.create();
  const totalPages = sourcePdf.getPageCount();
  const selected = [...new Set(pageNumbers)]
    .map((page) => Number(page))
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= totalPages);

  if (!selected.length) {
    const error = new Error("Select at least one valid template page.");
    error.status = 400;
    throw error;
  }

  const copiedPages = await outputPdf.copyPages(sourcePdf, selected.map((page) => page - 1));
  copiedPages.forEach((page) => outputPdf.addPage(page));
  const font = await outputPdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await outputPdf.embedFont(StandardFonts.HelveticaBold);
  applyEstimateWordingOverlays(outputPdf.getPages(), font, boldFont, selected);
  return outputPdf.save({ useObjectStreams: false });
}

module.exports = {
  generatedPassword,
  generateBlankTemplatePages,
  generatePdf,
  includedPageNumbers,
  selectedSignatureSections,
  SIGNATURE_SECTIONS,
};
