require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { app } = require("./index");
const { PDFDocument } = require("pdf-lib");
const { estimateFolderPath } = require("./estimate-files");
const { generatedPassword } = require("./pdf");
const { generatedPath, loadPacket } = require("./storage");

const ROOT = path.resolve(__dirname, "..");
const PACKET_DIR = path.join(ROOT, "data", "packets");
const TEST_SIGNATURE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQ2upAAAAABJRU5ErkJggg==";

function testPacketPayload(overrides = {}) {
  const customer = {
    firstName: "Api",
    lastName: "Tester",
    phone1: "(386) 555-9000",
    email: "api-test@example.com",
    textOptIn: "yes",
    mailingAddress: "100 Test Way, Edgewater, FL 32141",
    billingAddress: "100 Test Way, Edgewater, FL 32141",
    ...(overrides.customer || {}),
  };
  const order = {
    invoiceNumber: `API-${Date.now()}`,
    invoiceAmount: "$1,000",
    saleDate: "2026-05-23",
    installAddress: "100 Test Way, Edgewater, FL 32141",
    salesRep: "API Test",
    ...(overrides.order || {}),
  };
  const estimate = {
    estimateNumber: "EST-API",
    fileName: "Estimate API Test.pdf",
    notes: "API smoke test estimate placeholder.",
    ...(overrides.estimate || {}),
  };

  return {
    customer,
    order,
    project: {
      roomType: "kitchen",
      projectType: "remodel",
    },
    estimate,
    payments: {
      splitPaymentApproved: false,
      totalInvoiceAmount: "$1,000",
      rows: [],
    },
    vendors: [],
    materialRows: [],
    pages: {
      included: [1, 3, 4, 5, 6, 7, 8],
    },
    delivery: {
      emailCustomerLink: false,
    },
    signing: {
      sections: ["mainAgreement"],
    },
    notes: {
      companyNotes: "API smoke test.",
      internalNotes: "Safe to delete.",
    },
    ...overrides.root,
  };
}

function listen(serverApp) {
  return new Promise((resolve) => {
    const server = serverApp.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON but received: ${text.slice(0, 120)}`);
  }
}

async function request(baseUrl, pathName, options = {}, cookie = "") {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { response, data };
}

async function cleanupPacket(id) {
  if (!id) return;
  await fs.rm(path.join(PACKET_DIR, `${id}.json`), { force: true });
  await fs.rm(generatedPath(id, "signable", true), { force: true });
  await fs.rm(generatedPath(id, "signable", false), { force: true });
  await fs.rm(generatedPath(id, "final", true), { force: true });
  await fs.rm(generatedPath(id, "final", false), { force: true });
}

async function writeEstimateFixture(fileName) {
  const folder = estimateFolderPath();
  await fs.mkdir(folder, { recursive: true });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  page.drawText("API smoke estimate fixture", { x: 72, y: 720, size: 18 });
  await fs.writeFile(path.join(folder, fileName), await pdf.save());
}

async function cleanupEstimateFixture(fileName) {
  await fs.rm(path.join(estimateFolderPath(), fileName), { force: true });
}

async function main() {
  const previousSmtpHost = process.env.SMTP_HOST;
  const previousSmtpTo = process.env.SMTP_TO;
  process.env.SMTP_HOST = "";
  process.env.SMTP_TO = "";

  const server = await listen(app);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const createdIds = [];
  const estimateFixtureName = `api-smoke-estimate-${Date.now()}.pdf`;

  try {
    const login = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || "admin",
        password: process.env.ADMIN_PASSWORD || "admin",
      }),
    });
    const cookie = login.response.headers.get("set-cookie").split(";")[0];

    const branding = await request(baseUrl, "/api/public-branding");
    if (!branding.data.businessName || branding.data.signatures) {
      throw new Error("Public branding endpoint did not return the expected limited branding payload.");
    }

    await writeEstimateFixture(estimateFixtureName);
    const estimateList = await request(baseUrl, `/api/estimates?q=${encodeURIComponent(estimateFixtureName)}`, {}, cookie);
    if (!estimateList.data.folderPath || !estimateList.data.files.some((file) => file.fileName === estimateFixtureName)) {
      throw new Error("Estimate folder listing did not include the fixture PDF.");
    }

    let invalidEmailRejected = false;
    try {
      await request(baseUrl, "/api/packets", {
        method: "POST",
        body: JSON.stringify(testPacketPayload({
          customer: { email: "bad-email" },
          order: { invoiceNumber: `API-BAD-EMAIL-${Date.now()}` },
        })),
      }, cookie);
    } catch (error) {
      invalidEmailRejected = error.status === 400;
    }
    if (!invalidEmailRejected) {
      throw new Error("Packet creation accepted an invalid customer email address.");
    }

    let invalidDateRejected = false;
    try {
      await request(baseUrl, "/api/packets", {
        method: "POST",
        body: JSON.stringify(testPacketPayload({
          order: {
            invoiceNumber: `API-BAD-DATE-${Date.now()}`,
            saleDate: "13/40/2026",
          },
        })),
      }, cookie);
    } catch (error) {
      invalidDateRejected = error.status === 400;
    }
    if (!invalidDateRejected) {
      throw new Error("Packet creation accepted an invalid sale date.");
    }

    const create = await request(baseUrl, "/api/packets", {
      method: "POST",
      body: JSON.stringify(testPacketPayload({
        estimate: {
          selectedEstimateFile: estimateFixtureName,
          fileName: "",
        },
      })),
    }, cookie);
    createdIds.push(create.data.id);

    const createdPacket = await loadPacket(create.data.id);
    if (createdPacket.data.order.saleDate !== "05/23/2026") {
      throw new Error(`Created packet did not normalize sale date to MM/DD/YYYY: ${createdPacket.data.order.saleDate}`);
    }
    if (createdPacket.data.estimate.fileName !== estimateFixtureName || !createdPacket.data.estimate.dataUrl.startsWith("data:application/pdf;base64,")) {
      throw new Error("Selected estimate PDF was not attached to the created packet.");
    }
    if (!create.data.estimate?.viewUrl) {
      throw new Error("Created packet response did not include a viewable estimate link.");
    }
    const staffEstimateDownload = await fetch(`${baseUrl}${create.data.estimate.viewUrl}`, {
      headers: { Cookie: cookie },
    });
    const staffEstimateType = staffEstimateDownload.headers.get("content-type") || "";
    if (!staffEstimateDownload.ok || !staffEstimateType.includes("application/pdf")) {
      throw new Error(`Staff estimate view route did not return a PDF: ${staffEstimateType}`);
    }
    await staffEstimateDownload.arrayBuffer();

    const customerLookup = await request(baseUrl, "/api/customers/search?q=Tester", {}, cookie);
    const foundCustomer = (customerLookup.data.customers || []).find((customer) => (
      customer.lastName === "Tester" && customer.phone1 === "(386) 555-9000"
    ));
    if (!foundCustomer || !foundCustomer.contracts.some((contract) => contract.id === create.data.id)) {
      throw new Error("Customer lookup did not return the created customer and contract.");
    }
    if (!createdPacket.data.pages.included.includes(3)) {
      throw new Error("Selected estimate PDF did not include the estimate/POS slot page.");
    }

    const secondContract = await request(baseUrl, "/api/packets", {
      method: "POST",
      body: JSON.stringify(testPacketPayload({
        order: {
          invoiceNumber: `API-SECOND-${Date.now()}`,
          installAddress: "200 Test Way, Edgewater, FL 32141",
        },
        estimate: {
          estimateNumber: "EST-API-2",
        },
      })),
    }, cookie);
    createdIds.push(secondContract.data.id);
    const secondPacket = await loadPacket(secondContract.data.id);
    if (secondPacket.data.pages.included.includes(3)) {
      throw new Error("Contract without an attached estimate still included the estimate/POS slot page.");
    }

    const unrelatedContract = await request(baseUrl, "/api/packets", {
      method: "POST",
      body: JSON.stringify(testPacketPayload({
        customer: {
          phone1: "(386) 555-7777",
          email: "api-test-unrelated@example.com",
        },
        order: {
          invoiceNumber: `API-OTHER-${Date.now()}`,
          installAddress: "300 Test Way, Edgewater, FL 32141",
        },
        estimate: {
          estimateNumber: "EST-API-OTHER",
        },
      })),
    }, cookie);
    createdIds.push(unrelatedContract.data.id);

    if (generatedPassword((await loadPacket(create.data.id)).data) !== "AT1009000") {
      throw new Error("Generated password did not match expected test value.");
    }

    const customerLogin = await request(baseUrl, "/api/customer/login", {
      method: "POST",
      body: JSON.stringify({
        lastName: "Tester",
        password: "AT1009000",
      }),
    });
    const customerCookie = customerLogin.response.headers.get("set-cookie").split(";")[0];
    const customerOrders = await request(baseUrl, "/api/customer/orders", {}, customerCookie);
    const customerOrderIds = new Set(customerOrders.data.orders.map((order) => order.id));
    if (!customerOrderIds.has(create.data.id) || !customerOrderIds.has(secondContract.data.id)) {
      throw new Error("Customer portal did not include all contracts for the matching no-account customer.");
    }
    const createdCustomerOrder = customerOrders.data.orders.find((order) => order.id === create.data.id);
    if (!createdCustomerOrder?.estimate?.viewUrl) {
      throw new Error("Customer portal order did not include a viewable estimate link.");
    }
    const anonymousEstimateDownload = await fetch(`${baseUrl}${createdCustomerOrder.estimate.viewUrl}`);
    if (anonymousEstimateDownload.status !== 401) {
      throw new Error(`Anonymous estimate view was not rejected: ${anonymousEstimateDownload.status}`);
    }
    const customerEstimateDownload = await fetch(`${baseUrl}${createdCustomerOrder.estimate.viewUrl}`, {
      headers: { Cookie: customerCookie },
    });
    const customerEstimateType = customerEstimateDownload.headers.get("content-type") || "";
    if (!customerEstimateDownload.ok || !customerEstimateType.includes("application/pdf")) {
      throw new Error(`Customer estimate view route did not return a PDF: ${customerEstimateType}`);
    }
    await customerEstimateDownload.arrayBuffer();
    if (customerOrderIds.has(unrelatedContract.data.id)) {
      throw new Error("Customer portal included a contract that did not match the customer identity.");
    }

    const unrelatedCustomerLogin = await request(baseUrl, "/api/customer/login", {
      method: "POST",
      body: JSON.stringify({
        lastName: "Tester",
        password: "AT3007777",
      }),
    });
    const unrelatedCustomerCookie = unrelatedCustomerLogin.response.headers.get("set-cookie").split(";")[0];
    const unrelatedEstimateDownload = await fetch(`${baseUrl}${createdCustomerOrder.estimate.viewUrl}`, {
      headers: { Cookie: unrelatedCustomerCookie },
    });
    if (unrelatedEstimateDownload.status !== 403) {
      throw new Error(`Unrelated customer estimate view was not rejected: ${unrelatedEstimateDownload.status}`);
    }
    await request(baseUrl, "/api/customer/logout", { method: "POST" }, unrelatedCustomerCookie);

    await request(baseUrl, "/api/customer/logout", { method: "POST" }, customerCookie);
    const secondCustomerLogin = await request(baseUrl, "/api/customer/login", {
      method: "POST",
      body: JSON.stringify({
        lastName: "Tester",
        password: "AT2009000",
      }),
    });
    const secondCustomerCookie = secondCustomerLogin.response.headers.get("set-cookie").split(";")[0];
    const secondPasswordOrders = await request(baseUrl, "/api/customer/orders", {}, secondCustomerCookie);
    const secondPasswordOrderIds = new Set(secondPasswordOrders.data.orders.map((order) => order.id));
    if (!secondPasswordOrderIds.has(create.data.id) || !secondPasswordOrderIds.has(secondContract.data.id)) {
      throw new Error("Any valid packet password for the same customer should open all matching customer contracts.");
    }
    if (secondPasswordOrderIds.has(unrelatedContract.data.id)) {
      throw new Error("A valid password for one customer opened an unrelated customer contract.");
    }

    const detail = await request(baseUrl, `/api/packets/${create.data.id}/admin`, {}, cookie);
    if (!detail.data.password || detail.data.locked) {
      throw new Error("Admin detail did not return expected editable draft state.");
    }

    const blankPages = await fetch(`${baseUrl}/api/template-pages.pdf?pages=3,4,5`, {
      headers: { Cookie: cookie },
    });
    const blankType = blankPages.headers.get("content-type") || "";
    if (!blankPages.ok || !blankType.includes("application/pdf")) {
      throw new Error(`Blank page print route did not return a PDF: ${blankType}`);
    }
    await blankPages.arrayBuffer();

    const updatedPayload = detail.data.data;
    updatedPayload.order.invoiceAmount = "$1,250";
    const update = await request(baseUrl, `/api/packets/${create.data.id}`, {
      method: "PUT",
      body: JSON.stringify({ data: updatedPayload, reason: "API smoke update" }),
    }, cookie);
    if (update.data.data.order.invoiceAmount !== "$1,250") {
      throw new Error("Draft update did not save changed invoice amount.");
    }

    const verify = await request(baseUrl, `/api/packets/${create.data.id}/verify`, {
      method: "POST",
      body: JSON.stringify({ password: "AT1009000" }),
    });
    if (!verify.data.signablePdfUrl) {
      throw new Error("Verify endpoint did not return a signable PDF URL.");
    }
    const signingCustomerCookie = (verify.response.headers.get("set-cookie") || "").split(";")[0];
    if (!signingCustomerCookie) {
      throw new Error("Customer verification did not create a portal session cookie.");
    }

    await request(baseUrl, `/api/packets/${create.data.id}/reviewed`, {
      method: "POST",
      body: JSON.stringify({
        password: "AT1009000",
        reviewMode: "api_smoke_full_document",
        reviewedThroughEnd: true,
        readAndUnderstood: true,
      }),
    }, signingCustomerCookie);

    const sign = await request(baseUrl, `/api/packets/${create.data.id}/sign`, {
      method: "POST",
      body: JSON.stringify({
        password: "AT1009000",
        printedName: "Api Tester",
        customerInitials: "AT",
        customerNotes: "Signed by API smoke test.",
        digitalSignatureAccepted: true,
        communicationConsent: {
          accountEmailAccepted: true,
          marketingEmailConsent: false,
          accountTextConsent: false,
          marketingTextConsent: false,
        },
        signatureDataUrl: TEST_SIGNATURE_DATA_URL,
      }),
    });
    if (!sign.data.finalPdfUrl) {
      throw new Error("Sign endpoint did not return a final PDF URL.");
    }
    if (sign.data.downloadFilename !== "CONTRACT-TESTER-20260523-SIGNED-EST-API.pdf") {
      throw new Error(`Unexpected contract PDF filename: ${sign.data.downloadFilename}`);
    }

    const download = await fetch(`${baseUrl}${sign.data.finalPdfUrl}`, {
      headers: { Cookie: signingCustomerCookie },
    });
    const disposition = download.headers.get("content-disposition") || "";
    if (!download.ok || !disposition.includes("CONTRACT-TESTER-20260523-SIGNED-EST-API.pdf")) {
      throw new Error(`Download did not use the expected contract PDF filename: ${disposition}`);
    }
    await download.arrayBuffer();

    const adminDownload = await fetch(`${baseUrl}${sign.data.finalPdfUrl}`, {
      headers: { Cookie: cookie },
    });
    if (!adminDownload.ok) {
      throw new Error(`Admin/staff final PDF download failed: ${adminDownload.status}`);
    }
    await adminDownload.arrayBuffer();

    await request(baseUrl, `/api/packets/${create.data.id}/complete`, {
      method: "POST",
      body: JSON.stringify({
        password: "AT1009000",
        selected: ["download"],
        statuses: ["API smoke test completed post-sign flow."],
      }),
    });

    let lockedRejected = false;
    try {
      await request(baseUrl, `/api/packets/${create.data.id}`, {
        method: "PUT",
        body: JSON.stringify({ data: updatedPayload, reason: "Should not save" }),
      }, cookie);
    } catch (error) {
      lockedRejected = error.status === 409;
    }
    if (!lockedRejected) {
      throw new Error("Locked packet update was not rejected.");
    }

    updatedPayload.order.invoiceAmount = "$1,500";
    const revision = await request(baseUrl, `/api/packets/${create.data.id}/revisions`, {
      method: "POST",
      body: JSON.stringify({ data: updatedPayload, reason: "API smoke revision" }),
    }, cookie);
    createdIds.push(revision.data.id);
    if (!/-E1$/i.test(revision.data.contractNumber || "")) {
      throw new Error(`Edit number was not E1 internally: ${revision.data.contractNumber}`);
    }
    const revisionSearch = await request(baseUrl, `/api/packets/search?q=${encodeURIComponent(create.data.id)}`, {}, cookie);
    if (revisionSearch.data.count !== 1 || revisionSearch.data.results[0]?.id !== revision.data.id) {
      throw new Error("Contract search did not collapse edit history to the latest visible record.");
    }
    const baseSearch = await request(baseUrl, `/api/packets/search?q=${encodeURIComponent(createdPacket.contractNumber)}`, {}, cookie);
    const baseMatches = (baseSearch.data.results || []).filter((record) => record.id === revision.data.id);
    if (baseSearch.data.count !== 1 || baseMatches.length !== 1) {
      throw new Error("Contract-number search did not return only the latest edit family record.");
    }

    const duplicateDraftA = await request(baseUrl, "/api/packets", {
      method: "POST",
      body: JSON.stringify(testPacketPayload({
        customer: {
          firstName: "Drafty",
          lastName: "Repeat",
          phone1: "(386) 555-3333",
          email: "drafty-a@example.invalid",
        },
        order: {
          invoiceNumber: "",
          installAddress: "",
          invoiceAmount: "",
        },
      })),
    }, cookie);
    createdIds.push(duplicateDraftA.data.id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const duplicateDraftB = await request(baseUrl, "/api/packets", {
      method: "POST",
      body: JSON.stringify({
        ...testPacketPayload({
          customer: {
            firstName: "Drafty",
            lastName: "Repeat",
            phone1: "(386) 555-3333",
            email: "drafty-b@example.invalid",
          },
          order: {
            invoiceNumber: "",
            installAddress: "",
            invoiceAmount: "",
          },
        }),
        allowDuplicate: true,
      }),
    }, cookie);
    createdIds.push(duplicateDraftB.data.id);
    const duplicateDraftSearch = await request(baseUrl, "/api/packets/search?q=Drafty", {}, cookie);
    if (duplicateDraftSearch.data.count !== 1 || duplicateDraftSearch.data.results[0]?.id !== duplicateDraftB.data.id) {
      throw new Error("Generated duplicate draft records were not collapsed to the newest visible record.");
    }
    if (!duplicateDraftSearch.data.results[0]?.hiddenFamilyRecordCount) {
      throw new Error("Collapsed duplicate draft record did not report hidden history.");
    }

    console.log("API smoke test passed.");
  } finally {
    await Promise.all(createdIds.map(cleanupPacket));
    await cleanupEstimateFixture(estimateFixtureName);
    await close(server);
    process.env.SMTP_HOST = previousSmtpHost;
    process.env.SMTP_TO = previousSmtpTo;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
