const fs = require("node:fs/promises");
const path = require("node:path");

const { databaseConfigured, ensureLookupSchema, query } = require("./db");
const { SETTINGS_DIR, ensureDataDirs } = require("./storage");

const ROOT = path.resolve(__dirname, "..");
const CONTRACTS_PORTAL_ROOT = path.resolve(ROOT, "..");
const STATE_PATH = path.join(SETTINGS_DIR, "installer-upload-states.json");
const PORTAL_SETTINGS_KEY = "installer_upload_states";
const STORE_DEPARTMENTS = new Set(["cabinet", "floor"]);
const STATUS_VALUES = new Set(["inbox", "assigned", "archived", "deleted"]);
const PHOTO_STAGE_LABELS = {
  before: "Before",
  during: "During",
  after: "After",
};

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function splitList(value) {
  return clean(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function nowIso() {
  return new Date().toISOString();
}

function publicActor(actor = {}) {
  return {
    id: clean(actor.id),
    username: clean(actor.username),
    name: clean(actor.name || actor.username),
    role: clean(actor.role),
  };
}

function uploadRootCandidates() {
  return [
    process.env.INSTALLER_UPLOAD_ROOT,
    process.env.INSTALLER_PHOTO_ROOT,
    "/opt/apps/installerportal/app/data/installers/installer-job-photos",
    path.join(CONTRACTS_PORTAL_ROOT, "InstallerPortal", "data", "installers", "installer-job-photos"),
    path.join(ROOT, "..", "ContractsPortal", "InstallerPortal", "data", "installers", "installer-job-photos"),
    path.join(ROOT, "data", "installers", "installer-job-photos"),
  ].filter(Boolean).map((item) => path.resolve(item));
}

async function firstExistingPath(paths) {
  for (const candidate of paths) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch (_error) {
      // Keep looking.
    }
  }
  return paths[0];
}

async function installerUploadRoot() {
  return firstExistingPath(uploadRootCandidates());
}

function pathInside(basePath, candidatePath) {
  const base = path.resolve(basePath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function loadStateFromDb() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query("SELECT settings_json FROM portal_settings WHERE key = $1", [PORTAL_SETTINGS_KEY]);
  return result?.rows?.[0]?.settings_json || null;
}

async function saveStateToDb(store) {
  if (!databaseConfigured()) return false;
  await ensureLookupSchema();
  await query(
    `INSERT INTO portal_settings (key, settings_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET
       settings_json = EXCLUDED.settings_json,
       updated_at = now()`,
    [PORTAL_SETTINGS_KEY, store],
  );
  return true;
}

function normalizeStateStore(store = {}) {
  return {
    version: 1,
    uploads: store.uploads && typeof store.uploads === "object" ? store.uploads : {},
    updatedAt: clean(store.updatedAt),
  };
}

async function loadStateFromFile() {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { version: 1, uploads: {}, updatedAt: "" };
  }
}

async function writeStateToFile(store) {
  await ensureDataDirs();
  await fs.writeFile(STATE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readStateStore() {
  let store = null;
  if (databaseConfigured()) {
    try {
      store = await loadStateFromDb();
    } catch (error) {
      console.error(`Installer upload state database read failed: ${error.message}`);
    }
  }

  if (!store) {
    store = await loadStateFromFile();
    if (databaseConfigured()) {
      try {
        await saveStateToDb(normalizeStateStore(store));
      } catch (error) {
        console.error(`Installer upload state database backfill failed: ${error.message}`);
      }
    }
  }

  return normalizeStateStore(store);
}

async function writeStateStore(store) {
  const normalized = normalizeStateStore({ ...store, updatedAt: nowIso() });
  await writeStateToFile(normalized);
  if (databaseConfigured()) {
    try {
      await saveStateToDb(normalized);
    } catch (error) {
      console.error(`Installer upload state database write failed: ${error.message}`);
    }
  }
  return normalized;
}

async function readUploadDetails(folderPath) {
  const detailsPath = path.join(folderPath, "upload-details.json");
  try {
    const raw = await fs.readFile(detailsPath, "utf8");
    const details = JSON.parse(raw);
    const stat = await fs.stat(detailsPath);
    return {
      ...details,
      detailsPath,
      detailsUpdatedAt: stat.mtime.toISOString(),
    };
  } catch (_error) {
    return null;
  }
}

function normalizeStatus(value) {
  const status = cleanLower(value);
  return STATUS_VALUES.has(status) ? status : "inbox";
}

function normalizeUploadDepartment(value) {
  const department = cleanLower(value);
  if (department === "cabinet" || department === "floor") return department;
  return "unknown";
}

function uploadDepartmentLabel(value) {
  const department = normalizeUploadDepartment(value);
  if (department === "cabinet") return "Cabinet";
  if (department === "floor") return "Floor";
  return "Unknown";
}

function normalizePhotoStage(value) {
  const stage = cleanLower(value);
  return PHOTO_STAGE_LABELS[stage] ? stage : "";
}

function photoStageLabel(value) {
  return PHOTO_STAGE_LABELS[normalizePhotoStage(value)] || "Not selected";
}

function uploadSearchText(upload) {
  return [
    upload.uploadId,
    upload.folderName,
    upload.installerId,
    upload.installerName,
    upload.jobAddress,
    upload.storeDepartment,
    upload.storeDepartmentLabel,
    upload.photoStage,
    upload.photoStageLabel,
    upload.status,
    upload.assignment?.customerName,
    upload.assignment?.customerPhone,
    upload.assignment?.customerEmail,
    upload.assignment?.customerKey,
    upload.assignment?.packetId,
    upload.assignment?.contractNumber,
    upload.assignment?.invoiceNumber,
    upload.assignment?.installAddress,
    upload.notes,
    ...(upload.files || []).flatMap((file) => [file.originalName, file.storedName]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function mergeUpload(details, folderName, state = {}) {
  const uploadId = clean(details.uploadId || state.uploadId || folderName);
  const status = normalizeStatus(state.status);
  const files = Array.isArray(details.files) ? details.files : [];
  const storeDepartment = normalizeUploadDepartment(state.storeDepartment || details.storeDepartment);
  const photoStage = normalizePhotoStage(state.photoStage || details.photoStage);
  return {
    uploadId,
    folderName,
    installerId: clean(details.installerId || state.installerId),
    installerName: clean(details.installerName) || "Not entered",
    jobAddress: clean(details.jobAddress) || "Not entered",
    storeDepartment,
    storeDepartmentLabel: clean(state.storeDepartmentLabel || details.storeDepartmentLabel) || uploadDepartmentLabel(storeDepartment),
    photoStage,
    photoStageLabel: clean(state.photoStageLabel || details.photoStageLabel) || photoStageLabel(photoStage),
    photoCount: Number(details.photoCount || files.length || 0),
    uploadedAt: clean(details.uploadedAt || details.detailsUpdatedAt),
    uploadedAtDisplay: clean(details.uploadedAtDisplay),
    savedFolder: clean(details.savedFolder) || "",
    files,
    status,
    archivedAt: clean(state.archivedAt),
    deletedAt: clean(state.deletedAt),
    deletedReason: clean(state.deletedReason),
    assignment: state.assignment || null,
    notes: clean(state.notes),
    history: Array.isArray(state.history) ? state.history : [],
    searchText: "",
  };
}

async function scanRawUploads() {
  const root = await installerUploadRoot();
  try {
    await fs.mkdir(root, { recursive: true });
  } catch (_error) {
    // The API still reports the intended folder.
  }

  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (_error) {
    entries = [];
  }

  const uploads = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(root, entry.name);
    const details = await readUploadDetails(folderPath);
    if (!details) continue;
    uploads.push({ folderName: entry.name, folderPath, details });
  }
  return { root, uploads };
}

function filterUpload(upload, filters = {}) {
  const status = cleanLower(filters.status || "inbox");
  if (status && status !== "all" && upload.status !== status) return false;

  const department = cleanLower(filters.storeDepartment || "all");
  if (department !== "all" && upload.storeDepartment !== department) return false;

  const installerName = cleanLower(filters.installerName || "all");
  if (installerName !== "all" && cleanLower(upload.installerName) !== installerName) return false;

  const queryText = cleanLower(filters.q);
  if (queryText && !upload.searchText.includes(queryText)) return false;

  return true;
}

function compareUploads(a, b) {
  const statusRank = { inbox: 0, assigned: 1, archived: 2, deleted: 3 };
  const rankCompare = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
  if (rankCompare) return rankCompare;
  return String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || ""));
}

async function listInstallerUploads(filters = {}) {
  const [{ root, uploads: rawUploads }, stateStore] = await Promise.all([
    scanRawUploads(),
    readStateStore(),
  ]);

  const merged = rawUploads.map(({ folderName, details }) => {
    const uploadId = clean(details.uploadId || folderName);
    const upload = mergeUpload(details, folderName, stateStore.uploads[uploadId] || {});
    upload.searchText = uploadSearchText(upload);
    upload.files = upload.files.map((file) => ({
      ...file,
      photoUrl: `/api/installer-uploads/${encodeURIComponent(upload.uploadId)}/photos/${encodeURIComponent(clean(file.storedName))}`,
    }));
    return upload;
  }).filter((upload) => filterUpload(upload, filters));

  merged.sort(compareUploads);
  const counts = rawUploads.reduce((memo, { folderName, details }) => {
    const uploadId = clean(details.uploadId || folderName);
    const status = normalizeStatus(stateStore.uploads[uploadId]?.status);
    memo[status] = (memo[status] || 0) + 1;
    memo.all += 1;
    return memo;
  }, { all: 0, inbox: 0, assigned: 0, archived: 0, deleted: 0 });

  return {
    root,
    count: merged.length,
    counts,
    uploads: merged,
  };
}

async function findRawUpload(uploadId) {
  const cleanId = clean(uploadId);
  const { root, uploads } = await scanRawUploads();
  const match = uploads.find(({ folderName, details }) => clean(details.uploadId || folderName) === cleanId);
  if (!match) return null;
  return { root, ...match, uploadId: cleanId };
}

async function loadUpload(uploadId) {
  const [raw, stateStore] = await Promise.all([
    findRawUpload(uploadId),
    readStateStore(),
  ]);
  if (!raw) return null;
  const upload = mergeUpload(raw.details, raw.folderName, stateStore.uploads[raw.uploadId] || {});
  upload.searchText = uploadSearchText(upload);
  upload.files = upload.files.map((file) => ({
    ...file,
    photoUrl: `/api/installer-uploads/${encodeURIComponent(upload.uploadId)}/photos/${encodeURIComponent(clean(file.storedName))}`,
  }));
  return upload;
}

function departmentManagerConfig() {
  return {
    cabinet: new Set(splitList(process.env.CABINET_UPLOAD_MANAGERS || "jamie")),
    floor: new Set(splitList(process.env.FLOOR_UPLOAD_MANAGERS || "")),
  };
}

function actorManagesAllUploads(actor = {}) {
  const role = cleanLower(actor.role);
  return Boolean(actor.envAdmin || role === "superadmin" || role === "admin" || actor.canManageUsers);
}

function manageDepartmentsForActor(actor = {}) {
  if (actorManagesAllUploads(actor)) return ["cabinet", "floor", "unknown"];
  const username = cleanLower(actor.username);
  const config = departmentManagerConfig();
  return [...STORE_DEPARTMENTS].filter((department) => config[department]?.has(username));
}

function canManageUpload(actor, upload) {
  if (actorManagesAllUploads(actor)) return true;
  const departments = manageDepartmentsForActor(actor);
  const uploadDepartment = cleanLower(upload.storeDepartment);
  if (uploadDepartment === "both") return departments.includes("cabinet") || departments.includes("floor");
  return departments.includes(uploadDepartment);
}

function canHardDeleteUpload(actor = {}) {
  const role = cleanLower(actor.role);
  return Boolean(actor.envAdmin || actor.canManageUsers || role === "admin");
}

function permissionsForActor(actor = {}) {
  const departments = manageDepartmentsForActor(actor);
  return {
    canManageAll: departments.includes("cabinet") && departments.includes("floor"),
    canHardDelete: canHardDeleteUpload(actor),
    manageDepartments: departments,
  };
}

function stateHistoryEntry(action, actor, details = {}) {
  return {
    action,
    at: nowIso(),
    by: publicActor(actor),
    details,
  };
}

async function mutateUploadState(uploadId, mutator) {
  const stateStore = await readStateStore();
  const cleanId = clean(uploadId);
  const current = stateStore.uploads[cleanId] || { uploadId: cleanId, status: "inbox", history: [] };
  const next = mutator({
    ...current,
    history: Array.isArray(current.history) ? [...current.history] : [],
  });
  stateStore.uploads[cleanId] = next;
  await writeStateStore(stateStore);
  return next;
}

async function assignInstallerUpload(uploadId, payload = {}, actor = {}) {
  const upload = await loadUpload(uploadId);
  if (!upload) {
    const error = new Error("Installer upload not found.");
    error.status = 404;
    throw error;
  }
  if (!canManageUpload(actor, upload)) {
    const error = new Error("You do not have permission to manage this installer upload.");
    error.status = 403;
    throw error;
  }
  if (payload.confirm !== true) {
    const error = new Error("Confirm the assignment before saving.");
    error.status = 400;
    throw error;
  }

  const assignment = {
    customerKey: clean(payload.customerKey),
    customerName: clean(payload.customerName),
    customerPhone: clean(payload.customerPhone),
    customerEmail: clean(payload.customerEmail),
    packetId: clean(payload.packetId),
    contractNumber: clean(payload.contractNumber),
    invoiceNumber: clean(payload.invoiceNumber),
    installAddress: clean(payload.installAddress || payload.jobAddress),
    assignedAt: nowIso(),
    assignedBy: publicActor(actor),
  };
  if (!assignment.customerName && !assignment.packetId && !assignment.installAddress && !assignment.invoiceNumber) {
    const error = new Error("Choose or enter a customer/job before assigning.");
    error.status = 400;
    throw error;
  }

  const archiveAfterAssign = payload.archiveAfterAssign !== false;
  await mutateUploadState(upload.uploadId, (state) => {
    const next = {
      ...state,
      status: archiveAfterAssign ? "archived" : "assigned",
      assignment,
      notes: clean(payload.notes),
      archivedAt: archiveAfterAssign ? nowIso() : clean(state.archivedAt),
      deletedAt: "",
      deletedReason: "",
    };
    next.history.push(stateHistoryEntry("assigned", actor, { assignment, archiveAfterAssign }));
    return next;
  });
  return loadUpload(upload.uploadId);
}

async function updateInstallerUploadStore(uploadId, payload = {}, actor = {}) {
  const upload = await loadUpload(uploadId);
  if (!upload) {
    const error = new Error("Installer upload not found.");
    error.status = 404;
    throw error;
  }
  if (!canManageUpload(actor, upload)) {
    const error = new Error("You do not have permission to manage this installer upload.");
    error.status = 403;
    throw error;
  }
  const storeDepartment = normalizeUploadDepartment(payload.storeDepartment);
  if (storeDepartment === "unknown") {
    const error = new Error("Choose Cabinet or Floor before saving the store.");
    error.status = 400;
    throw error;
  }

  await mutateUploadState(upload.uploadId, (state) => {
    const next = {
      ...state,
      storeDepartment,
      storeDepartmentLabel: uploadDepartmentLabel(storeDepartment),
    };
    next.history.push(stateHistoryEntry("store_updated", actor, { storeDepartment }));
    return next;
  });
  return loadUpload(upload.uploadId);
}

async function archiveInstallerUpload(uploadId, payload = {}, actor = {}) {
  const upload = await loadUpload(uploadId);
  if (!upload) {
    const error = new Error("Installer upload not found.");
    error.status = 404;
    throw error;
  }
  if (!canManageUpload(actor, upload)) {
    const error = new Error("You do not have permission to manage this installer upload.");
    error.status = 403;
    throw error;
  }
  await mutateUploadState(upload.uploadId, (state) => {
    const next = {
      ...state,
      status: "archived",
      archivedAt: nowIso(),
      deletedAt: "",
      deletedReason: "",
      notes: clean(payload.notes || state.notes),
    };
    next.history.push(stateHistoryEntry("archived", actor, { notes: next.notes }));
    return next;
  });
  return loadUpload(upload.uploadId);
}

async function deleteInstallerUpload(uploadId, payload = {}, actor = {}) {
  const upload = await loadUpload(uploadId);
  if (!upload) {
    const error = new Error("Installer upload not found.");
    error.status = 404;
    throw error;
  }
  if (!canManageUpload(actor, upload)) {
    const error = new Error("You do not have permission to manage this installer upload.");
    error.status = 403;
    throw error;
  }
  if (payload.confirm !== true) {
    const error = new Error("Confirm delete before hiding this upload.");
    error.status = 400;
    throw error;
  }
  await mutateUploadState(upload.uploadId, (state) => {
    const next = {
      ...state,
      status: "deleted",
      deletedAt: nowIso(),
      deletedReason: clean(payload.reason || "Deleted from staff page."),
    };
    next.history.push(stateHistoryEntry("deleted", actor, { reason: next.deletedReason }));
    return next;
  });
  return loadUpload(upload.uploadId);
}

async function hardDeleteInstallerUpload(uploadId, payload = {}, actor = {}) {
  const [raw, stateStore] = await Promise.all([
    findRawUpload(uploadId),
    readStateStore(),
  ]);
  if (!raw) {
    const error = new Error("Installer upload not found.");
    error.status = 404;
    throw error;
  }
  const upload = mergeUpload(raw.details, raw.folderName, stateStore.uploads[raw.uploadId] || {});
  if (!canHardDeleteUpload(actor) || !canManageUpload(actor, upload)) {
    const error = new Error("Only an admin can hard delete installer upload files.");
    error.status = 403;
    throw error;
  }
  if (payload.confirm !== true || clean(payload.confirmText).toUpperCase() !== "DELETE") {
    const error = new Error("Type DELETE to permanently remove this upload folder.");
    error.status = 400;
    throw error;
  }

  const root = path.resolve(raw.root);
  const folderPath = path.resolve(raw.folderPath);
  if (!pathInside(root, folderPath) || root === folderPath) {
    const error = new Error("Upload folder path failed safety validation.");
    error.status = 400;
    throw error;
  }

  const removedFiles = Array.isArray(raw.details.files) ? raw.details.files.length : 0;
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
  } catch (error) {
    if (["EACCES", "EPERM"].includes(error.code)) {
      const permissionError = new Error("Server file permissions blocked hard delete for this installer upload folder.");
      permissionError.status = 403;
      permissionError.detail = error.message;
      throw permissionError;
    }
    throw error;
  }
  if (stateStore.uploads[raw.uploadId]) {
    delete stateStore.uploads[raw.uploadId];
    await writeStateStore(stateStore);
  }
  return {
    uploadId: raw.uploadId,
    folderName: raw.folderName,
    removedFolder: folderPath,
    removedFiles,
    reason: clean(payload.reason || "Hard deleted from staff page."),
    deletedAt: nowIso(),
    deletedBy: publicActor(actor),
  };
}

async function restoreInstallerUpload(uploadId, actor = {}) {
  const upload = await loadUpload(uploadId);
  if (!upload) {
    const error = new Error("Installer upload not found.");
    error.status = 404;
    throw error;
  }
  if (!canManageUpload(actor, upload)) {
    const error = new Error("You do not have permission to manage this installer upload.");
    error.status = 403;
    throw error;
  }
  await mutateUploadState(upload.uploadId, (state) => {
    const next = {
      ...state,
      status: state.assignment ? "assigned" : "inbox",
      deletedAt: "",
      deletedReason: "",
    };
    next.history.push(stateHistoryEntry("restored", actor));
    return next;
  });
  return loadUpload(upload.uploadId);
}

async function photoPathForUpload(uploadId, storedName) {
  const raw = await findRawUpload(uploadId);
  if (!raw) return null;
  const fileName = path.basename(clean(storedName));
  if (!fileName) return null;
  const filePath = path.resolve(raw.folderPath, fileName);
  if (!pathInside(raw.folderPath, filePath) || !pathInside(raw.root, filePath)) return null;
  const file = raw.details.files?.find((item) => clean(item.storedName) === fileName);
  if (!file) return null;
  return { filePath, file };
}

module.exports = {
  STATE_PATH,
  archiveInstallerUpload,
  assignInstallerUpload,
  canHardDeleteUpload,
  canManageUpload,
  deleteInstallerUpload,
  hardDeleteInstallerUpload,
  installerUploadRoot,
  listInstallerUploads,
  loadUpload,
  permissionsForActor,
  photoPathForUpload,
  restoreInstallerUpload,
  updateInstallerUploadStore,
};
