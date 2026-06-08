const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");

const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_HOST = safeHost(process.env.PUBLIC_BASE_URL) || "contracts.edgewaterhomestores.com";
const results = [];

function line(text = "") {
  process.stdout.write(`${text}\n`);
}

function record(status, name, detail) {
  results.push({ status, name, detail });
  const tag = status.padEnd(4).toUpperCase();
  line(`[${tag}] ${name}`);
  if (detail) line(`       ${detail}`);
}

function pass(name, detail) {
  record("pass", name, detail);
}

function warn(name, detail) {
  record("warn", name, detail);
}

function skip(name, detail) {
  record("skip", name, detail);
}

function fail(name, detail) {
  record("fail", name, detail);
}

function safeHost(urlValue) {
  try {
    if (!urlValue) return "";
    return new URL(urlValue).host;
  } catch (_error) {
    return "";
  }
}

function boolEnv(value) {
  return String(value || "").toLowerCase() === "true";
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function tcpCheck(name, host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function done(status, detail) {
      if (settled) return;
      settled = true;
      socket.destroy();
      record(status, name, detail);
      resolve(status === "pass");
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done("pass", `${host}:${port} accepted a TCP connection.`));
    socket.once("timeout", () => done("fail", `${host}:${port} timed out.`));
    socket.once("error", (error) => done("fail", `${host}:${port} failed: ${error.message}`));
    socket.connect(port, host);
  });
}

function httpCheck(name, urlValue, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(urlValue);
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: options.headers || {},
        timeout: options.timeoutMs || 5000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode > 299) {
            fail(name, `${urlValue} returned HTTP ${response.statusCode}.`);
            resolve(false);
            return;
          }

          if (options.includes && !body.includes(options.includes)) {
            fail(name, `${urlValue} answered, but the expected text was not found.`);
            resolve(false);
            return;
          }

          pass(name, `${urlValue} answered with HTTP ${response.statusCode}.`);
          resolve(true);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", (error) => {
      fail(name, `${urlValue} failed: ${error.message}`);
      resolve(false);
    });
    request.end();
  });
}

function commandExists(command) {
  const probe = spawnSync("which", [command], { encoding: "utf8" });
  return probe.status === 0;
}

function runPostgresQuery() {
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl.startsWith("postgres")) {
    skip("PostgreSQL login", "DATABASE_URL is blank or is not a PostgreSQL URL.");
    return;
  }

  if (!commandExists("psql")) {
    fail("PostgreSQL login", "psql command was not found.");
    return;
  }

  try {
    const parsed = new URL(databaseUrl);
    const database = parsed.pathname.replace(/^\//, "");
    const result = spawnSync(
      "psql",
      [
        "-h",
        parsed.hostname,
        "-p",
        parsed.port || "5432",
        "-U",
        decodeURIComponent(parsed.username),
        "-d",
        database,
        "-c",
        "select 1 as ok;",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGPASSWORD: decodeURIComponent(parsed.password || ""),
        },
      },
    );

    if (result.status === 0) {
      pass("PostgreSQL login", `Connected to ${parsed.hostname}:${parsed.port || "5432"} database ${database}.`);
    } else {
      fail("PostgreSQL login", (result.stderr || result.stdout || "psql failed.").trim());
    }
  } catch (error) {
    fail("PostgreSQL login", error.message);
  }
}

function runMysqlQuery() {
  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const port = process.env.MYSQL_PORT || "3306";
  const user = process.env.MYSQL_USER || "";
  const database = process.env.MYSQL_DATABASE || "";

  if (!user) {
    skip("MySQL login", "MYSQL_USER is blank, so only the MySQL port check was performed.");
    return;
  }

  if (!commandExists("mysql")) {
    fail("MySQL login", "mysql command was not found.");
    return;
  }

  const args = ["-h", host, "-P", port, "-u", user, "-e", "SELECT 1 AS ok;"];
  if (database) args.push(database);

  const result = spawnSync("mysql", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      MYSQL_PWD: process.env.MYSQL_PASS || "",
    },
  });

  if (result.status === 0) {
    pass("MySQL login", `Connected to ${host}:${port}${database ? ` database ${database}` : ""}.`);
  } else {
    fail("MySQL login", (result.stderr || result.stdout || "mysql failed.").trim());
  }
}

async function verifySmtp() {
  if (!process.env.SMTP_HOST) {
    skip("SMTP", "SMTP_HOST is blank. Email sending is not configured yet.");
    return;
  }

  await tcpCheck("SMTP port", process.env.SMTP_HOST, Number(process.env.SMTP_PORT || 587));

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: boolEnv(process.env.SMTP_SECURE),
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        }
      : undefined,
  });

  try {
    await transporter.verify();
    pass("SMTP login", `SMTP server accepted the settings for ${process.env.SMTP_HOST}.`);
  } catch (error) {
    fail("SMTP login", error.message);
  }
}

async function main() {
  line("Customer Portal Server Diagnostics");
  line("==================================");
  line(`Project folder: ${ROOT}`);
  line(`Public host used for Nginx Host header: ${PUBLIC_HOST}`);
  line("");

  exists("package.json") ? pass("Project file", "package.json exists.") : fail("Project file", "package.json is missing.");
  exists("server/index.js") ? pass("Server file", "server/index.js exists.") : fail("Server file", "server/index.js is missing.");
  exists("public/server-test.html")
    ? pass("Browser test page", "public/server-test.html exists.")
    : fail("Browser test page", "public/server-test.html is missing.");

  process.env.SESSION_SECRET ? pass("SESSION_SECRET", "SESSION_SECRET is set.") : warn("SESSION_SECRET", "SESSION_SECRET is blank.");
  process.env.ADMIN_PASSWORD ? pass("ADMIN_PASSWORD", "ADMIN_PASSWORD is set.") : warn("ADMIN_PASSWORD", "ADMIN_PASSWORD is blank.");
  process.env.PUBLIC_BASE_URL ? pass("PUBLIC_BASE_URL", process.env.PUBLIC_BASE_URL) : warn("PUBLIC_BASE_URL", "PUBLIC_BASE_URL is blank.");
  try {
    const estimatesDir = path.resolve(process.env.ESTIMATES_DIR || path.join(ROOT, "data", "estimates"));
    fs.mkdirSync(estimatesDir, { recursive: true });
    fs.accessSync(estimatesDir, fs.constants.R_OK);
    pass("ESTIMATES_DIR", `Portal can read ${estimatesDir}.`);
  } catch (error) {
    fail("ESTIMATES_DIR", error.message);
  }

  await tcpCheck("Customer Portal app port", "127.0.0.1", PORT);
  await httpCheck("Customer Portal API health", `http://127.0.0.1:${PORT}/api/health`, { includes: '"ok":true' });
  await tcpCheck("Nginx local port 80", "127.0.0.1", 80);
  await httpCheck("Nginx app route", "http://127.0.0.1/api/health", {
    headers: { Host: PUBLIC_HOST },
    includes: '"ok":true',
  });
  await httpCheck("Nginx access test page", "http://127.0.0.1/_server-test.html", {
    headers: { Host: PUBLIC_HOST },
    includes: "Customer Portal Nginx Test OK",
  });

  await verifySmtp();
  await tcpCheck("MySQL local port", process.env.MYSQL_HOST || "127.0.0.1", Number(process.env.MYSQL_PORT || 3306));
  runMysqlQuery();
  await tcpCheck("PostgreSQL local port", "127.0.0.1", 5432);
  runPostgresQuery();

  line("");
  line("Summary");
  line("-------");
  const counts = results.reduce((memo, item) => {
    memo[item.status] = (memo[item.status] || 0) + 1;
    return memo;
  }, {});
  line(`PASS: ${counts.pass || 0}`);
  line(`WARN: ${counts.warn || 0}`);
  line(`SKIP: ${counts.skip || 0}`);
  line(`FAIL: ${counts.fail || 0}`);

  if (counts.fail) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("Unexpected diagnostics error", error.stack || error.message);
  process.exitCode = 1;
});
