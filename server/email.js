const nodemailer = require("nodemailer");
const { contractPdfFilename } = require("./filenames");

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_TO);
}

function smtpCanSend() {
  return Boolean(process.env.SMTP_HOST);
}

function missingSmtpFields({ requireStoreRecipient = false } = {}) {
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
  if (requireStoreRecipient && !process.env.SMTP_TO) missing.push("SMTP_TO");
  return missing;
}

function smtpNotConfiguredReason(action, options) {
  const missing = missingSmtpFields(options);
  const detail = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
  return `SMTP is not configured.${detail} ${action}`;
}

function boolEnv(value) {
  return String(value || "").toLowerCase() === "true";
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: boolEnv(process.env.SMTP_SECURE),
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

async function sendFinalPacketEmail(packet, finalPdfPath, _password) {
  if (!smtpConfigured()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("Final PDF was saved locally.", { requireStoreRecipient: true }),
    };
  }

  const transporter = createTransporter();

  const customerName = `${packet.data.customer.firstName} ${packet.data.customer.lastName}`.trim();
  const invoice = packet.data.order.invoiceNumber || "No invoice number";

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_TO,
    subject: `Signed cabinet packet - ${customerName || "Customer"} - ${invoice}`,
    text: [
      "A customer packet has been signed.",
      "",
      `Customer: ${customerName}`,
      `Invoice: ${invoice}`,
      `Packet ID: ${packet.id}`,
      "",
      "The signed PDF is attached.",
    ].join("\n"),
    attachments: [
      {
        filename: contractPdfFilename(packet, { signed: true }),
        path: finalPdfPath,
      },
    ],
  });

  return {
    sent: true,
    to: process.env.SMTP_TO,
    messageId: result.messageId,
  };
}

async function sendCustomerLinkEmail(packet, signUrl, _password) {
  if (!smtpCanSend()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("Use the signing link or downloadable PDF fallback."),
    };
  }

  const customerEmail = packet.data.customer.email;
  if (!customerEmail) {
    return {
      sent: false,
      reason: "Customer email is blank. Use the signing link or downloadable PDF fallback.",
    };
  }

  const transporter = createTransporter();

  const customerName = `${packet.data.customer.firstName} ${packet.data.customer.lastName}`.trim();
  const invoice = packet.data.order.invoiceNumber || "your cabinet contract";
  const documentLabel = "contract";
  const titleLabel = "Contract";

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: customerEmail,
    subject: `Edgewater Cabinet Store ${documentLabel} ready - ${invoice}`,
    text: [
      `Hello${customerName ? ` ${customerName}` : ""},`,
      "",
      `Your Edgewater Cabinet Store ${documentLabel} is ready to review and sign online.`,
      "",
      `Signing link: ${signUrl}`,
      "",
      "Temporary password hint: it is based on the customer name, the job address number, and the phone or email on this order. Contact the store if it does not open.",
      "",
      `If you do not want to sign electronically, choose the paper signing option on the signing page, then print the filled-in ${titleLabel.toLowerCase()} PDF and email it back or bring it to the store.`,
    ].join("\n"),
  });

  return {
    sent: true,
    messageId: result.messageId,
    to: customerEmail,
  };
}

async function sendCustomerFinalPacketEmail(packet, finalPdfPath, _password, toAddress) {
  if (!smtpCanSend()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("Download or print the signed PDF instead."),
    };
  }

  const emailTo = String(toAddress || packet.data.customer.email || "").trim();
  if (!emailTo) {
    return {
      sent: false,
      reason: "No customer email address was provided.",
    };
  }

  const transporter = createTransporter();

  const customerName = `${packet.data.customer.firstName} ${packet.data.customer.lastName}`.trim();
  const invoice = packet.data.order.invoiceNumber || "your signed cabinet contract";

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: emailTo,
    subject: `Signed Edgewater Cabinet Store contract - ${invoice}`,
    text: [
      `Hello${customerName ? ` ${customerName}` : ""},`,
      "",
      "Attached is a copy of your signed Edgewater Cabinet Store contract.",
      "",
      "Thank you.",
    ].join("\n"),
    attachments: [
      {
        filename: contractPdfFilename(packet, { signed: true }),
        path: finalPdfPath,
      },
    ],
  });

  return {
    sent: true,
    messageId: result.messageId,
    to: emailTo,
  };
}

async function sendCustomerContactEmail(customer, packet, request) {
  if (!smtpConfigured()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("The customer request was saved in server logs.", { requireStoreRecipient: true }),
    };
  }

  const transporter = createTransporter();
  const customerName = customer.name || "Customer";
  const topic = request.topic === "existingConcern"
    ? "Existing sale concern"
    : request.topic === "customerQuestion"
      ? "Customer question"
      : "New sale call request";
  const invoice = packet?.data?.order?.invoiceNumber || request.invoiceNumber || "Not selected";

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_TO,
    subject: `Customer portal request - ${topic} - ${customerName}`,
    text: [
      "A customer submitted a portal request.",
      "",
      `Type: ${topic}`,
      `Customer: ${customerName}`,
      `Email: ${customer.email || ""}`,
      `Phone: ${customer.phone || ""}`,
      `Preferred contact: ${request.preferredContact || ""}`,
      `Sale / invoice number: ${request.topic === "existingConcern" ? invoice : ""}`,
      "",
      "Message:",
      request.message || "",
    ].join("\n"),
  });

  return {
    sent: true,
    messageId: result.messageId,
  };
}

async function sendCustomerAccountRequestEmail(request) {
  if (!smtpConfigured()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("The account request was saved in server logs.", { requireStoreRecipient: true }),
    };
  }

  const transporter = createTransporter();
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_TO,
    subject: `Customer portal password reset request - ${request.email || "unknown email"}`,
    text: [
      "A customer requested help resetting their portal password.",
      "",
      `Email: ${request.email || ""}`,
      `Last name: ${request.lastName || ""}`,
      `IP: ${request.ip || ""}`,
      `User agent: ${request.userAgent || ""}`,
      "",
      "Staff should verify the customer before resetting or changing portal access.",
    ].join("\n"),
  });

  return {
    sent: true,
    messageId: result.messageId,
  };
}

async function sendPasswordResetEmail(request = {}) {
  if (!smtpCanSend()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("The password reset link could not be emailed."),
    };
  }

  const emailTo = String(request.to || "").trim();
  if (!emailTo) {
    return {
      sent: false,
      reason: "No email address is saved for this account.",
    };
  }

  const transporter = createTransporter();
  const name = String(request.name || "").trim();
  const accountLabel = request.accountType === "staff" ? "staff" : "customer";
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: emailTo,
    subject: "Contract Portal password reset",
    text: [
      `Hello${name ? ` ${name}` : ""},`,
      "",
      `Use this link to reset your Contract Portal ${accountLabel} password:`,
      request.resetUrl,
      "",
      "This link expires in 2 hours.",
      "",
      "If you did not request this reset, ignore this email.",
    ].join("\n"),
  });

  return {
    sent: true,
    to: emailTo,
    messageId: result.messageId,
  };
}

async function sendFeatureRequestEmail(request) {
  if (!smtpConfigured()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("The feature request was saved in server logs.", { requireStoreRecipient: true }),
    };
  }

  const transporter = createTransporter();
  const features = Array.isArray(request.features) ? request.features.join(", ") : "";

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_TO,
    subject: `Contract Portal feature request - ${features || "Small-screen request"}`,
    text: [
      "A Contract Portal visitor submitted a feature request.",
      "",
      `Name: ${request.name || ""}`,
      `Email: ${request.email || ""}`,
      `Phone: ${request.phone || ""}`,
      `Features: ${features}`,
      `Page: ${request.page || ""}`,
      `Screen: ${request.screen || ""}`,
      "",
      "Message:",
      request.message || "",
      "",
      "Request metadata:",
      `IP: ${request.ip || ""}`,
      `User agent: ${request.userAgent || ""}`,
    ].join("\n"),
  });

  return {
    sent: true,
    messageId: result.messageId,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paidContractCustomerName(fields = {}) {
  return String(fields.customerName || "Customer").trim() || "Customer";
}

function paidContractLabel(fields = {}) {
  return fields.invoiceNumber || fields.estimateNumber || fields.receiptNumber || fields.contractNumber || "Paid contract";
}

function paidContractHtml(fields = {}, signature = {}) {
  const rows = [
    ["Customer", fields.customerName],
    ["Email", fields.email],
    ["Phone", fields.phone],
    ["Address", [fields.street, fields.city, fields.state, fields.zip].filter(Boolean).join(", ")],
    ["Estimate #", fields.estimateNumber],
    ["Contract / order #", fields.contractNumber],
    ["Acknowledgement / invoice #", fields.invoiceNumber],
    ["Receipt #", fields.receiptNumber],
    ["Sale date", fields.saleDate],
    ["Payment date", fields.paymentDate],
    ["Invoice amount", fields.invoiceAmount],
    ["Amount paid", fields.amountPaid],
    ["Balance due", fields.balanceDue],
    ["Payment method", fields.paymentMethod],
    ["Installer status", fields.installerStatus],
    ["Store rep", fields.storeRep],
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed Paid Contract</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #172331; }
    h1 { font-size: 20px; }
    table { border-collapse: collapse; width: 100%; }
    td { border: 1px solid #c8d4dc; padding: 6px 8px; vertical-align: top; }
    td:first-child { width: 180px; color: #4e5d68; font-weight: 700; }
    .box { border: 1px solid #c8d4dc; padding: 10px; margin-top: 12px; }
    .signature { max-width: 420px; max-height: 140px; border-bottom: 1px solid #172331; }
  </style>
</head>
<body>
  <h1>Signed Edgewater Cabinet Store Paid Contract</h1>
  <p><strong>Signed:</strong> ${escapeHtml(signature.signedDate || "")}</p>
  <p><strong>Printed name:</strong> ${escapeHtml(signature.printedName || "")} &nbsp; <strong>Initials:</strong> ${escapeHtml(signature.initials || "")}</p>
  <table>
    ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value || "")}</td></tr>`).join("")}
  </table>
  <div class="box">
    <strong>Work / materials description</strong><br>
    ${escapeHtml(fields.workDescription || "").replace(/\n/g, "<br>")}
  </div>
  <div class="box">
    <strong>Notes / exceptions</strong><br>
    ${escapeHtml(fields.notes || "").replace(/\n/g, "<br>")}
  </div>
  ${signature.signatureDataUrl ? `<div class="box"><strong>Customer signature</strong><br><img class="signature" src="${escapeHtml(signature.signatureDataUrl)}" alt="Customer signature"></div>` : ""}
  <p>Customer confirmed electronic signing and contract review before submitting.</p>
</body>
</html>`;
}

async function sendPaidContractCustomerEmail(fields, signUrl, files = []) {
  if (!smtpCanSend()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("Copy the customer link and email it manually."),
    };
  }

  const emailTo = String(fields.email || "").trim();
  if (!emailTo) {
    return {
      sent: false,
      reason: "Customer email is blank.",
    };
  }

  const transporter = createTransporter();
  const customerName = paidContractCustomerName(fields);
  const label = paidContractLabel(fields);

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: emailTo,
    subject: `Edgewater Cabinet Store paid contract ready - ${label}`,
    text: [
      `Hello ${customerName},`,
      "",
      "Your Edgewater Cabinet Store contract is ready to review and sign online.",
      "",
      `Signing link: ${signUrl}`,
      "",
      "Please review the contract and any attached estimate, acknowledgement/invoice, or receipt before signing.",
      "",
      "Thank you.",
    ].join("\n"),
    attachments: files.map((file) => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype,
    })),
  });

  return {
    sent: true,
    to: emailTo,
    messageId: result.messageId,
  };
}

async function sendPaidContractSignedEmail(fields, signature) {
  if (!smtpConfigured()) {
    return {
      sent: false,
      reason: smtpNotConfiguredReason("Ask the customer to print/save and email it manually.", { requireStoreRecipient: true }),
    };
  }

  const transporter = createTransporter();
  const customerName = paidContractCustomerName(fields);
  const label = paidContractLabel(fields);
  const html = paidContractHtml(fields, signature);
  const attachments = [
    {
      filename: `SIGNED-PAID-CONTRACT-${customerName.replace(/[^a-z0-9]+/gi, "-") || "CUSTOMER"}.html`,
      content: Buffer.from(html, "utf8"),
      contentType: "text/html",
    },
  ];

  if (String(signature.signatureDataUrl || "").startsWith("data:image/")) {
    const [_meta, base64] = signature.signatureDataUrl.split(",", 2);
    if (base64) {
      attachments.push({
        filename: "customer-signature.png",
        content: Buffer.from(base64, "base64"),
        contentType: "image/png",
      });
    }
  }

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_TO,
    subject: `Signed paid contract - ${customerName} - ${label}`,
    text: [
      "A paid contract was signed from the quick paid-contract page.",
      "",
      `Customer: ${customerName}`,
      `Email: ${fields.email || ""}`,
      `Phone: ${fields.phone || ""}`,
      `Estimate #: ${fields.estimateNumber || ""}`,
      `Acknowledgement / invoice #: ${fields.invoiceNumber || ""}`,
      `Receipt #: ${fields.receiptNumber || ""}`,
      `Signed date: ${signature.signedDate || ""}`,
      `IP: ${signature.ip || ""}`,
      "",
      "The signed contract summary is attached.",
    ].join("\n"),
    html,
    attachments,
  });

  return {
    sent: true,
    to: process.env.SMTP_TO,
    messageId: result.messageId,
  };
}

module.exports = {
  sendCustomerLinkEmail,
  sendCustomerContactEmail,
  sendCustomerAccountRequestEmail,
  sendCustomerFinalPacketEmail,
  sendFeatureRequestEmail,
  sendFinalPacketEmail,
  sendPaidContractCustomerEmail,
  sendPaidContractSignedEmail,
  sendPasswordResetEmail,
  smtpConfigured,
};
