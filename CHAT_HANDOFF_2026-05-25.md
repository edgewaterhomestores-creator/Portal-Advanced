# Contract Portal Handoff

Date prepared: 2026-05-25  
Project folder: `F:\ONGOINGPROJECTS\CUSTOMERPORTAL`  
GitHub repo: `git@github.com:edgewaterhomestores-creator/ContractsPortal.git`  
Branch: `main`  
Latest known commit at handoff: `2af217b Clean up customer portal document view`

This file is intended to be pasted into a future chat so work can continue without re-reading the whole thread.

Formatted user-pasted transcript file:

```text
CHAT_TRANSCRIPT_2026-05-25.txt
```

Raw pasted transcript backup:

```text
CHAT_TRANSCRIPT_RAW_PASTE_2026-05-25.txt
```

Use this handoff for the current state and the transcript files for the longer chat history. As of this update, the user-pasted transcript section that was formatted covers Friday 8:50 AM through Friday 9:53 AM. Later work is still summarized in this handoff until more pasted transcript sections are appended/formatted.

## One-Paragraph Handoff

We are building the Edgewater Contract Portal, currently named `customerportal` on the Linux server but now treated as the broader Contract Portal because customers, store employees, installers, delivery drivers, and future employee modules may all use it. The immediate goal is a usable contract/signing workflow for cabinet contracts: staff create a contract packet from the PDF template, choose what customer-facing documents apply, attach or record an estimate, generate a password-protected signable PDF, send/open a signing link, capture customer notes, initials, e-signature, digital-signature consent, IP/user-agent, and let the customer download/print/email the final signed PDF. The longer goal is a larger business portal with customer accounts, employee portal, installer portal, estimates, invoices/orders, payments, suppliers/customers master data, delivery/release forms, scanned documents, and local/server sync.

## Current Working State

- Main local project is `F:\ONGOINGPROJECTS\CUSTOMERPORTAL`.
- The server deploy path is `/opt/apps/customerportal/app`.
- The Linux server user is `michelle-work`.
- The server LAN IP is `192.168.1.70`.
- Current test URL is `http://contracts-v6.edgewaterhomestores.com`.
- Intended final URL is `https://contracts.edgewaterhomestores.com`.
- The current Linux service is still named `customerportal`.
- Do not rename the Linux paths/service yet unless deliberately planning a migration.
- `DEVSERVER.odt` is untracked and should stay uncommitted.

## Recent Commits

- `2af217b Clean up customer portal document view`
- `f821c4b Improve portal login and signing controls`
- `22e0b67 Document safe command prompt deployment`
- `5a882a2 Note future sales portal`
- `56db024 Improve contract navigation and downloads`
- `bd29cd6 Refine contract signing and estimate flow`
- `08cc4b9 Document disabling default Nginx site`
- `f848776 Add contract portal small-screen requests`

## Implemented Features

- Portal landing page is centered as `EWCS` and `Contract Portal`.
- Landing page choices: `Customers`, `Installers`, `Store`.
- Customers go to current customer lookup/sign-in.
- Store goes to staff login.
- Installer choice is visible but inactive/future.
- Staff login page no longer has a separate Customer Lookup button.
- Admin/store menu has Settings, Logout, Create Contract, View Contract, Print Contract Pages.
- Create Contract can start new or search existing customer.
- View Contract supports search by name, phone, address, invoice/contract, and saved text.
- View Contract has details, print, email signing link, email signed PDF, edit draft, and E-number revision creation.
- Signed/accepted/completed records are locked and require E-number revision records.
- E revision format uses `E1`, `E2`, etc., not letters.
- Store settings page stores business info and logo upload.
- Store representative profiles can be saved without a digital signature image.
- Store representative signature images are optional and can be uploaded or drawn on a canvas.
- Raw image-data paste boxes for logo/signature were removed.
- Store signature can be selected during contract creation, but no signature is required.
- Staff can print pages for manual signature.
- Contract flow is staged: Customer Information, Quick Measurement, Estimate, Sections, Job, Addendum A, Vendors, Materials, Signatures/Releases, Notes.
- Estimate step links to `https://cabquotes2.edgewaterhomestores.com`.
- Estimate attachment is PDF-only.
- Downloaded/emailed PDFs use `CONTRACT-LAST-YYYYMMDD-ESTNUM.pdf` when estimate number exists.
- First/last customer names are normalized/capitalized on save.
- Customer mailing and billing addresses are separate.
- Installation address is contract/job-specific.
- Buttons copy mailing or billing address to installation address.
- Page 4/legal disclaimers are always included.
- Vendor/job orders and receiving/material pages are internal and hidden from customer PDFs.
- Customer signing captures notes, initials, signature, IP address, user-agent, email/text communication choices, and digital-signature consent.
- Customer must agree to electronic signing before finalizing.
- Signing link becomes completed after the customer runs post-sign actions.
- Customer post-sign actions: download/save, print, email signed PDF to themselves.
- Customer portal now shows contract/order cards and packet password for each contract.
- Customer portal uses customer-friendly document group names instead of raw template page labels.
- Customer sees `Open packet` and `Download signed PDF`; the customer cannot edit staff-entered contract fields.
- Delivery & Material Release is hidden until that workflow applies.
- Delivery/release buttons are disabled/hidden until that workflow is live.
- Customer contact form supports new sale or existing-sale concern.
- Customer contact form includes the sale/invoice number if it is an existing concern.
- Customer contact form now shows a floating popup over the form for sending/sent/error messages.
- Small phone screens show a larger-device notice and request form for phone app/tablet/signature-pad/installer-delivery app.
- Server logs detailed errors/events in `data/logs`.

## Current Password Rule

Customer-facing screens must say:

```text
Use the password provided by the store representative.
```

Do not publish the formula in customer-facing screens or signing emails.

Staff-only temporary formula:

```text
First 4 letters of customer last name + street/building number + last 4 digits of phone
```

Example:

```text
Dawson, 608 address number, phone ending 7435 = DAWS6087435
```

The app uppercases the typed password before checking, so `Daws6087435`, `daws6087435`, and `DAWS6087435` are equivalent. `608Daws7435` is wrong because the address number comes after the last-name letters.

## Email / SMTP Notes

Production mode is not what makes email fail.

Email fails or is skipped when SMTP is not configured correctly in:

```bash
/opt/apps/customerportal/app/.env
```

Store-directed emails require at least:

```text
SMTP_HOST
SMTP_TO
```

Other SMTP settings also matter:

```text
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
```

Customer signing-link emails no longer include the password in the same email as the link. The store rep should provide the password separately.

Reason we went back toward development/testing mode earlier:

- `NODE_ENV=production` makes session cookies require HTTPS.
- While testing over plain `http://contracts-v6.edgewaterhomestores.com`, production secure cookies can make login/session behavior appear broken.
- Once HTTPS is live, production mode is appropriate.

Command to inspect server email settings without printing the password:

```bash
sudo grep -n "SMTP_HOST\|SMTP_PORT\|SMTP_SECURE\|SMTP_USER\|SMTP_FROM\|SMTP_TO\|NODE_ENV" /opt/apps/customerportal/app/.env
```

## Deployment Procedure That Worked Best

Use this file as the authoritative copy/paste deployment guide:

```text
DEPLOY_COPY_PASTE_STEPS.txt
```

The user specifically does not want a giant all-in-one Windows batch command. Give the deployment as one command at a time. The reliable pattern is:

1. Windows CMD: create `F:\customerportal-upload.tgz`.
2. Windows CMD: create/check `~/uploads` on the Linux server.
3. Windows CMD: switch to `F:\` before running `scp` so the `F:` drive path does not confuse SCP.
4. SSH into the Linux server.
5. Linux: extract tarball into `~/uploads/customerportal`.
6. Linux: verify `package.json`, `package-lock.json`, `server/index.js`, and `public/home.html`.
7. Linux: only after verification, rsync staging to `/opt/apps/customerportal/app`.
8. Linux: run `npm ci --omit=dev`, restart `customerportal`, and check `/api/health`.

Expected health response is:

```json
{"ok":true}
```

## Server / Network Notes

- Server OS is Ubuntu Studio on the Acer Aspire.
- Server machine is in Pueblo, Colorado and serves Edgewater, Florida users over the internet.
- User requested no Cloudflare.
- No-IP is preferred over DuckDNS.
- DuckDNS is considered unstable/testing only.
- Hostinger shared hosting is not the same as DDNS.
- The ISP router showed WAN IPv4 as `10.101.24.142`, which indicates CGNAT/private upstream IPv4.
- Public IPv4 from `curl -4 ifconfig.me` showed `66.33.12.98`.
- Because router WAN was private, direct IPv4 port forwarding from the outside did not work.
- ISP static/public IP was requested.
- IPv6 testing did work enough to reach a 404 from outside, which was good because it proved public access hit the server.
- Server IPv6 had a stable-looking address and a temporary privacy address; use the first/non-temporary address for DNS when needed.
- Nginx is being used as the reverse proxy and static test handler.
- Nginx `server_name` contains domains/subdomains that should route through the site config.
- `location = /_server-test.html` serves a temporary static file.
- `location /` proxies the app to Node on port 3000.
- The default Nginx site caused routing confusion and was disabled in a previous commit.
- Current app still uses HTTP on test domain; HTTPS setup remains needed.

## Current Known Issues / Next Tests

- Need verify latest `2af217b` is actually deployed to Linux.
- Need test customer contact form after SMTP is configured.
- Need test customer portal after latest cleanup: no raw Quick Measurement page chip unless intended document group applies.
- Need confirm customer display now only shows document groups: Estimate or Measurement/Estimate, Contract Packet, Addendum A when applicable, Acknowledgements/Receipts, Additional Notes, Installer Agreement/Checklist.
- Need confirm Delivery & Material Release is hidden until release workflow applies.
- Need decide whether Measurement should ever be visible to customer; latest logic shows it only as Measurement/Estimate if included.
- Need tune contract/customer document grouping if admin checklist needs more exact customer visibility.
- Need HTTPS before true production `NODE_ENV=production`.
- Need SMTP values from LavaCake Estimates or other working SMTP source.
- Need final printable setup guide after server setup stabilizes.

## Future TODO Highlights

- Real SQL database, likely PostgreSQL unless the rest of the system standardizes on MySQL.
- Move admin users out of `.env`.
- Admin password change and reset.
- Customer accounts with registration, password changes, and reset.
- Registered customers should see contracts without re-entering each document password, but each contract should still display its packet password for reference/PDF access.
- Stronger signer identity verification: customer accounts, one-time codes, verified phone/email, staff-assisted in-store signing, and camera coverage for in-store signing stations where appropriate.
- Signed documents are view-only.
- Changes after signing require signed revision or signed addendum.
- Define a dollar threshold for changes requiring signed addendum/change order.
- Add this language to the customer contract later.
- Customer portal login/register should live under Customers on the main page, not on staff login.
- Employee portal should support employee account basics, paystubs/pay history, staff contract setup, delivery/sales links.
- Installer portal is future; for now installers can sign printed docs that are scanned/attached.
- Supplier and customer master-data modules should be shared by estimates, invoices, receiving, ProKitchen, payments, and contracts.
- Larger financial system should eventually include estimates, invoices/orders/acknowledgements, payments, receipts, suppliers, customers, inventory/products, job costing, delivery, and reporting.
- Local-first plus hosted sync is a future direction.
- Sync must work regardless of where a contract is started or edited.
- Google OAuth/Drive future: detect emails/files by customer/order number and attach to customer file.
- OCR/scan future: read handwritten/scanned forms and populate fields.
- Android/iPad tablet packaging future.
- Phone app or phone-optimized mode only if enough users request it.

## Transcript / Chronological Chat Log

This is a transcript-style chronological log of the full thread. It captures the user requests, corrections, decisions, and work performed in order so a future chat can resume accurately.

### Phase 1: Initial Contract Portal Request

User provided `F:/0 CONTRACT PROTOTYPES/Final Draft Updated  3.11.26 - Customer Packet.pdf`.

User requested a portal on `cabinets.edgewaterhomestores.com` to:

- Let company staff fill the packet.
- Save it as signable/fillable PDF.
- Leave fields for customer signature or digital signature.
- Password-protect generated PDF using customer last-name/phone pattern.
- Include a customer notes area.
- Email final copy to store; SMTP info to be added later.

User added:

- Store employee must include/remove pages as needed.
- Email link to customer so they fill/sign on the server.
- If customer has issues/offline, PDF should be downloadable.
- Customer can print/download signed PDF after completion, or email to themselves.
- After signing, show a confirmation asking what actions they want: save, print, email.
- Show which selected actions were completed.
- Keep detailed error logs.
- Track IP where signature came from.
- Spin up a test server.
- Give updates as work proceeds.

Implemented early prototype:

- Node/Express app.
- PDF generation and field mapping.
- Signing route.
- Password protection.
- Logging.
- SMTP placeholders.
- Admin and customer routes.

### Phase 2: Admin Settings, First Setup, Docs, Folder Location

User requested:

- Admin page with business settings.
- Upload/input signature and choose it while doing contract.
- User login for admin.
- Dev TODO noting security/hosting discussion after features tested.
- Future customer account option for easier future signing.
- Local `.env` using same credentials as LavaCake Estimates SMTP.
- Easy summary of current features and planned features.
- No `ONGOINGPROJECTS` on D drive; later clarified project should be saved to `ONGOINGPROJECTS\CUSTOMERPORTAL\`.
- User hates OneDrive and wants local files.
- How-to-use document.
- Default customer password note originally by name/phone combo, later changed.
- SMTP From name should be `Edgewater Cabinet Store`.
- Admin password changes and whether SQLite/MySQL/PostgreSQL should be used.

Decisions:

- PostgreSQL likely better long-term for larger financial/customer/order system, but database deferred.
- Current prototype uses local JSON/file storage, with future SQL migration.
- Future data import from cleaned legacy/RFMS files.
- Database growth plan needed before importing real data.

Docs created/updated:

- `README.md`
- `HOW_TO_USE.md`
- `PROJECT_SUMMARY.md`
- `DEV_TODO.md`
- `CURRENTUSE_FUTUREUSE.md`

### Phase 3: Server Setup And Self-Hosting

User wanted a thorough Linux server setup document:

- Software list.
- Terminal commands.
- Security tightening.
- No static IP initially.
- Use No-IP/DuckDNS/local polling/Hostinger script discussion.
- No Cloudflare.
- Ubuntu Studio already installed.
- Acer Aspire A514-54 hardware details.
- Pueblo, Colorado server serving Edgewater, Florida.
- Server is also light dev/studio machine.
- Maybe use non-standard ports until secure.

Server setup work/discussion:

- Nginx selected as reverse proxy, explained as Apache alternative, not cPanel.
- MySQL port checks discussed.
- Password validation benefits discussed.
- `python3.14-venv` missing/needed for venv.
- Nano paste instructions discussed.
- FTP/SFTP staging upload explained.
- Temporary static Nginx test page created.
- Need Apache? Answer: Nginx is the web server/reverse proxy.
- SMTP and SQL diagnostics discussed.
- Step corrections made repeatedly to setup guide.
- User requested TOC/index, headers, page numbers, write-in blanks, troubleshooting, restart section.
- No-IP setup went through credentials/startup issues.
- Router port forwarding reviewed.
- CGNAT/private WAN discovered.
- IPv6 route tested successfully.
- ISP static IP requested.
- Public access strategy created without Cloudflare.

Important server files/docs:

- `BEGINNER_LINUX_SERVER_SETUP_GUIDE.md`
- `SERVER_SETUP_PRINTED_GUIDE_CORRECTIONS_2026-05-23.md`
- `SERVER_STATUS_AND_ACCESS_SUMMARY.md`
- `PUBLIC_ACCESS_STRATEGY.md`
- `EDGEWATER_PUBLIC_ACCESS_PROGRESS_PRINTABLE.md`
- `SERVER_SETUP_TECH_STANDARDS_SUMMARY_PRINTABLE.md`

### Phase 4: Customer vs Main vs Employee vs Installer Portals

User brought in pasted context from another chat about suppliers/customers modules and larger financial system.

Discussion/decisions:

- Current `CUSTOMERPORTAL` project is really becoming `Contract Portal`.
- MAINPORTAL/customer/employee/installer should likely be role-based areas in one app rather than separate duplicated codebases.
- But skeletons for `INSTALLERPORTAL` and `EMPLOYEEPORTAL` were also requested/started.
- Employee portal future: employee account, paystubs/pay history print/save, staff contract portal, delivery tasks.
- Employees must choose business module at login: cabinets/floors/others later.
- Future unified company database absorbing floor/cabinet stores.
- Products categorized Cabinet/Floor and subcategories from RFMS.
- Revision naming uses `E1`, `E2`, not letters.

### Phase 5: Estimates / LavaCake / CabQuotes / Invoice Flow

User explained:

- LavaCake projects were meant to be larger financial system.
- Need estimates more detailed and contracts digitally signed.
- Current use could be `cabquotes2` plus simple contract flow; future use integrates everything.
- CabQuotes2 works on web and emails customer/store a PDF estimate.
- Local estimate project may be `EWCS_Q2E` or similar and newer than live.
- Leave live cabquotes2 alone for now, focus on self-hosted portal.
- Estimate Step 3 should link to CabQuotes2 for now.
- Estimate should be attached/selected as PDF.
- Phone file picker issue: choose file led to photos, not documents, for PDF.
- The contract portal only needs customer support from estimates for now; item/product support belongs in estimate module.

Implemented:

- Step 3 Estimate section.
- Link to `https://cabquotes2.edgewaterhomestores.com`.
- Manual PDF attach.
- Estimate number field.
- Naming downloaded PDF with estimate number when available.

### Phase 6: Contract Flow Details

User described desired flow:

- Starts with admin/cabinet store rep.
- First-run setup asks whether to enter store info, logo, signature.
- Store address changed to `2119 S Ridgewood Ave`, not `2115`.
- Admin menu: Store Information, Signatures, Create Contract, View/Edit Contract.
- Search by phone/address/name/any identifying info.
- Create Contract can add new customer or search existing.
- View/Edit defaults to view; edit button opens changes.
- Accepted contracts cannot be overwritten.
- Later edits create records with `E1`, `E2`, etc.
- Step 1 Customer Information Sheet.
- Step 2 Quick Measurement optional.
- Step 3 Estimate attach/select.
- Page 4 always included.
- Pages 5-8 filled from entries and reviewed/approved.
- Customer can sign in store via tablet/computer/mouse/touch.
- Customer can choose step-by-step flow or full document.
- Split payment Addendum A prompted after signatures.
- Store reps fill Addendum A, customers cannot edit.
- Page 11 should fill as attachments are added.
- Receiving forms later.
- Chain of Custody / Material Release later.
- Delivery/pickup workflows later.
- Installer agreement signed by installer and visible to customer.
- Vendor invoices/receipts/job orders/receiving paperwork not visible to customer.

Implemented in current phase:

- Basic staged admin form.
- Page selection.
- Internal/customer-hidden page handling.
- Addendum A prompt.
- E revision creation.
- Admin view/search/detail.

### Phase 7: Customer Portal And Customer Visibility Rules

User clarified:

- Customer should not see Quick Measurement if admin did not set it.
- Customer should not see Delivery & Material Release until contract accepted and delivery/pickup applies.
- Customer view should be cleaner and not broken down by raw pages.
- Customer should mainly see `Open packet` and `Download signed PDF`.
- Customer cannot alter office-entered fields.
- They request help via contact form.
- Admin needs pages; customers do not.
- Legal Disclaimers + Purchase Agreement + signature pages are one contract document.
- Measurement and Estimate are one document if measurement is completed.
- Separate docs depend on admin checklist.

Implemented latest:

- Customer API now returns grouped customer-document summaries.
- Admin still uses page-level summaries.
- Customer portal document display uses customer-friendly grouped labels.
- Delivery & Material Release hidden until applicable.
- Customer portal action buttons simplified.

### Phase 8: Password And Identity Concerns

Original password formula was simple last-name/phone. User later said:

- Do not show default password structure publicly.
- Tell customer to use password given by store rep.
- Need customer to agree to digital signing or come in store/sign on paper.
- Need approval to email them, even verbal.
- Stores should have cameras.
- Need better pattern easy for sales team but harder to guess.
- Proposed pieces: last name, address number, phone, area code, etc.
- Multiple properties should have different passwords.
- Once customer has registered login, they should not need document password after login.
- Each contract should still display its password when logged in.
- Signed documents can only be viewed, not changed.
- Changes require signed addendum/revision.
- Big money changes need signed approval.

Implemented:

- Staff-only temporary formula: first 4 last-name letters + address/property number + last 4 phone digits.
- Customer-facing screens removed formula.
- Signing-link email no longer includes password.
- Customer portal shows packet password once logged into that customer contract view.
- Digital signature agreement required.
- TODO added for stronger identity verification, customer accounts, one-time codes, camera/in-store signing, signed addendum thresholds.

### Phase 9: Store Reps And Signature Images

User clarified:

- Store can save profile without signature file/drawn signature.
- They cannot digitally sign without signature image, but can print/manual-sign.
- Need select person from list, then choose/create signature only if needed.
- The previous signature UI took too much space.
- No raw image data paste boxes except text/CSV/import contexts.

Implemented:

- Store rep profiles.
- Optional signature image library.
- Compact signature creation under a details/expand section.
- Removed raw pasted image data fields.
- Rep profile can select optional saved signature.
- Contract creation can select saved rep profile and optional signature.

### Phase 10: Landing/Login Structure

User requested:

- First page center EWCS and Contract Portal.
- Under it choices: Customers, Installers, Store.
- Customers taken to current customer screen.
- Customer screen may later become login/register or direct contract approval.
- Repeat customers/builders should benefit from portal accounts.
- Installers go to future installer portal, hidden for now.
- Store goes to future employee portal/staff login.
- Remove customer lookup button from staff login page.

Implemented:

- Landing page role cards.
- Installer future/inactive.
- Store to staff login.
- Customer lookup remains under Customers.
- Staff login helper changed to tell customers to start from main portal.

### Phase 11: Deployment Problems And Fixes

User repeatedly needed step-by-step deploy help.

Key issue:

- Server still showed old portal entry page.
- `grep` on `/opt/apps/customerportal/app/public/home.html` showed only old `Customer Lookup`.
- Windows local file had `EWCS` and `role-choice-grid`.
- Conclusion: live app folder was old; new files not deployed.

Working deploy method:

- Build `.tgz` on Windows.
- Verify archive contains new `home.html`.
- Upload `.tgz` with `scp`.
- SSH to Linux.
- Extract to staging folder.
- Verify staging.
- `rsync` staging to app folder.
- `npm ci --omit=dev`.
- Restart service.
- Verify live file and curl.

### Phase 12: Popup/Progress Messages

User tested customer concern message and almost missed the inline status message below form.

User requested:

- Small popup over contact form for progress like sending email.
- Email did not work; asked if production mode caused it.

Clarification:

- Production mode does not cause SMTP failure.
- Email depends on SMTP config.
- Development mode was used for HTTP/session-cookie testing because production requires HTTPS cookies.

Implemented:

- Customer contact form popup overlay with Sending/Sent/Error.
- Inline status remains as backup.

### Phase 13: Latest State Before This Handoff

Latest user request:

- Create handoff summary and transcript of the whole chat for future chat.
- Commit and push.

This file was created in response.

## Quick Prompt For Future Chat

Paste this into the next chat:

```text
We are continuing the Edgewater Contract Portal in F:\ONGOINGPROJECTS\CUSTOMERPORTAL. Read CHAT_HANDOFF_2026-05-25.md first. The current test URL is http://contracts-v6.edgewaterhomestores.com. Latest expected commit is after 2af217b. Do not commit DEVSERVER.odt. We need to keep customer-facing views simple, hide internal pages, keep admin page-level control, use the staff-only packet password formula privately, and continue testing/deploying to /opt/apps/customerportal/app on the Linux server 192.168.1.70.
```
