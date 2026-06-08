function clean(value) {
  return String(value ?? "").trim();
}

function normalizeEmailAddress(value) {
  return clean(value).toLowerCase();
}

function isValidEmailAddress(value) {
  const email = normalizeEmailAddress(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function validDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function datePartsFromValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  const raw = clean(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validDateParts(year, month, day) ? { year, month, day } : null;
  }

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    return validDateParts(year, month, day) ? { year, month, day } : null;
  }

  const compact = raw.replace(/\D/g, "");
  if (compact.length === 8) {
    const month = Number(compact.slice(0, 2));
    const day = Number(compact.slice(2, 4));
    const year = Number(compact.slice(4));
    return validDateParts(year, month, day) ? { year, month, day } : null;
  }

  return null;
}

function formatDateDisplay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getMonth() + 1)}/${pad2(value.getDate())}/${value.getFullYear()}`;
  }
  const raw = clean(value);
  if (!raw) return "";
  const parts = datePartsFromValue(raw);
  if (!parts) return raw;
  return `${pad2(parts.month)}/${pad2(parts.day)}/${parts.year}`;
}

function isValidDateDisplay(value) {
  const raw = clean(value);
  return !raw || Boolean(datePartsFromValue(raw));
}

module.exports = {
  clean,
  formatDateDisplay,
  isValidDateDisplay,
  isValidEmailAddress,
  normalizeEmailAddress,
};
