const { Pool } = require("pg");

let pool = null;
let schemaPromise = null;
let databaseDisabledReason = "";
const LEGACY_ESTIMATE_SECTION = ["qu", "ote"].join("");
const SIGNED_CONTRACTS_TABLE = "signed_contracts";

function databaseConfigured() {
  return Boolean(String(process.env.DATABASE_URL || "").trim()) && !databaseDisabledReason;
}

function getPool() {
  if (!databaseConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
    });
  }
  return pool;
}

function disableDatabase(reason = "") {
  databaseDisabledReason = reason || "Database disabled for this process.";
  schemaPromise = null;
  const activePool = pool;
  pool = null;
  if (activePool) {
    activePool.end().catch(() => {});
  }
}

async function query(sql, params = []) {
  const activePool = getPool();
  if (!activePool) return null;
  return activePool.query(sql, params);
}

async function ensureLookupSchema() {
  if (!databaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          lookup_key TEXT UNIQUE NOT NULL,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          phone1 TEXT NOT NULL DEFAULT '',
          phone2 TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          mailing_address TEXT NOT NULL DEFAULT '',
          billing_address TEXT NOT NULL DEFAULT '',
          referral TEXT NOT NULL DEFAULT '',
          text_opt_in TEXT NOT NULL DEFAULT 'yes',
          social_media_tag_consent TEXT NOT NULL DEFAULT '',
          social_media_profile TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          active BOOLEAN NOT NULL DEFAULT true,
          source_name TEXT NOT NULL DEFAULT '',
          imported_at TIMESTAMPTZ,
          imported_by TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS suppliers (
          id TEXT PRIMARY KEY,
          lookup_key TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          contact_name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          website TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          account_number TEXT NOT NULL DEFAULT '',
          tax_exemption_number TEXT NOT NULL DEFAULT '',
          categories TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          active BOOLEAN NOT NULL DEFAULT true,
          source_name TEXT NOT NULL DEFAULT '',
          imported_at TIMESTAMPTZ,
          imported_by TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          lookup_key TEXT UNIQUE NOT NULL,
          product_code TEXT NOT NULL DEFAULT '',
          item_name TEXT NOT NULL DEFAULT '',
          item_type TEXT NOT NULL DEFAULT '',
          item_description TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          supplier TEXT NOT NULL DEFAULT '',
          sku TEXT NOT NULL DEFAULT '',
          item_number TEXT NOT NULL DEFAULT '',
          quantity TEXT NOT NULL DEFAULT '',
          vendor_list_price TEXT NOT NULL DEFAULT '',
          unit_cost TEXT NOT NULL DEFAULT '',
          cost_multiplier TEXT NOT NULL DEFAULT '',
          discount_percent TEXT NOT NULL DEFAULT '',
          markup_percent TEXT NOT NULL DEFAULT '',
          price TEXT NOT NULL DEFAULT '',
          line_total TEXT NOT NULL DEFAULT '',
          taxable BOOLEAN NOT NULL DEFAULT true,
          active BOOLEAN NOT NULL DEFAULT true,
          notes TEXT NOT NULL DEFAULT '',
          source_name TEXT NOT NULL DEFAULT '',
          imported_at TIMESTAMPTZ,
          imported_by TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS installers (
          id TEXT PRIMARY KEY,
          lookup_key TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          store_department TEXT NOT NULL DEFAULT 'both',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          created_by JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_by JSONB NOT NULL DEFAULT '{}'::jsonb,
          raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS import_runs (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          source_name TEXT NOT NULL DEFAULT '',
          imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          imported_by TEXT NOT NULL DEFAULT '',
          imported_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          invalid_count INTEGER NOT NULL DEFAULT 0
        );

        DO $$
        BEGIN
          IF to_regclass('public.contract_packets') IS NOT NULL
             AND to_regclass('public.signed_contracts') IS NULL THEN
            ALTER TABLE contract_packets RENAME TO signed_contracts;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS signed_contracts (
          id TEXT PRIMARY KEY,
          contract_number TEXT NOT NULL DEFAULT '',
          revision_base_contract_number TEXT NOT NULL DEFAULT '',
          revision_number INTEGER NOT NULL DEFAULT 0,
          parent_packet_id TEXT NOT NULL DEFAULT '',
          previous_packet_id TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '',
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          customer_email TEXT NOT NULL DEFAULT '',
          install_address TEXT NOT NULL DEFAULT '',
          invoice_number TEXT NOT NULL DEFAULT '',
          signable_pdf_path TEXT NOT NULL DEFAULT '',
          signable_pdf_sha256 TEXT NOT NULL DEFAULT '',
          final_pdf_path TEXT NOT NULL DEFAULT '',
          final_pdf_sha256 TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          finalized_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          packet_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS estimate_records (
          estimate_id TEXT PRIMARY KEY,
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          customer_email TEXT NOT NULL DEFAULT '',
          customer_address TEXT NOT NULL DEFAULT '',
          estimate_date TEXT NOT NULL DEFAULT '',
          supplier TEXT NOT NULL DEFAULT '',
          installer TEXT NOT NULL DEFAULT '',
          source_quote_filename TEXT NOT NULL DEFAULT '',
          source_quote_path TEXT NOT NULL DEFAULT '',
          source_quote_sha256 TEXT NOT NULL DEFAULT '',
          source_quote_total TEXT NOT NULL DEFAULT '',
          markup_percent TEXT NOT NULL DEFAULT '',
          pdf_filename TEXT NOT NULL DEFAULT '',
          pdf_path TEXT NOT NULL DEFAULT '',
          pdf_sha256 TEXT NOT NULL DEFAULT '',
          deleted BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          estimate_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS contract_drafts (
          id TEXT PRIMARY KEY,
          draft_key TEXT NOT NULL,
          owner_username TEXT NOT NULL DEFAULT '',
          section TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          UNIQUE (draft_key, owner_username)
        );

        CREATE TABLE IF NOT EXISTS staff_users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'salesperson',
          title TEXT NOT NULL DEFAULT '',
          signature_id TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL DEFAULT '',
          must_change_password BOOLEAN NOT NULL DEFAULT false,
          can_manage_users BOOLEAN NOT NULL DEFAULT false,
          disabled BOOLEAN NOT NULL DEFAULT false,
          seeded BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          last_login_at TIMESTAMPTZ,
          created_by TEXT NOT NULL DEFAULT '',
          updated_by TEXT NOT NULL DEFAULT '',
          notifications JSONB NOT NULL DEFAULT '[]'::jsonb,
          raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS customer_accounts (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          last_name_key TEXT NOT NULL DEFAULT '',
          phone_last4 TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL DEFAULT '',
          disabled BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          last_login_at TIMESTAMPTZ,
          raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS portal_settings (
          key TEXT PRIMARY KEY,
          settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS item_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS item_description TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_list_price TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS line_total TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_multiplier TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS markup_percent TEXT NOT NULL DEFAULT '';
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS lookup_key TEXT NOT NULL DEFAULT '';
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS store_department TEXT NOT NULL DEFAULT 'both';
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS created_by JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS updated_by JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE installers ADD COLUMN IF NOT EXISTS raw_json JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS social_media_tag_consent TEXT NOT NULL DEFAULT '';
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS social_media_profile TEXT NOT NULL DEFAULT '';
        ALTER TABLE signed_contracts ADD COLUMN IF NOT EXISTS signable_pdf_sha256 TEXT NOT NULL DEFAULT '';
        ALTER TABLE signed_contracts ADD COLUMN IF NOT EXISTS final_pdf_sha256 TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS source_quote_filename TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS source_quote_path TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS source_quote_sha256 TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS source_quote_total TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS markup_percent TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS pdf_filename TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS pdf_path TEXT NOT NULL DEFAULT '';
        ALTER TABLE estimate_records ADD COLUMN IF NOT EXISTS pdf_sha256 TEXT NOT NULL DEFAULT '';
        ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'salesperson';
        ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
        ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
        ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS signature_id TEXT NOT NULL DEFAULT '';
        CREATE UNIQUE INDEX IF NOT EXISTS staff_users_email_unique
          ON staff_users (lower(email))
          WHERE email <> '';
        CREATE INDEX IF NOT EXISTS installers_lookup_key_idx
          ON installers (lookup_key);
        CREATE INDEX IF NOT EXISTS installers_active_name_idx
          ON installers (active, lower(name));
      `);
      await query(
        "UPDATE contract_drafts SET section = $1 WHERE section = $2",
        ["estimate", LEGACY_ESTIMATE_SECTION],
      );
      return true;
    })();
  }
  return schemaPromise;
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeContractSection(value) {
  const section = clean(value);
  return section === LEGACY_ESTIMATE_SECTION ? "estimate" : section;
}

function keyText(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function phoneDigits(value) {
  return clean(value).replace(/\D/g, "").replace(/^1+/, "").slice(0, 10);
}

function stableId(prefix, key) {
  const crypto = require("node:crypto");
  return `${prefix}-${crypto.createHash("sha1").update(clean(key)).digest("hex").slice(0, 16)}`;
}

function isoOrEmpty(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return clean(value);
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function customerNameFromParts(firstName, lastName, fallback = "") {
  return clean([firstName, lastName].filter(Boolean).join(" ")) || clean(fallback);
}

function lookupKeyForCustomer(record = {}) {
  const name = keyText(record.name || customerNameFromParts(record.firstName, record.lastName));
  const email = keyText(record.email);
  const phone = phoneDigits(record.phone1 || record.phone2 || record.phone);
  const address = keyText(record.mailingAddress || record.billingAddress || record.address);
  if (email && name) return `email:${email}:${name}`;
  if (phone && name) return `phone:${phone}:${name}`;
  if (name && address) return `name-address:${name}:${address}`;
  if (name) return `name:${name}`;
  return "";
}

function linkedRecordKey(record = {}) {
  return [
    clean(record.type),
    clean(record.id),
    clean(record.number),
    clean(record.invoiceNumber),
  ].filter(Boolean).join(":");
}

function mergeLinkedRecords(...lists) {
  const byKey = new Map();
  lists.flat().filter(Boolean).forEach((record) => {
    const key = linkedRecordKey(record);
    if (!key) return;
    byKey.set(key, { ...(byKey.get(key) || {}), ...record });
  });
  return [...byKey.values()].slice(-75);
}

function packetCustomerRecord(packet = {}) {
  const customer = packet.data?.customer || {};
  const order = packet.data?.order || {};
  const name = customerNameFromParts(customer.firstName, customer.lastName);
  const invoiceNumber = clean(order.invoiceNumber);
  const contractNumber = clean(packet.contractNumber || order.contractNumber || invoiceNumber || packet.id);
  const record = {
    id: "",
    firstName: clean(customer.firstName),
    lastName: clean(customer.lastName),
    name,
    phone1: clean(customer.phone1),
    phone2: clean(customer.phone2),
    email: clean(customer.email),
    mailingAddress: clean(customer.mailingAddress || order.installAddress),
    billingAddress: clean(customer.billingAddress),
    referral: clean(customer.referral),
    textOptIn: clean(customer.textOptIn || "yes"),
    socialMediaTagConsent: clean(customer.socialMediaTagConsent),
    socialMediaProfile: clean(customer.socialMediaProfile),
    notes: clean(customer.notes),
    active: true,
    sourceName: "contract",
    importedAt: clean(packet.updatedAt || packet.createdAt) || new Date().toISOString(),
    importedBy: clean(packet.updatedBy?.username || packet.createdBy?.username),
    linkedRecords: mergeLinkedRecords([
      {
        type: "contract",
        id: clean(packet.id),
        number: contractNumber,
        status: clean(packet.status),
        createdAt: clean(packet.createdAt),
        updatedAt: clean(packet.updatedAt || packet.createdAt),
      },
      invoiceNumber ? {
        type: "invoice",
        id: clean(`${packet.id || contractNumber}:invoice:${invoiceNumber}`),
        number: invoiceNumber,
        contractNumber,
        amount: clean(order.invoiceAmount || packet.data?.payments?.totalInvoiceAmount),
        status: clean(packet.status),
        createdAt: clean(packet.createdAt),
        updatedAt: clean(packet.updatedAt || packet.createdAt),
      } : null,
    ]),
  };
  record.key = lookupKeyForCustomer(record);
  record.id = stableId("customer", record.key || `${name}:${record.phone1}:${record.email}`);
  return record.key ? record : null;
}

function estimateCustomerRecord(estimate = {}) {
  const name = clean(estimate.customer);
  const split = name.split(/\s+/);
  const estimateNumber = clean(estimate.estimateNumber || estimate.estimateId);
  const record = {
    id: "",
    firstName: split.length > 1 ? split.slice(0, -1).join(" ") : "",
    lastName: split.length > 1 ? split.at(-1) : name,
    name,
    phone1: clean(estimate.customerPhone),
    phone2: "",
    email: clean(estimate.customerEmail),
    mailingAddress: clean(estimate.customerAddress),
    billingAddress: "",
    referral: "",
    textOptIn: "yes",
    socialMediaTagConsent: "",
    socialMediaProfile: "",
    notes: "",
    active: true,
    sourceName: "estimate",
    importedAt: clean(estimate.updatedAt || estimate.createdAt) || new Date().toISOString(),
    importedBy: "",
    addressParts: {
      street: clean(estimate.customerStreet),
      city: clean(estimate.customerCity),
      state: clean(estimate.customerState),
      zip: clean(estimate.customerZip),
    },
    linkedRecords: mergeLinkedRecords([
      {
        type: "estimate",
        id: clean(estimate.estimateId),
        number: estimateNumber,
        status: clean(estimate.estimateStatus || "draft"),
        createdAt: clean(estimate.createdAt),
        updatedAt: clean(estimate.updatedAt || estimate.createdAt),
      },
    ]),
  };
  record.key = lookupKeyForCustomer(record);
  record.id = stableId("customer", record.key || `${name}:${record.phone1}:${record.email}`);
  return record.key ? record : null;
}

async function removeStaleEstimateCustomerRecords(activeEstimateCustomerKeys = new Set()) {
  if (!databaseConfigured()) return 0;
  await ensureLookupSchema();
  const keys = [...activeEstimateCustomerKeys].filter(Boolean);
  const result = keys.length
    ? await query(
      "DELETE FROM customers WHERE source_name = 'estimate' AND lookup_key <> ALL($1::text[])",
      [keys],
    )
    : await query("DELETE FROM customers WHERE source_name = 'estimate'");
  return result.rowCount || 0;
}

function rowDate(value) {
  return value ? new Date(value).toISOString() : "";
}

function customerFromRow(row) {
  return {
    id: row.id,
    key: row.lookup_key,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    phone1: row.phone1,
    phone2: row.phone2,
    email: row.email,
    mailingAddress: row.mailing_address,
    billingAddress: row.billing_address,
    referral: row.referral,
    textOptIn: row.text_opt_in,
    socialMediaTagConsent: row.social_media_tag_consent,
    socialMediaProfile: row.social_media_profile,
    notes: row.notes,
    active: row.active,
    sourceName: row.source_name,
    importedAt: rowDate(row.imported_at),
    importedBy: row.imported_by,
    linkedRecords: jsonArray(row.raw_json?.linkedRecords),
  };
}

function supplierFromRow(row) {
  return {
    id: row.id,
    key: row.lookup_key,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    accountNumber: row.account_number,
    taxExemptionNumber: row.tax_exemption_number,
    categories: row.categories,
    notes: row.notes,
    active: row.active,
    sourceName: row.source_name,
    importedAt: rowDate(row.imported_at),
    importedBy: row.imported_by,
  };
}

function productFromRow(row) {
  const productCode = clean(row.product_code || row.sku || row.item_number);
  const itemName = clean(row.item_name || row.name);
  const itemType = clean(row.item_type || row.category);
  const itemDescription = clean(row.item_description || row.notes);
  return {
    id: row.id,
    key: row.lookup_key,
    productCode,
    itemName,
    itemType,
    itemDescription,
    name: clean(row.name || itemName),
    category: clean(row.category || itemType),
    supplier: row.supplier,
    sku: clean(row.sku || productCode),
    itemNumber: clean(row.item_number || productCode),
    quantity: row.quantity,
    vendorListPrice: row.vendor_list_price,
    unitCost: row.unit_cost,
    costMultiplier: row.cost_multiplier,
    discountPercent: row.discount_percent,
    markupPercent: row.markup_percent,
    price: row.price,
    lineTotal: row.line_total,
    taxable: row.taxable,
    active: row.active,
    notes: row.notes,
    sourceName: row.source_name,
    importedAt: rowDate(row.imported_at),
    importedBy: row.imported_by,
  };
}

async function listLookupRecords(kind = "") {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();

  if (kind === "customers") {
    const result = await query("SELECT * FROM customers ORDER BY updated_at DESC, name ASC LIMIT 5000");
    return result.rows.map(customerFromRow);
  }
  if (kind === "suppliers") {
    const result = await query("SELECT * FROM suppliers ORDER BY updated_at DESC, name ASC LIMIT 5000");
    return result.rows.map(supplierFromRow);
  }
  if (kind === "products") {
    const result = await query("SELECT * FROM products ORDER BY updated_at DESC, name ASC LIMIT 5000");
    return result.rows.map(productFromRow);
  }

  const [customers, suppliers, products, importRuns] = await Promise.all([
    listLookupRecords("customers"),
    listLookupRecords("suppliers"),
    listLookupRecords("products"),
    query("SELECT * FROM import_runs ORDER BY imported_at DESC LIMIT 50"),
  ]);
  return {
    customers,
    suppliers,
    products,
    importRuns: importRuns.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      sourceName: row.source_name,
      importedAt: rowDate(row.imported_at),
      importedBy: row.imported_by,
      importedCount: row.imported_count,
      skippedCount: row.skipped_count,
      invalidCount: row.invalid_count,
    })),
  };
}

async function insertImportRun(run) {
  await query(
    `INSERT INTO import_runs (id, kind, source_name, imported_at, imported_by, imported_count, skipped_count, invalid_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      run.id,
      run.kind,
      run.sourceName || "",
      run.importedAt,
      run.importedBy || "",
      run.importedCount || 0,
      run.skippedCount || 0,
      run.invalidCount || 0,
    ],
  );
}

async function insertCustomer(record) {
  const result = await query(
    `INSERT INTO customers (
      id, lookup_key, first_name, last_name, name, phone1, phone2, email, mailing_address, billing_address,
      referral, text_opt_in, social_media_tag_consent, social_media_profile, notes, active, source_name, imported_at, imported_by, raw_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (lookup_key) DO NOTHING
    RETURNING *`,
    [
      record.id,
      record.key,
      record.firstName || "",
      record.lastName || "",
      record.name || "",
      record.phone1 || "",
      record.phone2 || "",
      record.email || "",
      record.mailingAddress || "",
      record.billingAddress || "",
      record.referral || "",
      record.textOptIn || "yes",
      record.socialMediaTagConsent || "",
      record.socialMediaProfile || "",
      record.notes || "",
      record.active !== false,
      record.sourceName || "",
      record.importedAt || new Date().toISOString(),
      record.importedBy || "",
      record,
    ],
  );
  return result.rows[0] ? customerFromRow(result.rows[0]) : null;
}

async function insertSupplier(record) {
  const result = await query(
    `INSERT INTO suppliers (
      id, lookup_key, name, contact_name, phone, email, website, address, account_number,
      tax_exemption_number, categories, notes, active, source_name, imported_at, imported_by, raw_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (lookup_key) DO NOTHING
    RETURNING *`,
    [
      record.id,
      record.key,
      record.name || "",
      record.contactName || "",
      record.phone || "",
      record.email || "",
      record.website || "",
      record.address || "",
      record.accountNumber || "",
      record.taxExemptionNumber || "",
      record.categories || "",
      record.notes || "",
      record.active !== false,
      record.sourceName || "",
      record.importedAt || new Date().toISOString(),
      record.importedBy || "",
      record,
    ],
  );
  return result.rows[0] ? supplierFromRow(result.rows[0]) : null;
}

async function insertProduct(record) {
  const result = await query(
    `INSERT INTO products (
      id, lookup_key, product_code, item_name, item_type, item_description, name, category,
      supplier, sku, item_number, quantity, vendor_list_price, unit_cost, cost_multiplier, discount_percent,
      markup_percent, price, line_total, taxable, active,
      notes, source_name, imported_at, imported_by, raw_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    ON CONFLICT (lookup_key) DO NOTHING
    RETURNING *`,
    [
      record.id,
      record.key,
      record.productCode || record.sku || record.itemNumber || "",
      record.itemName || record.name || "",
      record.itemType || record.category || "",
      record.itemDescription || record.notes || "",
      record.name || record.itemName || "",
      record.category || record.itemType || "",
      record.supplier || "",
      record.sku || record.productCode || "",
      record.itemNumber || record.productCode || "",
      record.quantity || "",
      record.vendorListPrice || record.listPrice || "",
      record.unitCost || "",
      record.costMultiplier || "",
      record.discountPercent || "",
      record.markupPercent || record.defaultMarkupPercent || "",
      record.price || "",
      record.lineTotal || "",
      record.taxable !== false,
      record.active !== false,
      record.notes || "",
      record.sourceName || "",
      record.importedAt || new Date().toISOString(),
      record.importedBy || "",
      record,
    ],
  );
  return result.rows[0] ? productFromRow(result.rows[0]) : null;
}

async function insertLookupRecords(kind, records, run) {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const imported = [];
  for (const record of records) {
    let inserted = null;
    if (kind === "customers") inserted = await insertCustomer(record);
    if (kind === "suppliers") inserted = await insertSupplier(record);
    if (kind === "products") inserted = await insertProduct(record);
    if (inserted) imported.push(inserted);
  }
  if (run) {
    await insertImportRun({
      ...run,
      importedCount: imported.length,
      skippedCount: (run.skippedCount || 0) + Math.max(0, records.length - imported.length),
    });
  }
  return imported;
}

async function upsertCustomerRecord(record) {
  if (!databaseConfigured() || !record?.key) return null;
  await ensureLookupSchema();
  const existing = await query("SELECT raw_json FROM customers WHERE lookup_key = $1", [record.key]);
  const mergedRecord = {
    ...record,
    linkedRecords: mergeLinkedRecords(
      existing?.rows?.[0]?.raw_json?.linkedRecords,
      record.linkedRecords,
    ),
  };
  const result = await query(
    `INSERT INTO customers (
      id, lookup_key, first_name, last_name, name, phone1, phone2, email, mailing_address, billing_address,
      referral, text_opt_in, social_media_tag_consent, social_media_profile, notes, active, source_name, imported_at, imported_by, raw_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (lookup_key) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      name = EXCLUDED.name,
      phone1 = COALESCE(NULLIF(EXCLUDED.phone1, ''), customers.phone1),
      phone2 = COALESCE(NULLIF(EXCLUDED.phone2, ''), customers.phone2),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), customers.email),
      mailing_address = COALESCE(NULLIF(EXCLUDED.mailing_address, ''), customers.mailing_address),
      billing_address = COALESCE(NULLIF(EXCLUDED.billing_address, ''), customers.billing_address),
      referral = COALESCE(NULLIF(EXCLUDED.referral, ''), customers.referral),
      text_opt_in = COALESCE(NULLIF(EXCLUDED.text_opt_in, ''), customers.text_opt_in),
      social_media_tag_consent = COALESCE(NULLIF(EXCLUDED.social_media_tag_consent, ''), customers.social_media_tag_consent),
      social_media_profile = COALESCE(NULLIF(EXCLUDED.social_media_profile, ''), customers.social_media_profile),
      notes = COALESCE(NULLIF(EXCLUDED.notes, ''), customers.notes),
      active = EXCLUDED.active,
      source_name = EXCLUDED.source_name,
      imported_at = EXCLUDED.imported_at,
      imported_by = COALESCE(NULLIF(EXCLUDED.imported_by, ''), customers.imported_by),
      updated_at = now(),
      raw_json = EXCLUDED.raw_json
    RETURNING *`,
    [
      mergedRecord.id,
      mergedRecord.key,
      mergedRecord.firstName || "",
      mergedRecord.lastName || "",
      mergedRecord.name || "",
      mergedRecord.phone1 || "",
      mergedRecord.phone2 || "",
      mergedRecord.email || "",
      mergedRecord.mailingAddress || "",
      mergedRecord.billingAddress || "",
      mergedRecord.referral || "",
      mergedRecord.textOptIn || "yes",
      mergedRecord.socialMediaTagConsent || "",
      mergedRecord.socialMediaProfile || "",
      mergedRecord.notes || "",
      mergedRecord.active !== false,
      mergedRecord.sourceName || "",
      mergedRecord.importedAt || new Date().toISOString(),
      mergedRecord.importedBy || "",
      mergedRecord,
    ],
  );
  return result.rows[0] ? customerFromRow(result.rows[0]) : null;
}

async function upsertProductRecord(record) {
  if (!databaseConfigured() || !record?.key) return null;
  await ensureLookupSchema();
  const result = await query(
    `INSERT INTO products (
      id, lookup_key, product_code, item_name, item_type, item_description, name, category,
      supplier, sku, item_number, quantity, vendor_list_price, unit_cost, cost_multiplier, discount_percent,
      markup_percent, price, line_total, taxable, active,
      notes, source_name, imported_at, imported_by, raw_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    ON CONFLICT (lookup_key) DO UPDATE SET
      product_code = COALESCE(NULLIF(EXCLUDED.product_code, ''), products.product_code),
      item_name = COALESCE(NULLIF(EXCLUDED.item_name, ''), products.item_name),
      item_type = COALESCE(NULLIF(EXCLUDED.item_type, ''), products.item_type),
      item_description = COALESCE(NULLIF(EXCLUDED.item_description, ''), products.item_description),
      name = COALESCE(NULLIF(EXCLUDED.name, ''), products.name),
      category = COALESCE(NULLIF(EXCLUDED.category, ''), products.category),
      supplier = COALESCE(NULLIF(EXCLUDED.supplier, ''), products.supplier),
      sku = COALESCE(NULLIF(EXCLUDED.sku, ''), products.sku),
      item_number = COALESCE(NULLIF(EXCLUDED.item_number, ''), products.item_number),
      quantity = COALESCE(NULLIF(EXCLUDED.quantity, ''), products.quantity),
      vendor_list_price = COALESCE(NULLIF(EXCLUDED.vendor_list_price, ''), products.vendor_list_price),
      unit_cost = COALESCE(NULLIF(EXCLUDED.unit_cost, ''), products.unit_cost),
      cost_multiplier = COALESCE(NULLIF(EXCLUDED.cost_multiplier, ''), products.cost_multiplier),
      discount_percent = COALESCE(NULLIF(EXCLUDED.discount_percent, ''), products.discount_percent),
      markup_percent = COALESCE(NULLIF(EXCLUDED.markup_percent, ''), products.markup_percent),
      price = COALESCE(NULLIF(EXCLUDED.price, ''), products.price),
      line_total = COALESCE(NULLIF(EXCLUDED.line_total, ''), products.line_total),
      taxable = EXCLUDED.taxable,
      active = EXCLUDED.active,
      notes = COALESCE(NULLIF(EXCLUDED.notes, ''), products.notes),
      source_name = EXCLUDED.source_name,
      imported_at = EXCLUDED.imported_at,
      imported_by = COALESCE(NULLIF(EXCLUDED.imported_by, ''), products.imported_by),
      updated_at = now(),
      raw_json = EXCLUDED.raw_json
    RETURNING *`,
    [
      record.id,
      record.key,
      record.productCode || record.sku || record.itemNumber || "",
      record.itemName || record.name || "",
      record.itemType || record.category || "",
      record.itemDescription || record.notes || "",
      record.name || record.itemName || "",
      record.category || record.itemType || "",
      record.supplier || "",
      record.sku || record.productCode || "",
      record.itemNumber || record.productCode || "",
      record.quantity || "",
      record.vendorListPrice || record.listPrice || "",
      record.unitCost || "",
      record.costMultiplier || "",
      record.discountPercent || "",
      record.markupPercent || record.defaultMarkupPercent || "",
      record.price || "",
      record.lineTotal || "",
      record.taxable !== false,
      record.active !== false,
      record.notes || "",
      record.sourceName || "",
      record.importedAt || new Date().toISOString(),
      record.importedBy || "",
      record,
    ],
  );
  return result.rows[0] ? productFromRow(result.rows[0]) : null;
}

function packetDbFields(packet = {}) {
  const data = packet.data || {};
  const customer = data.customer || {};
  const order = data.order || {};
  const name = customerNameFromParts(customer.firstName, customer.lastName);
  return {
    id: clean(packet.id),
    contractNumber: clean(packet.contractNumber || order.invoiceNumber || packet.id),
    revisionBaseContractNumber: clean(packet.revisionBaseContractNumber || packet.contractNumber || order.invoiceNumber || packet.id),
    revisionNumber: Number(packet.revisionNumber || 0),
    parentPacketId: clean(packet.parentPacketId),
    previousPacketId: clean(packet.previousPacketId),
    status: clean(packet.status),
    customerName: name,
    customerPhone: clean(customer.phone1 || customer.phone2),
    customerEmail: clean(customer.email),
    installAddress: clean(order.installAddress || customer.mailingAddress || customer.billingAddress),
    invoiceNumber: clean(order.invoiceNumber),
    signablePdfPath: clean(packet.signablePdfPath),
    signablePdfSha256: clean(packet.signablePdfSha256),
    finalPdfPath: clean(packet.finalPdfPath),
    finalPdfSha256: clean(packet.finalPdfSha256),
    createdAt: clean(packet.createdAt) || null,
    updatedAt: clean(packet.updatedAt || packet.createdAt) || null,
    finalizedAt: clean(packet.finalizedAt) || null,
    completedAt: clean(packet.completedAt) || null,
  };
}

async function savePacketRecord(packet) {
  if (!databaseConfigured() || !packet?.id) return null;
  await ensureLookupSchema();
  const fields = packetDbFields(packet);
  await query(
    `INSERT INTO ${SIGNED_CONTRACTS_TABLE} (
      id, contract_number, revision_base_contract_number, revision_number, parent_packet_id, previous_packet_id,
      status, customer_name, customer_phone, customer_email, install_address, invoice_number,
      signable_pdf_path, signable_pdf_sha256, final_pdf_path, final_pdf_sha256,
      created_at, updated_at, finalized_at, completed_at, packet_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (id) DO UPDATE SET
      contract_number = EXCLUDED.contract_number,
      revision_base_contract_number = EXCLUDED.revision_base_contract_number,
      revision_number = EXCLUDED.revision_number,
      parent_packet_id = EXCLUDED.parent_packet_id,
      previous_packet_id = EXCLUDED.previous_packet_id,
      status = EXCLUDED.status,
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_email = EXCLUDED.customer_email,
      install_address = EXCLUDED.install_address,
      invoice_number = EXCLUDED.invoice_number,
      signable_pdf_path = EXCLUDED.signable_pdf_path,
      signable_pdf_sha256 = EXCLUDED.signable_pdf_sha256,
      final_pdf_path = EXCLUDED.final_pdf_path,
      final_pdf_sha256 = EXCLUDED.final_pdf_sha256,
      created_at = COALESCE(${SIGNED_CONTRACTS_TABLE}.created_at, EXCLUDED.created_at),
      updated_at = EXCLUDED.updated_at,
      finalized_at = EXCLUDED.finalized_at,
      completed_at = EXCLUDED.completed_at,
      packet_json = EXCLUDED.packet_json`,
    [
      fields.id,
      fields.contractNumber,
      fields.revisionBaseContractNumber,
      fields.revisionNumber,
      fields.parentPacketId,
      fields.previousPacketId,
      fields.status,
      fields.customerName,
      fields.customerPhone,
      fields.customerEmail,
      fields.installAddress,
      fields.invoiceNumber,
      fields.signablePdfPath,
      fields.signablePdfSha256,
      fields.finalPdfPath,
      fields.finalPdfSha256,
      fields.createdAt,
      fields.updatedAt,
      fields.finalizedAt,
      fields.completedAt,
      packet,
    ],
  );
  const customer = packetCustomerRecord(packet);
  if (customer) await upsertCustomerRecord(customer);
  return packet;
}

async function loadPacketRecord(id) {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query(`SELECT packet_json FROM ${SIGNED_CONTRACTS_TABLE} WHERE id = $1`, [id]);
  return result.rows[0]?.packet_json || null;
}

async function listPacketRecords() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query(`SELECT packet_json FROM ${SIGNED_CONTRACTS_TABLE} ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`);
  return result.rows.map((row) => row.packet_json).filter(Boolean);
}

function estimateDbFields(estimate = {}) {
  return {
    estimateId: clean(estimate.estimateId),
    customerName: clean(estimate.customer),
    customerPhone: clean(estimate.customerPhone),
    customerEmail: clean(estimate.customerEmail),
    customerAddress: clean(estimate.customerAddress),
    estimateDate: clean(estimate.estimateDate),
    supplier: clean(estimate.supplier),
    installer: clean(estimate.installer),
    sourceQuoteFilename: clean(estimate.sourceQuoteFilename || estimate.vendorQuoteFilename),
    sourceQuotePath: clean(estimate.sourceQuotePath || estimate.vendorQuotePath),
    sourceQuoteSha256: clean(estimate.sourceQuoteSha256 || estimate.vendorQuoteSha256),
    sourceQuoteTotal: clean(estimate.sourceQuoteTotal || estimate.vendorQuoteTotal),
    markupPercent: clean(estimate.markupPercent || estimate.customerMarkupPercent),
    pdfFilename: clean(estimate.pdfFilename || estimate.pdfFileName || estimate.generatedPdfFilename),
    pdfPath: clean(estimate.pdfPath || estimate.generatedPdfPath),
    pdfSha256: clean(estimate.pdfSha256 || estimate.generatedPdfSha256),
    deleted: Boolean(estimate.deleted),
    createdAt: clean(estimate.createdAt) || null,
    updatedAt: clean(estimate.updatedAt || estimate.createdAt) || null,
  };
}

function productRecordFromEstimateItem(estimate, item) {
  if (item?.saveForLookup !== true) return null;
  const name = clean(item?.label);
  if (!name) return null;
  const supplier = clean(item.productSupplier || estimate.supplier);
  const productCode = clean(item.productCode);
  const category = clean(item.itemType || estimate.styleDescription || "Cabinets / Countertops");
  const key = productCode
    ? `product-code:${keyText(productCode)}`
    : supplier
      ? `product-name:${keyText(supplier)}:${keyText(name)}:${keyText(category)}`
      : `product-name:${keyText(name)}:${keyText(category)}`;
  const amount = clean(item.amount);
  return {
    id: stableId("product", key),
    key,
    productCode,
    itemName: name,
    itemType: category,
    itemDescription: clean(item.itemDescription),
    name,
    category,
    supplier,
    sku: productCode,
    itemNumber: productCode,
    quantity: "1",
    vendorListPrice: clean(item.vendorListPrice || item.listPrice),
    unitCost: clean(item.unitCost),
    costMultiplier: clean(item.costMultiplier),
    discountPercent: clean(item.discountPercent),
    markupPercent: clean(item.markupPercent),
    price: amount,
    lineTotal: amount,
    taxable: item.taxable !== false,
    active: true,
    notes: "",
    sourceName: "estimate",
    importedAt: clean(estimate.updatedAt || estimate.createdAt) || new Date().toISOString(),
    importedBy: "",
  };
}

async function saveEstimateRecords(estimates = []) {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const activeEstimateCustomerKeys = new Set();
  for (const estimate of estimates) {
    if (!estimate?.estimateId) continue;
    const fields = estimateDbFields(estimate);
    await query(
      `INSERT INTO estimate_records (
        estimate_id, customer_name, customer_phone, customer_email, customer_address, estimate_date,
        supplier, installer, source_quote_filename, source_quote_path, source_quote_sha256, source_quote_total,
        markup_percent, pdf_filename, pdf_path, pdf_sha256, deleted, created_at, updated_at, estimate_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (estimate_id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_phone = EXCLUDED.customer_phone,
        customer_email = EXCLUDED.customer_email,
        customer_address = EXCLUDED.customer_address,
        estimate_date = EXCLUDED.estimate_date,
        supplier = EXCLUDED.supplier,
        installer = EXCLUDED.installer,
        source_quote_filename = EXCLUDED.source_quote_filename,
        source_quote_path = EXCLUDED.source_quote_path,
        source_quote_sha256 = EXCLUDED.source_quote_sha256,
        source_quote_total = EXCLUDED.source_quote_total,
        markup_percent = EXCLUDED.markup_percent,
        pdf_filename = EXCLUDED.pdf_filename,
        pdf_path = EXCLUDED.pdf_path,
        pdf_sha256 = EXCLUDED.pdf_sha256,
        deleted = EXCLUDED.deleted,
        created_at = COALESCE(estimate_records.created_at, EXCLUDED.created_at),
        updated_at = EXCLUDED.updated_at,
        estimate_json = EXCLUDED.estimate_json`,
      [
        fields.estimateId,
        fields.customerName,
        fields.customerPhone,
        fields.customerEmail,
        fields.customerAddress,
        fields.estimateDate,
        fields.supplier,
        fields.installer,
        fields.sourceQuoteFilename,
        fields.sourceQuotePath,
        fields.sourceQuoteSha256,
        fields.sourceQuoteTotal,
        fields.markupPercent,
        fields.pdfFilename,
        fields.pdfPath,
        fields.pdfSha256,
        fields.deleted,
        fields.createdAt,
        fields.updatedAt,
        estimate,
      ],
    );
    const customer = estimateCustomerRecord(estimate);
    if (customer) {
      activeEstimateCustomerKeys.add(customer.key);
      await upsertCustomerRecord(customer);
    }
    for (const item of Array.isArray(estimate.cabinetItems) ? estimate.cabinetItems : []) {
      const product = productRecordFromEstimateItem(estimate, item);
      if (product) await upsertProductRecord(product);
    }
  }
  await removeStaleEstimateCustomerRecords(activeEstimateCustomerKeys);
  return true;
}

async function listEstimateRecords() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query("SELECT estimate_json FROM estimate_records ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST");
  return result.rows.map((row) => row.estimate_json).filter(Boolean);
}

async function saveContractDraft({ draftKey, ownerUsername, section, draft }) {
  if (!databaseConfigured() || !draftKey) return null;
  await ensureLookupSchema();
  const id = stableId("draft", `${draftKey}:${ownerUsername || ""}`);
  const owner = clean(ownerUsername);
  await query(
    `INSERT INTO contract_drafts (id, draft_key, owner_username, section, draft_json)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (draft_key, owner_username) DO UPDATE SET
       section = EXCLUDED.section,
       updated_at = now(),
       draft_json = EXCLUDED.draft_json`,
    [id, clean(draftKey), owner, normalizeContractSection(section), draft || {}],
  );
  let prunedDraftCount = 0;
  if (owner) {
    const deleteResult = await query(
      "DELETE FROM contract_drafts WHERE owner_username = $1 AND id <> $2",
      [owner, id],
    );
    prunedDraftCount = deleteResult.rowCount || 0;
  }
  return { id, draftKey: clean(draftKey), ownerUsername: owner, section: normalizeContractSection(section), prunedDraftCount };
}

async function deleteContractDraftsForOwner(ownerUsername = "") {
  if (!databaseConfigured()) return 0;
  const owner = clean(ownerUsername);
  if (!owner) return 0;
  await ensureLookupSchema();
  const result = await query(
    "DELETE FROM contract_drafts WHERE owner_username = $1",
    [owner],
  );
  return result.rowCount || 0;
}

async function listContractDrafts(ownerUsername = "") {
  if (!databaseConfigured()) return [];
  await ensureLookupSchema();
  const owner = clean(ownerUsername);
  const result = owner
    ? await query(
      `SELECT id, draft_key, owner_username, section, created_at, updated_at, draft_json
       FROM contract_drafts
       WHERE owner_username = $1
       ORDER BY updated_at DESC NULLS LAST`,
      [owner],
    )
    : await query(
      `SELECT id, draft_key, owner_username, section, created_at, updated_at, draft_json
       FROM contract_drafts
       ORDER BY updated_at DESC NULLS LAST`,
    );

  return result.rows.map((row) => ({
    id: row.id,
    draftKey: row.draft_key,
    ownerUsername: row.owner_username,
    section: normalizeContractSection(row.section),
    createdAt: isoOrEmpty(row.created_at),
    updatedAt: isoOrEmpty(row.updated_at),
    draft: row.draft_json || {},
  }));
}

async function loadContractDraft(id, ownerUsername = "") {
  if (!databaseConfigured() || !id) return null;
  await ensureLookupSchema();
  const owner = clean(ownerUsername);
  const result = owner
    ? await query(
      `SELECT id, draft_key, owner_username, section, created_at, updated_at, draft_json
       FROM contract_drafts
       WHERE id = $1 AND owner_username = $2
       LIMIT 1`,
      [clean(id), owner],
    )
    : await query(
      `SELECT id, draft_key, owner_username, section, created_at, updated_at, draft_json
       FROM contract_drafts
       WHERE id = $1
       LIMIT 1`,
      [clean(id)],
    );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    draftKey: row.draft_key,
    ownerUsername: row.owner_username,
    section: normalizeContractSection(row.section),
    createdAt: isoOrEmpty(row.created_at),
    updatedAt: isoOrEmpty(row.updated_at),
    draft: row.draft_json || {},
  };
}

function dateOrNull(value) {
  const text = clean(value);
  return text ? text : null;
}

function dbStaffUser(row) {
  const raw = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  const role = clean(raw.role || (row.created_by === "first-run-setup" ? "admin" : row.can_manage_users ? "sales_manager" : row.role));
  return {
    ...raw,
    id: row.id,
    username: row.username,
    email: clean(row.email || raw.email),
    name: row.name,
    role: role || "salesperson",
    title: clean(row.title || raw.title),
    signatureId: clean(row.signature_id || raw.signatureId),
    passwordHash: row.password_hash,
    mustChangePassword: Boolean(row.must_change_password),
    canManageUsers: Boolean(row.can_manage_users),
    disabled: Boolean(row.disabled),
    seeded: Boolean(row.seeded),
    createdAt: isoOrEmpty(row.created_at),
    updatedAt: isoOrEmpty(row.updated_at),
    lastLoginAt: isoOrEmpty(row.last_login_at),
    createdBy: row.created_by || raw.createdBy || "",
    updatedBy: row.updated_by || raw.updatedBy || "",
    notifications: jsonArray(row.notifications),
  };
}

function dbCustomerAccount(row) {
  const raw = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  return {
    ...raw,
    id: row.id,
    email: row.email,
    name: row.name,
    lastNameKey: row.last_name_key,
    phoneLast4: row.phone_last4,
    passwordHash: row.password_hash,
    disabled: Boolean(row.disabled),
    createdAt: isoOrEmpty(row.created_at),
    updatedAt: isoOrEmpty(row.updated_at),
    lastLoginAt: isoOrEmpty(row.last_login_at),
  };
}

async function loadUsersStoreFromDb() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const [staffResult, customerResult] = await Promise.all([
    query("SELECT * FROM staff_users ORDER BY name ASC, username ASC"),
    query("SELECT * FROM customer_accounts ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST"),
  ]);
  return {
    version: 1,
    staff: staffResult.rows.map(dbStaffUser),
    customers: customerResult.rows.map(dbCustomerAccount),
  };
}

async function saveUsersStoreToDb(store = {}) {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const activePool = getPool();
  const client = await activePool.connect();
  try {
    await client.query("BEGIN");
    for (const user of Array.isArray(store.staff) ? store.staff : []) {
      const id = clean(user.id) || stableId("staff", user.username || user.name);
      const username = clean(user.username).toLowerCase().replace(/[^a-z0-9._-]/g, "");
      const email = clean(user.email).toLowerCase();
      if (!id || !username) continue;
      const raw = { ...user, id, username, email };
      await client.query(
        `INSERT INTO staff_users (
          id, username, email, name, role, title, signature_id, password_hash, must_change_password, can_manage_users,
          disabled, seeded, created_at, updated_at, last_login_at, created_by, updated_by,
          notifications, raw_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          title = EXCLUDED.title,
          signature_id = EXCLUDED.signature_id,
          password_hash = EXCLUDED.password_hash,
          must_change_password = EXCLUDED.must_change_password,
          can_manage_users = EXCLUDED.can_manage_users,
          disabled = EXCLUDED.disabled,
          seeded = EXCLUDED.seeded,
          created_at = COALESCE(staff_users.created_at, EXCLUDED.created_at),
          updated_at = EXCLUDED.updated_at,
          last_login_at = EXCLUDED.last_login_at,
          created_by = COALESCE(NULLIF(staff_users.created_by, ''), EXCLUDED.created_by),
          updated_by = EXCLUDED.updated_by,
          notifications = EXCLUDED.notifications,
          raw_json = EXCLUDED.raw_json`,
        [
          id,
          username,
          email,
          clean(user.name),
          clean(user.role || (user.canManageUsers ? "sales_manager" : "salesperson")),
          clean(user.title),
          clean(user.signatureId),
          clean(user.passwordHash),
          Boolean(user.mustChangePassword),
          Boolean(user.canManageUsers),
          Boolean(user.disabled),
          Boolean(user.seeded),
          dateOrNull(user.createdAt),
          dateOrNull(user.updatedAt),
          dateOrNull(user.lastLoginAt),
          clean(user.createdBy),
          clean(user.updatedBy),
          jsonArray(user.notifications),
          raw,
        ],
      );
    }

    for (const account of Array.isArray(store.customers) ? store.customers : []) {
      const email = clean(account.email).toLowerCase();
      if (!email) continue;
      const id = clean(account.id) || stableId("cust", email);
      const raw = { ...account, id, email };
      await client.query(
        `INSERT INTO customer_accounts (
          id, email, name, last_name_key, phone_last4, password_hash, disabled,
          created_at, updated_at, last_login_at, raw_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          last_name_key = EXCLUDED.last_name_key,
          phone_last4 = EXCLUDED.phone_last4,
          password_hash = EXCLUDED.password_hash,
          disabled = EXCLUDED.disabled,
          created_at = COALESCE(customer_accounts.created_at, EXCLUDED.created_at),
          updated_at = EXCLUDED.updated_at,
          last_login_at = EXCLUDED.last_login_at,
          raw_json = EXCLUDED.raw_json`,
        [
          id,
          email,
          clean(account.name),
          clean(account.lastNameKey),
          clean(account.phoneLast4),
          clean(account.passwordHash),
          Boolean(account.disabled),
          dateOrNull(account.createdAt),
          dateOrNull(account.updatedAt),
          dateOrNull(account.lastLoginAt),
          raw,
        ],
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadBusinessSettingsFromDb() {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  const result = await query("SELECT settings_json FROM portal_settings WHERE key = $1", ["business"]);
  return result.rows[0]?.settings_json || null;
}

async function saveBusinessSettingsToDb(settings = {}) {
  if (!databaseConfigured()) return null;
  await ensureLookupSchema();
  await query(
    `INSERT INTO portal_settings (key, settings_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET
       settings_json = EXCLUDED.settings_json,
       updated_at = now()`,
    ["business", settings],
  );
  return true;
}

module.exports = {
  databaseConfigured,
  deleteContractDraftsForOwner,
  disableDatabase,
  ensureLookupSchema,
  insertLookupRecords,
  listEstimateRecords,
  listContractDrafts,
  loadContractDraft,
  listLookupRecords,
  loadBusinessSettingsFromDb,
  listPacketRecords,
  loadUsersStoreFromDb,
  loadPacketRecord,
  query,
  saveContractDraft,
  saveBusinessSettingsToDb,
  saveEstimateRecords,
  savePacketRecord,
  saveUsersStoreToDb,
};
