const HEADER_PAGES = [5, 9, 14, 15, 16, 17, 18];

const PAGE_LABELS = [
  { id: "customerInformation", page: 1, label: "Customer Information Sheet" },
  { id: "quickMeasurement", page: 2, label: "Quick Measurement Form" },
  { id: "salesEstimate", page: 3, label: "Sales Estimate" },
  { id: "legalDisclaimers", page: 4, label: "Florida Legal Disclaimers" },
  { id: "purchaseAgreement1", page: 5, label: "Purchase Agreement - Page 1/4" },
  { id: "purchaseAgreement2", page: 6, label: "Purchase Agreement - Page 2/4" },
  { id: "purchaseAgreement3", page: 7, label: "Purchase Agreement - Page 3/4" },
  { id: "agreementSignatures", page: 8, label: "Purchase Agreement - Page 4/4" },
  { id: "splitPaymentAddendum", page: 9, label: "Split Payment Addendum" },
  { id: "acknowledgementsReceipts", page: 10, label: "POS Acknowledgements / Receipts" },
  { id: "vendorJobOrders", page: 11, label: "Job Orders to Vendors" },
  { id: "additionalNotes", page: 12, label: "Additional Notes" },
  { id: "materialReceiving", page: 13, label: "Material / Receiving Lines" },
  { id: "chainOfCustody", page: 14, label: "Chain-of-Custody Release" },
  { id: "installerAgreement", page: 15, label: "Installer Job Agreement" },
  { id: "deliveryInstallationChecklist", page: 16, label: "Delivery/Installation Checklist" },
  { id: "deliverySignoff", page: 17, label: "Delivery Signoff Summary" },
  { id: "customerPickupRelease", page: 18, label: "Customer Pickup Release" },
];

const HEADER_FIELDS = [
  { key: "invoiceNumber", x: 71, y: 746, width: 58 },
  { key: "saleDate", x: 180, y: 746, width: 52 },
  { key: "customerHeader", x: 283, y: 746, width: 68 },
  { key: "installerName", x: 394, y: 746, width: 69 },
  { key: "installDate", x: 521, y: 746, width: 54 },
];

const INITIAL_FIELDS = [
  { page: 5, x: 500, y: 434 },
  { page: 5, x: 500, y: 322 },
  { page: 5, x: 500, y: 252 },
  { page: 5, x: 500, y: 159 },
  { page: 5, x: 500, y: 81 },
  { page: 6, x: 500, y: 742 },
  { page: 6, x: 500, y: 634 },
  { page: 6, x: 500, y: 514 },
  { page: 6, x: 500, y: 424 },
  { page: 6, x: 500, y: 193 },
  { page: 7, x: 500, y: 742 },
  { page: 7, x: 500, y: 571 },
  { page: 7, x: 500, y: 375 },
  { page: 7, x: 500, y: 258 },
  { page: 7, x: 500, y: 141 },
  { page: 8, x: 500, y: 742 },
];

const SIGNATURE_SECTIONS = {
  mainAgreement: {
    label: "Customer Material Purchase Agreement",
    signature: { page: 8, x: 158, y: 622, width: 205, height: 34 },
    date: { page: 8, x: 431, y: 636, width: 110, height: 18 },
    printedName: { page: 8, x: 122, y: 606, width: 260, height: 18 },
  },
  splitPayment: {
    label: "Split Payment Addendum",
    signature: { page: 9, x: 148, y: 246, width: 170, height: 30 },
    date: { page: 9, x: 392, y: 258, width: 80, height: 17 },
  },
  materialHandling: {
    label: "Chain-of-Custody Material Handling",
    signature: { page: 14, x: 36, y: 333, width: 250, height: 32 },
    date: { page: 14, x: 324, y: 345, width: 135, height: 17 },
  },
  installChecklist: {
    label: "Material Delivery and Installation Checklist",
    signature: { page: 16, x: 142, y: 150, width: 205, height: 31 },
    date: { page: 16, x: 390, y: 163, width: 84, height: 17 },
  },
  deliverySignoff: {
    label: "Delivery Signoff Summary",
    signature: { page: 17, x: 36, y: 235, width: 250, height: 31 },
    date: { page: 17, x: 324, y: 247, width: 135, height: 17 },
  },
  pickupRelease: {
    label: "Customer Pickup Material Release",
    signature: { page: 18, x: 36, y: 372, width: 250, height: 31 },
    date: { page: 18, x: 324, y: 384, width: 135, height: 17 },
  },
};

const PAGE_2_CHECKS = {
  roomType: {
    kitchen: { x: 99, y: 573 },
    bath: { x: 155, y: 573 },
    laundry: { x: 196, y: 573 },
    other: { x: 255, y: 573 },
  },
  projectType: {
    new: { x: 126, y: 533 },
    remodel: { x: 166, y: 533 },
  },
  hasIsland: {
    yes: { x: 71, y: 402 },
    no: { x: 106, y: 402 },
  },
  dishwasher: {
    standard: { x: 100, y: 298 },
    other: { x: 164, y: 298 },
  },
  cabinetStyle: {
    shaker: { x: 66, y: 230 },
    slab: { x: 118, y: 230 },
    traditional: { x: 158, y: 230 },
    unsure: { x: 229, y: 230 },
  },
  finish: {
    white: { x: 70, y: 204 },
    wood: { x: 116, y: 204 },
    dark: { x: 164, y: 204 },
    custom: { x: 206, y: 204 },
    unsure: { x: 262, y: 204 },
  },
  budgetRange: {
    "$": { x: 159, y: 178 },
    "$$": { x: 182, y: 178 },
    "$$$": { x: 212, y: 178 },
    "$$$$": { x: 248, y: 178 },
  },
};

module.exports = {
  HEADER_FIELDS,
  HEADER_PAGES,
  INITIAL_FIELDS,
  PAGE_LABELS,
  PAGE_2_CHECKS,
  SIGNATURE_SECTIONS,
};
