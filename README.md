# Edgewater Contract Portal

This Contract Portal generates Edgewater contract packets from `assets/templates/customer-packet.pdf`, lets the store choose which packet pages to include, protects the generated PDFs with a signer-specific password, and gives the customer, employee, or installer a server-hosted signing page for notes, initials, and an e-signature.

The current prototype also includes a customer portal login based on packet records, a customer order/payment view, customer contact requests, first-run setup, admin-managed staff users, and optional PostgreSQL-backed live records. Full employee and installer workflows and full password reset are planned for later phases.

Contract creation is being staged: Customer Information Sheet, Quick Measurement, Estimate, initial signatures, and then Detachable Addendum A only if split payment is needed. The current starter PDF still uses template page numbers for field placement, but the portal now records stable section IDs so later attachments are identified by document type instead of final PDF page number. Page 4 is required and is always included. Vendor job orders and receiving/material paperwork are internal, while acknowledgements, receipts, installer agreement, delivery signoff, pickup release, and customer checklist sections can be selected for the final customer packet when they apply. A manual estimate PDF can be attached as the estimate section; automatic RFMS/CabQuotes/LavaCake estimate lookup is planned after the production file location is decided.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Current Guides

- `SERVER_INSTALL_OWNER_ADMIN_GUIDE.md`: owner/admin server install guide with a tech appendix.
- `NEXT_STEPS_AFTER_DATABASEADD.md`: priority process after database setup, before UI polish.
- `QUICKSTART_INITIAL_ADMIN.md`: first admin setup after the server is installed.
- `QUICKSTART_REGULAR_USER.md`: staff user quickstart.
- `DEPLOY_COPY_PASTE_STEPS.txt`: concise deploy/update copy-paste commands.

That local URL is only for development/testing on the machine running the app. Production is intended to be self-hosted on the Pueblo, Colorado Linux server and reached over the internet by Edgewater, Florida users through the final HTTPS domain.

For testing from another device on the same local network, set `PUBLIC_BASE_URL` in `.env` to the LAN address, such as `http://192.168.1.69:3000`, so emailed signing links open the test server.

## Customer password

Generated PDFs and signing links require a packet password. Customer-facing screens should tell customers to use the password provided by the store representative, not explain how the temporary password is generated.

Staff-only current temporary pattern: first 4 letters of the customer last name + street/building number + last 4 digits of phone. Do not put this pattern in customer-facing instructions or signing screens.

## SMTP

Final signed PDFs are always saved under `data/generated`. Customer signing-link emails and store final-packet emails are skipped until SMTP values are added to `.env`:

```text
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_TO=
```

## Deploying To The Linux Server

Use `SERVER_INSTALL_OWNER_ADMIN_GUIDE.md` as the current owner/admin server setup guide. Deploy this as a Node app behind HTTPS, set `PUBLIC_BASE_URL` to the final portal domain such as `https://contracts.edgewaterhomestores.com`, and keep `assets/templates/customer-packet.pdf` available on the server. The app also needs Python with `pypdf` installed for password protection. Install `cryptography` too if you want AES-256 encryption instead of the built-in RC4-128 fallback:

```powershell
python -m pip install pypdf cryptography
```

The signature captured in the portal is an e-signature image placed into the PDF. It is not a certificate-backed cryptographic digital signature.

The customer can sign online through the emailed link after agreeing to electronic signing. If they do not agree to sign electronically, the store should have them sign in store or on paper. If they have technical trouble, the same signing page includes a download for the password-protected fillable PDF.

Downloaded and emailed contract PDFs use the naming format `CONTRACT-LAST-YYYYMMDD-ESTNUM.pdf`; the estimate number segment is included when available.

The signing page captures customer communication permissions: required account/contract email acknowledgement, optional marketing email, optional account/order texts, and optional marketing texts.

Store representative signatures can be saved from the admin settings page by upload or drawing directly on a phone/tablet/touchscreen.

Small phone screens show a larger-device notice and a request form for phone app, dedicated tablet mode, signature pad, and installer/delivery app requests.
