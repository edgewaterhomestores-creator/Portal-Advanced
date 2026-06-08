const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT, "data", "logs");

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.headers["cf-connecting-ip"] || req.ip || req.socket?.remoteAddress || "";
}

function requestMeta(req) {
  if (!req) return {};
  return {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: clientIp(req),
    userAgent: req.headers["user-agent"] || "",
    referer: req.headers.referer || "",
  };
}

function serializeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    status: error?.status,
    code: error?.code,
  };
}

async function logEvent(level, event, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details,
  };

  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(
      path.join(LOG_DIR, `portal-${dateStamp()}.log`),
      `${JSON.stringify(entry)}\n`,
      "utf8",
    );
  } catch (error) {
    console.error("Could not write portal log", error);
  }

  if (level === "error") {
    console.error(JSON.stringify(entry));
  }
}

function logError(error, req, details = {}) {
  return logEvent("error", "server_error", {
    request: requestMeta(req),
    error: serializeError(error),
    ...details,
  });
}

module.exports = {
  clientIp,
  logError,
  logEvent,
  requestMeta,
  serializeError,
};
