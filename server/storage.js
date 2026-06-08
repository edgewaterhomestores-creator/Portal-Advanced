const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { databaseConfigured, listPacketRecords, loadPacketRecord, savePacketRecord } = require("./db");

const ROOT = path.resolve(__dirname, "..");
const PACKET_DIR = path.join(ROOT, "data", "packets");
const GENERATED_DIR = path.join(ROOT, "data", "generated");
const SETTINGS_DIR = path.join(ROOT, "data", "settings");
const ESTIMATES_DIR = path.join(ROOT, "data", "estimates");

async function ensureDataDirs() {
  await fs.mkdir(PACKET_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.mkdir(ESTIMATES_DIR, { recursive: true });
}

function newPacketId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${date}-${crypto.randomBytes(4).toString("hex")}`;
}

function packetPath(id) {
  return path.join(PACKET_DIR, `${id}.json`);
}

async function savePacket(packet) {
  await ensureDataDirs();
  await fs.writeFile(packetPath(packet.id), `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  if (databaseConfigured()) {
    try {
      await savePacketRecord(packet);
    } catch (error) {
      console.error(`PostgreSQL packet mirror failed for ${packet.id}: ${error.message}`);
    }
  }
  return packet;
}

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseStoredJson(raw, filePath) {
  const text = String(raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/^\u00ef\u00bb\u00bf/, "");

  if (text.trim().startsWith("<")) {
    throw new Error(`Stored JSON file contains HTML instead of JSON: ${filePath}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not read stored JSON file ${filePath}: ${error.message}`);
  }
}

async function loadPacket(id) {
  if (databaseConfigured()) {
    try {
      const packet = await loadPacketRecord(id);
      if (packet) return packet;
    } catch (error) {
      console.error(`PostgreSQL packet load failed for ${id}: ${error.message}`);
    }
  }
  const filePath = packetPath(id);
  const raw = await fs.readFile(filePath, "utf8");
  return parseStoredJson(raw, filePath);
}

async function listPackets() {
  await ensureDataDirs();
  const byId = new Map();

  if (databaseConfigured()) {
    try {
      const packets = await listPacketRecords();
      packets.forEach((packet) => {
        if (packet?.id) byId.set(packet.id, packet);
      });
    } catch (error) {
      console.error(`PostgreSQL packet list failed: ${error.message}`);
    }
  }

  const entries = await fs.readdir(PACKET_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    const filePath = path.join(PACKET_DIR, entry.name);
    const raw = await fs.readFile(filePath, "utf8");
    const packet = parseStoredJson(raw, filePath);
    if (packet?.id && !byId.has(packet.id)) {
      byId.set(packet.id, packet);
      if (databaseConfigured()) {
        try {
          await savePacketRecord(packet);
        } catch (error) {
          console.error(`PostgreSQL packet backfill failed for ${packet.id}: ${error.message}`);
        }
      }
    }
  }

  return [...byId.values()];
}

function generatedPath(id, kind, encrypted = true) {
  const suffix = encrypted ? "" : ".tmp";
  return path.join(GENERATED_DIR, `${id}-${kind}${suffix}.pdf`);
}

module.exports = {
  ESTIMATES_DIR,
  GENERATED_DIR,
  SETTINGS_DIR,
  ensureDataDirs,
  generatedPath,
  listPackets,
  loadPacket,
  newPacketId,
  savePacket,
  sha256File,
};
