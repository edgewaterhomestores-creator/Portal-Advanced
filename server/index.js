require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { mountQuickContractRoutes } = require("./quick-contract");
const { publicBaseUrl } = require("./public-url");
const { createPostgresSessionStore } = require("./session-store");

const { databaseConfigured, deleteContractDraftsForOwner, disableDatabase, ensureLookupSchema, listContractDrafts, listLookupRecords, loadContractDraft, query, saveContractDraft } = require("./db");
const {
  sendCustomerContactEmail,
  sendCustomerFinalPacketEmail,
  sendCustomerLinkEmail,
  sendFeatureRequestEmail,
  sendFinalPacketEmail,
  sendPaidContractCustomerEmail,
  sendPaidContractSignedEmail,
  sendPasswordResetEmail,
} = require("./email");
const { contractPdfFilename } = require("./filenames");
const { estimateFolderPath, listEstimateFiles, readEstimatePdfDataUrl, safeEstimatePath } = require("./estimate-files");
const {
  completeGmailOAuth,
  deleteGmailImportAccount,
  gmailAuthUrl,
  listGmailImportAccounts,
  saveGmailImportAccount,
  scanGmailImports,
} = require("./gmail-import");
const { listEstimateCustomers, registerEstimateModule } = require("./estimate-module");
const { generatedPassword, generateBlankTemplatePages, generatePdf, includedPageNumbers, selectedSignatureSections, SIGNATURE_SECTIONS } = require("./pdf");
const {
  importPreimportRows,
  listPreimportRecords,
  ocrPreimportDocument,
  previewPreimport,
  savePreimportUploads,
  scanIncomingDocuments,
} = require("./preimport");
const { PAGE_LABELS } = require("./fieldMap");
const { clientIp, logError, logEvent, requestMeta } = require("./logger");
const { formatDateDisplay, isValidDateDisplay, isValidEmailAddress, normalizeEmailAddress } = require("./validation");
const {
  addSignature,
  deleteSignature,
  dismissSetup,
  loadSettings,
  updateBusinessSettings,
  updateSignature,
} = require("./settings");
const { ensureDataDirs, generatedPath, listPackets, loadPacket, newPacketId, savePacket } = require("./storage");
const {
  authenticateCustomerAccount,
  authenticateCustomerAccountByLastName,
  authenticateStaff,
  changeCustomerPassword,
  changeStaffPassword,
  completePasswordResetWithToken,
  createFirstStaffUser,
  createPasswordResetTokensForEmail,
  createStaffUser,
  createStaffPasswordResetToken,
  findCustomerAccountByCustomerKey,
  hasStaffUsers,
  listStaffUsers,
  listStaffUsersForAdmin,
  popStaffNotifications,
  queueStaffNotification,
  resetStaffPassword,
  updateCustomerAccount,
  updateStaffUser,
  upsertCustomerAccount,
} = require("./users");
const { INSTALLER_DIRECTORY_PATH, listInstallers, saveInstaller, saveInstallerByName } = require("./installer-directory");
const {
  STATE_PATH: INSTALLER_UPLOAD_STATE_PATH,
  archiveInstallerUpload,
  assignInstallerUpload,
  canHardDeleteUpload,
  canManageUpload,
  deleteInstallerUpload,
  hardDeleteInstallerUpload,
  listInstallerUploads,
  loadUpload,
  permissionsForActor,
  photoPathForUpload,
  restoreInstallerUpload,
  updateInstallerUploadStore,
} = require("./installer-uploads");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const REQUIRED_PAGES = [4];
const CUSTOMER_HIDDEN_PAGES = [11, 13];
const PAIRED_CUSTOMER_PAGES = {
  15: 16,
};
const STAFF_MAX_ACTIVE_SESSIONS = Math.max(1, Number(process.env.STAFF_MAX_ACTIVE_SESSIONS || 3));
const STAFF_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const STAFF_SESSION_DEFAULT_IDLE_MINUTES = 5;
const STAFF_SESSION_DEFAULT_IDLE_MS = 1000 * 60 * STAFF_SESSION_DEFAULT_IDLE_MINUTES;
const RECORD_EDIT_LOCK_TTL_MS = 1000 * 60 * 3;
const activeStaffSessions = new Map();
const activeRecordLocks = new Map();

const app = express();
const preimportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 75 * 1024 * 1024,
    files: 20,
  },
});

app.set("trust proxy", true);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

const sessionStore = process.env.DATABASE_URL
  ? createPostgresSessionStore(session, {
    databaseConfigured,
    query,
    ttlMs: STAFF_SESSION_TTL_MS,
  })
  : undefined;

app.use(session({
  name: "edgewater.sid",
  secret: process.env.SESSION_SECRET || "dev-only-change-me",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));
app.use(express.json({ limit: "30mb" }));
app.use(requirePrivateFinancialRoutes);
app.use(express.static(PUBLIC_DIR, { index: false }));

function text(value) {
  return String(value ?? "").trim();
}

function customerPortalEnabled() {
  return /^(1|true|yes)$/i.test(text(process.env.CUSTOMER_PORTAL_ENABLED));
}

function customerPortalUrl() {
  return customerPortalEnabled() ? "/customer" : "/customer-limited";
}

function envAdminCredentials() {
  const username = text(process.env.ADMIN_USERNAME);
  const password = text(process.env.ADMIN_PASSWORD);
  return { username, password, configured: Boolean(username && password) };
}

function bool(value) {
  return value === true || value === "true" || value === "on";
}

function normalizedIp(value) {
  return text(value).replace(/^::ffff:/, "");
}

function isPrivateNetworkIp(value) {
  const ip = normalizedIp(value);
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const match172 = ip.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  const lower = ip.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

function isFinancialRoute(pathname) {
  return /^\/(?:api\/)?(?:finance|financial|payroll|payments-admin|owner-financial)(?:\/|$)/i.test(pathname);
}

function requirePrivateFinancialRoutes(req, res, next) {
  if (!isFinancialRoute(req.path)) return next();
  if (String(process.env.ALLOW_PUBLIC_FINANCIAL_ROUTES || "").toLowerCase() === "true") return next();
  if (isPrivateNetworkIp(clientIp(req)) || isPrivateNetworkIp(req.ip)) return next();
  return res.status(403).json({ error: "Financial routes require private network or VPN access." });
}

function dateText(value) {
  return formatDateDisplay(value);
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function communicationConsentFromBody(body, audit) {
  const consent = body?.communicationConsent || {};
  return {
    accountEmailAccepted: bool(consent.accountEmailAccepted),
    marketingEmailConsent: bool(consent.marketingEmailConsent),
    accountTextConsent: bool(consent.accountTextConsent),
    marketingTextConsent: bool(consent.marketingTextConsent),
    socialMediaTagConsent: bool(consent.socialMediaTagConsent),
    socialMediaProfile: text(consent.socialMediaProfile),
    capturedAt: audit.signedAt,
    ip: audit.ip,
    userAgent: audit.userAgent,
  };
}

function capitalizeName(value) {
  const raw = text(value).replace(/\s+/g, " ");
  if (!raw) return "";

  return raw
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_match, separator, character) => `${separator}${character.toUpperCase()}`);
}

function keyText(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LEGACY_ESTIMATE_KEY = ["qu", "ote"].join("");
const LEGACY_ESTIMATE_SECTION_ID = `${LEGACY_ESTIMATE_KEY}Estimate`;
const GENERATED_ESTIMATE_SECTION_ID = ["estimate", "Estimate"].join("");

function legacyVendorEstimateKey(suffix) {
  const legacy = `${LEGACY_ESTIMATE_KEY.charAt(0).toUpperCase()}${LEGACY_ESTIMATE_KEY.slice(1)}`;
  return `vendor${legacy}${suffix}`;
}

function normalizeContractSectionValue(value) {
  const section = text(value);
  return section === LEGACY_ESTIMATE_KEY ? "estimate" : section;
}

function normalizePacketSectionId(value) {
  const id = text(value);
  if (id === LEGACY_ESTIMATE_SECTION_ID || id === GENERATED_ESTIMATE_SECTION_ID) return "salesEstimate";
  return id;
}

function normalizePacketInput(body) {
  const source = body && typeof body === "object" ? body : {};
  const data = { ...source };
  if (!data.estimate && source[LEGACY_ESTIMATE_KEY]) {
    data.estimate = source[LEGACY_ESTIMATE_KEY];
  }
  if (Array.isArray(source.vendors)) {
    data.vendors = source.vendors.map((row) => {
      const next = { ...(row || {}) };
      next.vendorEstimateNumber = next.vendorEstimateNumber || next[legacyVendorEstimateKey("Number")] || "";
      next.vendorEstimateAmount = next.vendorEstimateAmount || next[legacyVendorEstimateKey("Amount")] || "";
      return next;
    });
  }
  if (data.sections && Array.isArray(data.sections.included)) {
    data.sections = {
      ...data.sections,
      included: data.sections.included.map(normalizePacketSectionId),
    };
  }
  return data;
}

function last4Digits(value) {
  return text(value).replace(/\D/g, "").slice(-4);
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return require("node:crypto").timingSafeEqual(left, right);
}

function wantsJson(req) {
  return req.path.startsWith("/api/") || req.xhr || String(req.get("accept") || "").includes("application/json");
}

function passwordChangeAllowed(req) {
  return ["/change-password", "/api/change-password", "/api/logout", "/api/session"].includes(req.path);
}

function normalizeStaffSessionIdleMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return STAFF_SESSION_DEFAULT_IDLE_MINUTES;
  return Math.min(480, Math.max(1, parsed));
}

async function staffSessionIdleMs() {
  try {
    const settings = await loadSettings();
    return normalizeStaffSessionIdleMinutes(settings.staffSessionIdleMinutes) * 60 * 1000;
  } catch (_error) {
    return STAFF_SESSION_DEFAULT_IDLE_MS;
  }
}

function pruneStaffSessions(ttlMs = STAFF_SESSION_DEFAULT_IDLE_MS) {
  const cutoff = Date.now() - ttlMs;
  activeStaffSessions.forEach((session, id) => {
    if (session.lastSeen < cutoff) {
      activeStaffSessions.delete(id);
      releaseRecordLocksForSession(id);
    }
  });
}

function staffSessionIdsForUsername(username) {
  const userKey = keyText(username);
  if (!userKey) return [];
  return [...activeStaffSessions.entries()]
    .filter(([_id, session]) => keyText(session.username) === userKey)
    .map(([id]) => id);
}

function clearStaffSessionId(sessionId) {
  activeStaffSessions.delete(sessionId);
  releaseRecordLocksForSession(sessionId);
}

async function registerStaffSession(req, staffUser, options = {}) {
  if (staffUser.envAdmin) return { ok: true };
  const ttlMs = await staffSessionIdleMs();
  pruneStaffSessions(ttlMs);
  if (options.reclaimExistingUser) {
    staffSessionIdsForUsername(staffUser.username)
      .filter((id) => id !== req.sessionID)
      .forEach(clearStaffSessionId);
  }
  const existing = activeStaffSessions.get(req.sessionID);
  if (!existing && activeStaffSessions.size >= STAFF_MAX_ACTIVE_SESSIONS) {
    const matchingUserSessions = staffSessionIdsForUsername(staffUser.username)
      .filter((id) => id !== req.sessionID);
    return {
      ok: false,
      canReclaimExistingUser: matchingUserSessions.length > 0,
      activeSessions: activeStaffSessions.size,
      maxSessions: STAFF_MAX_ACTIVE_SESSIONS,
    };
  }

  activeStaffSessions.set(req.sessionID, {
    username: staffUser.username,
    lastSeen: Date.now(),
  });
  return { ok: true };
}

function touchStaffSession(req) {
  if (!req.session?.authenticated || !req.session?.staffUser) return;
  req.session.staffLastSeenAt = Date.now();
  if (req.session.staffUser.envAdmin) return;
  activeStaffSessions.set(req.sessionID, {
    username: req.session.staffUser.username,
    lastSeen: Date.now(),
  });
}

function clearStaffSession(req) {
  clearStaffSessionId(req.sessionID);
}

function recordLockKey(type, id) {
  return `${type}:${text(id)}`;
}

function publicRecordLock(lock) {
  if (!lock) return null;
  return {
    type: lock.type,
    id: lock.id,
    owner: {
      username: lock.username,
      name: lock.name,
    },
    lockedAt: lock.lockedAt,
    expiresAt: lock.expiresAt,
  };
}

function pruneRecordLocks() {
  const now = Date.now();
  activeRecordLocks.forEach((lock, key) => {
    if (lock.expiresAtMs <= now) activeRecordLocks.delete(key);
  });
}

function releaseRecordLocksForSession(sessionId) {
  if (!sessionId) return;
  activeRecordLocks.forEach((lock, key) => {
    if (lock.sessionId === sessionId) activeRecordLocks.delete(key);
  });
}

function activeRecordLock(type, id) {
  pruneRecordLocks();
  return activeRecordLocks.get(recordLockKey(type, id)) || null;
}

function recordLockedByOther(req, type, id) {
  const lock = activeRecordLock(type, id);
  return lock && lock.sessionId !== req.sessionID ? lock : null;
}

function acquireRecordLock(req, type, id, actor) {
  const existing = recordLockedByOther(req, type, id);
  if (existing) {
    return { acquired: false, lock: existing };
  }

  const now = new Date();
  const expiresAtMs = Date.now() + RECORD_EDIT_LOCK_TTL_MS;
  const lock = {
    type,
    id: text(id),
    sessionId: req.sessionID,
    username: actor.username,
    name: actor.name || actor.username,
    lockedAt: now.toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  };
  activeRecordLocks.set(recordLockKey(type, id), lock);
  return { acquired: true, lock };
}

function releaseRecordLock(req, type, id) {
  const key = recordLockKey(type, id);
  const lock = activeRecordLocks.get(key);
  if (lock?.sessionId === req.sessionID) {
    activeRecordLocks.delete(key);
    return true;
  }
  return false;
}

function sendRecordLocked(res, lock) {
  return res.status(423).json({
    error: `${lock.name || lock.username || "Another staff user"} is currently editing this record. Try again after they save and exit.`,
    recordLocked: true,
    lock: publicRecordLock(lock),
  });
}

function safeStaffReturnPath(value, fallback = "") {
  const raw = text(value);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (raw === "/login" || raw.startsWith("/login?") || raw === "/setup" || raw.startsWith("/setup?")) return fallback;
  if (raw === "/api/login" || raw === "/api/logout") return fallback;
  return raw;
}

function staffLoginPath(req, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const nextPath = safeStaffReturnPath(req.originalUrl || req.url);
  if (nextPath) query.set("next", nextPath);
  const queryText = query.toString();
  return `/login${queryText ? `?${queryText}` : ""}`;
}

async function requireAuth(req, res, next) {
  try {
    if (req.session?.authenticated) {
      const ttlMs = await staffSessionIdleMs();
      const lastSeen = Number(req.session.staffLastSeenAt || 0);
      if (lastSeen && Date.now() - lastSeen > ttlMs) {
        clearStaffSession(req);
        return req.session.destroy((error) => {
          if (error) return next(error);
          if (wantsJson(req)) {
            return res.status(401).json({
              error: "Your staff session timed out from inactivity. Log in again.",
              timedOut: true,
            });
          }
          return res.redirect(staffLoginPath(req, { timedOut: "1" }));
        });
      }

      touchStaffSession(req);
      if (req.session.staffUser?.mustChangePassword && !passwordChangeAllowed(req)) {
        if (wantsJson(req)) {
          return res.status(409).json({
            error: "Change your temporary password before continuing.",
            mustChangePassword: true,
            redirect: "/change-password",
          });
        }
        return res.redirect("/change-password");
      }
      return next();
    }

    if (wantsJson(req)) {
      return res.status(401).json({ error: "Login required." });
    }

    return res.redirect(staffLoginPath(req));
  } catch (error) {
    return next(error);
  }
}

function requireCustomerAuth(req, res, next) {
  if (req.session?.customer?.lastNameKey && (req.session?.customer?.phoneLast4 || req.session?.customer?.emailKey)) return next();

  if (wantsJson(req)) {
    return res.status(401).json({ error: "Customer login required." });
  }

  return res.redirect("/");
}

function customerName(packet) {
  return `${capitalizeName(packet.data.customer.firstName)} ${capitalizeName(packet.data.customer.lastName)}`.trim();
}

function customerFileName(packet) {
  const firstName = capitalizeName(packet.data.customer.firstName);
  const lastName = capitalizeName(packet.data.customer.lastName);
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return lastName || firstName || "Customer";
}

function safeHttpUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch (_error) {
    return "";
  }
}

function estimateDownloadFilename(packet) {
  const estimate = packet.data?.estimate || {};
  const raw = text(estimate.fileName || estimate.selectedEstimateFile || estimate.estimateNumber || "ESTIMATE.pdf");
  const base = path.basename(raw).replace(/[^a-z0-9._ -]/gi, "").trim() || "ESTIMATE.pdf";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

function packetEstimateSummary(packet, { includeInternal = false } = {}) {
  const estimate = packet.data?.estimate || {};
  const hasPacketPdf = text(estimate.dataUrl).startsWith("data:application/pdf;base64,");
  const safeSourceUrl = safeHttpUrl(estimate.sourceUrl);
  const selectedFile = text(estimate.selectedEstimateFile);
  const fileName = text(estimate.fileName || selectedFile);
  const viewUrl = hasPacketPdf
    ? `/api/packets/${encodeURIComponent(packet.id)}/download/estimate`
    : safeSourceUrl;
  const internalFolderUrl = includeInternal && selectedFile
    ? `/api/estimates/${encodeURIComponent(selectedFile)}/download`
    : "";

  return {
    available: Boolean(viewUrl || internalFolderUrl),
    estimateNumber: text(estimate.estimateNumber),
    fileName,
    viewUrl: viewUrl || internalFolderUrl,
    sourceUrl: safeSourceUrl,
    notes: includeInternal ? text(estimate.notes) : "",
    sourcePath: includeInternal ? text(estimate.sourcePath) : "",
  };
}

function estimatePdfBytes(packet) {
  const dataUrl = text(packet.data?.estimate?.dataUrl);
  const match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function customerKeyFromPacket(packet) {
  return {
    lastNameKey: keyText(packet.data.customer.lastName),
    phoneLast4: last4Digits(packet.data.customer.phone1 || packet.data.customer.phone2),
    emailKey: normalizeEmailAddress(packet.data.customer.email),
  };
}

function setCustomerSessionFromPacket(req, packet) {
  const key = customerKeyFromPacket(packet);
  req.session.customer = {
    ...key,
    name: customerName(packet),
  };
}

function setCustomerSessionFromAccount(req, account) {
  req.session.customer = {
    lastNameKey: account.lastNameKey,
    phoneLast4: account.phoneLast4,
    emailKey: normalizeEmailAddress(account.email),
    name: account.name,
    email: account.email,
    accountId: account.id,
    registered: true,
  };
}

function packetMatchesCustomer(packet, customer) {
  if (!customer?.lastNameKey) return false;
  const key = customerKeyFromPacket(packet);
  if (key.lastNameKey !== customer.lastNameKey) return false;
  if (key.phoneLast4 && customer.phoneLast4 && key.phoneLast4 === customer.phoneLast4) return true;
  if (key.emailKey && customer.emailKey && key.emailKey === customer.emailKey) return true;
  return false;
}

function canViewPacketPdf(req, packet) {
  return Boolean(req.session?.authenticated || packetMatchesCustomer(packet, req.session?.customer));
}

function packetPdfAccessDenied(req, res) {
  return res.status(req.session?.customer ? 403 : 401).json({
    error: "Open this contract through staff login or customer password verification.",
  });
}

async function customerPackets(customer) {
  const packets = await listPackets();
  return latestPacketsByContractFamily(packets.filter((packet) => packetMatchesCustomer(packet, customer)));
}

function flattenForSearch(value, out = []) {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach((item) => flattenForSearch(item, out));
    return out;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => flattenForSearch(item, out));
    return out;
  }

  out.push(String(value));
  return out;
}

function searchTextFor(value) {
  const values = flattenForSearch(value);
  const digitValues = values
    .map((item) => String(item).replace(/\D/g, ""))
    .filter((item) => item.length >= 3);
  return [...values, ...digitValues].join(" ").toLowerCase();
}

function splitNameParts(name) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
    lastName: parts.length > 1 ? parts.at(-1) : parts[0] || "",
  };
}

function packetSearchText(packet) {
  return searchTextFor(packet);
}

function customerSearchKey(packet) {
  const key = customerKeyFromPacket(packet);
  return customerIdentityKey(key);
}

function customerIdentityKey(key = {}) {
  return `${key.lastNameKey}:${key.phoneLast4 || key.emailKey || "no-contact"}`;
}

function customerRecordSummary(customerKey, packets, req) {
  const sorted = [...packets].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const latest = sorted[0];
  const customer = latest.data.customer || {};
  const contractGroups = contractFamilyGroups(sorted).sort((a, b) => comparePacketRecency(a.latest, b.latest));
  const contracts = contractGroups.map((group) => adminPacketSummary(group.latest, req, null, { count: group.packets.length }));

  return {
    key: customerKey,
    name: customerName(latest),
    firstName: capitalizeName(customer.firstName),
    lastName: capitalizeName(customer.lastName),
    phone1: customer.phone1 || "",
    phone2: customer.phone2 || "",
    email: customer.email || "",
    textOptIn: customer.textOptIn || "yes",
    socialMediaTagConsent: customer.socialMediaTagConsent || "",
    socialMediaProfile: customer.socialMediaProfile || "",
    referral: customer.referral || "",
    mailingAddress: customer.mailingAddress || "",
    billingAddress: customer.billingAddress || "",
    notes: customer.notes || "",
    contractCount: contracts.length,
    totalContractRecords: sorted.length,
    hiddenRevisionCount: Math.max(0, sorted.length - contracts.length),
    updatedAt: latest.updatedAt || latest.createdAt,
    contracts,
    searchText: searchTextFor(sorted.map((packet) => ({
      customer: packet.data.customer,
      order: {
        invoiceNumber: packet.data.order?.invoiceNumber,
        installAddress: packet.data.order?.installAddress,
        invoiceAmount: packet.data.order?.invoiceAmount,
      },
      contractNumber: packet.contractNumber,
      customerName: customerName(packet),
    }))),
  };
}

function importedCustomerSummary(customer) {
  const name = text(customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" "));
  return {
    key: `import:${text(customer.id || customer.key)}`,
    name,
    firstName: capitalizeName(customer.firstName),
    lastName: capitalizeName(customer.lastName),
    phone1: text(customer.phone1),
    phone2: text(customer.phone2),
    email: text(customer.email),
    textOptIn: text(customer.textOptIn || "yes"),
    socialMediaTagConsent: text(customer.socialMediaTagConsent),
    socialMediaProfile: text(customer.socialMediaProfile),
    referral: text(customer.referral),
    mailingAddress: text(customer.mailingAddress),
    billingAddress: text(customer.billingAddress),
    notes: text(customer.notes),
    imported: true,
    importSource: text(customer.sourceName),
    contractCount: 0,
    totalContractRecords: 0,
    hiddenRevisionCount: 0,
    updatedAt: text(customer.importedAt),
    contracts: [],
    searchText: searchTextFor(customer),
  };
}

function lookupCustomerSummary(customer) {
  const name = text(customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" "));
  const split = splitNameParts(name);
  const linkedRecords = Array.isArray(customer.linkedRecords) ? customer.linkedRecords : [];
  return {
    key: `customer:${text(customer.id || customer.key || name)}`,
    name,
    firstName: capitalizeName(customer.firstName || split.firstName),
    lastName: capitalizeName(customer.lastName || split.lastName),
    phone1: text(customer.phone1),
    phone2: text(customer.phone2),
    email: text(customer.email),
    textOptIn: text(customer.textOptIn || "yes"),
    socialMediaTagConsent: text(customer.socialMediaTagConsent),
    socialMediaProfile: text(customer.socialMediaProfile),
    referral: text(customer.referral),
    mailingAddress: text(customer.mailingAddress),
    billingAddress: text(customer.billingAddress),
    notes: text(customer.notes),
    sourceName: text(customer.sourceName),
    linkedRecords,
    contractCount: 0,
    totalContractRecords: 0,
    hiddenRevisionCount: 0,
    updatedAt: text(customer.importedAt),
    contracts: [],
    searchText: searchTextFor({ ...customer, linkedRecords }),
  };
}

function estimateCustomerSummary(customer) {
  const name = text(customer.name);
  const split = splitNameParts(name);
  return {
    key: `estimate:${text(customer.key || name)}`,
    name,
    firstName: capitalizeName(split.firstName),
    lastName: capitalizeName(split.lastName),
    phone1: text(customer.phone),
    phone2: "",
    email: text(customer.email),
    textOptIn: "yes",
    socialMediaTagConsent: "",
    socialMediaProfile: "",
    referral: "",
    mailingAddress: text(customer.address),
    billingAddress: "",
    notes: "",
    sourceName: "estimate",
    contractCount: 0,
    totalContractRecords: 0,
    hiddenRevisionCount: 0,
    updatedAt: text(customer.lastUsedAt),
    contracts: [],
    searchText: searchTextFor(customer),
  };
}

function customerDuplicateKey(customer) {
  return [
    keyText(customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" ")),
    last4Digits(customer.phone1),
    keyText(customer.email),
    keyText(customer.mailingAddress || customer.billingAddress),
  ].join(":");
}

function adminPacketSummary(packet, req, duplicateInfo = null, familyInfo = null) {
  const status = packetStatus(packet);
  const locked = isPacketLocked(packet);

  return {
    id: packet.id,
    contractNumber: packet.contractNumber || packet.data.order.invoiceNumber || packet.id,
    revisionBaseContractNumber: packet.revisionBaseContractNumber || packet.contractNumber || packet.data.order.invoiceNumber || packet.id,
    revisionNumber: packet.revisionNumber || 0,
    familyRecordCount: familyInfo?.count || 1,
    hiddenFamilyRecordCount: Math.max(0, (familyInfo?.count || 1) - 1),
    parentPacketId: packet.parentPacketId || null,
    previousPacketId: packet.previousPacketId || null,
    createdBy: packet.createdBy || null,
    updatedBy: packet.updatedBy || null,
    owner: packetOwner(packet),
    customerName: customerName(packet),
    customerFirstName: capitalizeName(packet.data.customer.firstName),
    customerLastName: capitalizeName(packet.data.customer.lastName),
    customerFileName: customerFileName(packet),
    customerPhone: packet.data.customer.phone1 || packet.data.customer.phone2,
    customerEmail: packet.data.customer.email,
    installAddress: packet.data.order.installAddress || "",
    invoiceNumber: packet.data.order.invoiceNumber,
    invoiceAmount: packet.data.order.invoiceAmount || packet.data.payments?.totalInvoiceAmount,
    createdAt: packet.createdAt,
    updatedAt: packet.updatedAt,
    finalizedAt: packet.finalizedAt || null,
    completedAt: packet.completedAt || null,
    status,
    locked,
    lockReason: locked ? "Signed/accepted records cannot be overwritten. Create an edit for changes." : "",
    possibleDuplicate: duplicateInfo,
    customerLinkEmail: packet.customerLinkEmail || null,
    estimate: packetEstimateSummary(packet, { includeInternal: true }),
    signUrl: packet.completedAt ? null : `${baseUrl(req)}/sign/${packet.id}`,
    signablePdfUrl: `/api/packets/${packet.id}/download/signable`,
    finalPdfUrl: packet.finalizedAt ? `/api/packets/${packet.id}/download/final` : null,
  };
}

function draftSearchText(draft = {}) {
  const payload = normalizePacketInput(draft.draft?.payload || {});
  return [
    draft.id,
    draft.draftKey,
    draft.ownerUsername,
    normalizeContractSectionValue(draft.section),
    payload.customer?.firstName,
    payload.customer?.lastName,
    payload.customer?.phone1,
    payload.customer?.phone2,
    payload.customer?.email,
    payload.customer?.mailingAddress,
    payload.customer?.billingAddress,
    payload.order?.installAddress,
    payload.order?.invoiceNumber,
    payload.estimate?.estimateNumber,
    payload.estimate?.fileName,
    payload.estimate?.selectedEstimateFile,
  ].map(text).join(" ").toLowerCase();
}

function packetLikeFromDraft(draft = {}) {
  const payload = normalizePacketInput(draft.draft?.payload || {});
  return { id: draft.id, data: normalizePacketData(payload) };
}

function draftFamilyKey(draft = {}) {
  return contractFamilyKey(packetLikeFromDraft(draft));
}

function collapseDraftsForSearch(drafts = []) {
  const groups = new Map();
  drafts.forEach((draft) => {
    const key = draftFamilyKey(draft);
    const group = groups.get(key) || [];
    group.push(draft);
    groups.set(key, group);
  });

  return [...groups.entries()].map(([key, groupDrafts]) => {
    const sorted = [...groupDrafts].sort(comparePacketRecency);
    return {
      key,
      drafts: sorted,
      latest: sorted[0],
      searchText: flattenForSearch(sorted).join(" ").toLowerCase(),
    };
  });
}

function visibleDraftGroupsForSearch(drafts = [], contractGroups = []) {
  const contractKeys = new Set(contractGroups.map((group) => group.key));
  return collapseDraftsForSearch(drafts)
    .filter((group) => !contractKeys.has(group.key))
    .sort((a, b) => comparePacketRecency(a.latest, b.latest));
}

function contractDraftKey(clientDraftKey, payload = {}) {
  const key = draftFamilyKey({
    id: "autosave",
    draft: { payload },
  });
  if (!key.startsWith("packet:")) return `contract:${key}`;
  return text(clientDraftKey || "contract/new");
}

async function clearProcessedContractDrafts(actor, req, reason) {
  const username = text(actor?.username);
  if (!username) return 0;
  try {
    const deletedCount = await deleteContractDraftsForOwner(username);
    if (deletedCount) {
      await logEvent("info", "contract_autosave_drafts_cleared", {
        request: requestMeta(req),
        username,
        reason,
        deletedCount,
      });
    }
    return deletedCount;
  } catch (error) {
    await logError(error, req, {
      event: "contract_autosave_draft_cleanup_failed",
      username,
      reason,
    });
    return 0;
  }
}

function draftSummary(draft, req, familyInfo = null) {
  const payload = draft.draft?.payload || {};
  const packetLike = packetLikeFromDraft(draft);
  const customer = packetLike.data.customer || {};
  const order = packetLike.data.order || {};
  const estimate = packetLike.data.estimate || {};
  const resumeUrl = `/contract/new?serverDraft=${encodeURIComponent(draft.id)}&section=${encodeURIComponent(normalizeContractSectionValue(draft.section) || "customer")}`;

  return {
    id: draft.id,
    draft: true,
    contractNumber: order.invoiceNumber || "Unsaved draft",
    revisionBaseContractNumber: order.invoiceNumber || "Unsaved draft",
    revisionNumber: 0,
    familyRecordCount: familyInfo?.count || 1,
    hiddenFamilyRecordCount: Math.max(0, (familyInfo?.count || 1) - 1),
    owner: { username: draft.ownerUsername },
    customerName: customerName(packetLike),
    customerFirstName: customer.firstName,
    customerLastName: customer.lastName,
    customerFileName: customerFileName(packetLike),
    customerPhone: customer.phone1 || customer.phone2,
    customerEmail: customer.email,
    installAddress: order.installAddress || "",
    invoiceNumber: order.invoiceNumber,
    invoiceAmount: order.invoiceAmount || payload.payments?.totalInvoiceAmount,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    status: "draft",
    locked: false,
    lockReason: "Autosaved draft. Open it and generate/save the packet when ready.",
    customerLinkEmail: { sent: false, reason: "Not sent yet" },
    estimate: {
      available: Boolean(estimate.selectedEstimateFile || estimate.fileName),
      estimateNumber: estimate.estimateNumber || "",
      fileName: estimate.fileName || estimate.selectedEstimateFile || "",
      viewUrl: estimate.selectedEstimateFile ? `/api/estimates/${encodeURIComponent(estimate.selectedEstimateFile)}/download` : "",
      sourcePath: estimate.sourcePath || "",
      sourceUrl: estimate.sourceUrl || "",
    },
    resumeUrl,
  };
}

function packetStatus(packet) {
  if (packet.completedAt || packet.status === "completed") return "completed";
  if (packet.finalizedAt || packet.status === "signed") return "signed";
  if (packet.acceptedAt || packet.status === "accepted") return "accepted";
  return packet.status || "signable";
}

function isPacketLocked(packet) {
  return ["accepted", "signed", "completed"].includes(packetStatus(packet));
}

function baseContractNumberFromPacket(packet) {
  const current = text(packet.revisionBaseContractNumber || packet.contractNumber || packet.data?.order?.invoiceNumber || packet.id);
  return current.replace(/-E\d+$/i, "") || packet.id;
}

function contractNumberForData(data, fallbackId) {
  return text(data.order?.invoiceNumber) || fallbackId;
}

async function nextRevisionNumber(baseContractNumber) {
  const packets = await listPackets();
  let max = 0;

  packets.forEach((packet) => {
    const sameBase = baseContractNumberFromPacket(packet) === baseContractNumber;
    if (!sameBase) return;

    const explicit = Number(packet.revisionNumber || 0);
    const match = text(packet.contractNumber).match(/-E(\d+)$/i);
    const parsed = match ? Number(match[1]) : 0;
    max = Math.max(max, explicit, parsed);
  });

  return max + 1;
}

function comparePacketRecency(a, b) {
  const timeCompare = String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  if (timeCompare) return timeCompare;
  return Number(b.revisionNumber || 0) - Number(a.revisionNumber || 0);
}

function generatedPacketNumber(value, packet) {
  const current = text(value);
  return !current || current === packet.id || /^\d{8}-[a-f0-9]{8}$/i.test(current);
}

function contractFamilyKey(packet) {
  const key = customerKeyFromPacket(packet);
  const customerKey = customerIdentityKey(key);
  const data = packet.data || {};
  const order = data.order || {};
  const invoice = keyText(order.invoiceNumber);
  if (invoice) return `${customerKey}:invoice:${invoice}`;

  const base = baseContractNumberFromPacket(packet);
  if (!generatedPacketNumber(base, packet)) return `${customerKey}:contract:${keyText(base)}`;

  const address = keyText(order.installAddress || data.customer?.mailingAddress || data.customer?.billingAddress);
  const amount = keyText(order.invoiceAmount || data.payments?.totalInvoiceAmount);
  if (address && amount) return `${customerKey}:address-amount:${address}:${amount}`;
  if (address) return `${customerKey}:address:${address}`;

  const estimate = keyText(data.estimate?.estimateNumber || data.estimate?.estimateId || data.estimate?.fileName);
  if (estimate) return `${customerKey}:estimate:${estimate}`;

  if (key.lastNameKey && (key.phoneLast4 || key.emailKey)) return `${customerKey}:draft`;
  return `packet:${packet.id}`;
}

function contractFamilyGroups(packets) {
  const groups = new Map();

  packets.forEach((packet) => {
    const key = contractFamilyKey(packet);
    const group = groups.get(key) || [];
    group.push(packet);
    groups.set(key, group);
  });

  return [...groups.entries()].map(([key, groupPackets]) => {
    const sorted = [...groupPackets].sort(comparePacketRecency);
    return {
      key,
      packets: sorted,
      latest: sorted[0],
      searchText: flattenForSearch(sorted).join(" ").toLowerCase(),
    };
  });
}

function latestPacketsByContractFamily(packets) {
  return contractFamilyGroups(packets)
    .map((group) => group.latest)
    .sort(comparePacketRecency);
}

async function packetHistory(packet, req) {
  const base = baseContractNumberFromPacket(packet);
  const packets = await listPackets();
  return packets
    .filter((item) => baseContractNumberFromPacket(item) === base)
    .sort((a, b) => Number(a.revisionNumber || 0) - Number(b.revisionNumber || 0))
    .map((item) => adminPacketSummary(item, req));
}

async function adminPacketDetail(packet, req) {
  return {
    ...adminPacketSummary(packet, req),
    password: generatedPassword(packet.data),
    data: packet.data,
    createdBy: packet.createdBy || null,
    updatedBy: packet.updatedBy || null,
    owner: packetOwner(packet),
    editLock: publicRecordLock(activeRecordLock("packet", packet.id)),
    versions: packetVersions(packet),
    sections: adminSectionSummary(packet),
    signatures: packet.signatures || [],
    revisionReason: packet.revisionReason || "",
    history: await packetHistory(packet, req),
  };
}

function staffActor(req) {
  const user = req.session?.staffUser || {};
  const username = text(user.username || req.session?.username || "admin");
  return {
    id: text(user.id),
    username,
    name: text(user.name || username),
    role: text(user.role || (user.canManageUsers ? "admin" : "salesperson")),
    title: text(user.title),
    signatureId: text(user.signatureId),
    envAdmin: Boolean(user.envAdmin),
    canManageUsers: Boolean(user.canManageUsers),
  };
}

function requireUserManager(req, res, next) {
  const actor = staffActor(req);
  const role = text(actor.role).toLowerCase();
  if (actor.envAdmin || role === "superadmin" || role === "admin") return next();
  return res.status(403).json({ error: "Only Superadmin or Admin accounts can manage staff users." });
}

function canManageInstallerDirectory(actor = {}) {
  return actor.envAdmin || actor.canManageUsers || actor.role === "admin" || actor.role === "sales_manager";
}

function requireInstallerDirectoryManager(req, res, next) {
  const actor = staffActor(req);
  if (canManageInstallerDirectory(actor)) return next();
  return res.status(403).json({ error: "Only Admin or Sales Manager accounts can maintain installers." });
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function versionEntry(packet, actor, label, reason) {
  return {
    id: crypto.randomBytes(6).toString("hex"),
    label,
    savedAt: new Date().toISOString(),
    by: actor,
    reason: text(reason),
    contractNumber: packet.contractNumber || packet.data?.order?.invoiceNumber || packet.id,
    data: cloneData(packet.data),
  };
}

function ensurePacketVersions(packet, actor) {
  if (Array.isArray(packet.versions) && packet.versions.length) return;
  const createdBy = packet.createdBy || actor || { username: "unknown", name: "Unknown" };
  packet.versions = [versionEntry(packet, createdBy, "Original", "Created")];
}

function appendPacketVersion(packet, actor, label, reason) {
  ensurePacketVersions(packet, actor);
  packet.versions.push(versionEntry(packet, actor, label, reason));
  packet.versions = packet.versions.slice(-50);
}

function packetVersions(packet) {
  return (Array.isArray(packet.versions) ? packet.versions : []).map((version, index) => ({
    id: version.id || String(index),
    label: version.label || `Version ${index + 1}`,
    savedAt: version.savedAt || packet.updatedAt || packet.createdAt,
    by: version.by || null,
    reason: version.reason || "",
    contractNumber: version.contractNumber || packet.contractNumber || packet.id,
    data: version.data || null,
  }));
}

function packetOwnerUsername(packet) {
  return text(packetOwner(packet)?.username || packet.updateLog?.[0]?.by);
}

function packetOwner(packet) {
  return packet.owner || packet.createdBy || null;
}

function canEditPacketWithoutOverride(packet, actor) {
  const owner = packetOwnerUsername(packet);
  return actor.envAdmin || !owner || owner === actor.username;
}

function canTransferPacketOwner(packet, actor) {
  const owner = packetOwnerUsername(packet);
  return actor.envAdmin || !owner || owner === actor.username;
}

function deliveryReleaseVisible(packet) {
  const release = packet.deliveryRelease || {};
  return Boolean(packet.finalizedAt && release.status && release.status !== "not_ready");
}

function publicOrderSummary(packet, req) {
  const status = packet.completedAt
    ? "completed"
    : packet.finalizedAt
      ? "signed"
      : packet.status || "signable";
  const release = packet.deliveryRelease || {
    status: "not_ready",
    customerReleaseRequired: false,
    chainOfCustodyAvailable: false,
    pickupReleaseAvailable: false,
  };

  return {
    id: packet.id,
    customerName: customerName(packet),
    invoiceNumber: packet.data.order.invoiceNumber,
    invoiceAmount: packet.data.order.invoiceAmount || packet.data.payments?.totalInvoiceAmount,
    saleDate: packet.data.order.saleDate,
    createdAt: packet.createdAt,
    finalizedAt: packet.finalizedAt || null,
    completedAt: packet.completedAt || null,
    status,
    password: generatedPassword(packet.data),
    signUrl: packet.finalizedAt ? null : `${baseUrl(req)}/sign/${packet.id}`,
    finalPdfUrl: packet.finalizedAt ? `/api/packets/${packet.id}/download/final` : null,
    estimate: packetEstimateSummary(packet),
    sections: customerDocumentSummary(packet),
    deliveryRelease: {
      ...release,
      visible: deliveryReleaseVisible(packet),
    },
    payments: {
      totalInvoiceAmount: packet.data.payments?.totalInvoiceAmount || packet.data.order.invoiceAmount,
      rows: packet.data.payments?.rows || [],
    },
  };
}

function sectionStatus(packet, section) {
  if (["purchaseAgreement1", "purchaseAgreement2", "purchaseAgreement3", "agreementSignatures"].includes(section.id)) {
    return packet.finalizedAt ? "Signed" : "Unsigned / pending customer signature";
  }

  if (["installerAgreement", "deliveryInstallationChecklist"].includes(section.id)) {
    return packet.installerSignedAt ? "Signed by installer" : "Installer signature not recorded yet";
  }

  if (section.id === "splitPaymentAddendum") {
    return packet.data.payments?.splitPaymentApproved ? "Included by store" : "Not included";
  }

  return "Included";
}

function adminSectionSummary(packet) {
  return includedPageNumbers(packet.data).map((page) => {
    const section = PAGE_LABELS.find((item) => item.page === page) || {
      id: `templatePage${page}`,
      label: `Template page ${page}`,
      page,
    };

    return {
      id: section.id,
      label: section.label,
      templatePage: page,
      status: sectionStatus(packet, section),
    };
  });
}

function contractStatus(packet) {
  return packet.finalizedAt ? "Signed" : "Ready for review/signature";
}

function customerDocumentSummary(packet) {
  const pages = new Set(includedPageNumbers(packet.data));
  const docs = [];

  if (pages.has(3) || pages.has(2)) {
    docs.push({
      id: pages.has(2) && pages.has(3) ? "measurementEstimate" : pages.has(3) ? "estimate" : "measurement",
      label: pages.has(2) && pages.has(3) ? "Measurement / Estimate" : pages.has(3) ? "Estimate" : "Measurement Form",
      status: "Included by store",
    });
  }

  if ([4, 5, 6, 7, 8].some((page) => pages.has(page))) {
    docs.push({
      id: "contractPacket",
      label: "Contract Packet",
      status: contractStatus(packet),
    });
  }

  if (pages.has(9) && packet.data.payments?.splitPaymentApproved) {
    docs.push({
      id: "splitPaymentAddendum",
      label: "Split Payment Addendum",
      status: sectionStatus(packet, { id: "splitPaymentAddendum" }),
    });
  }

  if (pages.has(10)) {
    docs.push({
      id: "acknowledgementsReceipts",
      label: "Acknowledgements / Receipts",
      status: "Included by store",
    });
  }

  if (pages.has(12)) {
    docs.push({
      id: "additionalNotes",
      label: "Additional Notes",
      status: "Included by store",
    });
  }

  return docs;
}

const packetDateKeys = new Set(["dueDate", "customerPaymentDate", "vendorOrderDate", "expectedMaterialDate", "actualMaterialDate", "date"]);

function normalizeRows(rows, keys, maxRows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, maxRows).map((row) => {
    const out = {};
    keys.forEach((key) => {
      out[key] = packetDateKeys.has(key) ? dateText(row?.[key]) : text(row?.[key]);
    });
    return out;
  });
}

function normalizePageSelection(raw) {
  const allPages = PAGE_LABELS.map((item) => item.page);
  if (raw === undefined) return allPages;

  const values = Array.isArray(raw) ? raw : [raw];
  const selected = values
    .map(Number)
    .filter((page) => Number.isInteger(page) && allPages.includes(page) && !CUSTOMER_HIDDEN_PAGES.includes(page));

  Object.entries(PAIRED_CUSTOMER_PAGES).forEach(([source, paired]) => {
    if (selected.includes(Number(source))) {
      selected.push(Number(paired));
    }
  });

  return [...new Set([...selected, ...REQUIRED_PAGES])].sort((a, b) => a - b);
}

function sectionIdsFromPages(pages) {
  const byPage = new Map(PAGE_LABELS.map((item) => [item.page, item.id]));
  return pages.map((page) => byPage.get(page)).filter(Boolean);
}

function normalizeSectionSelection(raw, pages) {
  const known = new Set(PAGE_LABELS.map((item) => item.id));
  const included = new Set(sectionIdsFromPages(pages));
  const values = Array.isArray(raw) ? raw : [];
  const selected = values.map(normalizePacketSectionId).filter((id) => known.has(id) && included.has(id));
  return [...new Set([...sectionIdsFromPages(pages), ...selected])];
}

function normalizePacketData(body) {
  const data = normalizePacketInput(body);

  const normalized = {
    customer: {
      firstName: capitalizeName(data.customer?.firstName),
      lastName: capitalizeName(data.customer?.lastName),
      phone1: text(data.customer?.phone1),
      phone2: text(data.customer?.phone2),
      email: normalizeEmailAddress(data.customer?.email),
      textOptIn: text(data.customer?.textOptIn || "yes"),
      socialMediaTagConsent: ["yes", "no"].includes(text(data.customer?.socialMediaTagConsent)) ? text(data.customer?.socialMediaTagConsent) : "",
      socialMediaProfile: text(data.customer?.socialMediaProfile),
      referral: text(data.customer?.referral),
      mailingStreet: text(data.customer?.mailingStreet),
      mailingCity: text(data.customer?.mailingCity),
      mailingState: text(data.customer?.mailingState).toUpperCase(),
      mailingZip: text(data.customer?.mailingZip),
      mailingAddress: text(data.customer?.mailingAddress),
      billingStreet: text(data.customer?.billingStreet),
      billingCity: text(data.customer?.billingCity),
      billingState: text(data.customer?.billingState).toUpperCase(),
      billingZip: text(data.customer?.billingZip),
      billingAddress: text(data.customer?.billingAddress),
      notes: text(data.customer?.notes),
    },
    order: {
      invoiceNumber: text(data.order?.invoiceNumber),
      saleDate: dateText(data.order?.saleDate),
      installDate: dateText(data.order?.installDate),
      installStreet: text(data.order?.installStreet),
      installCity: text(data.order?.installCity),
      installState: text(data.order?.installState).toUpperCase(),
      installZip: text(data.order?.installZip),
      installAddress: text(data.order?.installAddress || data.customer?.installAddress || data.project?.installAddress),
      installerName: text(data.order?.installerName),
      salesRep: text(data.order?.salesRep),
      measurementDate: dateText(data.order?.measurementDate),
      storeRep: text(data.order?.storeRep),
      storeRepTitle: text(data.order?.storeRepTitle),
      storeRepDate: dateText(data.order?.storeRepDate),
      storeSignatureId: text(data.order?.storeSignatureId),
      storeSignatureName: text(data.order?.storeSignatureName),
      storeSignatureDataUrl: text(data.order?.storeSignatureDataUrl),
      invoiceAmount: text(data.order?.invoiceAmount),
      customerAcceptedDate: dateText(data.order?.customerAcceptedDate),
    },
    project: {
      roomType: text(data.project?.roomType),
      roomTypeOther: text(data.project?.roomTypeOther),
      projectType: text(data.project?.projectType),
      desiredTimeline: text(data.project?.desiredTimeline),
      totalWallLength: text(data.project?.totalWallLength),
      ceilingHeight: text(data.project?.ceilingHeight),
      hasIsland: text(data.project?.hasIsland),
      islandSize: text(data.project?.islandSize),
      refrigeratorWidth: text(data.project?.refrigeratorWidth),
      rangeCooktopSize: text(data.project?.rangeCooktopSize),
      dishwasher: text(data.project?.dishwasher),
      dishwasherOther: text(data.project?.dishwasherOther),
      cabinetStyle: text(data.project?.cabinetStyle),
      finish: text(data.project?.finish),
      budgetRange: text(data.project?.budgetRange),
      projectNotes: text(data.project?.projectNotes),
    },
    estimate: {
      sourcePath: text(data.estimate?.sourcePath || estimateFolderPath()),
      sourceUrl: text(data.estimate?.sourceUrl),
      estimateNumber: text(data.estimate?.estimateNumber),
      fileName: text(data.estimate?.fileName),
      selectedEstimateFile: text(data.estimate?.selectedEstimateFile),
      estimateStatus: text(data.estimate?.estimateStatus),
      acceptedFromEstimate: bool(data.estimate?.acceptedFromEstimate),
      changedAfterAcceptance: bool(data.estimate?.changedAfterAcceptance),
      approvalBypassed: bool(data.estimate?.approvalBypassed),
      approvalBypassedAt: text(data.estimate?.approvalBypassedAt),
      dataUrl: text(data.estimate?.dataUrl),
      notes: text(data.estimate?.notes),
    },
    payments: {
      splitPaymentApproved: bool(data.payments?.splitPaymentApproved),
      totalInvoiceAmount: text(data.payments?.totalInvoiceAmount),
      rows: normalizeRows(
        data.payments?.rows,
        ["amount", "dueDate", "paidInitials", "paidAmountDate"],
        3,
      ),
    },
    vendors: normalizeRows(
      data.vendors,
      [
        "customerPayment",
        "vendor",
        "customerPaymentDate",
        "vendorEstimateNumber",
        "vendorOrderNumber",
        "vendorEstimateAmount",
        "vendorOrderDate",
        "expectedMaterialDate",
        "actualMaterialDate",
      ],
      8,
    ),
    materialRows: normalizeRows(
      data.materialRows,
      ["date", "productCode", "poNumber", "supplier", "itemName", "styleColor", "unitCount", "unitCost", "total", "freight"],
      10,
    ),
    pages: {
      included: normalizePageSelection(data.pages?.included),
    },
    sections: {
      included: [],
    },
    delivery: {
      emailCustomerLink: bool(data.delivery?.emailCustomerLink),
    },
    signing: {
      sections: Array.isArray(data.signing?.sections) ? data.signing.sections.map(text).filter(Boolean) : ["mainAgreement"],
    },
    notes: {
      companyNotes: text(data.notes?.companyNotes),
      customerNotes: text(data.notes?.customerNotes),
      internalNotes: text(data.notes?.internalNotes),
    },
  };

  const addendumHasData = Boolean(
    normalized.payments.totalInvoiceAmount
    || normalized.payments.rows.length
  );
  normalized.payments.splitPaymentApproved = Boolean(normalized.payments.splitPaymentApproved && addendumHasData);
  if (!normalized.payments.splitPaymentApproved) {
    normalized.signing.sections = normalized.signing.sections.filter((section) => section !== "splitPayment");
  }

  if (normalized.payments.splitPaymentApproved && !normalized.pages.included.includes(9)) {
    normalized.pages.included.push(9);
    normalized.pages.included.sort((a, b) => a - b);
  }
  normalized.sections.included = normalizeSectionSelection(data.sections?.included, normalized.pages.included);

  return normalized;
}

function validatePacketData(data) {
  const missing = [];
  if (!data.customer.lastName) missing.push("customer last name");
  if (!data.customer.phone1 && !data.customer.phone2 && !data.customer.email) missing.push("customer phone or email");
  if (!data.pages.included.length) missing.push("at least one packet page");

  if (missing.length) {
    const error = new Error(`Missing required field: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  if (data.customer.email && !isValidEmailAddress(data.customer.email)) {
    throw validationError("Enter a valid customer email address.");
  }

  const dateFields = [
    ["sale date", data.order.saleDate],
    ["install date", data.order.installDate],
    ["measurement date", data.order.measurementDate],
    ["customer accepted date", data.order.customerAcceptedDate],
    ["store rep date", data.order.storeRepDate],
    ...(data.payments.rows || []).flatMap((row, index) => [
      [`payment row ${index + 1} due date`, row.dueDate],
    ]),
    ...(data.vendors || []).flatMap((row, index) => [
      [`vendor row ${index + 1} payment date`, row.customerPaymentDate],
      [`vendor row ${index + 1} order date`, row.vendorOrderDate],
      [`vendor row ${index + 1} expected material date`, row.expectedMaterialDate],
      [`vendor row ${index + 1} actual delivered date`, row.actualMaterialDate],
    ]),
    ...(data.materialRows || []).map((row, index) => [`material row ${index + 1} date`, row.date]),
  ];
  const invalidDate = dateFields.find(([, value]) => value && !isValidDateDisplay(value));
  if (invalidDate) {
    throw validationError(`Use MM/DD/YYYY for ${invalidDate[0]}.`);
  }

  generatedPassword(data);
}

async function applySelectedEstimateAttachment(data) {
  if (data.estimate?.dataUrl || !data.estimate?.selectedEstimateFile) return;

  const estimate = await readEstimatePdfDataUrl(data.estimate.selectedEstimateFile);
  data.estimate.dataUrl = estimate.dataUrl;
  data.estimate.fileName = data.estimate.fileName || estimate.fileName;
  data.estimate.sourcePath = data.estimate.sourcePath || estimate.folderPath;
}

function hasEstimateAttachment(data) {
  return Boolean(text(data.estimate?.dataUrl));
}

function syncEstimatePageSelection(data) {
  if (hasEstimateAttachment(data)) {
    data.pages.included.push(3);
  } else {
    data.pages.included = data.pages.included.filter((page) => page !== 3);
  }

  data.pages.included = [...new Set([...data.pages.included, ...REQUIRED_PAGES])].sort((a, b) => a - b);
  data.sections.included = normalizeSectionSelection(data.sections?.included, data.pages.included);
}

function signatureOwnedByActor(signature = {}, actor = {}) {
  const username = text(actor.username).toLowerCase();
  if (!username) return false;
  const ownerUsername = text(signature.ownerUsername).toLowerCase();
  if (ownerUsername) return ownerUsername === username;
  return keyText(signature.name) && keyText(signature.name) === keyText(actor.name || actor.username);
}

async function applyBusinessSettings(data, actor = {}) {
  const settings = await loadSettings();

  if (!data.order.storeRep && settings.defaultStoreRep) {
    data.order.storeRep = settings.defaultStoreRep;
  }

  if (!data.order.storeRepTitle && settings.defaultStoreRepTitle) {
    data.order.storeRepTitle = settings.defaultStoreRepTitle;
  }

  if (data.order.storeSignatureId) {
    const signature = (settings.signatures || []).find((item) => item.id === data.order.storeSignatureId);
    if (signatureOwnedByActor(signature, actor)) {
      data.order.storeSignatureName = signature.name;
      data.order.storeSignatureDataUrl = signature.dataUrl;
    } else {
      data.order.storeSignatureId = "";
      data.order.storeSignatureName = "";
      data.order.storeSignatureDataUrl = "";
    }
  }

  data.business = {
    businessName: settings.businessName,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    address: settings.address,
    logoDataUrl: settings.logoDataUrl,
  };
}

function baseUrl(req) {
  return publicBaseUrl(req);
}

function localSigningLinkReason(req) {
  const url = baseUrl(req).toLowerCase();
  if (process.env.ALLOW_NON_PRODUCTION_EMAILS === "true") return "";
  if (process.env.NODE_ENV !== "production") {
    return "Email skipped because this server is not running in production. Use the visible signing link for preview/testing.";
  }
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url)) {
    return "Email skipped because the signing link points to a local preview address.";
  }
  return "";
}

function passwordResetUrl(req, token) {
  return `${baseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetLinks(req, targets = []) {
  const results = [];
  for (const target of targets) {
    const result = await sendPasswordResetEmail({
      to: target.email,
      name: target.name,
      accountType: target.accountType,
      resetUrl: passwordResetUrl(req, target.token),
    });
    results.push({
      accountType: target.accountType,
      email: target.email,
      sent: Boolean(result.sent),
      reason: result.reason || "",
      messageId: result.messageId || "",
    });
  }
  return results;
}

async function sendCustomerLinkForRequest(req, packet, password) {
  if (packet.data.customer.email && !isValidEmailAddress(packet.data.customer.email)) {
    return {
      sent: false,
      reason: "Customer email format is invalid. Correct the customer email before sending.",
    };
  }

  const suppressedReason = localSigningLinkReason(req);
  if (suppressedReason) {
    return {
      sent: false,
      reason: suppressedReason,
    };
  }

  return sendCustomerLinkEmail(
    packet,
    `${baseUrl(req)}/sign/${packet.id}`,
    password,
  );
}

function duplicateKeyFromData(data) {
  const customer = data.customer || {};
  const order = data.order || {};
  const lastNameKey = keyText(customer.lastName);
  const phoneLast4 = last4Digits(customer.phone1 || customer.phone2);
  const contactKey = phoneLast4 || normalizeEmailAddress(customer.email);
  if (!lastNameKey || !contactKey) return "";

  const invoice = keyText(order.invoiceNumber);
  if (invoice) return `invoice:${lastNameKey}:${contactKey}:${invoice}`;

  const address = keyText(order.installAddress || customer.mailingAddress || customer.billingAddress);
  const amount = keyText(order.invoiceAmount || data.payments?.totalInvoiceAmount);
  if (address && amount) return `address-amount:${lastNameKey}:${contactKey}:${address}:${amount}`;

  return "";
}

function duplicateKeyFromPacket(packet) {
  if (packet.parentPacketId || Number(packet.revisionNumber || 0) > 0) return "";
  return duplicateKeyFromData(packet.data || {});
}

async function potentialDuplicatePackets(data) {
  const key = duplicateKeyFromData(data);
  if (!key) return [];

  const packets = await listPackets();
  return packets
    .filter((packet) => duplicateKeyFromPacket(packet) === key)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function duplicateLookupForPackets(packets) {
  const groups = new Map();
  packets.forEach((packet) => {
    const key = duplicateKeyFromPacket(packet);
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), packet]);
  });

  const lookup = new Map();
  groups.forEach((group) => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    sorted.forEach((packet) => {
      lookup.set(packet.id, {
        count: sorted.length,
        otherIds: sorted.filter((item) => item.id !== packet.id).map((item) => item.id),
        newestId: sorted[0].id,
        newestCreatedAt: sorted[0].createdAt,
      });
    });
  });
  return lookup;
}

function packetSummary(packet, req) {
  const password = generatedPassword(packet.data);
  const sections = selectedSignatureSections(packet.data);
  const signUrl = packet.completedAt ? null : `${baseUrl(req)}/sign/${packet.id}`;

  return {
    id: packet.id,
    customerName: `${packet.data.customer.firstName} ${packet.data.customer.lastName}`.trim(),
    invoiceNumber: packet.data.order.invoiceNumber,
    createdAt: packet.createdAt,
    status: packet.status,
    password,
    signUrl,
    signablePdfUrl: `/api/packets/${packet.id}/download/signable`,
    finalPdfUrl: packet.finalizedAt ? `/api/packets/${packet.id}/download/final` : null,
    estimate: packetEstimateSummary(packet, { includeInternal: true }),
    customerLinkEmail: packet.customerLinkEmail || null,
    signatureSections: sections.map((key) => ({
      key,
      label: SIGNATURE_SECTIONS[key].label,
    })),
    pages: includedPageNumbers(packet.data).map((page) => {
      const item = PAGE_LABELS.find((candidate) => candidate.page === page);
      return {
        page,
        id: item?.id || "",
        label: item?.label || `Template page ${page}`,
      };
    }),
    sections: (packet.data.sections?.included || sectionIdsFromPages(includedPageNumbers(packet.data))).map((id) => {
      const item = PAGE_LABELS.find((candidate) => candidate.id === id);
      return {
        id,
        templatePage: item?.page || null,
        label: item?.label || id,
      };
    }),
  };
}

app.get("/", async (_req, res, next) => {
  try {
    if (!(await hasStaffUsers())) {
      return res.redirect("/setup");
    }
    res.sendFile(path.join(PUBLIC_DIR, "home.html"));
  } catch (error) {
    next(error);
  }
});

app.get("/setup", async (_req, res, next) => {
  try {
    if (await hasStaffUsers()) {
      return res.redirect("/login");
    }
    res.sendFile(path.join(PUBLIC_DIR, "setup.html"));
  } catch (error) {
    next(error);
  }
});

app.get("/portal", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "dashboard.html"));
});

app.get("/documents", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "documents.html"));
});

app.get("/installer-photos", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "installer-photos.html"));
});

app.get("/contract/new", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/paid-contract", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "paid-contract.html"));
});

app.get("/paid-contract/sign", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "paid-contract.html"));
});

app.get("/contract/:id/edit", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/contracts", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "contracts.html"));
});

app.get("/print-pages", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "print-pages.html"));
});

app.get("/customer-limited", requireCustomerAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "customer-limited.html"));
});

app.get("/customer", requireCustomerAuth, (_req, res) => {
  if (!customerPortalEnabled()) {
    return res.redirect("/customer-limited");
  }
  res.sendFile(path.join(PUBLIC_DIR, "customer.html"));
});

app.get("/admin", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/login", async (_req, res, next) => {
  try {
    if (!(await hasStaffUsers())) {
      return res.redirect("/setup");
    }
    res.sendFile(path.join(PUBLIC_DIR, "login.html"));
  } catch (error) {
    next(error);
  }
});

app.get("/change-password", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "change-password.html"));
});

app.get("/reset-password", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "reset-password.html"));
});

app.get("/sign/:id", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "sign.html"));
});

registerEstimateModule(app, { requireAuth });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/setup/status", async (_req, res, next) => {
  try {
    let schemaReady = false;
    let schemaError = "";
    if (databaseConfigured()) {
      try {
        await ensureLookupSchema();
        schemaReady = true;
      } catch (error) {
        schemaError = error.message;
      }
    }

    const settings = await loadSettings();
    const staffConfigured = await hasStaffUsers();
    res.json({
      setupRequired: !staffConfigured,
      staffConfigured,
      databaseConfigured: databaseConfigured(),
      schemaReady,
      schemaError,
      businessConfigured: Boolean(text(settings.businessName)),
      setupComplete: Boolean(settings.setupComplete),
      storage: databaseConfigured() ? "postgres" : "file",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/setup/first-run", async (req, res, next) => {
  try {
    if (await hasStaffUsers()) {
      return res.status(409).json({ error: "First-run setup is already complete. Log in from the staff login page." });
    }

    if (databaseConfigured()) {
      await ensureLookupSchema();
    }

    const business = req.body?.business || {};
    const admin = req.body?.admin || {};
    const businessName = text(business.businessName);
    const businessEmail = text(business.email);
    const adminPassword = String(admin.password || "");
    const adminConfirmPassword = String(admin.confirmPassword || "");

    if (!businessName) {
      return res.status(400).json({ error: "Business name is required." });
    }
    if (businessEmail && !isValidEmailAddress(businessEmail)) {
      return res.status(400).json({ error: "Business email format is invalid." });
    }
    if (adminPassword !== adminConfirmPassword) {
      return res.status(400).json({ error: "The admin passwords do not match." });
    }

    const staffUser = await createFirstStaffUser({
      name: admin.name,
      username: admin.username,
      email: admin.email,
      password: adminPassword,
    });

    const settings = await updateBusinessSettings({
      businessName,
      phone: business.phone,
      email: businessEmail,
      website: business.website,
      address: business.address,
      logoDataUrl: business.logoDataUrl,
      salesTaxRate: business.salesTaxRate,
      defaultStoreRep: staffUser.name,
      defaultStoreRepTitle: staffUser.title || "Admin",
      setupComplete: true,
      setupDismissed: true,
    }, staffUser);

    req.session.authenticated = true;
    req.session.username = staffUser.username;
    req.session.staffUser = staffUser;
    req.session.staffLastSeenAt = Date.now();
    await registerStaffSession(req, staffUser, { reclaimExistingUser: true });

    await logEvent("info", "first_run_setup_completed", {
      request: requestMeta(req),
      username: staffUser.username,
      storage: databaseConfigured() ? "postgres" : "file",
    });

    res.status(201).json({
      ok: true,
      redirect: "/admin?setup=1",
      user: staffUser,
      settings,
      storage: databaseConfigured() ? "postgres" : "file",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public-branding", async (_req, res, next) => {
  try {
    const settings = await loadSettings();
    res.json({
      businessName: settings.businessName || "Contract Portal",
      logoDataUrl: settings.logoDataUrl,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/feature-requests", async (req, res, next) => {
  try {
    const allowedFeatures = new Set([
      "phoneApp",
      "dedicatedTablet",
      "signaturePad",
      "installerDeliveryApp",
      "other",
    ]);
    const features = Array.isArray(req.body?.features)
      ? req.body.features.map(text).filter((item) => allowedFeatures.has(item))
      : [];
    const request = {
      name: text(req.body?.name).slice(0, 120),
      email: text(req.body?.email).slice(0, 180),
      phone: text(req.body?.phone).slice(0, 60),
      message: text(req.body?.message).slice(0, 1200),
      page: text(req.body?.page).slice(0, 240),
      screen: text(req.body?.screen).slice(0, 80),
      features,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
    };

    if (!request.email && !request.phone && !request.message) {
      return res.status(400).json({ error: "Add an email, phone number, or short note before sending." });
    }
    if (request.email && !isValidEmailAddress(request.email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const result = await sendFeatureRequestEmail(request);
    await logEvent("info", "feature_request_submitted", {
      request: requestMeta(req),
      featureRequest: request,
      sent: Boolean(result.sent),
      reason: result.reason,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    const ttlMs = await staffSessionIdleMs();
    pruneStaffSessions(ttlMs);
    const lastSeen = Number(req.session?.staffLastSeenAt || 0);
    if (req.session?.authenticated && lastSeen && Date.now() - lastSeen > ttlMs) {
      clearStaffSession(req);
      return req.session.destroy((error) => {
        if (error) return next(error);
        return res.json({
          authenticated: false,
          timedOut: true,
          staffActiveSessions: activeStaffSessions.size,
          staffMaxActiveSessions: STAFF_MAX_ACTIVE_SESSIONS,
          staffSessionIdleMinutes: Math.round(ttlMs / 60000),
        });
      });
    }
    res.json({
      authenticated: Boolean(req.session?.authenticated),
      user: req.session?.staffUser || null,
      mustChangePassword: Boolean(req.session?.staffUser?.mustChangePassword),
      staffActiveSessions: activeStaffSessions.size,
      staffMaxActiveSessions: STAFF_MAX_ACTIVE_SESSIONS,
      staffSessionIdleMinutes: Math.round(ttlMs / 60000),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/customer/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.customer),
    customer: req.session?.customer || null,
    customerPortalEnabled: customerPortalEnabled(),
    portalUrl: customerPortalUrl(),
  });
});

app.post("/api/account/password-reset/request", async (req, res, next) => {
  try {
    const email = normalizeEmailAddress(req.body?.email);
    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ error: "Enter the email address saved on the account." });
    }

    const targets = await createPasswordResetTokensForEmail(email, { username: "self-service" });
    let results = [];
    if (targets.length) {
      try {
        results = await sendPasswordResetLinks(req, targets);
      } catch (error) {
        await logError(error, req, {
          event: "password_reset_email_failed",
          email,
        });
        results = targets.map((target) => ({
          accountType: target.accountType,
          email: target.email,
          sent: false,
          reason: `Reset link could not be emailed: ${error.message}`,
        }));
      }
    }

    await logEvent("info", "password_reset_requested", {
      request: requestMeta(req),
      email,
      targets: targets.map((target) => target.accountType),
      sentCount: results.filter((item) => item.sent).length,
    });

    const failedReason = results.find((item) => !item.sent)?.reason || "";
    res.json({
      ok: true,
      sent: results.some((item) => item.sent),
      message: results.some((item) => item.sent)
        ? "Password reset link sent. Check the email address saved on the account."
        : "If an account exists for that email, a reset link will be sent.",
      reason: failedReason,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/password-reset/complete", async (req, res, next) => {
  try {
    const result = await completePasswordResetWithToken(
      text(req.body?.token),
      text(req.body?.newPassword),
    );
    await logEvent("info", "password_reset_completed", {
      request: requestMeta(req),
      accountType: result.accountType,
      username: result.account?.username,
      email: result.account?.email,
    });
    res.json({
      ok: true,
      accountType: result.accountType,
      redirect: result.accountType === "staff" ? "/login" : "/",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const username = text(req.body?.username);
    const password = text(req.body?.password);
    const nextPath = safeStaffReturnPath(req.body?.next, "/portal");
    const envAdmin = envAdminCredentials();
    const staffConfigured = await hasStaffUsers();
    let staffUser = await authenticateStaff(username, password);

    if (!staffUser && envAdmin.configured && constantTimeEqual(username, envAdmin.username) && constantTimeEqual(password, envAdmin.password)) {
      staffUser = {
        id: "env-admin",
        username,
        name: username,
        role: "superadmin",
        title: "Superadmin",
        signatureId: "",
        mustChangePassword: false,
        canManageUsers: true,
        envAdmin: true,
      };
    }

    if (!staffUser && !staffConfigured) {
      return res.status(409).json({
        error: "First-run setup is required before staff can log in.",
        setupRequired: true,
        redirect: "/setup",
      });
    }

    if (!staffUser) {
      await logEvent("warn", "admin_login_failed", { request: requestMeta(req), username });
      return res.status(401).json({ error: "Invalid login." });
    }

    const sessionRegistration = await registerStaffSession(req, staffUser, {
      reclaimExistingUser: Boolean(req.body?.reclaimExistingUser),
    });
    if (!sessionRegistration.ok) {
      await logEvent("warn", "admin_login_limit_reached", { request: requestMeta(req), username });
      return res.status(409).json({
        error: sessionRegistration.canReclaimExistingUser
          ? `There is already an active login for ${staffUser.name || staffUser.username}. Confirm to close that old login and continue.`
          : `Too many staff users are signed in. Limit is ${STAFF_MAX_ACTIVE_SESSIONS}.`,
        staffSessionLimit: true,
        canReclaimExistingUser: sessionRegistration.canReclaimExistingUser,
        username: staffUser.username,
        staffName: staffUser.name || staffUser.username,
        activeSessions: sessionRegistration.activeSessions,
        maxSessions: sessionRegistration.maxSessions,
      });
    }

    req.session.authenticated = true;
    req.session.username = staffUser.username;
    req.session.staffUser = staffUser;
    req.session.staffLastSeenAt = Date.now();
    const notifications = staffUser.envAdmin ? [] : await popStaffNotifications(staffUser.username);
    req.session.staffNotifications = notifications;
    await logEvent("info", "admin_login_success", { request: requestMeta(req), username: staffUser.username });
    res.json({
      ok: true,
      mustChangePassword: Boolean(staffUser.mustChangePassword),
      redirect: staffUser.mustChangePassword ? "/change-password" : nextPath,
      user: staffUser,
      notifications,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/change-password", requireAuth, async (req, res, next) => {
  try {
    if (req.session.staffUser?.envAdmin) {
      return res.status(400).json({ error: "This admin password is managed in the server .env file." });
    }

    const currentPassword = text(req.body?.currentPassword);
    const newPassword = text(req.body?.newPassword);
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Use at least 8 characters for the new password." });
    }

    const staffUser = await changeStaffPassword(req.session.username, currentPassword, newPassword);
    req.session.staffUser = staffUser;
    req.session.username = staffUser.username;
    await logEvent("info", "staff_password_changed", { request: requestMeta(req), username: staffUser.username });
    res.json({ ok: true, redirect: "/portal", user: staffUser });
  } catch (error) {
    next(error);
  }
});

app.get("/api/staff-users", requireAuth, async (_req, res, next) => {
  try {
    res.json({ users: await listStaffUsers() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireAuth, requireUserManager, async (_req, res, next) => {
  try {
    res.json({ users: await listStaffUsersForAdmin() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireAuth, requireUserManager, async (req, res, next) => {
  try {
    const user = await createStaffUser(req.body || {}, staffActor(req));
    await logEvent("info", "staff_user_created", {
      request: requestMeta(req),
      username: user.username,
    });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/users/:id", requireAuth, requireUserManager, async (req, res, next) => {
  try {
    const user = await updateStaffUser(req.params.id, req.body || {}, staffActor(req));
    req.session.staffUser = req.session.staffUser?.id === user.id
      ? { ...req.session.staffUser, ...user }
      : req.session.staffUser;
    await logEvent("info", "staff_user_updated", {
      request: requestMeta(req),
      username: user.username,
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/password", requireAuth, requireUserManager, async (req, res, next) => {
  try {
    const user = await resetStaffPassword(req.params.id, req.body || {}, staffActor(req));
    await logEvent("info", "staff_user_password_reset", {
      request: requestMeta(req),
      username: user.username,
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/password-reset-link", requireAuth, requireUserManager, async (req, res, next) => {
  try {
    const target = await createStaffPasswordResetToken(req.params.id, staffActor(req));
    let result;
    try {
      result = await sendPasswordResetEmail({
        to: target.email,
        name: target.name,
        accountType: "staff",
        resetUrl: passwordResetUrl(req, target.token),
      });
    } catch (error) {
      await logError(error, req, {
        event: "staff_password_reset_link_email_failed",
        staffId: req.params.id,
        email: target.email,
      });
      result = {
        sent: false,
        reason: `Reset link could not be emailed: ${error.message}`,
      };
    }
    await logEvent("info", "staff_password_reset_link_requested", {
      request: requestMeta(req),
      username: target.username,
      email: target.email,
      sent: Boolean(result.sent),
      reason: result.reason,
    });
    res.json({
      ok: true,
      sent: Boolean(result.sent),
      to: target.email,
      reason: result.reason || "",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/installers", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    res.json({
      installers: await listInstallers({
        includeInactive: req.query.includeInactive === "1" || req.query.includeInactive === "true",
        q: req.query.q,
      }),
      installerDirectoryPath: INSTALLER_DIRECTORY_PATH,
      canManage: canManageInstallerDirectory(actor),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installers", requireAuth, requireInstallerDirectoryManager, async (req, res, next) => {
  try {
    const installer = await saveInstaller(req.body || {}, staffActor(req));
    await logEvent("info", "installer_saved", {
      request: requestMeta(req),
      installerId: installer.id,
      installerName: installer.name,
    });
    res.status(201).json({ installer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installers/quick-add", requireAuth, async (req, res, next) => {
  try {
    const installer = await saveInstallerByName(req.body || {}, staffActor(req));
    await logEvent("info", "installer_quick_added", {
      request: requestMeta(req),
      installerId: installer.id,
      installerName: installer.name,
    });
    res.status(201).json({ installer });
  } catch (error) {
    next(error);
  }
});

app.put("/api/installers/:id", requireAuth, requireInstallerDirectoryManager, async (req, res, next) => {
  try {
    const installer = await saveInstaller({ ...(req.body || {}), id: req.params.id }, staffActor(req));
    await logEvent("info", "installer_saved", {
      request: requestMeta(req),
      installerId: installer.id,
      installerName: installer.name,
    });
    res.json({ installer });
  } catch (error) {
    next(error);
  }
});

app.get("/api/installer-uploads", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const result = await listInstallerUploads({
      q: req.query.q,
      status: req.query.status || "inbox",
      storeDepartment: req.query.storeDepartment || "all",
      installerName: req.query.installerName || "all",
    });
    res.json({
      ...result,
      statePath: INSTALLER_UPLOAD_STATE_PATH,
      permissions: permissionsForActor(actor),
      uploads: result.uploads.slice(0, 200).map((upload) => ({
        ...upload,
        canHardDelete: canHardDeleteUpload(actor),
        canManage: canManageUpload(actor, upload),
        searchText: undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/installer-uploads/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const upload = await loadUpload(req.params.id);
    if (!upload) return res.status(404).json({ error: "Installer upload not found." });
    res.json({
      upload: {
        ...upload,
        canHardDelete: canHardDeleteUpload(actor),
        canManage: canManageUpload(actor, upload),
        searchText: undefined,
      },
      permissions: permissionsForActor(actor),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/installer-uploads/:id/photos/:filename", requireAuth, async (req, res, next) => {
  try {
    const photo = await photoPathForUpload(req.params.id, req.params.filename);
    if (!photo) return res.status(404).json({ error: "Photo not found." });
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(photo.filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installer-uploads/:id/assign", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const upload = await assignInstallerUpload(req.params.id, req.body || {}, actor);
    await logEvent("info", "installer_upload_assigned", {
      request: requestMeta(req),
      uploadId: upload.uploadId,
      assignment: upload.assignment,
      status: upload.status,
    });
    res.json({ upload: { ...upload, canHardDelete: canHardDeleteUpload(actor), canManage: canManageUpload(actor, upload), searchText: undefined } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installer-uploads/:id/store", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const upload = await updateInstallerUploadStore(req.params.id, req.body || {}, actor);
    await logEvent("info", "installer_upload_store_updated", {
      request: requestMeta(req),
      uploadId: upload.uploadId,
      storeDepartment: upload.storeDepartment,
    });
    res.json({ upload: { ...upload, canHardDelete: canHardDeleteUpload(actor), canManage: canManageUpload(actor, upload), searchText: undefined } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installer-uploads/:id/archive", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const upload = await archiveInstallerUpload(req.params.id, req.body || {}, actor);
    await logEvent("info", "installer_upload_archived", {
      request: requestMeta(req),
      uploadId: upload.uploadId,
    });
    res.json({ upload: { ...upload, canHardDelete: canHardDeleteUpload(actor), canManage: canManageUpload(actor, upload), searchText: undefined } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installer-uploads/:id/delete", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const upload = await deleteInstallerUpload(req.params.id, req.body || {}, actor);
    await logEvent("info", "installer_upload_deleted", {
      request: requestMeta(req),
      uploadId: upload.uploadId,
      reason: upload.deletedReason,
    });
    res.json({ upload: { ...upload, canHardDelete: canHardDeleteUpload(actor), canManage: canManageUpload(actor, upload), searchText: undefined } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installer-uploads/:id/hard-delete", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const result = await hardDeleteInstallerUpload(req.params.id, req.body || {}, actor);
    await logEvent("warning", "installer_upload_hard_deleted", {
      request: requestMeta(req),
      uploadId: result.uploadId,
      removedFiles: result.removedFiles,
      reason: result.reason,
    });
    res.json({ removed: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/installer-uploads/:id/restore", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const upload = await restoreInstallerUpload(req.params.id, actor);
    await logEvent("info", "installer_upload_restored", {
      request: requestMeta(req),
      uploadId: upload.uploadId,
    });
    res.json({ upload: { ...upload, canHardDelete: canHardDeleteUpload(actor), canManage: canManageUpload(actor, upload), searchText: undefined } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/security/status", requireAuth, requireUserManager, (req, res) => {
  const sessionSecret = text(process.env.SESSION_SECRET);
  const publicUrl = text(process.env.PUBLIC_BASE_URL);
  res.json({
    ok: true,
    sessionStore: sessionStore ? "postgres" : "memory",
    databaseConfigured: databaseConfigured(),
    sessionSecretConfigured: Boolean(sessionSecret && sessionSecret !== "dev-only-change-me" && sessionSecret.length >= 32),
    sessionCookieSecure: process.env.NODE_ENV === "production",
    financialRoutesPrivate: String(process.env.ALLOW_PUBLIC_FINANCIAL_ROUTES || "").toLowerCase() !== "true",
    publicBaseUrlHttps: !publicUrl || publicUrl.startsWith("https://"),
    secretRotationRecommended: !sessionSecret || sessionSecret === "dev-only-change-me" || sessionSecret.length < 32,
    checkedBy: staffActor(req).username,
  });
});

app.post("/api/customer/login", async (req, res, next) => {
  try {
    const lastNameKey = keyText(req.body?.lastName);
    const rawPassword = text(req.body?.password || req.body?.portalPassword);
    const contractPassword = rawPassword.toUpperCase();

    if (!lastNameKey || !rawPassword) {
      return res.status(400).json({ error: "Enter the customer last name and password." });
    }

    const accountLogin = await authenticateCustomerAccountByLastName(lastNameKey, rawPassword);
    if (accountLogin) {
      setCustomerSessionFromAccount(req, accountLogin);
      await logEvent("info", "customer_account_last_name_login_success", {
        request: requestMeta(req),
        customer: req.session.customer,
      });
      return res.json({ ok: true, portalUrl: customerPortalUrl() });
    }

    const packets = await listPackets();
    const packet = packets.find((item) => {
      const key = customerKeyFromPacket(item);
      if (key.lastNameKey !== lastNameKey) return false;
      try {
        return constantTimeEqual(generatedPassword(item.data), contractPassword);
      } catch (_error) {
        return false;
      }
    });

    if (!packet) {
      await logEvent("warn", "customer_login_failed", {
        request: requestMeta(req),
        lastNameKey,
      });
      return res.status(401).json({ error: "No customer packet was found for that login." });
    }

    const packetKey = customerKeyFromPacket(packet);
    const existingAccount = await findCustomerAccountByCustomerKey(packetKey.lastNameKey, packetKey.phoneLast4, packetKey.emailKey);
    if (existingAccount) {
      await logEvent("warn", "customer_contract_password_blocked_for_registered_account", {
        request: requestMeta(req),
        lastNameKey,
      });
      return res.status(401).json({
        error: "This customer already has a registered portal login. Use Registered User login, or enter the last name with the registered personal password.",
      });
    }

    setCustomerSessionFromPacket(req, packet);
    await logEvent("info", "customer_login_success", {
      request: requestMeta(req),
      customer: req.session.customer,
    });
    res.json({ ok: true, portalUrl: customerPortalUrl() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/account/login", async (req, res, next) => {
  try {
    const email = normalizeEmailAddress(req.body?.email);
    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const account = await authenticateCustomerAccount(email, req.body?.password);
    if (!account) {
      await logEvent("warn", "customer_account_login_failed", {
        request: requestMeta(req),
        email,
      });
      return res.status(401).json({ error: "Invalid customer account login." });
    }

    setCustomerSessionFromAccount(req, account);
    await logEvent("info", "customer_account_login_success", {
      request: requestMeta(req),
      customer: req.session.customer,
    });
    res.json({ ok: true, portalUrl: customerPortalUrl() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/account/register", async (req, res, next) => {
  try {
    const lastNameKey = keyText(req.body?.lastName);
    const contractPassword = text(req.body?.contractPassword).toUpperCase();
    const email = normalizeEmailAddress(req.body?.email);
    const personalPassword = text(req.body?.personalPassword);

    if (!lastNameKey || !contractPassword || !email || !personalPassword) {
      return res.status(400).json({ error: "Enter last name, contract password, email, and a new personal password." });
    }
    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const packets = await listPackets();
    const packet = packets.find((item) => {
      const key = customerKeyFromPacket(item);
      if (key.lastNameKey !== lastNameKey) return false;
      try {
        return constantTimeEqual(generatedPassword(item.data), contractPassword);
      } catch (_error) {
        return false;
      }
    });

    if (!packet) {
      await logEvent("warn", "customer_account_register_failed", {
        request: requestMeta(req),
        lastNameKey,
        email,
      });
      return res.status(401).json({ error: "No matching contract was found for that last name and contract password." });
    }

    const account = await upsertCustomerAccount({
      email,
      password: personalPassword,
      packet,
      name: customerName(packet),
    });
    setCustomerSessionFromAccount(req, account);
    await logEvent("info", "customer_account_registered", {
      request: requestMeta(req),
      customer: req.session.customer,
    });
    res.json({ ok: true, portalUrl: customerPortalUrl() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/account/register-current", requireCustomerAuth, async (req, res, next) => {
  try {
    if (req.session.customer?.accountId) {
      return res.status(400).json({ error: "This customer already has a registered portal login." });
    }

    const email = normalizeEmailAddress(req.body?.email);
    const personalPassword = text(req.body?.personalPassword);
    if (!email || !personalPassword) {
      return res.status(400).json({ error: "Enter an email and a new personal password." });
    }
    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const packets = await customerPackets(req.session.customer);
    const packet = packets[0];
    if (!packet) {
      return res.status(404).json({ error: "No matching contract was found for this customer session." });
    }

    const account = await upsertCustomerAccount({
      email,
      password: personalPassword,
      packet,
      name: req.session.customer.name || customerName(packet),
    });
    setCustomerSessionFromAccount(req, account);
    await logEvent("info", "customer_account_registered_from_portal", {
      request: requestMeta(req),
      customer: req.session.customer,
    });
    res.json({ ok: true, portalUrl: customerPortalUrl() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/logout", requireCustomerAuth, async (req, res, next) => {
  req.session.customer = null;
  req.session.save((error) => {
    if (error) return next(error);
    res.json({ ok: true });
  });
});

app.get("/api/customer/orders", requireCustomerAuth, async (req, res, next) => {
  try {
    const packets = await customerPackets(req.session.customer);
    res.json({
      customer: {
        ...req.session.customer,
        suggestedEmail: req.session.customer.email || packets.find((packet) => text(packet.data.customer.email))?.data.customer.email || "",
      },
      orders: packets.map((packet) => publicOrderSummary(packet, req)),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/change-password", requireCustomerAuth, async (req, res, next) => {
  try {
    if (!req.session.customer?.accountId) {
      return res.status(400).json({ error: "Register a customer account before changing a personal password." });
    }

    const account = await changeCustomerPassword(
      req.session.customer.accountId,
      text(req.body?.currentPassword),
      text(req.body?.newPassword),
    );
    setCustomerSessionFromAccount(req, account);
    await logEvent("info", "customer_password_changed", {
      request: requestMeta(req),
      customer: req.session.customer,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/account/update", requireCustomerAuth, async (req, res, next) => {
  try {
    if (!req.session.customer?.accountId) {
      return res.status(400).json({ error: "Register a customer account before changing account details." });
    }

    const account = await updateCustomerAccount(req.session.customer.accountId, {
      name: text(req.body?.name),
      email: normalizeEmailAddress(req.body?.email),
      phoneLast4: text(req.body?.phoneLast4),
    });
    setCustomerSessionFromAccount(req, account);
    await logEvent("info", "customer_account_updated", {
      request: requestMeta(req),
      customer: req.session.customer,
    });
    res.json({ ok: true, customer: req.session.customer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/account/reset-request", async (req, res, next) => {
  try {
    const email = normalizeEmailAddress(req.body?.email);
    const lastName = text(req.body?.lastName);
    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ error: "Enter the registered customer email address." });
    }

    const targets = await createPasswordResetTokensForEmail(email, { username: "registered-login-self-service" });
    let results = [];
    if (targets.length) {
      try {
        results = await sendPasswordResetLinks(req, targets);
      } catch (error) {
        await logError(error, req, {
          event: "customer_password_reset_link_email_failed",
          email,
        });
        results = targets.map((target) => ({
          accountType: target.accountType,
          email: target.email,
          sent: false,
          reason: `Reset link could not be emailed: ${error.message}`,
        }));
      }
    }

    await logEvent("info", "customer_account_reset_requested", {
      request: requestMeta(req),
      email,
      lastName,
      sent: results.some((item) => item.sent),
      reason: results.find((item) => !item.sent)?.reason || "",
    });
    res.json({
      ok: true,
      sent: results.some((item) => item.sent),
      message: results.some((item) => item.sent)
        ? "Password reset link sent. Check the email address saved on the account."
        : "If an account exists for that email, a reset link will be sent.",
      reason: results.find((item) => !item.sent)?.reason || "",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customer/contact", requireCustomerAuth, async (req, res, next) => {
  try {
    const packets = await customerPackets(req.session.customer);
    const requestedTopic = text(req.body?.topic);
    const topic = requestedTopic === "existingConcern"
      ? "existingConcern"
      : requestedTopic === "customerQuestion"
        ? "customerQuestion"
        : "newSale";
    const message = text(req.body?.message);
    const preferredContact = text(req.body?.preferredContact);

    if (!message) {
      return res.status(400).json({ error: "Enter a message before sending." });
    }
    if (preferredContact.includes("@") && !isValidEmailAddress(preferredContact)) {
      return res.status(400).json({ error: "Enter a valid email address, or use a phone number/best time instead." });
    }

    const packet = topic === "existingConcern"
      ? packets.find((item) => item.id === text(req.body?.packetId))
      : null;

    if (topic === "existingConcern" && !packet) {
      return res.status(400).json({ error: "Choose the sale/order this concern is about." });
    }

    const customerPacket = packet || packets[0] || null;
    const customer = {
      name: customerPacket ? customerName(customerPacket) : req.session.customer?.name || "Customer",
      email: customerPacket?.data?.customer?.email || req.session.customer?.email || "",
      phone: customerPacket?.data?.customer?.phone1 || customerPacket?.data?.customer?.phone2 || "",
    };

    const result = await sendCustomerContactEmail(customer, packet, {
      topic,
      preferredContact,
      message,
      invoiceNumber: packet?.data?.order?.invoiceNumber || "",
    });

    await logEvent("info", "customer_contact_requested", {
      request: requestMeta(req),
      customer: req.session.customer,
      topic,
      packetId: packet?.id || null,
      invoiceNumber: packet?.data?.order?.invoiceNumber || null,
      sent: Boolean(result.sent),
      reason: result.reason,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", requireAuth, async (req, res, next) => {
  clearStaffSession(req);
  req.session.destroy((error) => {
    if (error) return next(error);
    res.json({ ok: true });
  });
});

app.get("/api/settings", requireAuth, async (req, res, next) => {
  try {
    res.json({
      ...(await loadSettings()),
      currentStaff: req.session?.staffUser || null,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", requireAuth, async (req, res, next) => {
  try {
    const settings = await updateBusinessSettings(req.body || {}, req.session?.staffUser || {});
    await logEvent("info", "business_settings_updated", { request: requestMeta(req) });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings/setup-skip", requireAuth, async (req, res, next) => {
  try {
    const settings = await dismissSetup();
    await logEvent("info", "store_setup_dismissed", { request: requestMeta(req) });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings/signatures", requireAuth, async (req, res, next) => {
  try {
    const signature = await addSignature(req.body || {}, req.session?.staffUser || {});
    await logEvent("info", "store_signature_added", {
      request: requestMeta(req),
      signatureId: signature.id,
      name: signature.name,
    });
    res.status(201).json(signature);
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/signatures/:id", requireAuth, async (req, res, next) => {
  try {
    const signature = await updateSignature(req.params.id, req.body || {}, req.session?.staffUser || {});
    await logEvent("info", "store_signature_replaced", {
      request: requestMeta(req),
      signatureId: signature.id,
      name: signature.name,
    });
    res.json(signature);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/settings/signatures/:id", requireAuth, async (req, res, next) => {
  try {
    await deleteSignature(req.params.id, req.session?.staffUser || {});
    await logEvent("info", "store_signature_deleted", {
      request: requestMeta(req),
      signatureId: req.params.id,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/estimates", requireAuth, async (req, res, next) => {
  try {
    const query = text(req.query.q);
    res.json({
      folderPath: estimateFolderPath(),
      files: await listEstimateFiles(query),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/estimates/:filename/download", requireAuth, async (req, res, next) => {
  try {
    const filePath = safeEstimatePath(req.params.filename);
    if (!filePath) {
      return res.status(404).json({ error: "Estimate PDF not found." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`);
    res.sendFile(filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/preimport", requireAuth, async (_req, res, next) => {
  try {
    if (databaseConfigured()) {
      await ensureLookupSchema();
    }
    const store = await listPreimportRecords();
    res.json({
      storage: databaseConfigured() ? "postgres" : "file",
      counts: {
        customers: store.customers.length,
        suppliers: store.suppliers.length,
        products: store.products.length,
        documents: (store.documents || []).length,
      },
      customers: store.customers.slice(0, 200),
      suppliers: store.suppliers.slice(0, 200),
      products: store.products.slice(0, 200),
      documents: (store.documents || []).slice(0, 100),
      documentBatches: (store.documentBatches || []).slice(0, 20),
      importRuns: store.importRuns.slice(0, 20),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail-import/accounts", requireAuth, async (req, res, next) => {
  try {
    res.json(await listGmailImportAccounts(req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail-import/accounts", requireAuth, async (req, res, next) => {
  try {
    const account = await saveGmailImportAccount(req.body || {}, req.session?.staffUser || {});
    res.json({ account });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/gmail-import/accounts/:id", requireAuth, async (req, res, next) => {
  try {
    await deleteGmailImportAccount(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail-import/accounts/:id/auth-url", requireAuth, async (req, res, next) => {
  try {
    res.json({ url: await gmailAuthUrl(req.params.id, req) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail-import/oauth/callback", async (req, res, next) => {
  try {
    await completeGmailOAuth({
      code: req.query.code,
      state: req.query.state,
      req,
    });
    res.redirect("/admin?tab=email-imports&gmail=connected");
  } catch (error) {
    next(error);
  }
});

app.post("/api/document-inbox/check", requireAuth, async (req, res, next) => {
  try {
    const localResult = await scanIncomingDocuments(req.session?.staffUser || {});
    const gmailResult = await scanGmailImports({
      req,
      actor: req.session?.staffUser || {},
      force: Boolean(req.body?.force),
    });
    await logEvent("info", "document_inbox_checked", {
      request: requestMeta(req),
      localScannedCount: localResult.scanned.length,
      gmailUploadedCount: gmailResult.uploaded.length,
      gmailSkippedCount: gmailResult.skipped.length,
    });
    res.json({ local: localResult, gmail: gmailResult });
  } catch (error) {
    next(error);
  }
});

app.post("/api/preimport/preview", requireAuth, async (req, res, next) => {
  try {
    const preview = await previewPreimport(text(req.body?.kind), req.body?.content || "", req.body?.format || "auto");
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

app.post("/api/preimport/import", requireAuth, async (req, res, next) => {
  try {
    const result = await importPreimportRows(
      text(req.body?.kind),
      Array.isArray(req.body?.rows) ? req.body.rows : [],
      req.session?.staffUser || {},
      req.body?.sourceName || "",
    );
    await logEvent("info", "preimport_records_imported", {
      request: requestMeta(req),
      kind: result.kind,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      invalidCount: result.invalidCount,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/preimport/documents/upload", requireAuth, preimportUpload.array("documents", 20), async (req, res, next) => {
  try {
    const result = await savePreimportUploads(req.files || [], req.session?.staffUser || {});
    await logEvent("info", "preimport_documents_uploaded", {
      request: requestMeta(req),
      uploadedCount: result.uploaded.length,
      skippedCount: result.skipped.length,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/paid-contract/email-customer", requireAuth, preimportUpload.array("documents", 12), async (req, res, next) => {
  try {
    const fields = JSON.parse(text(req.body?.fields) || "{}");
    const signUrl = text(req.body?.signUrl);
    if (!fields.customerName) return res.status(400).json({ error: "Customer name is required." });
    if (!fields.email || !isValidEmailAddress(fields.email)) return res.status(400).json({ error: "A valid customer email is required." });
    if (!signUrl) return res.status(400).json({ error: "Customer signing link is missing." });

    const result = await sendPaidContractCustomerEmail(fields, signUrl, req.files || []);
    await logEvent("info", "paid_contract_customer_email_requested", {
      request: requestMeta(req),
      customerName: fields.customerName,
      customerEmail: fields.email,
      attachedCount: (req.files || []).length,
      sent: Boolean(result.sent),
      reason: result.reason,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/paid-contract/email-signed", async (req, res, next) => {
  try {
    const fields = req.body?.fields || {};
    const signature = {
      printedName: text(req.body?.printedName),
      initials: text(req.body?.initials),
      signedDate: text(req.body?.signedDate || formatDateDisplay(new Date())),
      reviewedAndAccepted: bool(req.body?.reviewedAndAccepted),
      signatureDataUrl: text(req.body?.signatureDataUrl),
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
    };

    if (!fields.customerName) return res.status(400).json({ error: "Customer name is required." });
    if (!signature.printedName || !signature.initials) return res.status(400).json({ error: "Printed name and initials are required." });
    if (!signature.reviewedAndAccepted) return res.status(400).json({ error: "Customer must confirm review and electronic signature agreement." });
    if (!signature.signatureDataUrl.startsWith("data:image/")) return res.status(400).json({ error: "Customer signature is required." });

    const result = await sendPaidContractSignedEmail(fields, signature);
    await logEvent("info", "paid_contract_signed_email_requested", {
      request: requestMeta(req),
      customerName: fields.customerName,
      customerEmail: fields.email,
      sent: Boolean(result.sent),
      reason: result.reason,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/preimport/documents/scan", requireAuth, async (req, res, next) => {
  try {
    const result = await scanIncomingDocuments(req.session?.staffUser || {});
    await logEvent("info", "preimport_incoming_documents_scanned", {
      request: requestMeta(req),
      scannedCount: result.scanned.length,
      skippedCount: result.skipped.length,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/preimport/documents/:id/ocr", requireAuth, async (req, res, next) => {
  try {
    const document = await ocrPreimportDocument(req.params.id, req.session?.staffUser || {});
    await logEvent("info", "preimport_document_ocr_completed", {
      request: requestMeta(req),
      documentId: document.id,
      ocrStatus: document.ocrStatus,
      ocrEngine: document.ocrEngine,
    });
    res.json({ document });
  } catch (error) {
    next(error);
  }
});

app.post("/api/contract-drafts", requireAuth, async (req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.json({ ok: true, saved: false, storage: "browser-only" });
    }

    const settings = await loadSettings();
    const serverDataResetId = text(settings.dataResetId);
    const clientDataResetId = text(req.body?.dataResetId);
    if (serverDataResetId && clientDataResetId !== serverDataResetId) {
      return res.status(409).json({
        resetRequired: true,
        dataResetId: serverDataResetId,
        error: "This browser has old contract draft data from before the latest server reset. Refresh before saving.",
      });
    }

    const actor = staffActor(req);
    const payload = normalizePacketInput(req.body?.payload || {});
    const result = await saveContractDraft({
      draftKey: contractDraftKey(req.body?.draftKey, payload),
      ownerUsername: actor.username,
      section: normalizeContractSectionValue(req.body?.section),
      draft: {
        payload,
        savedAt: new Date().toISOString(),
        by: actor,
      },
    });
    res.json({ ok: true, saved: true, storage: "postgres", draft: result });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contract-drafts", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const query = text(req.query.q).toLowerCase();
    const drafts = await listContractDrafts(actor.username);
    const groups = visibleDraftGroupsForSearch(drafts);
    const filtered = query
      ? groups.filter((group) => group.searchText.includes(query))
      : groups;
    res.json({
      count: filtered.length,
      totalDraftRecords: groups.length,
      hiddenDraftRecords: Math.max(0, drafts.length - groups.length),
      drafts: filtered.slice(0, 30).map((group) => draftSummary(group.latest, req, { count: group.drafts.length })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contract-drafts/:id", requireAuth, async (req, res, next) => {
  try {
    const actor = staffActor(req);
    const draft = await loadContractDraft(req.params.id, actor.username);
    if (!draft) return res.status(404).json({ error: "Draft not found." });
    res.json({ draft, summary: draftSummary(draft, req) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/packets/search", requireAuth, async (req, res, next) => {
  try {
    const query = text(req.query.q).toLowerCase();
    const packets = await listPackets();
    const drafts = await listContractDrafts(staffActor(req).username);
    const duplicateLookup = duplicateLookupForPackets(packets);
    const groups = contractFamilyGroups(packets);
    const draftGroups = visibleDraftGroupsForSearch(drafts, groups);
    const matchingGroups = query
      ? groups.filter((group) => group.searchText.includes(query))
      : groups;
    const matchingDraftGroups = query
      ? draftGroups.filter((group) => group.searchText.includes(query))
      : draftGroups;
    const matchingDrafts = matchingDraftGroups
      .slice(0, 30)
      .map((group) => draftSummary(group.latest, req, { count: group.drafts.length }));

    matchingGroups.sort((a, b) => comparePacketRecency(a.latest, b.latest));

    const resultGroups = query ? matchingGroups.slice(0, 50) : matchingGroups;

    res.json({
      totalRecords: groups.length + draftGroups.length,
      totalContractRecords: groups.length,
      totalPacketRecords: packets.length,
      totalDraftRecords: draftGroups.length,
      hiddenDraftRecords: Math.max(0, drafts.length - draftGroups.length),
      hiddenRevisionRecords: Math.max(0, packets.length - groups.length),
      count: matchingGroups.length + matchingDraftGroups.length,
      results: [
        ...resultGroups.map((group) => {
          const packet = group.latest;
          return adminPacketSummary(packet, req, duplicateLookup.get(packet.id) || null, { count: group.packets.length });
        }),
        ...matchingDrafts,
      ],
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/customers/search", requireAuth, async (req, res, next) => {
  try {
    const query = text(req.query.q).toLowerCase();
    const packets = await listPackets();
    const groups = new Map();

    packets.forEach((packet) => {
      const key = customerSearchKey(packet);
      groups.set(key, [...(groups.get(key) || []), packet]);
    });

    const packetCustomers = [...groups.entries()].map(([key, groupPackets]) => customerRecordSummary(key, groupPackets, req));
    const knownCustomerKeys = new Set(packetCustomers.map(customerDuplicateKey));
    const lookupCustomers = (databaseConfigured() ? await listLookupRecords("customers") : [])
      .map(lookupCustomerSummary)
      .filter((customer) => {
        const key = customerDuplicateKey(customer);
        if (knownCustomerKeys.has(key)) return false;
        knownCustomerKeys.add(key);
        return true;
      });
    const estimateCustomers = (await listEstimateCustomers())
      .map(estimateCustomerSummary)
      .filter((customer) => {
        const key = customerDuplicateKey(customer);
        if (knownCustomerKeys.has(key)) return false;
        knownCustomerKeys.add(key);
        return true;
      });
    const importedCustomers = (databaseConfigured() ? [] : await listPreimportRecords("customers"))
      .map(importedCustomerSummary)
      .filter((customer) => {
        const key = customerDuplicateKey(customer);
        if (knownCustomerKeys.has(key)) return false;
        knownCustomerKeys.add(key);
        return true;
      });

    let customers = [...packetCustomers, ...lookupCustomers, ...estimateCustomers, ...importedCustomers];
    if (query) {
      customers = customers.filter((customer) => customer.searchText.includes(query));
    }
    customers.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    res.json({
      totalCustomers: groups.size,
      count: customers.length,
      customers: (query ? customers.slice(0, 30) : customers.slice(0, 60)).map(({ searchText, ...customer }) => customer),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/packets/:id/admin", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    res.json(await adminPacketDetail(packet, req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/edit-lock", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const actor = staffActor(req);

    if (isPacketLocked(packet)) {
      return res.json({
        ok: true,
        acquired: false,
        readonly: true,
        message: "Signed/accepted records are view-only. Create an edit for changes.",
      });
    }

    const result = acquireRecordLock(req, "packet", packet.id, actor);
    if (!result.acquired) return sendRecordLocked(res, result.lock);

    res.json({
      ok: true,
      acquired: true,
      lock: publicRecordLock(result.lock),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/packets/:id/edit-lock", requireAuth, async (req, res, next) => {
  try {
    releaseRecordLock(req, "packet", req.params.id);
    res.json({ ok: true, released: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/edit-lock/release", requireAuth, async (req, res, next) => {
  try {
    releaseRecordLock(req, "packet", req.params.id);
    res.json({ ok: true, released: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/owner", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const actor = staffActor(req);

    if (isPacketLocked(packet)) {
      return res.status(409).json({ error: "Signed/accepted contracts cannot have draft ownership changed." });
    }

    const activeLock = recordLockedByOther(req, "packet", packet.id);
    if (activeLock) return sendRecordLocked(res, activeLock);

    if (!packet.createdBy) {
      packet.createdBy = actor;
    }
    if (!packet.owner) {
      packet.owner = packet.createdBy;
    }

    if (!canTransferPacketOwner(packet, actor)) {
      return res.status(403).json({
        error: `${packetOwner(packet)?.name || packetOwnerUsername(packet)} owns this draft. Only the current owner or failsafe admin can transfer it.`,
      });
    }

    const targetUsername = text(req.body?.username).toLowerCase();
    const target = (await listStaffUsers()).find((user) => user.username === targetUsername);
    if (!target) {
      return res.status(404).json({ error: "Choose a valid staff user." });
    }

    const previousOwner = packetOwner(packet);
    packet.owner = {
      id: target.id,
      username: target.username,
      name: target.name,
    };
    packet.updatedBy = actor;
    packet.updatedAt = new Date().toISOString();
    packet.updateLog = packet.updateLog || [];
    packet.updateLog.push({
      type: "ownership_transfer",
      at: packet.updatedAt,
      by: actor.username,
      from: previousOwner,
      to: packet.owner,
    });

    await savePacket(packet);

    if (target.username !== actor.username) {
      await queueStaffNotification(target.username, {
        type: "contract_ownership_transferred",
        packetId: packet.id,
        contractNumber: packet.contractNumber || packet.id,
        customerName: customerName(packet),
        editedBy: actor,
        message: `${actor.name || actor.username} transferred ${packet.contractNumber || packet.id} to you.`,
      });
    }

    await logEvent("info", "packet_owner_transferred", {
      packetId: packet.id,
      request: requestMeta(req),
      from: previousOwner,
      to: packet.owner,
    });

    res.json(await adminPacketDetail(packet, req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets", requireAuth, async (req, res, next) => {
  try {
    const body = req.body?.data ? req.body.data : req.body;
    const allowDuplicate = bool(req.body?.allowDuplicate);
    const actor = staffActor(req);
    const data = normalizePacketData(body);
    await applyBusinessSettings(data, actor);
    await applySelectedEstimateAttachment(data);
    syncEstimatePageSelection(data);
    validatePacketData(data);

    if (!allowDuplicate) {
      const duplicates = await potentialDuplicatePackets(data);
      if (duplicates.length) {
        return res.status(409).json({
          error: "Possible duplicate contract. Open/edit the existing record or create an edit unless this is intentionally separate.",
          duplicateOverrideRequired: true,
          duplicates: duplicates.map((packet) => adminPacketSummary(packet, req)),
        });
      }
    }

    const id = newPacketId();
    const contractNumber = contractNumberForData(data, id);
    const now = new Date().toISOString();

    const packet = {
      id,
      contractNumber,
      revisionBaseContractNumber: contractNumber,
      revisionNumber: 0,
      status: "signable",
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      owner: actor,
      data,
      signatures: [],
    };
    appendPacketVersion(packet, actor, "Original", "Created");

    await savePacket(packet);
    const pdf = await generatePdf(packet, "signable");
    packet.signablePdfPath = pdf.path;
    packet.signablePdfSha256 = pdf.sha256;
    if (packet.data.delivery.emailCustomerLink) {
      try {
        packet.customerLinkEmail = await sendCustomerLinkForRequest(req, packet, pdf.password);
      } catch (error) {
        await logError(error, req, {
          event: "customer_link_email_failed",
          packetId: packet.id,
        });
        packet.customerLinkEmail = {
          sent: false,
          reason: `Email could not be sent: ${error.message}`,
        };
      }
    }
    packet.updatedAt = new Date().toISOString();
    await savePacket(packet);
    const clearedDraftCount = await clearProcessedContractDrafts(actor, req, "packet_created");

    await logEvent("info", "packet_created", {
      packetId: packet.id,
      request: requestMeta(req),
      pages: packet.data.pages.included,
      emailedCustomerLink: Boolean(packet.customerLinkEmail?.sent),
      clearedDraftCount,
    });

    res.status(201).json(packetSummary(packet, req));
  } catch (error) {
    next(error);
  }
});

app.put("/api/packets/:id", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);

    if (isPacketLocked(packet)) {
      return res.status(409).json({
        error: "This contract is signed/accepted and locked. Create an edit instead.",
        locked: true,
      });
    }

    const actor = staffActor(req);
    const activeLock = recordLockedByOther(req, "packet", packet.id);
    if (activeLock) return sendRecordLocked(res, activeLock);

    if (!packet.createdBy) {
      packet.createdBy = actor;
    }
    if (!packet.owner) {
      packet.owner = packet.createdBy;
    }
    const ownerUsername = packetOwnerUsername(packet);
    const overrideEdit = bool(req.body?.overrideEdit);
    if (!canEditPacketWithoutOverride(packet, actor) && !overrideEdit) {
      return res.status(409).json({
        error: `${packet.createdBy?.name || ownerUsername} created this draft. Confirm takeover before saving changes.`,
        editOverrideRequired: true,
        owner: packet.createdBy,
      });
    }

    const data = normalizePacketData(req.body?.data || req.body);
    await applyBusinessSettings(data, actor);
    await applySelectedEstimateAttachment(data);
    syncEstimatePageSelection(data);
    validatePacketData(data);

    packet.data = data;
    packet.contractNumber = packet.contractNumber || contractNumberForData(data, packet.id);
    packet.revisionBaseContractNumber = packet.revisionBaseContractNumber || baseContractNumberFromPacket(packet);
    packet.status = "signable";
    packet.updatedAt = new Date().toISOString();
    packet.updatedBy = actor;
    packet.updateLog = packet.updateLog || [];
    packet.updateLog.push({
      type: "draft_update",
      at: packet.updatedAt,
      by: actor.username,
      overrideEdit,
      reason: text(req.body?.reason || req.body?.revisionReason),
    });
    appendPacketVersion(packet, actor, overrideEdit ? "Override edit" : "Draft update", text(req.body?.reason || req.body?.revisionReason));

    await savePacket(packet);
    const pdf = await generatePdf(packet, "signable");
    packet.signablePdfPath = pdf.path;
    packet.signablePdfSha256 = pdf.sha256;
    await savePacket(packet);
    const clearedDraftCount = await clearProcessedContractDrafts(actor, req, "packet_updated");

    await logEvent("info", "packet_draft_updated", {
      packetId: packet.id,
      request: requestMeta(req),
      pages: packet.data.pages.included,
      overrideEdit,
      clearedDraftCount,
    });

    if (overrideEdit && ownerUsername && ownerUsername !== actor.username) {
      await queueStaffNotification(ownerUsername, {
        type: "contract_override_edit",
        packetId: packet.id,
        contractNumber: packet.contractNumber || packet.id,
        customerName: customerName(packet),
        editedBy: actor,
        message: `${actor.name || actor.username} changed ${packet.contractNumber || packet.id}. Please review it for accidental edits.`,
      });
    }

    res.json(await adminPacketDetail(packet, req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/revisions", requireAuth, async (req, res, next) => {
  try {
    const original = await loadPacket(req.params.id);
    const actor = staffActor(req);

    if (!isPacketLocked(original)) {
      return res.status(400).json({
        error: "This contract is not locked yet. Use draft edit/save instead of creating an edit.",
        locked: false,
      });
    }

    const data = normalizePacketData(req.body?.data || req.body);
    await applyBusinessSettings(data, actor);
    await applySelectedEstimateAttachment(data);
    syncEstimatePageSelection(data);
    validatePacketData(data);

    const baseContractNumber = baseContractNumberFromPacket(original);
    const revisionNumber = await nextRevisionNumber(baseContractNumber);
    const id = newPacketId();
    const now = new Date().toISOString();
    const revisionReason = text(req.body?.reason || req.body?.revisionReason);
    const packet = {
      id,
      contractNumber: `${baseContractNumber}-E${revisionNumber}`,
      revisionBaseContractNumber: baseContractNumber,
      revisionNumber,
      parentPacketId: original.parentPacketId || original.id,
      previousPacketId: original.id,
      revisionReason,
      status: "signable",
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      owner: actor,
      data,
      signatures: [],
      updateLog: [
        {
          type: "revision_created",
          at: now,
          by: actor.username,
          fromPacketId: original.id,
          reason: revisionReason,
        },
      ],
    };
    appendPacketVersion(packet, actor, `Edit ${revisionNumber}`, revisionReason || "Created edit");

    await savePacket(packet);
    const pdf = await generatePdf(packet, "signable");
    packet.signablePdfPath = pdf.path;
    packet.signablePdfSha256 = pdf.sha256;
    await savePacket(packet);

    original.revisionChildren = [...new Set([...(original.revisionChildren || []), packet.id])];
    original.updatedAt = now;
    await savePacket(original);
    const clearedDraftCount = await clearProcessedContractDrafts(actor, req, "packet_revision_created");

    await logEvent("info", "packet_revision_created", {
      packetId: packet.id,
      originalPacketId: original.id,
      contractNumber: packet.contractNumber,
      revisionNumber,
      request: requestMeta(req),
      clearedDraftCount,
    });

    res.status(201).json(await adminPacketDetail(packet, req));
  } catch (error) {
    next(error);
  }
});

app.get("/api/packets/:id", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    res.json(packetSummary(packet, req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/email-link", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    let result;
    try {
      result = await sendCustomerLinkForRequest(req, packet, generatedPassword(packet.data));
    } catch (error) {
      await logError(error, req, {
        event: "customer_link_email_failed",
        packetId: packet.id,
      });
      result = {
        sent: false,
        reason: `Email could not be sent: ${error.message}`,
      };
    }

    packet.customerLinkEmail = result;
    packet.updatedAt = new Date().toISOString();
    await savePacket(packet);

    await logEvent("info", "customer_link_email_requested", {
      packetId: packet.id,
      request: requestMeta(req),
      sent: Boolean(result.sent),
      reason: result.reason,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/template-pages.pdf", requireAuth, async (req, res, next) => {
  try {
    const pages = text(req.query.pages)
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((page) => Number.isInteger(page));
    const bytes = await generateBlankTemplatePages(pages);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="BLANK-CONTRACT-PAGES.pdf"');
    res.send(Buffer.from(bytes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/admin-email-final", requireAuth, async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);

    if (!packet.finalizedAt) {
      return res.status(400).json({ error: "This packet has not been signed yet." });
    }

    const filePath = generatedPath(packet.id, "final", true);
    await fs.access(filePath);
    const requestedEmail = normalizeEmailAddress(req.body?.email);
    const recipientEmail = requestedEmail || packet.data.customer.email;
    if (requestedEmail && !isValidEmailAddress(requestedEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (recipientEmail && !isValidEmailAddress(recipientEmail)) {
      return res.status(400).json({ error: "Customer email format is invalid. Correct the customer email before sending." });
    }

    let result;
    try {
      result = await sendCustomerFinalPacketEmail(
        packet,
        filePath,
        generatedPassword(packet.data),
        requestedEmail,
      );
    } catch (error) {
      await logError(error, req, {
        event: "admin_customer_final_email_failed",
        packetId: packet.id,
      });
      result = {
        sent: false,
        reason: `Email could not be sent: ${error.message}`,
      };
    }

    packet.customerFinalEmails = packet.customerFinalEmails || [];
    packet.customerFinalEmails.push({
      requestedAt: new Date().toISOString(),
      requestedBy: req.session.username || "admin",
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
      to: recipientEmail,
      sent: Boolean(result.sent),
      reason: result.reason,
      messageId: result.messageId,
      source: "admin",
    });
    packet.updatedAt = new Date().toISOString();
    await savePacket(packet);

    await logEvent("info", "admin_customer_final_email_requested", {
      packetId: packet.id,
      request: requestMeta(req),
      sent: Boolean(result.sent),
      reason: result.reason,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/verify", async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const expected = generatedPassword(packet.data);

    if (text(req.body?.password).toUpperCase() !== expected) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    setCustomerSessionFromPacket(req, packet);
    const documentEmail = packet.customerLinkEmail?.to || packet.data.customer.email || "";

    if (packet.completedAt) {
      const key = customerKeyFromPacket(packet);
      const account = await findCustomerAccountByCustomerKey(key.lastNameKey, key.phoneLast4, key.emailKey);
      return res.json({
        ok: true,
        completed: true,
        customerName: customerName(packet),
        customerEmail: documentEmail,
        customerAccountRegistered: Boolean(account || req.session.customer?.accountId),
        invoiceNumber: packet.data.order.invoiceNumber,
        portalUrl: customerPortalUrl(),
        finalPdfUrl: packet.finalizedAt ? `/api/packets/${packet.id}/download/final` : null,
        downloadFilename: contractPdfFilename(packet, { signed: true }),
      });
    }

    if (packet.finalizedAt) {
      const key = customerKeyFromPacket(packet);
      const account = await findCustomerAccountByCustomerKey(key.lastNameKey, key.phoneLast4, key.emailKey);
      return res.json({
        ok: true,
        signed: true,
        customerName: customerName(packet),
        customerEmail: documentEmail,
        customerAccountRegistered: Boolean(account || req.session.customer?.accountId),
        invoiceNumber: packet.data.order.invoiceNumber,
        finalPdfUrl: `/api/packets/${packet.id}/download/final`,
        downloadFilename: contractPdfFilename(packet, { signed: true }),
        portalUrl: customerPortalUrl(),
      });
    }

    const key = customerKeyFromPacket(packet);
    const account = await findCustomerAccountByCustomerKey(key.lastNameKey, key.phoneLast4, key.emailKey);
    res.json({
      ok: true,
      customerName: customerName(packet),
      customerEmail: documentEmail,
      customerAccountRegistered: Boolean(account || req.session.customer?.accountId),
      invoiceNumber: packet.data.order.invoiceNumber,
      signablePdfUrl: `/api/packets/${packet.id}/download/signable`,
      downloadFilename: contractPdfFilename(packet),
      sections: selectedSignatureSections(packet.data).map((key) => ({
        key,
        label: SIGNATURE_SECTIONS[key].label,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/reviewed", async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const expected = generatedPassword(packet.data);

    if (text(req.body?.password).toUpperCase() !== expected) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    if (!bool(req.body?.reviewedThroughEnd) || !bool(req.body?.readAndUnderstood)) {
      return res.status(400).json({
        error: "Confirm that you reviewed all contract pages and understand the document before signing.",
      });
    }

    packet.customerReviewEvents = packet.customerReviewEvents || [];
    packet.customerReviewEvents.push({
      reviewedAt: new Date().toISOString(),
      reviewMode: text(req.body?.reviewMode || "full_document"),
      reviewedThroughEnd: true,
      readAndUnderstood: true,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
    });
    packet.updatedAt = new Date().toISOString();
    await savePacket(packet);
    setCustomerSessionFromPacket(req, packet);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/sign", async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const expected = generatedPassword(packet.data);

    if (text(req.body?.password).toUpperCase() !== expected) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    if (packet.completedAt) {
      return res.status(409).json({ error: "This signing link is already complete. Please use the customer portal." });
    }

    if (packet.finalizedAt) {
      return res.status(409).json({
        error: "This packet has already been signed.",
        finalPdfUrl: `/api/packets/${packet.id}/download/final`,
      });
    }

    const confirmedReview = (packet.customerReviewEvents || []).some((event) => {
      return event.reviewedThroughEnd && event.readAndUnderstood;
    });
    if (!confirmedReview) {
      return res.status(400).json({ error: "Open and review all contract pages, then confirm that you read and understand the document before signing." });
    }

    if (!text(req.body?.signatureDataUrl).startsWith("data:image/")) {
      return res.status(400).json({ error: "A signature is required." });
    }

    if (!bool(req.body?.communicationConsent?.accountEmailAccepted)) {
      return res.status(400).json({ error: "Account and contract email acknowledgement is required." });
    }

    if (!bool(req.body?.digitalSignatureAccepted)) {
      return res.status(400).json({ error: "Digital signature agreement is required. The customer can sign in store or on paper if they do not agree." });
    }

    const signature = {
      signedAt: new Date().toISOString(),
      signedDate: formatDateDisplay(new Date()),
      customerInitials: text(req.body.customerInitials),
      printedName: text(req.body.printedName),
      customerNotes: text(req.body.customerNotes),
      signatureDataUrl: text(req.body.signatureDataUrl),
      digitalSignatureAccepted: true,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
    };
    signature.communicationConsent = communicationConsentFromBody(req.body, signature);

    const pdf = await generatePdf(packet, "final", signature);
    let email;
    try {
      email = await sendFinalPacketEmail(packet, pdf.path, pdf.password);
    } catch (error) {
      await logError(error, req, {
        event: "store_final_email_failed",
        packetId: packet.id,
      });
      email = {
        sent: false,
        reason: `Store email could not be sent: ${error.message}`,
      };
    }

    packet.status = "signed";
    packet.finalizedAt = signature.signedAt;
    packet.finalPdfPath = pdf.path;
    packet.finalPdfSha256 = pdf.sha256;
    packet.email = email;
    packet.signatures.push({
      signedAt: signature.signedAt,
      signedDate: signature.signedDate,
      customerInitials: signature.customerInitials,
      printedName: signature.printedName,
      customerNotes: signature.customerNotes,
      ip: signature.ip,
      userAgent: signature.userAgent,
      digitalSignatureAccepted: signature.digitalSignatureAccepted,
      communicationConsent: signature.communicationConsent,
      signatureDataUrl: "[captured]",
    });
    packet.data.customer.communicationConsent = signature.communicationConsent;
    packet.data.customer.socialMediaTagConsent = signature.communicationConsent.socialMediaTagConsent ? "yes" : "no";
    packet.data.customer.socialMediaProfile = signature.communicationConsent.socialMediaProfile || packet.data.customer.socialMediaProfile || "";
    packet.data.notes.customerNotes = signature.customerNotes || packet.data.notes.customerNotes;
    packet.updatedAt = new Date().toISOString();
    await savePacket(packet);
    setCustomerSessionFromPacket(req, packet);

    await logEvent("info", "packet_signed", {
      packetId: packet.id,
      request: requestMeta(req),
      signature: {
        ip: signature.ip,
        userAgent: signature.userAgent,
        signedAt: signature.signedAt,
        digitalSignatureAccepted: signature.digitalSignatureAccepted,
        communicationConsent: signature.communicationConsent,
      },
      storeEmailSent: Boolean(email.sent),
    });

    res.json({
      ok: true,
      finalPdfUrl: `/api/packets/${packet.id}/download/final`,
      downloadFilename: contractPdfFilename(packet, { signed: true }),
      customerEmail: packet.data.customer.email,
      email,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/complete", async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const expected = generatedPassword(packet.data);

    if (text(req.body?.password).toUpperCase() !== expected) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    if (!packet.finalizedAt) {
      return res.status(400).json({ error: "This packet has not been signed yet." });
    }

    const now = new Date().toISOString();
    packet.status = "completed";
    packet.completedAt = packet.completedAt || now;
    packet.postSignActions = {
      completedAt: now,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
      selected: Array.isArray(req.body?.selected) ? req.body.selected.map(text).filter(Boolean) : [],
      statuses: Array.isArray(req.body?.statuses) ? req.body.statuses.map(text).filter(Boolean) : [],
    };
    packet.updatedAt = now;
    await savePacket(packet);
    setCustomerSessionFromPacket(req, packet);

    await logEvent("info", "packet_link_completed", {
      packetId: packet.id,
      request: requestMeta(req),
      selected: packet.postSignActions.selected,
      statuses: packet.postSignActions.statuses,
    });

    res.json({ ok: true, portalUrl: customerPortalUrl() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packets/:id/email-final-to-customer", async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    const expected = generatedPassword(packet.data);

    if (text(req.body?.password).toUpperCase() !== expected) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    if (!packet.finalizedAt) {
      return res.status(400).json({ error: "This packet has not been signed yet." });
    }

    const filePath = generatedPath(packet.id, "final", true);
    await fs.access(filePath);
    const requestedEmail = normalizeEmailAddress(req.body?.email);
    const recipientEmail = requestedEmail || packet.data.customer.email;
    if (requestedEmail && !isValidEmailAddress(requestedEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (recipientEmail && !isValidEmailAddress(recipientEmail)) {
      return res.status(400).json({ error: "Customer email format is invalid. Correct the customer email before sending." });
    }

    let result;
    try {
      result = await sendCustomerFinalPacketEmail(
        packet,
        filePath,
        expected,
        requestedEmail,
      );
    } catch (error) {
      await logError(error, req, {
        event: "customer_final_email_failed",
        packetId: packet.id,
      });
      result = {
        sent: false,
        reason: `Email could not be sent: ${error.message}`,
      };
    }

    packet.customerFinalEmails = packet.customerFinalEmails || [];
    packet.customerFinalEmails.push({
      requestedAt: new Date().toISOString(),
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || "",
      to: recipientEmail,
      sent: Boolean(result.sent),
      reason: result.reason,
      messageId: result.messageId,
    });
    packet.updatedAt = new Date().toISOString();
    await savePacket(packet);

    await logEvent("info", "customer_final_email_requested", {
      packetId: packet.id,
      request: requestMeta(req),
      sent: Boolean(result.sent),
      reason: result.reason,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/packets/:id/download/:kind", async (req, res, next) => {
  try {
    const packet = await loadPacket(req.params.id);
    if (req.params.kind === "estimate") {
      if (!canViewPacketPdf(req, packet)) return packetPdfAccessDenied(req, res);

      const bytes = estimatePdfBytes(packet);
      if (!bytes) {
        return res.status(404).json({ error: "No estimate PDF is attached to this contract." });
      }

      const filename = estimateDownloadFilename(packet);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
      res.send(bytes);
      return;
    }

    const kind = req.params.kind === "final" ? "final" : "signable";
    if (!canViewPacketPdf(req, packet)) return packetPdfAccessDenied(req, res);

    const filePath = generatedPath(packet.id, kind, true);

    await fs.access(filePath);

    const filename = contractPdfFilename(packet, { signed: kind === "final" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

mountQuickContractRoutes(app);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.use((error, req, res, _next) => {
  const status = error.status || 500;
  const jsonBodyParseError = error instanceof SyntaxError && error.type === "entity.parse.failed";
  const message = jsonBodyParseError
    ? "Request body was not valid JSON."
    : status === 500
      ? "Something went wrong while processing the packet."
      : error.message;
  void logError(error, req, { status });
  res.status(status).json({
    error: message,
    detail: process.env.NODE_ENV === "production" || jsonBodyParseError ? undefined : error.message,
  });
});

async function startServer() {
  await ensureDataDirs();
  if (databaseConfigured()) {
    try {
      await ensureLookupSchema();
      await listInstallers({ includeInactive: true });
    } catch (error) {
      disableDatabase(error.message);
      console.error(`PostgreSQL unavailable; starting with file storage: ${error.message}`);
    }
  }
  return app.listen(PORT, () => {
    console.log(`Edgewater packet portal listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
};
