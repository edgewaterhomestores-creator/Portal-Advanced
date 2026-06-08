require("dotenv").config();

const { scanGmailImports } = require("../server/gmail-import");
const { scanIncomingDocuments } = require("../server/preimport");

async function main() {
  const actor = { username: "system", name: "Scheduled Email Scan" };
  const local = await scanIncomingDocuments(actor);
  const gmail = await scanGmailImports({ actor, force: process.argv.includes("--force") });
  const summary = {
    checkedAt: new Date().toISOString(),
    localScanned: local.scanned.length,
    localSkipped: local.skipped.length,
    gmailAccounts: gmail.scanned.length,
    gmailUploaded: gmail.uploaded.length,
    gmailSkipped: gmail.skipped.length,
    gmailErrors: gmail.scanned.filter((item) => item.error).map((item) => ({
      account: item.account?.email || "",
      error: item.error,
    })),
  };
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
