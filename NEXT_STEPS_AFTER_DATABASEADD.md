# Next Steps After Database Add

Purpose: this document comes before normal UI/dev todo work. It is the order of operations after PostgreSQL, first-run setup, and staff user management are in place.

The goal is to prove the portal works correctly with real shared data, then lock it down, then improve the database design without turning PostgreSQL into the whole application engine.

## Guiding Rule

Treat the system as live once a real staff member can enter real customer information.

- Back up before clearing or changing data.
- Preserve documents and signed PDFs.
- Do not expose PostgreSQL or Node directly to the internet.
- Do not make UI polish changes while a data/security issue is open.
- Keep workflow logic in Node/API code unless there is a strong database reason.
- Let PostgreSQL protect records, searching, relationships, and reporting.

## Phase 1 - Prove The Working Baseline

Confirm these before calling the portal ready for real staff use:

- App health returns `{"ok":true}`.
- PostgreSQL `DATABASE_URL` is set and the app creates tables on startup.
- Staff users, customer portal accounts, and business settings are visible in PostgreSQL after first setup/login activity.
- Server JSON user/settings files are treated as migration backups, not the primary shared storage.
- `/setup` works on a clean install with no staff users.
- On a clean install with no staff users, `/` and `/login` redirect to `/setup`; customer login is not shown until setup is complete.
- First admin can create staff users in `Admin Menu > Users`.
- Staff users can log in and change temporary passwords.
- Customer, contract, estimate, supplier, product, import, and draft tables start empty on first run.
- Creating a customer/contract writes to PostgreSQL and server files.
- Creating/saving an estimate writes to PostgreSQL and server files.
- Generated PDFs save under server `data/generated`.
- Signable and signed PDFs open from another computer.
- Customer signing saves the final signed packet in the portal.
- Electronic signing records signature audit metadata: signed date/time, printed name, initials, IP, user agent, sections, notes, and communication consent. The drawn signature image remains embedded in the signed PDF.
- Manual/paper signing still needs an admin upload workflow: staff uploads the returned signed PDF, records received date/time, received method, staff user, and reminder/follow-up status.
- Email sending is either tested working or intentionally left off.

## Phase 2 - Lock Down Security

Do this after the working baseline is proven:

- Keep Node port `3000` private behind Nginx.
- Keep PostgreSQL port `5432` private/local only.
- Keep SSH limited to authorized users.
- Use HTTPS for public access.
- Rotate any temporary database/admin passwords used during testing.
- Set a strong `SESSION_SECRET`.
- Confirm `.env` is not in upload archives.
- Confirm server file permissions are owned by the app user.
- Enable regular OS/security updates.
- Add or verify firewall rules.
- Review Nginx config and redirect HTTP to HTTPS.
- Add backup automation for PostgreSQL and `/opt/apps/customerportal/app/data`.
- Document restore steps and test at least one restore.

Later security improvements:

- IP allowlist or VPN for staff/admin routes if practical.
- Separate customer public access from staff admin access if needed.
- Fail2ban or similar SSH/login protection.
- More detailed audit logs for user/admin actions.
- Stronger session store than Express MemoryStore.

## Phase 3 - PostgreSQL Design Direction

This is a UI/API-driven application. PostgreSQL should not become a stored-procedure-heavy application engine.

Use PostgreSQL for:

- Durable shared records.
- Proper data types.
- Practical indexes.
- Unique constraints.
- Foreign keys once relationships are stable.
- Views for reporting and latest-version screens.
- Audit-friendly timestamps.
- Search support.

Keep in Node/API code:

- Workflow decisions.
- Contract generation.
- Estimate calculations while still changing.
- UI state.
- Permission flows.
- Email/PDF behavior.
- Import review logic.

Use sparingly:

- Database functions.
- Triggers.
- Custom aggregate functions.

Good future database improvements:

- Index customer lookup fields: name, phone, email, address.
- Index contract lookup fields: contract number, invoice number, customer, updated date.
- Index estimate lookup fields: estimate ID, customer, phone, address, updated date.
- Use views for `latest_contract_versions` and reporting.
- Add constraints after field rules stabilize.
- Keep JSONB snapshots for contracts/estimates while forms are still evolving.
- Move high-value fields into typed columns as the data model settles.

## Phase 4 - Backup And Recovery

Before more feature work:

- Create a repeatable PostgreSQL backup command.
- Create a repeatable `data/` folder backup command.
- Store backups outside the app directory.
- Confirm backups include settings, users, logos, generated PDFs, packets, estimate files, and OCR/preimport files.
- Confirm PostgreSQL backups include `staff_users`, `customer_accounts`, and `portal_settings`.
- Write down how to restore PostgreSQL.
- Write down how to restore server files.
- Run one restore test on a demo/staging copy.

## Phase 5 - Pilot Use

Use a short pilot period before broader rollout:

- One admin.
- One or two staff users.
- Realistic customer/contract/estimate flow.
- Confirm staff can find records from another computer.
- Confirm documents are visible from another computer.
- Confirm signed packets save correctly.
- Confirm duplicate warning behavior is understandable.
- Confirm records do not multiply confusingly when edits/revisions happen.

During pilot:

- Avoid large UI redesigns.
- Fix broken save/search/security behavior first.
- Record confusing workflows for later UI cleanup.
- Back up before any reset.

## Phase 6 - UI And Module Work

After data/security are stable, resume normal product work:

- Refine contract navigation and save/send/view flow.
- Continue RFMS-style compact internal UI cleanup.
- Finish estimate-to-contract workflow.
- Convert accepted/signed estimates into invoices only after the customer signs the contract.
- Add customer-facing reject/return-with-reason workflow and a staff queue for returned/rejected signatures.
- Add customer account maintenance: name, email, phone, address updates, saved signature/profile, password maintenance, and clear registration prompts after signing.
- Add customer portal notices for coming-soon features: estimate tracking, invoice tracking, payment tracking, and account status/history.
- Add optional estimate signature setting for staff: estimates can require signature only when selected.
- Improve duplicate handling and version labels.
- Add better document import/OCR review.
- Add customer/supplier/product import workflows.
- Add archive/retrieve status instead of delete.
- Add future vendor/supplier portal links.
- Add future financial-system private network notes.
- Keep cabinet-store product records compact: product code, item name, item type, item description, quantity, price, and line total.
- Plan a different product/pricing structure for future flooring-store installs instead of forcing cabinet inventory rules onto flooring.

## Current Decision

Use a balanced architecture:

- Node owns business workflow.
- PostgreSQL owns shared storage, constraints, searching, and reporting support.
- The UI remains the main working surface for staff.
- Database views/indexes/constraints should support the app, not replace the app.
