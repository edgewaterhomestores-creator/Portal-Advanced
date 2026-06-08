const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { databaseConfigured, ensureLookupSchema, query } = require("./db");
const { SETTINGS_DIR, ensureDataDirs } = require("./storage");

const ROOT = path.resolve(__dirname, "..");
const INSTALLER_DIRECTORY_PATH = path.join(SETTINGS_DIR, "installers.json");
const INSTALLER_DIRECTORY_READ_PATHS = [
  process.env.INSTALLER_DIRECTORY_FILE,
  INSTALLER_DIRECTORY_PATH,
  "/opt/apps/installerportal/app/data/settings/installers.json",
  path.resolve(ROOT, "..", "ContractsPortal", "InstallerPortal", "data", "settings", "installers.json"),
  path.resolve(ROOT, "InstallerPortal", "data", "settings", "installers.json"),
].filter(Boolean).map((item) => path.resolve(item));
const PORTAL_SETTINGS_KEY = "installers";
const STORE_DEPARTMENTS = new Set(["cabinet", "floor", "both"]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function keyText(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function makeInstallerId(name) {
  const nameKey = keyText(name) || "installer";
  return `installer-${nameKey}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeDepartment(value) {
  const department = clean(value).toLowerCase();
  return STORE_DEPARTMENTS.has(department) ? department : "both";
}

function publicActor(actor = {}) {
  return {
    username: clean(actor.username),
    name: clean(actor.name || actor.username),
    role: clean(actor.role),
  };
}

function normalizeInstaller(installer = {}) {
  const now = new Date().toISOString();
  const name = clean(installer.name);
  const id = clean(installer.id) || makeInstallerId(name);
  return {
    id,
    name,
    storeDepartment: normalizeDepartment(installer.storeDepartment),
    phone: clean(installer.phone),
    email: clean(installer.email).toLowerCase(),
    notes: clean(installer.notes),
    active: installer.active !== false,
    createdAt: clean(installer.createdAt) || now,
    updatedAt: clean(installer.updatedAt) || now,
    createdBy: installer.createdBy || null,
    updatedBy: installer.updatedBy || null,
  };
}

function normalizeStore(store = {}) {
  const installers = Array.isArray(store.installers)
    ? store.installers.map(normalizeInstaller).filter((installer) => installer.name)
    : [];
  return {
    version: 1,
    installers,
    updatedAt: clean(store.updatedAt),
  };
}

function dateText(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return clean(value);
}

function dateOrNull(value) {
  const text = clean(value);
  return text || null;
}

function dateNumber(value) {
  const text = dateText(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actorJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function installerFromRow(row = {}) {
  const raw = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  return normalizeInstaller({
    ...raw,
    id: row.id || raw.id,
    name: row.name || raw.name,
    storeDepartment: row.store_department || raw.storeDepartment,
    phone: row.phone || raw.phone,
    email: row.email || raw.email,
    notes: row.notes || raw.notes,
    active: row.active !== false,
    createdAt: dateText(row.created_at) || raw.createdAt,
    updatedAt: dateText(row.updated_at) || raw.updatedAt,
    createdBy: Object.keys(actorJson(row.created_by)).length ? row.created_by : raw.createdBy,
    updatedBy: Object.keys(actorJson(row.updated_by)).length ? row.updated_by : raw.updatedBy,
  });
}

function mergeInstallerRecords(current, incoming) {
  const existing = normalizeInstaller(current);
  const next = normalizeInstaller(incoming);
  const nextWins = dateNumber(next.updatedAt) >= dateNumber(existing.updatedAt);
  const merged = nextWins ? { ...existing, ...next } : { ...next, ...existing };
  const existingCreated = dateNumber(existing.createdAt);
  const nextCreated = dateNumber(next.createdAt);
  const existingUpdated = dateNumber(existing.updatedAt);
  const nextUpdated = dateNumber(next.updatedAt);

  return normalizeInstaller({
    ...merged,
    id: existing.id || next.id,
    createdAt: existingCreated && nextCreated
      ? (existingCreated <= nextCreated ? existing.createdAt : next.createdAt)
      : (existing.createdAt || next.createdAt),
    updatedAt: existingUpdated && nextUpdated
      ? (existingUpdated >= nextUpdated ? existing.updatedAt : next.updatedAt)
      : (existing.updatedAt || next.updatedAt),
    createdBy: existing.createdBy || next.createdBy,
    updatedBy: nextWins ? (next.updatedBy || existing.updatedBy) : (existing.updatedBy || next.updatedBy),
  });
}

function mergeStores(stores = []) {
  const installersByName = new Map();
  for (const store of stores) {
    const normalized = normalizeStore(store);
    for (const installer of normalized.installers) {
      const key = keyText(installer.name);
      if (!key) continue;
      const existing = installersByName.get(key);
      installersByName.set(key, existing ? mergeInstallerRecords(existing, installer) : installer);
    }
  }
  const installers = [...installersByName.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const newestUpdate = installers
    .map((installer) => installer.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  return normalizeStore({ version: 1, installers, updatedAt: newestUpdate });
}

async function loadStoreFromDb() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query("SELECT * FROM installers ORDER BY active DESC, lower(name) ASC, updated_at DESC NULLS LAST");
  return {
    version: 1,
    installers: (result?.rows || []).map(installerFromRow).filter((installer) => installer.name),
    updatedAt: "",
  };
}

async function saveStoreToDb(store) {
  if (!databaseConfigured()) return false;
  await ensureLookupSchema();
  const normalized = normalizeStore(store);
  for (const installer of normalized.installers) {
    const lookupKey = keyText(installer.name);
    if (!lookupKey) continue;
    await query(
      `INSERT INTO installers (
        id, lookup_key, name, store_department, phone, email, notes, active,
        created_at, updated_at, created_by, updated_by, raw_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        lookup_key = EXCLUDED.lookup_key,
        name = EXCLUDED.name,
        store_department = EXCLUDED.store_department,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        notes = EXCLUDED.notes,
        active = EXCLUDED.active,
        created_at = COALESCE(installers.created_at, EXCLUDED.created_at),
        updated_at = EXCLUDED.updated_at,
        created_by = COALESCE(NULLIF(installers.created_by, '{}'::jsonb), EXCLUDED.created_by),
        updated_by = EXCLUDED.updated_by,
        raw_json = EXCLUDED.raw_json`,
      [
        installer.id,
        lookupKey,
        installer.name,
        installer.storeDepartment,
        installer.phone,
        installer.email,
        installer.notes,
        installer.active !== false,
        dateOrNull(installer.createdAt),
        dateOrNull(installer.updatedAt),
        actorJson(installer.createdBy),
        actorJson(installer.updatedBy),
        installer,
      ],
    );
  }

  await query(
    `INSERT INTO portal_settings (key, settings_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET
       settings_json = EXCLUDED.settings_json,
       updated_at = now()`,
    [PORTAL_SETTINGS_KEY, normalized],
  );
  return true;
}

async function loadLegacyStoreFromDb() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query("SELECT settings_json FROM portal_settings WHERE key = $1", [PORTAL_SETTINGS_KEY]);
  return result?.rows?.[0]?.settings_json || null;
}

async function loadStoresFromFiles() {
  await ensureDataDirs();
  const stores = [];
  const seen = new Set();
  for (const filePath of INSTALLER_DIRECTORY_READ_PATHS) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      stores.push(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return stores.length ? stores : [{ version: 1, installers: [], updatedAt: "" }];
}

async function writeStoreToFile(store) {
  await ensureDataDirs();
  await fs.writeFile(INSTALLER_DIRECTORY_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readStore() {
  const stores = [];
  if (databaseConfigured()) {
    try {
      const dbStore = await loadStoreFromDb();
      if (dbStore?.installers?.length) stores.push(dbStore);
    } catch (error) {
      console.error(`Installer directory database read failed: ${error.message}`);
    }
    try {
      const legacyStore = await loadLegacyStoreFromDb();
      if (legacyStore?.installers?.length) stores.push(legacyStore);
    } catch (error) {
      console.error(`Installer directory legacy settings read failed: ${error.message}`);
    }
  }

  try {
    const fileStores = await loadStoresFromFiles();
    fileStores.forEach((fileStore) => {
      if (fileStore?.installers?.length || !stores.length) stores.push(fileStore);
    });
  } catch (error) {
    console.error(`Installer directory file read failed: ${error.message}`);
  }

  const normalized = mergeStores(stores);
  if (databaseConfigured()) {
    try {
      await saveStoreToDb(normalized);
    } catch (error) {
      console.error(`Installer directory database backfill failed: ${error.message}`);
    }
  }
  try {
    await writeStoreToFile(normalized);
  } catch (error) {
    console.error(`Installer directory file mirror failed: ${error.message}`);
  }

  return normalized;
}

async function writeStore(store) {
  const normalized = normalizeStore({
    ...store,
    updatedAt: new Date().toISOString(),
  });
  await writeStoreToFile(normalized);
  if (databaseConfigured()) {
    try {
      await saveStoreToDb(normalized);
    } catch (error) {
      console.error(`Installer directory database write failed: ${error.message}`);
    }
  }
  return normalized;
}

function installerMatches(installer, query) {
  if (!query) return true;
  return [
    installer.name,
    installer.storeDepartment,
    installer.phone,
    installer.email,
    installer.notes,
  ].join(" ").toLowerCase().includes(query);
}

function combineDepartments(existing, next) {
  const current = normalizeDepartment(existing);
  const incoming = normalizeDepartment(next);
  if (current === incoming) return current;
  if (current === "both" || incoming === "both") return "both";
  return "both";
}

async function listInstallers({ includeInactive = false, q = "" } = {}) {
  const queryText = clean(q).toLowerCase();
  const store = await readStore();
  return store.installers
    .filter((installer) => includeInactive || installer.active)
    .filter((installer) => installerMatches(installer, queryText))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function saveInstaller(payload = {}, actor = {}) {
  const name = clean(payload.name);
  if (!name) {
    const error = new Error("Installer name is required.");
    error.status = 400;
    throw error;
  }

  const store = await readStore();
  const id = clean(payload.id);
  const existingIndex = id ? store.installers.findIndex((installer) => installer.id === id) : -1;
  const now = new Date().toISOString();
  const existing = existingIndex >= 0 ? store.installers[existingIndex] : {};
  const installer = normalizeInstaller({
    ...existing,
    ...payload,
    id: existing.id || id || makeInstallerId(name),
    name,
    active: payload.active !== false,
    createdAt: existing.createdAt || now,
    createdBy: existing.createdBy || publicActor(actor),
    updatedAt: now,
    updatedBy: publicActor(actor),
  });

  if (existingIndex >= 0) {
    store.installers[existingIndex] = installer;
  } else {
    store.installers.push(installer);
  }

  await writeStore(store);
  return installer;
}

async function saveInstallerByName(payload = {}, actor = {}) {
  const name = clean(payload.name || payload.installerName);
  if (!name) {
    const error = new Error("Installer name is required.");
    error.status = 400;
    throw error;
  }

  const store = await readStore();
  const nameKey = keyText(name);
  const existingIndex = store.installers.findIndex((installer) => keyText(installer.name) === nameKey);
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = store.installers[existingIndex];
    const nextDepartment = combineDepartments(existing.storeDepartment, payload.storeDepartment);
    if (nextDepartment !== existing.storeDepartment) {
      store.installers[existingIndex] = normalizeInstaller({
        ...existing,
        storeDepartment: nextDepartment,
        updatedAt: now,
        updatedBy: publicActor(actor),
      });
      await writeStore(store);
    }
    return store.installers[existingIndex];
  }

  const installer = normalizeInstaller({
    name,
    storeDepartment: payload.storeDepartment,
    notes: clean(payload.notes),
    active: true,
    createdAt: now,
    createdBy: publicActor(actor),
    updatedAt: now,
    updatedBy: publicActor(actor),
  });
  store.installers.push(installer);
  await writeStore(store);
  return installer;
}

async function findInstaller(id) {
  const cleanId = clean(id);
  if (!cleanId) return null;
  const store = await readStore();
  return store.installers.find((installer) => installer.id === cleanId) || null;
}

module.exports = {
  INSTALLER_DIRECTORY_PATH,
  findInstaller,
  listInstallers,
  saveInstaller,
  saveInstallerByName,
};
