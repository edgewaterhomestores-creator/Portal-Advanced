# Current Use / Future Use Split

This project is being built in two tracks so Edgewater can use the signature workflow now while the larger business system grows behind it.

This is the short roadmap. The detailed backlog lives in `DEV_TODO.md`.

Production hosting note: the self-hosted public server is expected to be in Pueblo, Colorado and serve Edgewater, Florida over the internet. Future local-first storage means Edgewater-side computers can write locally first and sync to the Pueblo-hosted server.

## CURRENTUSE: test and use now

This is the simple working path for contracts.

1. Store employee logs in to the Contract Portal.
2. Store employee creates a customer contract packet.
3. Store employee attaches or records the current estimate PDF.
4. Store employee chooses which packet sections apply.
5. Portal creates a password-protected signable PDF.
6. Portal gives a customer signing link.
7. Customer signs digitally on the server.
8. Portal records signature date, IP address, and browser/user-agent.
9. Portal creates the final signed PDF.
10. Customer can download, print, or email the signed PDF.
11. Store can search contract records, view details, edit draft records, or create an E-number revision when a signed/accepted record is locked.

CURRENTUSE should stay boring and dependable. It can use cabquotes2 or an uploaded PDF for estimates until the new estimate module is ready.

After the deployed portal passes the basic health check, the next current-use priority is the security lockdown pass in `SECURITY_LOCKDOWN_PLAN.md`. Keep public users on HTTPS through Nginx, keep Node/PostgreSQL private, rotate temporary passwords, and verify backups before treating the portal as production-ready.

Current release scope guard:

- Do not release the invoice/payment module yet.
- Current usable scope should be independent estimates and independent contracts, with the option to start a contract from an accepted estimate when appropriate.
- If an estimate is created alone, staff can send/print/save the estimate without starting a contract.
- If a contract is created without an estimate, staff can still create the contract directly.
- If an estimate is part of the first contract flow, keep the handoff explicit so staff chooses the right path instead of accidentally sending the wrong document.

## FUTUREUSE: build next, do not block current signing

These are planned parts of the larger program.

1. Detailed estimate module using LavaCake-style sections and line detail.
2. Shared customer records.
3. Shared supplier records.
4. Invoice/order/acknowledgement module.
5. Payment recording module.
6. Customer account registration and password reset.
7. Customer portal at `customers.edgefam.com` with customer-visible estimates, contracts, invoices, receipts, acknowledgements, account status, and selected documents. For the first customer version, show only estimates and the contract pages/documents the store has assigned to that customer; unassigned internal pages/documents stay hidden.
8. Employee portal with assigned sales/delivery tools and paystub/pay-history access.
9. Installer portal with installer agreements, job checklists, delivery/pickup signatures, and assigned job access.
10. Cabinet and floor store module selection at login.
11. One shared database for both stores after the company consolidation plan is finalized.
12. Product and inventory categories such as Cabinet and Floor, with subcategories matching the current product lists.
13. Google OAuth/Drive folder scanning for customer/order emails and attachments.
14. Scan/OCR import for handwritten forms and receiving paperwork.
15. Local-first storage/database on the Edgewater store computer or store-side database.
16. Change-triggered sync from Edgewater-local data to the Pueblo-hosted server.
17. Pueblo-hosted reporting that can read synced customer/order/financial data in near real time.
18. Sync from any contract origin or edit point, including admin desktop, store tablet, customer link, installer portal, employee portal, delivery-driver device, or future offline module.
19. Hardware signature pad support for in-store/counter signing.
20. Android tablet and possible iPad packaging for store signing and staff workflows.
21. Optional dedicated store tablet/kiosk mode that opens only the Contract Portal.
22. Track phone-app requests from small-screen visitors before deciding whether to build a phone app or phone-optimized mode.
23. Private financial systems network for Edgewater sales/authorized staff only, separate from the public customer-facing portal.
24. Lock financial apps, database ports, internal APIs, reporting, invoices, payments, job costing, and payroll/pay-history behind VPN/private access, firewall allowlists, strong logins, device/user authorization, and audit logs.
25. Append-only quote/invoice/payment history so original financial records are never overwritten; changes become revisions or events linked back to the same quote/invoice number.
26. Paid-invoice change workflow: if an invoice already has payments or payouts, staff chooses add/remove/change/correction, the system creates a linked adjustment/revision instead of editing the paid invoice, and existing payments are applied to calculate refund due, customer credit due, additional payment required, or paid in full.
27. Financial status and correction audit trail for written, delivered, paid, refunded, voided, donated, warranty, adjusted, and corrected records, including who/when/what/why.
28. Cash target / cash discount calculator for future invoice/payment flow, with explicit discount tracking, sales-tax calculation, manager/superadmin review, and petty-cash/cash-drawer reconciliation reporting.
29. Post-job satisfaction follow-up by email/SMS, with opt-in/opt-out handling and Google/Facebook review request links when the customer is satisfied.

Customer portal current-scope rule:

- Customers should use `customers.edgefam.com`, not the staff contract-entry area, when the separate customer portal is active.
- Right now, customers should see only assigned estimates from this system, assigned contracts/contract pages from this system, and assigned customer-visible external documents such as RFMS acknowledgements/invoices and RFMS receipts when the store uploads or attaches them.
- Until invoice/payment/account history is built, do not show future placeholders as if they are active customer tools.
- Customers need a simple way to message the store with questions or concerns. For now those messages should email `edgewatercabinetstore@gmail.com`.
- Customer account maintenance comes later: customers should be able to update email, addresses, second contact/name, phone numbers, and password, while the system keeps old values as searchable history/aliases instead of erasing them.
- Customer Google login/OAuth and bot protection are planned for the real public account phase. Customer registration from a document should start from the email address that received the estimate/contract link.

RFMS bridge note:

- Until native invoice/payment/receipt generation exists in this portal, RFMS acknowledgements should be treated as the current invoice/order document and RFMS receipts should be treated as the current payment proof document.
- After assigned estimates/contracts/RFMS documents are stable, add a simple paid-status tracker so Jamie can mark whether an order was paid even when payment was taken in RFMS.
- The first paid-status tracker should allow manual amount, payment method, payment date, notes, and optional RFMS receipt upload/attachment. Later, when receipts are generated directly in this portal, the RFMS receipt upload step can become optional or disappear for new records.

## Reuse Decisions

Use the current portal for digital contracts and signing.

Use LavaCake Estimates for the future detailed estimate structure:

- estimate sections
- section templates
- taxable and non-taxable section totals
- supplier/installer labels
- quantity flags
- tax snapshots
- zip lookup ideas

Use cabquotes2/EWCS_Q2E for the current estimate bridge and styling reference.

Use the Invoice Web App later for invoice/payment line item ideas:

- item
- quantity
- unit
- rate
- amount
- taxable
- PDF/email patterns

Future financial records should be able to answer both of these questions:

- What did we know at the time?
- What is the current final state?

## Revision Rule

Draft records can be edited directly.

Signed, accepted, or completed records are locked. They must not be overwritten. Changes create a new signable E-number revision:

- original contract: `ABC123`
- first edit after lock: `ABC123-E1`
- second edit after lock: `ABC123-E2`

This preserves what the customer originally signed.
