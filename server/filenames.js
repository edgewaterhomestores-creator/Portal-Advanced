function text(value) {
  return String(value ?? "").trim();
}

function cleanToken(value, fallback = "") {
  const cleaned = text(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();

  return cleaned || fallback;
}

function dateToken(value) {
  const raw = text(value);
  const displayDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (displayDate) {
    return `${displayDate[3]}${displayDate[1].padStart(2, "0")}${displayDate[2].padStart(2, "0")}`;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}${isoDate[2]}${isoDate[3]}`;

  const date = raw ? new Date(raw) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toISOString().slice(0, 10).replace(/-/g, "");
}

function estimateToken(data) {
  const explicit = cleanToken(data?.estimate?.estimateNumber || data?.estimate?.estimateId || data?.estimate?.number);
  if (explicit) return explicit;

  const fileBase = text(data?.estimate?.fileName).replace(/\.[a-z0-9]+$/i, "");
  const match = fileBase.match(/estimate[\s_-]*([a-z0-9][a-z0-9\s_-]*)$/i);
  return match ? cleanToken(match[1]) : "";
}

function contractPdfFilename(packet, options = {}) {
  const data = packet?.data || {};
  const lastName = cleanToken(data.customer?.lastName, "CUSTOMER");
  const date = dateToken(data.order?.customerAcceptedDate || data.order?.saleDate || packet?.finalizedAt || packet?.createdAt);
  const estimate = estimateToken(data);
  const parts = ["CONTRACT", lastName, date];

  if (options.signed) parts.push("SIGNED");
  if (estimate) parts.push(estimate);

  return `${parts.join("-")}.pdf`;
}

module.exports = {
  contractPdfFilename,
};
