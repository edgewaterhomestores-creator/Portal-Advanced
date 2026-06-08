function clean(value) {
  return String(value ?? "").trim();
}

function firstHeaderValue(value) {
  return clean(value).split(",")[0].trim();
}

function localHostname(hostname) {
  const value = clean(hostname).replace(/^\[|\]$/g, "").toLowerCase();
  return value === "localhost" || value === "::1" || value === "0.0.0.0" || value === "127.0.0.1" || value.startsWith("127.");
}

function parseBaseUrl(value) {
  const raw = clean(value).replace(/\/+$/, "");
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function securePublicUrl(url) {
  if (!url) return "";
  if (!localHostname(url.hostname)) {
    url.protocol = "https:";
  }
  return url.toString().replace(/\/+$/, "");
}

function publicBaseUrl(req, options = {}) {
  const configured = clean(process.env[options.envName || "PUBLIC_BASE_URL"]);
  const fallbackConfigured = options.fallbackEnvName ? clean(process.env[options.fallbackEnvName]) : "";
  const configuredUrl = parseBaseUrl(configured || fallbackConfigured);
  if (configuredUrl) return securePublicUrl(configuredUrl);

  const host = firstHeaderValue(req?.get?.("host")) || "localhost";
  const forwardedProto = firstHeaderValue(req?.get?.("x-forwarded-proto"));
  const proto = forwardedProto || req?.protocol || "http";
  const requestUrl = parseBaseUrl(`${proto}://${host}`);
  return securePublicUrl(requestUrl);
}

module.exports = {
  localHostname,
  publicBaseUrl,
};
