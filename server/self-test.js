require("dotenv").config();

const fs = require("node:fs/promises");
const { generatedPassword, generatePdf } = require("./pdf");
const { newPacketId } = require("./storage");

async function main() {
  const packet = {
    id: `test-${newPacketId()}`,
    data: {
      customer: {
        firstName: "Test",
        lastName: "Smith",
        phone1: "(386) 555-1234",
        phone2: "",
        email: "test@example.com",
        textOptIn: "yes",
        referral: "Website",
        mailingAddress: "123 Main Street, Edgewater, FL",
        billingAddress: "456 Billing Street, Edgewater, FL",
        notes: "Customer prefers morning calls.",
      },
      order: {
        invoiceNumber: "INV-1001",
        saleDate: "05/22/2026",
        installDate: "06/15/2026",
        installAddress: "123 Main Street\nEdgewater, FL",
        installerName: "Installer Name",
        salesRep: "Sales Rep",
        measurementDate: "05/22/2026",
        storeRep: "Store Rep",
        storeRepTitle: "Manager",
        storeRepDate: "05/22/2026",
        invoiceAmount: "$12,500",
        customerAcceptedDate: "05/22/2026",
      },
      project: {
        roomType: "kitchen",
        roomTypeOther: "",
        projectType: "remodel",
        desiredTimeline: "As soon as materials arrive",
        totalWallLength: "240 inches",
        ceilingHeight: "96 inches",
        hasIsland: "yes",
        islandSize: "72 x 36",
        refrigeratorWidth: "36 inches",
        rangeCooktopSize: "30 inches",
        dishwasher: "standard",
        dishwasherOther: "",
        cabinetStyle: "shaker",
        finish: "white",
        budgetRange: "$$$",
        projectNotes: "Soft close doors and trash pull-out.",
      },
      payments: {
        splitPaymentApproved: true,
        totalInvoiceAmount: "$12,500",
        rows: [
          { amount: "$6,250", dueDate: "05/22/2026", paidInitials: "SR", paidAmountDate: "$6,250 / 5-22" },
          { amount: "$6,250", dueDate: "06/01/2026", paidInitials: "", paidAmountDate: "" },
        ],
      },
      vendors: [
        {
          customerPayment: "$6,250",
          vendor: "Vendor A",
          customerPaymentDate: "05/22/2026",
          vendorEstimateNumber: "ES-123",
          vendorEstimateAmount: "$4,000",
          vendorOrderDate: "05/23/2026",
          expectedMaterialDate: "06/10/2026",
        },
      ],
      materialRows: [
        {
          date: "05/22/2026",
          productCode: "CAB",
          poNumber: "PO-1",
          supplier: "Supplier",
          itemName: "Base Cabinet",
          styleColor: "White",
          unitCount: "4",
          unitCost: "$250",
          total: "$1,000",
          freight: "$50",
        },
      ],
      signing: { sections: ["mainAgreement", "splitPayment"] },
      notes: {
        companyNotes: "Company note for test packet.",
        customerNotes: "",
        internalNotes: "Internal only test note.",
      },
    },
  };

  const password = generatedPassword(packet.data);
  if (password !== "TS1231234") throw new Error(`Unexpected password: ${password}`);

  const signable = await generatePdf(packet, "signable");
  await fs.access(signable.path);

  console.log(`Generated ${signable.path}`);
  console.log(`Password ${signable.password}`);
  await fs.rm(signable.path, { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
