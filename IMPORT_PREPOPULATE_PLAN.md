# Import / Prepopulate Plan

This is the planned workflow for loading real Edgewater data into the Contract Portal before final release or after a clean install.

## Goal

Create an admin-only import/prepopulate module that can load existing business data without manually recreating every record.

Priority order:

- Customers
- Suppliers/vendors
- Products
- Estimates
- Existing signed or scanned contracts, if available
- Installers
- Related customer/order documents such as acknowledgements, receipts, delivery forms, and scans

Customers, suppliers, and products are the most important prepopulate data because they make daily lookup, estimate entry, purchasing, and later POS/invoice work faster. Estimates, contracts, installers, and scanned documents can follow after the core lookup data is stable.

## Current Implementation Status

The first preimport version supports CSV/JSON import for:

- Customers
- Suppliers/vendors
- Products

When `DATABASE_URL` is set, these imports are stored in PostgreSQL lookup tables so multiple workstations share the same data. When `DATABASE_URL` is blank, the same import screen falls back to `data/preimport/prepopulate.json`.

Current form usage:

- Imported customers appear in Create Contract customer search and estimate customer lookup.
- Imported suppliers appear in estimate supplier suggestions.
- Imported products appear in estimate cabinet/countertop item-name suggestions.
- Admin Preimport includes document OCR staging for PDFs/images. It can upload documents, scan the incoming folder, run OCR, show extracted text preview, and suggest customer/document fields for review.
- Contract packets are mirrored into PostgreSQL table `contract_packets` when `DATABASE_URL` is set, while JSON/PDF files remain on the server as backup/document storage.
- Estimate records are mirrored into PostgreSQL table `estimate_records` when `DATABASE_URL` is set, while generated estimate PDFs remain server files.
- Contract entry autosave drafts are stored in PostgreSQL table `contract_drafts` when `DATABASE_URL` is set.

Still file-based:

- Generated PDFs
- Settings
- Watched/imported estimate PDF documents
- OCR staged documents and OCR output PDFs under `data/preimport`

## Import Safety Rules

- Always make a server backup before importing.
- Import into a staging/review screen first.
- Do not overwrite existing records silently.
- Detect likely duplicates by normalized name, phone, email, address, invoice/estimate number, and document filename.
- Show duplicate warnings with a clear choice: skip, update/link, import as separate, or import as revision/version where appropriate.
- Keep original source files unchanged.
- OCR may suggest customer name, address, invoice number, estimate number, document date, and document type, but those suggestions must be confirmed by a salesperson/admin before the file is renamed or attached as a live record.
- If a PDF was not created by this program, import should treat it as an external document until a staff person verifies what it is.
- Store who imported the file, when it was imported, source filename/path, and what record it was attached to.
- Imported signed contracts must be locked/read-only unless a new signed revision/addendum is created.
- Test imports should be removable before final release, but production imports should be preserved with audit history.

## Bulk Import Staging

For a rushed pre-live import, do not drop unverified files straight into the live records as final truth.

Use a staging flow:

1. Put incoming PDFs/spreadsheets in an `incoming-import` folder.
2. If the incoming material is in ZIP files, evaluate the ZIP contents first before extracting into the import staging area.
3. Group files by year and document type when possible.
4. For Michelle's planned 2026-forward import, expect receipts, acknowledgements, unknown/mixed documents that need review, and estimates from at least two source types.
5. Keep estimate source type visible during review because RFMS/CabQuotes/LavaCake-style files may not use the same naming or layout.
6. OCR/read the file when possible.
7. Suggest a clean filename and record match.
8. Have the salesperson/admin verify the suggested customer, supplier, product, estimate, contract, date, and document type.
9. Rename/copy the verified file into the correct watched folder.
10. Keep the original in the staging/archive folder for traceability.
11. Mark records imported for testing separately from records imported for production.

Suggested verified filename patterns:

- `Customer-Last-First-PhoneOrAddress.pdf`
- `Estimate-Last-First-YYYYMMDD-EstimateOrInvoice.pdf`
- `Contract-SIGNED-Last-First-YYYYMMDD-Invoice.pdf`
- `Supplier-SupplierName-DocumentType-YYYYMMDD.pdf`
- `Product-Supplier-SKU-Description.pdf`

If there is uncertainty, leave the file in staging with a `REVIEW-` prefix instead of guessing.

## Current Estimate Detection

Right now the portal detects estimate PDFs by scanning the configured estimates folder:

`data/estimates`

or the folder set by:

`ESTIMATES_DIR=...`

Detection is currently filename based. A good filename should include searchable terms:

`Estimate-Last-First-YYYYMMDD-AddressOrInvoice.pdf`

Example:

`Estimate-Edwards-Jamie-20260528-Ridgewood.pdf`

The future import module should create estimate metadata records from these PDFs so staff can search by customer, address, phone, date, estimate number, supplier, or installer instead of relying only on filenames.

## Existing Signed Contracts

For an existing signed customer contract PDF, the import module should ask for:

- Customer name
- Phone
- Email, if available
- Mailing address
- Installation/job address
- Invoice or contract number, if available
- Contract date or signed date
- Status: signed, completed, cancelled, archived, or test/import only
- Related estimate PDF, if available
- The signed PDF file

The module should then create a locked contract record and attach the signed PDF as the original signed customer-visible document.

## Customer Import

Customer import should accept CSV/XLSX or a reviewed manual table with fields such as:

- First name
- Last name
- Phone 1
- Phone 2
- Email
- Mailing address
- Billing address
- Notes
- Communication permissions, if known

Installation address belongs to a contract/job/order, not the customer record.

## Products Import

Product import is for the future products/POS/purchasing side. It should support:

- Product name
- Category
- Supplier/vendor
- SKU/item number, if available
- Unit cost/price, if used
- Taxable default
- Active/archive status
- Notes

Products should not be deleted in normal use. They should be archived/inactive when no longer used.

## Supplier / Vendor Import

Supplier/vendor import should support:

- Supplier/vendor name
- Contact person
- Phone
- Email
- Website/login link, if appropriate
- Address
- Account number, if used
- Sales-tax exemption certificate number/details
- Product categories supplied
- Active/archive status
- Notes

Suppliers should be searchable from estimates, products, purchasing, receiving, and future invoice/job-costing workflows.

Supplier alias note: Rosenthal may appear as Healthier Choice, and Rosenthal is now CIT Group. Treat Rosenthal, Healthier Choice, and CIT Group as alias/match candidates during product, receiving, vendor document, and supplier import review, but keep staff confirmation before merging records.

Receiving workflow requirement: both the Cabinet Store version and the broader/demo version should allow staff to either scan/import handwritten receiving reports or type receiving details manually. OCR/read results must open in a correction/review screen before saving, so staff can fix handwriting or scan errors in store, date, PO/order number, PC, supplier, product/item number, product name/color, description, unit, quantity, cost, amount, freight, entered-by user, status, notes, and customer/order/estimate/contract links.

Receiving/customer-file link requirement: receiving can be entered or scanned from a customer/contract record and should merge into the main receiving records. Main receiving records should also be able to attach back to a customer, contract, estimate, or order when a match is known or later discovered. Customer/job receiving and main receiving must stay bidirectional, so staff can find the same received material from either the customer file or the receiving module.

Contract-page receiving storage rule: receiving/material rows entered from the contract page count as real storable receiving records. They should be saved into the same receiving record pool used by the receiving module, with a source such as `contract_page`, the contract/customer/estimate/order links, entered-by user, and timestamp. When staff later enters or scans receiving from the main receiving screen, the system should compare supplier, PO/order number, estimate/contract/customer link, product/item number, quantity, cost/amount, freight, and received date against existing contract-page receiving rows before saving. If a likely duplicate is found, prompt staff to link/update the existing receiving record, save as a separate receipt, or cancel/review instead of silently creating a duplicate.

Receiving stock handling requirement: receiving lines should support a customer/contract/estimate link for cabinet jobs, plus a showroom/stock/on-hand flag for non-customer orders.

## Installer Import

Installer import should support:

- Installer/company name
- Contact person
- Phone
- Email
- Address
- License/insurance notes
- Active/archive status
- Notes

Installer records should be role-limited when the installer portal is built.

## Document Storage Direction

The server must keep a copy of imported/generated documents so records are available from other machines and protected if a local workstation fails.

Future setup should ask for the customer document root folder, but the server copy remains authoritative for the portal. Local access should be through a shared folder, sync, or mount, not by making a workstation the only copy.

## First Useful Version

The first practical version can be simple:

1. Back up current `data`.
2. Clear test records if requested.
3. Import/review customers.
4. Import/review suppliers.
5. Import/review products.
6. Upload/import estimate PDFs into `data/estimates`.
7. Import one existing signed contract with customer details and attached signed PDF.
8. Link the related estimate PDF if one exists.
9. Confirm it appears in staff search and customer portal where appropriate.

OCR/content reading can come later. The first version should be stable, reviewable, and safe.

## Program Import Ready Package

Michelle referenced a ready package named `PROGRAM_IMPORT_READY_20260603.zip` with folder version `PROGRAM_IMPORT_READY_20260603`. Expected files include products, cabinet pricing supplement, suppliers, customers, receiving report templates, receiving line item templates, field map, validation summary, and README.

Current local status: the package name is known, but the parent folder path was not provided in chat and it was not found in the likely local search locations checked from the portal workspace. Locate the parent path before attempting any import or mapping work.

Project/import storage rule: do not place active project folders or current import packages under `C:\` or OneDrive. Use `F:\ONGOINGPROJECTS\...` for active projects and `E:\...` or `F:\...` for import/export packages unless Michelle explicitly directs otherwise. `C:\...` paths from older chats are historical source references only.

## OCR Build-Out Path

After Michelle uploads the 2026-forward document ZIPs, use OCR/content extraction to build the starting customer, supplier, and product bases.

Available OCR tools:

- Server: `ocrmypdf` is installed through `apt`.
- Windows/local: Tesseract is installed and can be used for local document review before upload.

Preferred flow is to use server-side `ocrmypdf` for scanned PDFs stored with the portal so OCR output is consistent for everyone, then use Windows Tesseract only when Michelle is doing local pre-upload review or testing.

Process:

1. Inspect ZIP contents without importing.
2. Sort or tag files by document type: receipts, acknowledgements, estimates, contracts, supplier documents, unknown/review.
3. OCR/read each PDF where possible.
4. Extract candidate customers from names, addresses, phone numbers, emails, invoice/estimate numbers, and document dates.
5. Extract candidate suppliers from acknowledgements, receipts, vendor documents, and estimate/product source files.
6. Extract candidate products from estimate lines, acknowledgement lines, receipt lines, supplier names, SKUs/item numbers, descriptions, taxable clues, and categories.
7. Produce review CSV/JSON for the Preimport tab instead of writing directly to live records.
8. Have a salesperson/admin verify the generated rows before importing.

The OCR output should be treated as a draft data source, not as final truth.
