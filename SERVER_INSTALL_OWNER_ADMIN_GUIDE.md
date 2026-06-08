# Contract Portal Server Install Guide

Audience: owner, admin, or tech helper installing the portal on the server.

This guide assumes the app will run on the Linux server and staff will use it through a browser. Staff users do not need database tools, SSH, or DBeaver.

## What Gets Stored Where

- PostgreSQL stores shared live records: staff users, customer portal accounts, business/settings JSON, customers, suppliers, products, imports, contract packets, estimate records, and autosave drafts.
- Server files store PDFs, uploaded documents, OCR staging files, generated packets, and file backups. The app still writes settings/users JSON backups, but PostgreSQL is the source of truth when `DATABASE_URL` is configured.
- The first admin account is created in the browser at `/setup`.
- Additional staff users are created later in `Admin Menu > Users`.

## Before You Start

You need:

- Server SSH login.
- Server sudo password.
- The upload file from Windows: `F:\customerportal-upload.tgz`.
- A PostgreSQL password for the portal database user.
- A long `SESSION_SECRET`.
- The public website hostname.

Use a database password with only letters, numbers, underscore, or dash if possible. If the password has symbols like `@`, `:`, `/`, `#`, `%`, `?`, or `&`, it must be URL-encoded inside `DATABASE_URL`.

## Windows Upload

Open Windows Command Prompt.

```bat
cd /d F:\
scp customerportal-upload.tgz michelle-work@192.168.1.70:/home/michelle-work/uploads/customerportal-upload.tgz
ssh michelle-work@192.168.1.70
```

## Server Deploy

Run this after logging into the server:

```bash
rm -rf ~/uploads/customerportal
mkdir -p ~/uploads/customerportal
tar -xzf ~/uploads/customerportal-upload.tgz -C ~/uploads/customerportal

sudo rsync -av --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude 'data/generated' \
  --exclude 'data/packets' \
  --exclude 'data/logs' \
  --exclude 'data/settings' \
  --exclude 'data/estimates' \
  --exclude 'data/estimate-module' \
  --exclude 'data/preimport' \
  ~/uploads/customerportal/ /opt/apps/customerportal/app/

cd /opt/apps/customerportal/app
sudo chown -R customerportal:customerportal /opt/apps/customerportal/app
sudo -u customerportal npm ci --omit=dev
```

## PostgreSQL Setup

Run this once. If the user or database already exists, that is okay.

```bash
sudo -u postgres psql
```

Inside `psql`, run this with your real password:

```sql
CREATE USER customer_portal_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE customer_portal OWNER customer_portal_user;
\q
```

If the user already exists and you need to set the password:

```bash
sudo -u postgres psql
```

```sql
ALTER USER customer_portal_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';
\q
```

Then confirm ownership/permissions:

```bash
sudo -u postgres psql -d postgres -c "ALTER DATABASE customer_portal OWNER TO customer_portal_user;"
sudo -u postgres psql -d customer_portal <<'SQL'
ALTER SCHEMA public OWNER TO customer_portal_user;
GRANT CONNECT ON DATABASE customer_portal TO customer_portal_user;
GRANT USAGE, CREATE ON SCHEMA public TO customer_portal_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO customer_portal_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO customer_portal_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO customer_portal_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO customer_portal_user;
SQL
```

## Environment File

Edit the server `.env`:

```bash
sudo nano /opt/apps/customerportal/app/.env
```

Minimum live values:

```env
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://contracts-v6.edgewaterhomestores.com
SESSION_SECRET=replace-with-a-long-random-secret
STAFF_MAX_ACTIVE_SESSIONS=3
PORTAL_SEED_STAFF=false
DATABASE_URL=postgresql://customer_portal_user:CHANGE_THIS_PASSWORD@localhost:5432/customer_portal
```

SMTP can stay blank until email is ready:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Contract Portal <email@example.com>"
SMTP_TO=
```

Save nano with `Ctrl+O`, Enter, then `Ctrl+X`.

## Start And Check

```bash
sudo systemctl restart customerportal
sleep 5
sudo systemctl status customerportal --no-pager
curl http://127.0.0.1:3000/api/health
```

You want:

```text
Active: active (running)
{"ok":true}
```

If the first curl fails immediately after restart, wait a few seconds and run it again.

## First Browser Setup

Open:

```text
https://contracts-v6.edgewaterhomestores.com/setup
```

If there are no staff users yet, setup will ask for:

- Business details.
- First admin name.
- First admin username.
- First admin password.

On a true first run, the normal public customer/staff entry page should not appear yet. The site root and staff login redirect to `/setup` until the first admin user exists.

After setup, the first admin can add regular staff users at:

```text
Admin Menu > Users
```

If `/setup` redirects to login, staff users already exist.

## Database Creation Note

For this hosted/server version, the database server, database name, and database user are created by the installer or tech helper. The portal software then creates its own tables/schema when `DATABASE_URL` is configured.

For a future downloadable installer, the installer can hide more of this by creating local storage or database settings during setup. Staff users should still be created through `/setup` and `Admin Menu > Users`, not by editing files by hand.

## Clean First Run After Testing

Only do this if you intentionally want to remove test records. It makes a backup first.

```bash
cd /opt/apps/customerportal/app
set -e

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/opt/apps/customerportal/backups/pre-true-first-run-$TS"

sudo mkdir -p "$BACKUP_DIR"
sudo rsync -a /opt/apps/customerportal/app/data/ "$BACKUP_DIR/data/" || true

if sudo -u postgres psql -d customer_portal -tAc "SELECT 1" >/dev/null 2>&1; then
  sudo -u postgres pg_dump -d customer_portal -Fc | sudo tee "$BACKUP_DIR/customer_portal.dump" >/dev/null
fi

sudo systemctl stop customerportal

if sudo -u postgres psql -d customer_portal -tAc "SELECT 1" >/dev/null 2>&1; then
  sudo -u postgres psql -d customer_portal <<'SQL'
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contract_drafts',
    'contract_packets',
    'customer_accounts',
    'estimate_records',
    'import_runs',
    'portal_settings',
    'staff_users',
    'customers',
    'suppliers',
    'products'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', tbl);
    END IF;
  END LOOP;
END $$;
SQL
fi

sudo rm -rf data/generated/* data/packets/* data/estimate-module/* data/estimates/* data/preimport/*
sudo rm -f data/settings/users.json data/settings/business.json

sudo mkdir -p data/generated data/packets data/estimate-module data/estimates data/preimport data/settings
sudo chown -R customerportal:customerportal data

sudo systemctl start customerportal
sleep 5
curl http://127.0.0.1:3000/api/health

echo "Backup saved at: $BACKUP_DIR"
```

After that, open `/setup`.

## Appendix For Tech Helpers

Service:

```bash
sudo systemctl status customerportal --no-pager
sudo journalctl -u customerportal -n 120 --no-pager -l
```

Ports:

```bash
sudo ss -ltnp | grep -E ':3000|:5432'
```

Database tables:

```bash
sudo -u postgres psql -d customer_portal <<'SQL'
SELECT 'customers' AS table_name, count(*) FROM customers
UNION ALL SELECT 'suppliers', count(*) FROM suppliers
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'contract_packets', count(*) FROM contract_packets
UNION ALL SELECT 'estimate_records', count(*) FROM estimate_records
UNION ALL SELECT 'contract_drafts', count(*) FROM contract_drafts
UNION ALL SELECT 'import_runs', count(*) FROM import_runs
ORDER BY table_name;
SQL
```

DBeaver from Windows should use an SSH tunnel. Do not open PostgreSQL to the public internet.

Manual tunnel:

```bat
ssh -N -L 15432:127.0.0.1:5432 michelle-work@192.168.1.70
```

DBeaver settings:

```text
Host: 127.0.0.1
Port: 15432
Database: customer_portal
User: customer_portal_user
SSL: disabled
```

Security reminders:

- Keep Node port `3000` private behind Nginx.
- Keep PostgreSQL port `5432` private.
- Use HTTPS for public access.
- Keep `.env` out of upload archives.
- Back up both PostgreSQL and `/opt/apps/customerportal/app/data`.
