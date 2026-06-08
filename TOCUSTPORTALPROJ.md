# TOCUSTPORTALPROJ

Server setup handoff for Customer Portal, Installer Portal, TerpTrainer, and future portal projects.

Last updated: 2026-05-23

## Purpose

This document tells each project how the Linux server is expected to be set up so the coding teams can build toward the same environment.

The beginner setup steps live in:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\BEGINNER_LINUX_SERVER_SETUP_GUIDE.md
```

This file is the shorter shared server contract.

## Server Role

One self-hosted Linux machine in Pueblo, Colorado will host multiple web apps across the internet for Edgewater, Florida users.

Known hardware note:

```text
Acer Aspire A514-54
11th Gen Intel i5-1135G7 @ 2.40 GHz
8 GB RAM
Intel Iris Xe graphics
```

Expected use:

- Low customer traffic at first.
- Also used lightly as a dev/studio machine.
- Direct Linux install is preferred at first, not a heavy virtual machine.
- Ubuntu Studio is already installed on the Pueblo server. Use it as the baseline unless there is a reason to reinstall.
- Edgewater Florida staff/customers will use the Pueblo server through public HTTPS URLs.
- Future Edgewater-store local storage/database can write locally first, then sync changed records to the Pueblo-hosted server.

## Public Web Layout

Nginx is the public front door.

Only these public ports should be exposed by the router/firewall:

```text
80/tcp   HTTP
443/tcp  HTTPS
22/tcp   SSH, only if remote terminal access is needed
```

Do not expose app ports directly.

Do not expose database ports directly.

Nginx will route public hostnames to local app ports:

```text
contracts.edgewaterhomestores.com   -> 127.0.0.1:3000 -> Customer Portal / Contracts Portal
customers.edgewaterhomestores.com   -> 127.0.0.1:3000 -> same app if used as an alias
installer.edgewaterhomestores.com   -> 127.0.0.1:3011 -> Installer Portal shell
employee.edgewaterhomestores.com    -> 127.0.0.1:3012 -> Employee Portal shell
terptrainer.edgewaterhomestores.com -> 127.0.0.1:3002 -> TerpTrainer, if hosted as web app
```

Future apps should use the next available local port:

```text
3013, 3014, 3015, etc.
```

## DNS And Host Records

If the internet connection has a static public IP, DNS can use `A` records:

```text
A  contracts    -> STATIC_PUBLIC_IP
A  customers    -> STATIC_PUBLIC_IP
A  installer    -> STATIC_PUBLIC_IP
A  employee     -> STATIC_PUBLIC_IP
A  terptrainer  -> STATIC_PUBLIC_IP
```

If the internet connection has a changing public IP, use Dynamic DNS.

Example with No-IP or DuckDNS:

```text
edgewatercabinets.ddns.net -> current public IP
```

Then create CNAME records:

```text
CNAME  contracts   -> edgewatercabinets.ddns.net
CNAME  customers   -> edgewatercabinets.ddns.net
CNAME  installer   -> edgewatercabinets.ddns.net
CNAME  employee    -> edgewatercabinets.ddns.net
CNAME  terptrainer -> edgewatercabinets.ddns.net
```

If the ISP uses CGNAT or port forwarding does not work, normal Dynamic DNS will not be enough. Ask the ISP for a real public IP/static IP, or use a small VPS reverse proxy later if needed.

## Router Setup

If using normal DNS or Dynamic DNS, router port forwarding should be:

```text
External TCP 80  -> Linux server LAN IP TCP 80
External TCP 443 -> Linux server LAN IP TCP 443
```

Do not forward:

```text
3000
3011
3012
3002
3306
5432
```

The Linux server should have a fixed LAN address. Prefer router/app DHCP reservation if the router or ISP app supports it. If not, set the static LAN IP inside Ubuntu Studio with NetworkManager/`nmcli`.

Example:

```text
192.168.1.50
```

## App Folder Layout

Hosted apps should live under:

```text
/opt/apps
```

Expected folders:

```text
/opt/apps/customerportal/app
/opt/apps/installerportal/app
/opt/apps/terptrainer/app
```

Each app should have its own Linux service user:

```text
customerportal
installerportal
terptrainer
```

Each app should have its own `.env` file:

```text
/opt/apps/customerportal/app/.env
/opt/apps/installerportal/app/.env
/opt/apps/terptrainer/app/.env
```

Permissions:

```text
.env files should be chmod 600
.env files should be owned by that app's Linux user
```

Do not commit `.env` files to git.

## systemd Services

Each app should run as its own systemd service.

Expected service names:

```text
customerportal.service
installerportal.service
terptrainer.service
```

Customer Portal service shape:

```ini
[Unit]
Description=Edgewater Customer Portal
After=network.target

[Service]
Type=simple
User=customerportal
Group=customerportal
WorkingDirectory=/opt/apps/customerportal/app
Environment=NODE_ENV=production
EnvironmentFile=/opt/apps/customerportal/app/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Other portal services should follow the same pattern with their own user, folder, and port.

## Nginx Sites

Customer Portal Nginx route:

```nginx
server {
    listen 80;
    server_name contracts.edgewaterhomestores.com customers.edgewaterhomestores.com;

    client_max_body_size 35M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Installer Portal Nginx route:

```nginx
server {
    listen 80;
    server_name installer.edgewaterhomestores.com;

    client_max_body_size 35M;

    location / {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

TerpTrainer Nginx route, if hosted on this machine as a web app:

```nginx
server {
    listen 80;
    server_name terptrainer.edgewaterhomestores.com;

    client_max_body_size 35M;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After HTTPS is added, Certbot will update Nginx to listen on `443` too.

## Databases

Database ports stay private on the server.

```text
MySQL port:      3306 local only
PostgreSQL port: 5432 local only
```

### PostgreSQL Direction

Customer Portal, Installer Portal, delivery/driver workflows, customer records, contracts, orders, signatures, audit logs, and shared operational data should use PostgreSQL.

Prepared database:

```text
Database: customer_portal
User: customer_portal_user
Host: localhost
Port: 5432
```

Connection string shape for coding teams:

```text
postgresql://customer_portal_user:YOUR_PASSWORD@localhost:5432/customer_portal
```

Recommended app env name:

```text
DATABASE_URL=postgresql://customer_portal_user:YOUR_PASSWORD@localhost:5432/customer_portal
```

Important:

- The current Customer Portal prototype still stores records as local files.
- The coding team should migrate Customer Portal to PostgreSQL.
- Installer Portal should not create a separate disconnected customer/order database if it needs the same jobs, customers, contracts, or delivery records.
- Use roles and permissions in the app so installers/drivers only see their portion.

### MySQL Direction

MySQL is available for TerpTrainer or other apps that are already MySQL-based.

Example database:

```text
Database: terptrainer
User: terptrainer_user
Host: localhost
Port: 3306
```

Connection string shape:

```text
mysql://terptrainer_user:YOUR_PASSWORD@localhost:3306/terptrainer
```

Customer Portal and Installer Portal should use PostgreSQL unless a future architecture decision changes that.

## Customer Portal Current Runtime Requirements

Customer Portal is a Node.js app.

Current source project on the Windows dev machine:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL
```

Expected server path:

```text
/opt/apps/customerportal/app
```

Expected public URL:

```text
https://contracts.edgewaterhomestores.com
```

Expected local port:

```text
3000
```

Required server packages:

```text
Node.js LTS
Python 3
pypdf
cryptography
Nginx
PostgreSQL prepared for future migration
```

Current file storage until PostgreSQL migration:

```text
/opt/apps/customerportal/app/data/packets
/opt/apps/customerportal/app/data/generated
/opt/apps/customerportal/app/data/settings
/opt/apps/customerportal/app/data/logs
```

Current PDF template:

```text
/opt/apps/customerportal/app/assets/templates/customer-packet.pdf
```

Current Python helper:

```text
/opt/apps/customerportal/app/scripts/encrypt_pdf.py
```

Required Customer Portal `.env` shape:

```text
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://contracts.edgewaterhomestores.com
SESSION_SECRET=long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong-password
PYTHON_BIN=/opt/apps/customerportal/venv/bin/python
DATABASE_URL=postgresql://customer_portal_user:YOUR_PASSWORD@localhost:5432/customer_portal
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Edgewater Cabinet Store <emailserver@edgewaterhomestores.com>"
SMTP_TO=edgewatercabinetstore@gmail.com
```

## Installer Portal Expected Runtime

Current source project on the Windows dev machine:

```text
F:\ONGOINGPROJECTS\INSTALLERPORTAL
```

Expected server path:

```text
/opt/apps/installerportal/app
```

Expected public URL:

```text
https://installer.edgewaterhomestores.com
```

Expected local port:

```text
3011
```

Expected database direction:

```text
Use PostgreSQL customer_portal database if Installer Portal shares jobs/customers/contracts/delivery data.
```

Required Installer Portal `.env` shape:

```text
NODE_ENV=production
PORT=3011
PUBLIC_BASE_URL=https://installer.edgewaterhomestores.com
SESSION_SECRET=long-random-secret
DATABASE_URL=postgresql://customer_portal_user:YOUR_PASSWORD@localhost:5432/customer_portal
```

Installer Portal should not expose admin/customer data beyond the installer's role.

## Future Portal Rules

For every new portal:

1. Pick the next free local port.
2. Create a Linux user.
3. Put the app in `/opt/apps/APPNAME/app`.
4. Create `/etc/systemd/system/APPNAME.service`.
5. Create `/etc/nginx/sites-available/APPNAME`.
6. Add DNS for the app hostname.
7. Add HTTPS with Certbot.
8. Keep secrets in `.env`.
9. Keep app data out of the public web root.
10. Add backup rules before production use.

Recommended port reservation table:

```text
3000 customerportal
3011 installerportal
3012 employeeportal
3002 terptrainer
3013 next portal/app
3014 next portal/app
```

## File Upload And Generated Document Rules

Customer-facing generated PDFs, signatures, uploaded quotes, acknowledgements, receipts, delivery forms, and customer documents must be treated as private data.

Do not serve storage folders directly through Nginx.

Use app routes that check permissions before download.

Customer-facing packets must not expose internal vendor paperwork unless explicitly allowed by business rules.

Internal/store archive may include vendor invoices, vendor receipts, job orders, receiving paperwork, and job-costing files.

## Backups

Back up every app's:

```text
.env
uploaded files
generated files
settings files
logs, if needed for audit/troubleshooting
database dumps
```

Customer Portal file backups until PostgreSQL migration:

```text
/opt/apps/customerportal/app/data
```

PostgreSQL backup target:

```text
customer_portal
```

MySQL backup target for TerpTrainer:

```text
terptrainer
```

Backups should be copied somewhere other than the same internal drive.

## Security Expectations

Required:

- HTTPS for public portals.
- Strong `SESSION_SECRET`.
- Strong admin passwords.
- No plain text app passwords in code.
- `.env` files excluded from git.
- App users should not be root.
- Database ports should not be public.
- Nginx should be the only public web front door.
- Generated PDFs and customer files should be private.
- Admin, installer, driver, and customer roles should be separated in app code.

Before full production:

- Move admin users out of `.env` and into PostgreSQL.
- Store password hashes, not plain text passwords.
- Add admin password change and reset workflows.
- Add audit logs for important actions.
- Add rate limiting or lockout for repeated failed login attempts.

## Commands The Server Owner Will Use Often

Customer Portal:

```bash
sudo systemctl status customerportal
sudo systemctl restart customerportal
journalctl -u customerportal -f
```

Installer Portal:

```bash
sudo systemctl status installerportal
sudo systemctl restart installerportal
journalctl -u installerportal -f
```

Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

PostgreSQL:

```bash
sudo systemctl status postgresql
sudo -u postgres psql
```

MySQL:

```bash
sudo systemctl status mysql
sudo mysql
```

## Notes For Coding Teams

Build apps so the server owner only has to set environment variables.

Use these env vars where possible:

```text
PORT
PUBLIC_BASE_URL
DATABASE_URL
SESSION_SECRET
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
SMTP_TO
UPLOAD_DIR
DATA_DIR
```

Do not hardcode:

```text
Windows paths
local dev URLs
database passwords
SMTP passwords
absolute production paths unless they are env-configurable
```

The production Linux paths are:

```text
/opt/apps/customerportal/app
/opt/apps/installerportal/app
/opt/apps/terptrainer/app
```

The Windows development paths are:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL
F:\ONGOINGPROJECTS\INSTALLERPORTAL
F:\ONGOINGPROJECTS\EMPLOYEEPORTAL
```

The coding team should adapt Customer Portal and Installer Portal to PostgreSQL using:

```text
DATABASE_URL=postgresql://customer_portal_user:YOUR_PASSWORD@localhost:5432/customer_portal
```

If a future project needs MySQL, use a separate MySQL database and user for that project.
