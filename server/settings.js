const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  databaseConfigured,
  loadBusinessSettingsFromDb,
  saveBusinessSettingsToDb,
} = require("./db");
const { SETTINGS_DIR, ensureDataDirs } = require("./storage");

const SETTINGS_PATH = path.join(SETTINGS_DIR, "business.json");
const EDGEWATER_CABINET_ADDRESS = "2119 S Ridgewood Ave\nEdgewater, FL 32141";

const DEFAULT_SETTINGS = {
  businessName: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  logoDataUrl: "",
  salesTaxRate: 6.5,
  salesTaxChangedAt: "",
  salesTaxHistory: [],
  defaultStoreRep: "",
  defaultStoreRepTitle: "",
  staffSessionIdleMinutes: 5,
  setupComplete: false,
  setupDismissed: false,
  dataResetId: "",
  signatures: [],
};

function clean(value) {
  return String(value ?? "").trim();
}

function newDataResetId() {
  return `reset-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function ensureDataResetId(settings) {
  const current = clean(settings.dataResetId);
  if (current && current !== "initial") return settings;
  return { ...settings, dataResetId: newDataResetId() };
}

function numberSetting(value, fallback) {
  const parsed = Number(String(value ?? "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumberSetting(value, fallback, min, max) {
  const parsed = numberSetting(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function keyText(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeBusinessAddress(value) {
  const address = clean(value);
  const compact = address.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
  if (
    compact === "2119 S Ridgewood Ave, Edgewater, FL"
    || compact === "2119 S Ridgewood Ave, Edgewater, FL 32141"
    || compact === "2119 S Ridgewood Ave Edgewater, FL"
    || compact === "2119 S Ridgewood Ave Edgewater, FL 32141"
  ) {
    return EDGEWATER_CABINET_ADDRESS;
  }
  return address;
}

function normalizeBusinessPhone(value) {
  const raw = clean(value);
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10 || digits.startsWith("1")) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function actorUsername(actor) {
  return clean(actor?.username).toLowerCase();
}

function ownedByActor(record, actor) {
  const username = actorUsername(actor);
  if (!username) return false;
  if (clean(record?.ownerUsername).toLowerCase() === username) return true;
  if (!record?.ownerUsername && keyText(record?.name) && keyText(record.name) === keyText(actor?.name || actor?.username)) return true;
  return false;
}

function ownerFields(actor) {
  return {
    ownerUsername: actorUsername(actor),
    ownerName: clean(actor?.name || actor?.username),
  };
}

function sameOwner(record, actor) {
  const username = actorUsername(actor);
  return username && clean(record?.ownerUsername).toLowerCase() === username;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

async function loadSettings() {
  await ensureDataDirs();
  if (databaseConfigured()) {
    const stored = await loadBusinessSettingsFromDb();
    if (stored) {
      const settings = ensureDataResetId(normalizeSettings(stored));
      await saveSettings(settings);
      return settings;
    }
    const jsonSettings = await loadJsonSettings();
    const settings = ensureDataResetId(normalizeSettings(jsonSettings || DEFAULT_SETTINGS));
    await saveSettings(settings);
    return settings;
  }

  const jsonSettings = await loadJsonSettings();
  if (!jsonSettings) {
    const settings = ensureDataResetId({ ...DEFAULT_SETTINGS });
    await saveSettings(settings);
    return settings;
  }
  const settings = ensureDataResetId(normalizeSettings(jsonSettings));
  await saveSettings(settings);
  return settings;
}

function normalizeSettings(stored) {
  const settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  settings.phone = normalizeBusinessPhone(settings.phone);
  settings.address = normalizeBusinessAddress(settings.address);
  settings.salesTaxRate = numberSetting(settings.salesTaxRate, DEFAULT_SETTINGS.salesTaxRate);
  settings.salesTaxChangedAt = clean(settings.salesTaxChangedAt);
  settings.staffSessionIdleMinutes = boundedNumberSetting(settings.staffSessionIdleMinutes, DEFAULT_SETTINGS.staffSessionIdleMinutes, 1, 480);
  settings.dataResetId = clean(settings.dataResetId);
  settings.salesTaxHistory = Array.isArray(settings.salesTaxHistory) ? settings.salesTaxHistory : [];
  delete settings.storeReps;
  settings.signatures = Array.isArray(settings.signatures) ? settings.signatures : [];
  return settings;
}

async function loadJsonSettings() {
  try {
    const raw = (await fs.readFile(SETTINGS_PATH, "utf8"))
      .replace(/^\uFEFF/, "")
      .replace(/^\u00ef\u00bb\u00bf/, "");
    if (raw.trim().startsWith("<")) {
      throw new Error(`Settings file contains HTML instead of JSON: ${SETTINGS_PATH}`);
    }
    let stored;
    try {
      stored = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Could not read settings JSON file ${SETTINGS_PATH}: ${error.message}`);
    }
    return stored;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await ensureDataDirs();
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  if (databaseConfigured()) {
    await saveBusinessSettingsToDb(normalized);
  }
  return normalized;
}

async function updateBusinessSettings(body, actor = {}) {
  const settings = await loadSettings();
  const currentTaxRate = numberSetting(settings.salesTaxRate, DEFAULT_SETTINGS.salesTaxRate);
  const nextTaxRate = numberSetting(body.salesTaxRate, currentTaxRate);
  if (nextTaxRate < 0 || nextTaxRate > 20) {
    const error = new Error("Sales tax rate must be between 0 and 20.");
    error.status = 400;
    throw error;
  }

  const taxChanged = Math.round(nextTaxRate * 10000) !== Math.round(currentTaxRate * 10000);
  const changedAt = taxChanged ? new Date().toISOString() : settings.salesTaxChangedAt;
  const next = {
    ...settings,
    businessName: body.businessName === undefined ? settings.businessName : clean(body.businessName),
    phone: body.phone === undefined ? settings.phone : normalizeBusinessPhone(body.phone),
    email: body.email === undefined ? settings.email : clean(body.email),
    website: body.website === undefined ? settings.website : clean(body.website),
    address: body.address === undefined ? settings.address : clean(body.address),
    logoDataUrl: clean(body.logoDataUrl || settings.logoDataUrl),
    salesTaxRate: nextTaxRate,
    salesTaxChangedAt: changedAt,
    salesTaxHistory: taxChanged
      ? [
        {
          rate: nextTaxRate,
          previousRate: currentTaxRate,
          changedAt,
          changedBy: clean(actor?.name || actor?.username),
        },
        ...(settings.salesTaxHistory || []),
      ].slice(0, 24)
      : settings.salesTaxHistory,
    defaultStoreRep: body.defaultStoreRep === undefined ? settings.defaultStoreRep : clean(body.defaultStoreRep),
    defaultStoreRepTitle: body.defaultStoreRepTitle === undefined ? settings.defaultStoreRepTitle : clean(body.defaultStoreRepTitle),
    staffSessionIdleMinutes: body.staffSessionIdleMinutes === undefined
      ? settings.staffSessionIdleMinutes
      : boundedNumberSetting(body.staffSessionIdleMinutes, settings.staffSessionIdleMinutes, 1, 480),
    setupComplete: body.setupComplete === undefined ? settings.setupComplete : Boolean(body.setupComplete),
    setupDismissed: body.setupDismissed === undefined ? settings.setupDismissed : Boolean(body.setupDismissed),
  };

  return saveSettings(next);
}

async function dismissSetup() {
  const settings = await loadSettings();
  settings.setupDismissed = true;
  return saveSettings(settings);
}

async function addSignature(body, actor = {}) {
  const settings = await loadSettings();
  const dataUrl = clean(body.dataUrl);

  if (!dataUrl.startsWith("data:image/")) {
    const error = new Error("Signature image is required.");
    error.status = 400;
    throw error;
  }

  const signature = {
    id: crypto.randomBytes(6).toString("hex"),
    name: clean(body.name) || "Store signature",
    dataUrl,
    ...ownerFields(actor),
    createdAt: new Date().toISOString(),
  };

  const duplicate = (settings.signatures || []).find((existing) => (
    (sameOwner(existing, actor) || ownedByActor(existing, actor))
    && (keyText(existing.name) === keyText(signature.name) || clean(existing.dataUrl) === dataUrl)
  ));
  if (duplicate) {
    throw conflict("That saved signature already exists. Choose the existing signature or replace it instead of saving a second copy.");
  }

  settings.signatures = [signature, ...(settings.signatures || [])].slice(0, 12);
  await saveSettings(settings);
  return signature;
}

async function updateSignature(id, body, actor = {}) {
  const settings = await loadSettings();
  const signature = (settings.signatures || []).find((item) => item.id === id);
  if (!signature) {
    const error = new Error("Signature image was not found.");
    error.status = 404;
    throw error;
  }
  if (!ownedByActor(signature, actor)) {
    throw forbidden("You can view this signature, but only the owner can replace it.");
  }

  const dataUrl = clean(body.dataUrl);
  if (!dataUrl.startsWith("data:image/")) {
    const error = new Error("Signature image is required.");
    error.status = 400;
    throw error;
  }

  signature.name = clean(body.name) || signature.name || "Store signature";
  signature.dataUrl = dataUrl;
  signature.updatedAt = new Date().toISOString();
  if (!signature.ownerUsername) {
    Object.assign(signature, ownerFields(actor));
  }
  await saveSettings(settings);
  return signature;
}

async function deleteSignature(id, actor = {}) {
  const settings = await loadSettings();
  const signature = (settings.signatures || []).find((item) => item.id === id);
  if (signature && !ownedByActor(signature, actor)) {
    throw forbidden("You can view this signature, but only the owner can delete it.");
  }
  settings.signatures = (settings.signatures || []).filter((signature) => signature.id !== id);
  await saveSettings(settings);
}

module.exports = {
  addSignature,
  deleteSignature,
  dismissSetup,
  loadSettings,
  updateSignature,
  updateBusinessSettings,
};
