const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { google } = require("googleapis");

const { SETTINGS_DIR, ensureDataDirs } = require("./storage");
const { stageIncomingDocumentBuffer } = require("./preimport");

const GMAIL_IMPORT_PATH = path.join(SETTINGS_DIR, "gmail-import.json");
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DEFAULT_QUERY = "has:attachment";
const DEFAULT_LABEL = "Portal Import";
const MAX_MESSAGES_PER_SCAN = 50;

function clean(value) {
  return String(value ?? "").trim();
}

function makeId() {
  return `gmail-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function minutesValue(value, fallback = 240) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 15) return fallback;
  return Math.min(1440, Math.round(parsed));
}

function publicAccount(account = {}) {
  return {
    id: account.id,
    email: account.email || "",
    displayName: account.displayName || "",
    store: account.store || "cabinet",
    labelName: account.labelName || DEFAULT_LABEL,
    query: account.query || DEFAULT_QUERY,
    scanEveryMinutes: minutesValue(account.scanEveryMinutes),
    enabled: account.enabled !== false,
    connected: Boolean(account.oauth?.refresh_token),
    lastScanAt: account.lastScanAt || "",
    lastError: account.lastError || "",
    createdAt: account.createdAt || "",
    updatedAt: account.updatedAt || "",
  };
}

async function readGmailImportSettings() {
  await ensureDataDirs();
  try {
    const parsed = JSON.parse(await fs.readFile(GMAIL_IMPORT_PATH, "utf8"));
    return {
      enabled: parsed.enabled !== false,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { enabled: true, accounts: [] };
  }
}

async function writeGmailImportSettings(settings) {
  await ensureDataDirs();
  const next = {
    enabled: settings.enabled !== false,
    accounts: Array.isArray(settings.accounts) ? settings.accounts : [],
  };
  await fs.writeFile(GMAIL_IMPORT_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function listGmailImportAccounts(req) {
  const settings = await readGmailImportSettings();
  return {
    enabled: settings.enabled !== false,
    accounts: settings.accounts.map(publicAccount),
    oauthConfigured: Boolean(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET),
    redirectUri: gmailRedirectUri(req),
  };
}

function gmailRedirectUri(req) {
  const configured = clean(process.env.GMAIL_OAUTH_REDIRECT_URI);
  if (configured) return configured;
  const base = clean(process.env.PUBLIC_BASE_URL).replace(/\/$/, "");
  if (base) return `${base}/api/gmail-import/oauth/callback`;
  if (req) return `${req.protocol}://${req.get("host")}/api/gmail-import/oauth/callback`;
  return "";
}

function oauthClient(req) {
  const clientId = clean(process.env.GMAIL_OAUTH_CLIENT_ID);
  const clientSecret = clean(process.env.GMAIL_OAUTH_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const error = new Error("Gmail OAuth is not configured on the server.");
    error.status = 400;
    throw error;
  }
  return new google.auth.OAuth2(clientId, clientSecret, gmailRedirectUri(req));
}

async function saveGmailImportAccount(body = {}, actor = {}) {
  const settings = await readGmailImportSettings();
  const accountId = clean(body.id) || makeId();
  const existing = settings.accounts.find((account) => account.id === accountId);
  const account = {
    ...(existing || {}),
    id: accountId,
    email: clean(body.email || existing?.email).toLowerCase(),
    displayName: clean(body.displayName || existing?.displayName),
    store: clean(body.store || existing?.store || "cabinet").toLowerCase(),
    labelName: clean(body.labelName || existing?.labelName || DEFAULT_LABEL),
    query: clean(body.query || existing?.query || DEFAULT_QUERY),
    scanEveryMinutes: minutesValue(body.scanEveryMinutes ?? existing?.scanEveryMinutes),
    enabled: body.enabled === undefined ? existing?.enabled !== false : Boolean(body.enabled),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: clean(actor?.username || actor?.name),
  };
  if (!account.email) {
    const error = new Error("Gmail account email is required.");
    error.status = 400;
    throw error;
  }
  const index = settings.accounts.findIndex((item) => item.id === accountId);
  if (index >= 0) settings.accounts[index] = account;
  else settings.accounts.unshift(account);
  await writeGmailImportSettings(settings);
  return publicAccount(account);
}

async function deleteGmailImportAccount(accountId) {
  const settings = await readGmailImportSettings();
  settings.accounts = settings.accounts.filter((account) => account.id !== accountId);
  await writeGmailImportSettings(settings);
  return true;
}

function statePayload(accountId) {
  const secret = clean(process.env.SESSION_SECRET || process.env.GMAIL_OAUTH_STATE_SECRET || "dev-state-secret");
  const nonce = crypto.randomBytes(8).toString("hex");
  const body = Buffer.from(JSON.stringify({ accountId, nonce, ts: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function parseStatePayload(value) {
  const [body, sig] = clean(value).split(".");
  if (!body || !sig) return "";
  const secret = clean(process.env.SESSION_SECRET || process.env.GMAIL_OAUTH_STATE_SECRET || "dev-state-secret");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return "";
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return clean(parsed.accountId);
}

async function gmailAuthUrl(accountId, req) {
  const settings = await readGmailImportSettings();
  const account = settings.accounts.find((item) => item.id === accountId);
  if (!account) {
    const error = new Error("Gmail import account not found.");
    error.status = 404;
    throw error;
  }
  const client = oauthClient(req);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE],
    login_hint: account.email,
    state: statePayload(account.id),
  });
}

async function completeGmailOAuth({ code, state, req }) {
  const accountId = parseStatePayload(state);
  if (!accountId) {
    const error = new Error("Gmail OAuth state is invalid.");
    error.status = 400;
    throw error;
  }
  const client = oauthClient(req);
  const tokenResult = await client.getToken(clean(code));
  const tokens = tokenResult.tokens || {};
  if (!tokens.refresh_token) {
    const error = new Error("Google did not return a refresh token. Reconnect with consent, or remove this account and try again.");
    error.status = 400;
    throw error;
  }
  const settings = await readGmailImportSettings();
  const index = settings.accounts.findIndex((account) => account.id === accountId);
  if (index < 0) {
    const error = new Error("Gmail import account not found.");
    error.status = 404;
    throw error;
  }
  settings.accounts[index] = {
    ...settings.accounts[index],
    oauth: tokens,
    lastError: "",
    updatedAt: nowIso(),
  };
  await writeGmailImportSettings(settings);
  return publicAccount(settings.accounts[index]);
}

function gmailForAccount(account, req) {
  const client = oauthClient(req);
  client.setCredentials(account.oauth || {});
  return google.gmail({ version: "v1", auth: client });
}

async function labelIdForName(gmail, labelName) {
  const name = clean(labelName);
  if (!name) return "";
  const response = await gmail.users.labels.list({ userId: "me" });
  const labels = response.data.labels || [];
  const match = labels.find((label) => clean(label.name).toLowerCase() === name.toLowerCase());
  return match?.id || "";
}

function messageHeader(message, name) {
  const headers = message.payload?.headers || [];
  return clean(headers.find((header) => clean(header.name).toLowerCase() === name.toLowerCase())?.value);
}

function attachmentParts(payload, collected = []) {
  if (!payload) return collected;
  const filename = clean(payload.filename);
  if (filename && payload.body?.attachmentId) {
    collected.push({
      filename,
      mimeType: payload.mimeType || "",
      attachmentId: payload.body.attachmentId,
    });
  }
  (payload.parts || []).forEach((part) => attachmentParts(part, collected));
  return collected;
}

function base64UrlToBuffer(value) {
  return Buffer.from(clean(value).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function scanGmailAccount(account, req, actor = {}) {
  const gmail = gmailForAccount(account, req);
  const labelId = await labelIdForName(gmail, account.labelName);
  const params = {
    userId: "me",
    maxResults: MAX_MESSAGES_PER_SCAN,
    q: clean(account.query || DEFAULT_QUERY),
  };
  if (labelId) params.labelIds = [labelId];
  const list = await gmail.users.messages.list(params);
  const messages = list.data.messages || [];
  const uploaded = [];
  const skipped = [];

  for (const summary of messages) {
    const message = await gmail.users.messages.get({
      userId: "me",
      id: summary.id,
      format: "full",
    });
    const data = message.data || {};
    const parts = attachmentParts(data.payload);
    for (const part of parts) {
      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: data.id,
        id: part.attachmentId,
      });
      const buffer = base64UrlToBuffer(attachment.data.data);
      const result = await stageIncomingDocumentBuffer({
        buffer,
        originalName: part.filename,
        source: "gmail",
        actor,
        metadata: {
          emailAccount: account.email,
          emailMessageId: data.id,
          emailThreadId: data.threadId,
          emailAttachmentId: part.attachmentId,
          emailFrom: messageHeader(data, "From"),
          emailSubject: messageHeader(data, "Subject"),
          emailReceivedAt: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : "",
          emailSnippet: data.snippet || "",
        },
      });
      uploaded.push(...(result.uploaded || []));
      skipped.push(...(result.skipped || []));
    }
  }

  return { account: publicAccount(account), messagesChecked: messages.length, uploaded, skipped };
}

async function scanGmailImports({ req = null, actor = {}, force = false } = {}) {
  const settings = await readGmailImportSettings();
  if (settings.enabled === false) return { enabled: false, scanned: [], skipped: [], uploaded: [] };
  const scanned = [];
  const uploaded = [];
  const skipped = [];
  const updatedAccounts = [];
  const now = Date.now();

  for (const account of settings.accounts) {
    const interval = minutesValue(account.scanEveryMinutes);
    const lastScanMs = Date.parse(account.lastScanAt || "");
    const due = force || !lastScanMs || now - lastScanMs >= interval * 60 * 1000;
    if (account.enabled === false || !account.oauth?.refresh_token || !due) {
      updatedAccounts.push(account);
      continue;
    }
    try {
      const result = await scanGmailAccount(account, req, actor);
      const updated = { ...account, lastScanAt: nowIso(), lastError: "", updatedAt: nowIso() };
      updatedAccounts.push(updated);
      scanned.push(result);
      uploaded.push(...result.uploaded);
      skipped.push(...result.skipped);
    } catch (error) {
      updatedAccounts.push({ ...account, lastError: error.message, updatedAt: nowIso() });
      scanned.push({ account: publicAccount(account), error: error.message, uploaded: [], skipped: [] });
    }
  }

  await writeGmailImportSettings({ ...settings, accounts: updatedAccounts });
  return { enabled: true, scanned, uploaded, skipped };
}

module.exports = {
  completeGmailOAuth,
  deleteGmailImportAccount,
  gmailAuthUrl,
  listGmailImportAccounts,
  saveGmailImportAccount,
  scanGmailImports,
};
