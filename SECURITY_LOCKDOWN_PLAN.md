# Security Lockdown Plan

Use this after the current portal deploy is running and `curl http://127.0.0.1:3000/api/health` returns `{"ok":true}` on the server.

This plan has two tracks:

- Immediate Contract Portal lockdown.
- Future private financial systems network.

## Immediate Contract Portal Lockdown

Goal: public users can reach only the web portal through HTTPS. Database ports, Node ports, files, and admin internals stay private.

### 1. Confirm Public HTTPS

- Confirm the public URL loads over HTTPS.
- Confirm HTTP redirects to HTTPS.
- Confirm the customer signing flow works through HTTPS.
- Set `NODE_ENV=production` only when HTTPS is working, because secure cookies require HTTPS.

Server `.env` should include:

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://contracts-v6.edgewaterhomestores.com
SESSION_SECRET=long-random-secret
DATABASE_URL=postgresql://customer_portal_user:STRONG_PASSWORD@localhost:5432/customer_portal
```

### 2. Firewall Ports

Normal public exposure:

- `80` HTTP for redirect/proxy.
- `443` HTTPS.
- `22` SSH, preferably restricted later if a stable admin IP/VPN exists.

Must not be public:

- `3000` Node app.
- `5432` PostgreSQL.
- `3306` MySQL if present.
- Any future internal app/database/admin ports.

Check:

```bash
sudo ufw status verbose
sudo ss -ltnp
```

### 3. Nginx Boundary

- Nginx is the only public web entry point.
- Node should listen behind Nginx, not be opened to the internet directly.
- Add or confirm security headers after the app is stable:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - a conservative Content Security Policy after testing images/signatures/PDF previews.
- Keep upload size limits intentional for contract PDFs/OCR files.

### 4. PostgreSQL

- PostgreSQL stays local/private.
- Do not open public `5432`.
- DBeaver/admin access should use SSH tunnel only.
- Rotate the temporary database password used during setup.
- Confirm app can connect after rotation.
- Back up PostgreSQL on a schedule.

Useful checks:

```bash
sudo ss -ltnp | grep 5432 || true
psql "$DATABASE_URL" -c "select current_database(), current_user;"
```

### 5. Secrets And File Permissions

- Never upload local `.env`.
- Server `.env` should be readable only by the app/admin users.
- Rotate any temporary passwords used in chat/testing.
- Use strong staff/admin passwords.
- SMTP credentials stay only in server `.env`.
- Confirm `data/generated`, `data/packets`, `data/preimport`, `data/settings`, and `data/estimates` are not under `public`.

### 6. App Accounts And Sessions

Immediate:

- Confirm staff login is required for admin pages.
- Keep customer signing links password-gated.
- Keep packet password pattern out of customer-facing emails/screens.
- Keep `STAFF_MAX_ACTIVE_SESSIONS` reasonable.

Next build:

- Move staff users out of `.env` and into PostgreSQL with password hashes.
- Add staff password change/reset.
- Add role permissions for admin, sales rep, delivery, installer, and customer.
- Add login failure throttling/lockout.
- Add session revocation/admin logout-all.

### 7. Backups

Back up both database and files. The app is hybrid on purpose:

Database:

- `customers`
- `suppliers`
- `products`
- `contract_packets`
- `estimate_records`
- `contract_drafts`
- `import_runs`

Server files:

- `data/generated`
- `data/packets`
- `data/settings`
- `data/estimates`
- `data/preimport`
- logs if needed for audit/troubleshooting

Backup must include a restore test. A backup that has never been restored is not trusted.

### 8. Logs And Monitoring

- Keep systemd logs available.
- Keep app error logs.
- Review failed login/signing attempts.
- Add structured audit events for create/update/sign/email/download/admin actions.
- Consider `fail2ban` after SSH/app login patterns are stable.

### 9. SSH Safety

Do not lock yourself out.

- Keep one SSH session open while testing SSH/firewall changes.
- Prefer SSH key auth later.
- Disable password SSH only after key login is verified from another terminal.
- Consider limiting SSH to a VPN/private admin path later.

## Future Private Financial Systems Network

The financial system should not be exposed like the public contract/customer portal.

Goal: only Edgewater authorized staff/devices can reach financial apps and internal operations modules.

Private-only modules should include:

- invoices
- payments
- refunds/voids/donations/warranty adjustments
- job costing
- vendor costs
- receiving
- payroll/pay-history
- reporting
- database admin tools
- internal APIs

Recommended direction:

- VPN/private overlay or site-to-site access for Edgewater staff.
- Firewall allowlists.
- Device/user authorization.
- Strong app login with roles.
- Audit logs for every financial change.
- Append-only financial records.
- Database ports never public.
- Public customers reach only customer-facing routes/documents intended for them.

This future network should be planned before real financial modules go live.
