const fs = require("node:fs/promises");
const path = require("node:path");

const { ESTIMATES_DIR, ensureDataDirs } = require("./storage");

function estimateFolderPath() {
  return path.resolve(process.env.ESTIMATES_DIR || ESTIMATES_DIR);
}

async function ensureEstimateFolder() {
  await ensureDataDirs();
  await fs.mkdir(estimateFolderPath(), { recursive: true });
}

function safeEstimateFileName(fileName) {
  const raw = String(fileName || "").trim();
  const base = path.basename(raw);
  if (!base || base !== raw || !base.toLowerCase().endsWith(".pdf")) return "";
  return base;
}

function safeEstimatePath(fileName) {
  const base = safeEstimateFileName(fileName);
  if (!base) return "";

  const folder = estimateFolderPath();
  const filePath = path.resolve(folder, base);
  const relative = path.relative(folder, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return filePath;
}

async function listEstimateFiles(query = "") {
  await ensureEstimateFolder();
  const folder = estimateFolderPath();
  const filter = String(query || "").trim().toLowerCase();
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;

    const filePath = path.join(folder, entry.name);
    const stats = await fs.stat(filePath);
    files.push({
      fileName: entry.name,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      url: `/api/estimates/${encodeURIComponent(entry.name)}/download`,
    });
  }

  files.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.fileName.localeCompare(b.fileName));
  return files;
}

async function readEstimatePdfDataUrl(fileName) {
  const filePath = safeEstimatePath(fileName);
  if (!filePath) {
    const error = new Error("Estimate PDF filename is not valid.");
    error.status = 400;
    throw error;
  }

  try {
    const bytes = await fs.readFile(filePath);
    return {
      fileName: safeEstimateFileName(fileName),
      folderPath: estimateFolderPath(),
      dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      const missing = new Error("Selected estimate PDF was not found in the estimates folder.");
      missing.status = 404;
      throw missing;
    }
    throw error;
  }
}

module.exports = {
  ensureEstimateFolder,
  estimateFolderPath,
  listEstimateFiles,
  readEstimatePdfDataUrl,
  safeEstimatePath,
};
