# Edgewater Contract Portal Summary

The umbrella system name is **Contract Portal**. Customer portal, employee portal, installer portal, delivery-driver signing, and future role-specific tools are views/workflows inside the larger Contract Portal.

Customer-facing account/document access should move to `customers.edgefam.com` when that side is active. The first customer portal scope is intentionally narrow: customers see only assigned estimates from this system, assigned customer-visible contract pages/documents from this system, assigned RFMS acknowledgements/invoices, and assigned RFMS receipts, plus a question/concern message path to `edgewatercabinetstore@gmail.com`. Native invoices, native receipts, full payment history, and account status are planned expansions, not all live customer features yet.

Customer account maintenance is planned but should not be exposed as a full dashboard until history/search is handled correctly. Customers should be able to update email, addresses, second contact/name, phone numbers, and password, while old contact values remain searchable as aliases/history. Registration from a document should default to the email address the document was sent to. Customer Google login/OAuth and CAPTCHA/bot protection belong in the later public-account phase.

Payment bridge: after assigned estimates/contracts/RFMS acknowledgements/RFMS receipts work reliably, add a lightweight paid-status tracker so Jamie can mark an order paid even if RFMS handled the actual payment. First pass should capture amount, payment method, payment date, reference/receipt number, notes, and optional RFMS receipt upload/attachment.

Release guard: do not release native invoice/payment posting yet. The current product should focus on independent estimates, independent contracts, and the explicit Start Contract From Accepted Estimate flow. RFMS acknowledgements and receipts can be attached as customer-visible bridge documents until native invoice/receipt generation is ready.

Future cash calculator: before native invoice/payment release, add a controlled cash-target/cash-discount calculator that records the customer-facing discount, tax calculation, cash received, approval/review status, and petty-cash/cash-drawer reconciliation details for the superadmin/financial person. Keep this separate from supplier/dealer cost discounts, catalog multipliers, and internal margin/markup rules.

Custom cabinet control requirement: future financial/customer-order reporting must reconcile income, customer orders/contracts, RFMS acknowledgements/invoices, RFMS receipts, native future receipts/payments, and receiving/material records so unmatched or duplicate income/receiving can be reviewed.

UI design direction is documented in `INTERNAL_OPERATIONS_UI_BRIEF.md`. Future UI work should follow that internal operations / RFMS-style business application brief unless Michelle asks for a different style.

PDF/live-preview output rules are documented in `PDF_OUTPUT_STANDARD.md`. Live previews are staff guidance; generated PDFs are the official print/save/email/customer documents.

Import/prepopulate planning is documented in `IMPORT_PREPOPULATE_PLAN.md`. The future admin import module should handle customers, estimates, existing signed/scanned contracts, products, installers, and related documents with backup, staging review, duplicate detection, and audit history.

Security lockdown planning is documented in `SECURITY_LOCKDOWN_PLAN.md`. After the current deploy is healthy, use that checklist to lock public access to HTTPS/Nginx, keep PostgreSQL and Node private, rotate temporary secrets, verify backups, and separate future financial systems behind private staff-only access.

Current priority order from Michelle, 2026-06-08:

1. Stabilize and verify the current contract, estimate, customer signing, and staff login flow.
2. Clean up customer records so one customer does not split into duplicate active records.
3. Build installer accounts next, then group installer details under the installer account/profile.
4. Add customer portal basics next: assigned estimates, invoices/acknowledgements, payment proof or paid status, signed contracts, and customer-visible documents. This does not need to be a full dashboard yet.
5. Add a near-term paid-status bridge for Jamie/store staff to mark paid status, amount, and date. Native finance/invoice/payment posting stays much later.
6. Security lockdown is vital soon before installer/customer links are broadly shared.
7. Customer photos come after customer portal basics are stable. Receiving/vendor scan/upload/email processing comes later. UI layout cleanup is last.

## What We Have Built So Far

This is a basic working portal for creating and signing customer cabinet packets.

- Store employees log in before using the portal.
- The portal login page now uses a normal vertical login layout with Admin / Store Staff selected and Registered Customer shown as planned.
- Store employees now land on an admin menu instead of directly inside the contract form.
- The admin menu keeps Settings and Logout in the top bar, then presents Create Contract, View Contract, and Print Contract Pages as the main choices.
- Print Contract Pages lets staff select blank packet pages and open a printable PDF for handwritten signatures or the paper file.
- Admin and customer-facing work pages now have Back, Forward, Home, and Exit navigation.
- On first run, the admin menu asks whether the store rep wants to enter store information, logo, and signature now.
- Store employees fill out the customer packet from a sectioned web form so the entry page is less overwhelming.
- The confusing top Generate button was removed from the contract form. Save/generate actions now live in a bottom Finish Or Exit section.
- Create Contract starts with Step 1: Customer Information Sheet.
- After Step 1, the screen asks whether to complete Quick Measurement, skip it, or stop for now.
- After Step 2, the screen prompts for the Sales Estimate.
- The estimate step links to the current CabQuotes2 estimate tool, records the RFMS/CabQuotes/LavaCake source, and can manually attach an estimate PDF as page 3.
- Store records and customer order cards can show a separate View Estimate link when an estimate PDF or safe estimate URL is available.
- Downloaded and emailed contract PDFs now use readable names like `CONTRACT-LAST-YYYYMMDD-ESTNUM.pdf`, with the estimate number included when available.
- The customer portal is for finalized customer-visible documents. The store/admin version keeps the full workflow, source data, edit history, internal attachments, and operational records.
- Initial customer signing defaults now exclude in-house customer information and quick measurement pages. The customer signing packet focuses on the estimate, legal/disclaimer page, purchase agreement pages, agreement signatures, and split-payment addendum only when needed.
- After the initial contract signature section, the store rep is asked whether Detachable Addendum A for split payment is needed.
- Addendum A/page 9 is included only when the store rep says it is needed.
- Vendor Orders/Page 11 now has a workflow note that it can be manually entered now and later filled from attached/generated documents.
- Material Lines/Receiving now has a workflow note for manual entry now and scan/import later.
- Vendor, receiving, and release/support sections now show not-stable-yet notices telling staff to keep paper copies and not rely on those sections as official records until tested and approved.
- Store employees can choose which PDF pages to include or remove.
- Packet choices are now described as named sections, not just page numbers. Template page numbers are only the current PDF placement map.
- The saved packet record includes stable section IDs so future attachments do not have to be identified by whatever page number they land on after the final PDF is assembled.
- Customer portal order cards now show final packet sections by name with a simple status, including signed/unsigned purchase agreement sections and installer-signature status when installer pages are included.
- Page 4 is forced into generated PDFs even if someone tries to remove it.
- Vendor job orders and receiving/material paperwork are protected as internal pages and are not included in customer-facing PDFs.
- Receiving/material rows entered from the contract page should count as real receiving records for internal storage. Later receiving entries from the main receiving screen should be compared against those contract-page records so staff is prompted before creating duplicate receiving.
- Customer-facing final packet pages can include POS acknowledgements/receipts, signed installer agreement, Exhibit A when used, delivery signoff, pickup release, customer checklist pages, and other applicable release/checklist pages.
- Customer names are cleaned up on save so first and last names display with normal capitalization.
- Customer information now separates mailing address and billing address.
- Job/contract information has its own installation address, with buttons to copy from mailing or billing if needed.
- The first page is now centered as EWCS / Contract Portal with choices for Customers, Installers, and Store. Customers open the current customer lookup, Store opens staff login, and Installer is held for a future portal.
- The system creates a password-protected PDF.
- Customer-facing screens tell customers to use the password provided by the store representative instead of explaining the temporary password structure.
- A how-to-use guide now explains that store reps provide the packet password. The current staff-only temporary pattern is first 4 letters of last name, street/building number, and last 4 phone digits.
- Customer signing-link emails no longer include the password in the same message as the signing link.
- The customer can open a signing link.
- A customer can also log in from the portal start page using last name and the portal password provided by the store.
- Customers have a simple portal page showing packet/order records and payment schedule information from the packet.
- Customer portal order cards show the packet password for that specific contract.
- Signed customer documents are marked view-only; changes after signing require a store-created signed revision or addendum later.
- Customer portal document display is now grouped by customer-friendly document names instead of raw template page numbers.
- Delivery & Material Release stays hidden from the customer portal until the release workflow actually applies to that order.
- Customer contact messages now show a popup over the form for sending/sent/error status so the customer does not miss the result.
- The Delivery & Material Release section is forward-compatible with customer print/email/signing options, but those actions stay hidden or disabled until that stage is live.
- Customers can send a portal message to the store for a new sale or an existing-sale concern.
- If the message is about an existing sale, the selected sale/invoice is included for the store.
- The customer can sign online, add initials, and leave notes.
- The customer signing page now offers a basic choice between step-by-step review and opening the full document.
- Small phone screens now show a larger-device notice with a request form for a phone app, dedicated tablet mode, signature pad support, or installer/delivery app features.
- The customer can download the fillable PDF if online signing is not working.
- After signing, the customer can choose to download/save, print, or email themselves the signed PDF.
- After the customer finishes selected post-signing actions, the signing link is marked complete and points them back to the customer portal.
- The store can receive the final signed PDF by email when SMTP is configured.
- The customer signing IP address and browser info are saved with the signature record.
- The customer must agree to electronic signing before the signed PDF can be finalized.
- The customer signing page now captures communication permissions for required account/contract email acknowledgement, optional marketing email, optional account/order texts, and optional marketing texts.
- Server errors and important events are written to local log files.
- There is a business settings page for store information.
- The settings page can save store representative profiles without requiring a digital signature image.
- Optional store representative signature images can be saved from an upload or a browser drawing pad for phone/tablet/touchscreen signing.
- A saved store representative profile and optional saved store signature image can be selected when creating a packet.
- The packet form has a direct link to manage saved store representatives and signature images.
- There is a basic protected contract search page. It can search packet records by name, phone, address, invoice, or other saved text.
- Contract search now has a View details button that shows customer/job details, included sections, signing audit details, and revision history.
- Contract search now lets staff resend the customer signing link or email the signed PDF again from the admin result.
- Draft/signable contracts can be reopened and saved from the admin form.
- Signed, accepted, or completed contracts are locked and must be changed by creating an E-number revision such as E1 or E2.
- If there are no saved records, the View/Edit action points the user back toward Create Contract.
- `CURRENTUSE_FUTUREUSE.md` documents which features are for the usable contract/signing flow now and which are for the larger portal later.
- `BEGINNER_LINUX_SERVER_SETUP_GUIDE.md` is now the single Linux/server setup guide. The shorter duplicate server guide was removed.
- `SERVER_SETUP_PRINTED_GUIDE_CORRECTIONS_2026-05-23.md` exists so printed guide corrections can be marked by hand without reprinting the full guide.
- `SERVER_STATUS_AND_ACCESS_SUMMARY.md` summarizes the current Pueblo server status, the CGNAT/static-IP blocker, and temporary tunnel/funnel options.
- `PUBLIC_ACCESS_STRATEGY.md` documents the proactive no-wait access plan: static/public IPv4, direct IPv6 testing, temporary tunnels, VPS reverse proxy fallback, and why the Florida eero relay is not the main path.
- `EDGEWATER_PUBLIC_ACCESS_PROGRESS_PRINTABLE.md` documents the specific Edgewater path we used to prove outside IPv6 access to the Pueblo server and includes the follow-up steps for static/public IPv4 later.
- `SERVER_SETUP_TECH_STANDARDS_SUMMARY_PRINTABLE.md` is a binder-style summary page for final server values, DNS, ports, database, SMTP, backups, security, and public test results.
- The server guide now distinguishes local testing from the public self-hosted Pueblo, Colorado server that will serve Edgewater, Florida over the internet.
- The server guide now assumes Ubuntu Studio is already installed on the Acer Aspire server.
- The unwanted tunnel-provider option was removed from the active setup plan.
- The guide now explains that Nginx is not cPanel and adds Cockpit as an optional LAN-only control dashboard.
- The fixed LAN IP section now explains router/app DHCP reservation and Ubuntu Studio static IP setup with `nmcli`.
- The Linux setup guide now includes the planned Pueblo-server internal app ports for Customer/Contracts Portal, Installer Portal, and Employee Portal.
- Installer Portal has a starter skeleton in `F:\ONGOINGPROJECTS\INSTALLERPORTAL`.
- Employee Portal has a starter skeleton in `F:\ONGOINGPROJECTS\EMPLOYEEPORTAL`.
- Store address is updated to 2119 S Ridgewood Ave, Edgewater, FL.
- Right now, the main thing being tracked is the customer contract/signature workflow.

## What Is Ready To Test

- Admin login.
- Business settings.
- Store representative profiles and optional saved store signatures.
- Packet creation.
- Page include/remove choices.
- Customer signing link.
- Customer notes and signature.
- Download/print/email options after signing.
- SMTP sending using the local test `.env`.
- Server error logs.
- View/Edit details for contract records.
- Draft contract editing.
- E-number revision creation for locked signed/accepted/completed records.
- Installer Portal shell on Pueblo/internal app port 3011.
- Employee Portal shell on Pueblo/internal app port 3012.

## In-Store Customer Workflow

If the customer is physically in the store, we still use the digital signing version. The customer signs through the portal, then the store can print their copy for them and email the signed PDF to them if they want.

## What We Are Not Doing Yet

These are planned for later, after the current features are tested.

- Customer accounts for faster signing on future purchases.
- Customer-controlled password changes and password reset after customer registration is added.
- Stronger full customer accounts backed by SQL instead of the current packet-based login.
- Cleaner record display where saved data is read-only until an Edit button is clicked.
- More guided customer signing steps instead of one long signing page.
- Full Create/View/Edit handling for real SQL-backed customer records and contract records.
- Comparing original contracts against E1/E2 revisions side by side.
- Automatic estimate lookup from RFMS/CabQuotes/LavaCake once the server-side estimate location/integration is decided.
- Store rep review/approval workflow for agreement pages 5-8 before sending or printing.
- More complete guided customer signing that walks customers to every required initial/signature location.
- Delivery-stage signing workflow for Chain of Custody / Material Release, including store receiving, installer pickup/inspection, driver/customer delivery signing, and customer pickup release.
- Delivery/pickup final packet rules: installer pickup or installer delivery needs installer and customer signoff; customer pickup needs the customer pickup release and checklist portion; store driver delivery needs driver/store-rep and customer delivery signoff.
- Delivery and customer checklist pages at the end of the packet stay selectable as needed and should be available to the customer as part of the final contract packet when they apply.
- Future PDF assembly should track estimate, acknowledgements, receipts, installer agreement, Exhibit A, delivery signoff, pickup release, vendor paperwork, and receiving paperwork by document type. Page numbers should be calculated only after the final combined PDF is assembled.
- Role-limited access for store reps, delivery drivers, and installers so each can complete only their portion of the sale.
- Customer opt-in, print/hand-to-customer, and scan-import options for later forms outside the primary estimate/acknowledgement contract flow.
- Keep current priority on perfecting the contract at estimate and acknowledgement stage before expanding the later operational workflows.
- Uploading acknowledgements, receipts, vendor invoices, vendor receipts, and related documents to the customer/order file.
- Auto-filling existing contract forms from generated/imported/uploaded data.
- Scan/OCR reading of handwritten or completed forms, including Page 11 and receiving forms, to fill matching fields.
- Google OAuth/Drive/email detection so customer/order emails can create or update customer folders automatically.
- Database-backed admin users and admin password changes.
- Moving long-term data into a real SQL database instead of simple local JSON files.
- Local-first storage/database design where Edgewater-side store computers can write locally first.
- Change-triggered sync from Edgewater-local data to the Pueblo-hosted server after records change.
- Sync conflict handling, retry handling, deleted-record tracking, and reporting from synced Pueblo-hosted data.
- Connecting this contract portal to the larger estimates, invoice, and financial modules.
- The working estimate module has been copied into Contract Portal at `/estimates/new`. The copied entry screen does not show store-information fields; saved/printed/emailed estimate PDFs pull store name, address, contact, and logo from portal settings.
- The admin/module entry page style is now locked as the preferred direction: compact cards, top-left functional icons, module title/summary beside the icon, search first where relevant, and compact Add New/View/Print actions under the search.
- PDF output standard: live previews should stay contained and useful for entry, while save/download/print/email must use server-generated PDFs with business settings applied at generation time.
- Creating a Sales Portal for day-to-day store operations once the estimate, invoice, payment, customer, and related modules are ready.
- Master project supplier navigation: add an internal supplier browser/window so staff can click a supplier record and open the supplier site inside the app, reducing confusion from jumping out to a separate browser tab and trying to navigate back.
- Archive workflow for records that should not be deleted: archive/restore actions, archive status labels, and archive search/retrieve views.
- Future module cards/pages should include Customers, Installers, Vendors/Receiving, purchasing/products, and any other day-to-day operations area that belongs in the internal portal.
- Append-only financial records for the future quote/invoice/payment modules. Original quotes and invoices should never be overwritten; changes should create revisions or events tied to the same quote/invoice number, and payment records should remain separate linked records.
- Financial audit trail for statuses and corrections such as written, delivered, paid, refunded, voided, donated, warranty, adjusted, and corrected, with who/when/what/why saved for future reporting.
- Production hosting on the self-hosted Pueblo, Colorado server that Edgewater, Florida reaches over the internet.
- Deciding whether to run the app directly on the Linux server or inside a virtual machine.
- Hosting plan should account for the fact that the in-house Linux machine also doubles as a light-use dev/studio machine, and the portal is expected to have low simultaneous customer traffic at first.
- Choosing the production database. PostgreSQL is probably the better long-term fit for the larger financial system, unless the other modules are already standardized on MySQL.
- Full production security review using `SECURITY_LOCKDOWN_PLAN.md`.
- Private financial systems network for Edgewater sales/authorized staff only. Public customers should reach only the customer-facing contract/customer portal, while financial apps, invoices, payments, job costing, reporting, database ports, admin panels, and internal APIs stay behind VPN/private access and firewall allowlists.
- Final decisions about backup, retention, and access rules for generated PDFs.

## Plain-English Status

The basic code is in place. It is not final production software yet. The next step is testing the full flow locally, fixing anything that feels wrong, and then discussing secure hosting.
