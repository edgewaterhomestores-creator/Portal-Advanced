# Contracts Portal Security Lockdown Checklist

Prepared for the `security cleanup` deployment package.

## Before Deploying

1. Back up PostgreSQL and the app data folder before replacing files.
2. Confirm `.env` is not included in the upload package.
3. Confirm `NODE_ENV=production`.
4. Confirm `DATABASE_URL` points to local PostgreSQL only.
5. Confirm `SESSION_SECRET` is a long random value and is not the default.

## Backup Command

Run from the Linux server:

```bash
cd /opt/apps/customerportal/app
sudo bash scripts/backup-live-data.sh
```

The backup script writes under `/opt/apps/customerportal/backups`.

## Session Store

When `DATABASE_URL` is configured, staff sessions are stored in PostgreSQL table `portal_sessions`.
If PostgreSQL is unavailable, the app can still run, but sessions will not have the same production durability.

Admin check:

```bash
curl -b cookies.txt https://contracts.edgefam.us/api/security/status
```

Use the logged-in browser/admin UI for normal verification.

## Secret Rotation

Rotate these after a suspected exposure, after deployment mistakes, or before final go-live:

- `SESSION_SECRET`
- `DATABASE_URL` password
- SMTP app password
- Gmail OAuth client secret
- Any temporary admin passwords

After changing `.env`, restart the service:

```bash
sudo systemctl restart customerportal
```

## Firewall / Private Financial Routes

Public web traffic should only reach Nginx on ports 80 and 443.
Keep Node and PostgreSQL private:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw deny 3000/tcp
sudo ufw deny 5432/tcp
sudo ufw status verbose
```

The app also blocks future `/financial`, `/finance`, `/payroll`, `/payments-admin`, and `/owner-financial` routes unless the request comes from a private network/VPN or `ALLOW_PUBLIC_FINANCIAL_ROUTES=true` is set.

## Post-Deploy Checks

```bash
curl http://127.0.0.1:3000/api/health; echo
curl https://contracts.edgefam.us/api/health; echo
sudo journalctl -u customerportal -n 80 --no-pager -l
```

