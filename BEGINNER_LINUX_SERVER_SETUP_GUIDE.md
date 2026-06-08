# Beginner Linux Server Setup Guide

This guide is for setting up one self-hosted Linux computer to host more than one website or web app across the internet.

It is written for a beginner. If a step says "type this," copy the command exactly, paste it into the Linux Terminal, and press Enter.

This is the single server setup guide for this project. The shorter setup checklist was removed so there is only one place to maintain Linux setup, dynamic DNS, security, and deployment notes.

This guide is written for the Edgewater setup:

- The public self-hosted production server is expected to be physically in Pueblo, Colorado.
- Edgewater Cabinet Store is in Edgewater, Florida and will use the portal across the internet.
- The Pueblo server may also be used lightly as a dev/studio machine.
- Customer Portal / Contracts Portal will run as the current Node.js contract and signing app.
- Installer Portal and Employee Portal shells may run as separate apps on the same Pueblo server while the larger Main Portal is being planned.
- TerpTrainer and other apps may run on the same server later.
- MySQL will be installed for programs that need MySQL, such as TerpTrainer or other modules.
- PostgreSQL will be installed and prepared as the Customer Portal / customer-order-financial-system direction.
- Nginx will receive public web traffic and send it to the right app.
- Dynamic DNS will be used unless the internet provider gives you a static public IP.

Important wording:

- "Local to the server" means inside the Pueblo Linux server, such as `localhost:3000`.
- "Local to Edgewater" means a store computer or store-side database in Edgewater, Florida.
- Those are not the same thing. Edgewater users will normally reach the Pueblo server over the public internet.
- Future offline/local-first work means Edgewater-side computers can write to a local store database first, then sync changes to the Pueblo-hosted server.

## Table Of Contents

Use this as the working table of contents for the Markdown guide. The final compiled print manual should add real page numbers after layout is finished.

```text
0. The Big Picture
1. What You Need Before Starting
2. Confirm The Ubuntu Studio Baseline
3. Open Terminal On Ubuntu Studio
4. Update The Server
5. Install Basic Tools
6. Give The Server A Fixed LAN IP
7. Install OpenSSH For Remote Terminal Access
8. Turn On The Firewall
8A. Should We Use Non-Standard Ports?
9. Install Fail2Ban
10. Install Automatic Security Updates
11. Install Nginx
12. Install Node.js
13. Install Python PDF Requirements
14. Install MySQL
15. Install PostgreSQL
16. Create Folders For Multiple Apps
17. Create A Dedicated Linux User For Customer Portal
18. Pre-Upload Customer Portal Setup
19. Stop Here If Project Files Are Not Ready
20. Copy Customer Portal To The Server
21. Install Customer Portal Node Packages
22. Test Customer Portal Directly
23. Run Customer Portal Automatically With systemd
24. Test Customer Portal Through Nginx
25. Pattern For More Apps Later
26. Check If Your Internet Can Host A Server
27. Router Port Forwarding
28. Choose Dynamic DNS Method
29. Dynamic DNS Option A: No-IP
30. Dynamic DNS Option B: Hostinger DNS API Script
31. Dynamic DNS Option C: DuckDNS
32. Dynamic DNS Option D: ddclient
33. DNS Records For Your Domain
34. Test From Outside The Network
35. Install HTTPS Certificates
36. Backups
37. Log Rotation
38. Safer SSH Settings
39. Daily Server Commands
40. Updating Customer Portal Later
41. Final Go-Live Checklist
42. End Troubleshooting Quick Guide
43. Restarting And Checking Services
44. Final Printed Manual And Index Notes
45. Sources Checked
```

## Quick Index

```text
Apache vs Nginx: see 11, 18, 42
Backups: see 36
BeeBEEP LAN discovery: see 42
CGNAT/private router WAN IP: see 26, 34, 42
Customer Portal service: see 23, 39, 43
DNS records: see 33
Dynamic DNS/No-IP: see 28, 29, 34, 42, 43
Firewall/UFW: see 8, 27, 34, 42
HTTPS certificates: see 35
IPv4 public/static IP: see 26, 27, 33, 34
IPv6 testing: see 18, 33, 34, 42
MySQL: see 14
Nginx site file: see 18, 24, 34, 42, 43
Node.js: see 12, 21, 22, 23
Password validation: see 14, 42
Port forwarding: see 27, 34, 42
PostgreSQL: see 15
SFTP/upload: see 18, 20
Static LAN IP: see 6
Troubleshooting 404/502/timeout: see 42
```

## 0. The Big Picture

When someone visits:

```text
https://contracts.edgewaterhomestores.com
```

the production path is:

```text
Customer/staff browser in Edgewater, FL or elsewhere
-> Internet
-> Pueblo, CO public IP address / Dynamic DNS hostname
-> Pueblo router port forwarding
-> Pueblo Linux server
-> Nginx
-> Customer Portal / Contracts Portal Node app
```

Local testing on the Pueblo server is different:

```text
Pueblo Linux server browser or terminal
-> http://127.0.0.1:3000
-> Customer Portal / Contracts Portal Node app
```

Local testing from another device on the same Pueblo network is also different:

```text
Device on Pueblo LAN
-> http://PUEBLO_SERVER_LAN_IP:3000
-> Customer Portal / Contracts Portal Node app
```

For multiple apps, Nginx routes each public hostname to a different internal app port on the Pueblo server:

```text
contracts.edgewaterhomestores.com -> localhost:3000 -> Customer Portal / Contracts Portal
installer.edgewaterhomestores.com -> localhost:3011 -> Installer Portal shell
employee.edgewaterhomestores.com -> localhost:3012 -> Employee Portal shell
terptrainer.edgewaterhomestores.com -> localhost:3002 -> TerpTrainer
another.edgewaterhomestores.com -> localhost:3003 -> another app
```

Naming note:

- The current public portal name is `contracts.edgewaterhomestores.com`.
- `customers.edgewaterhomestores.com` was part of earlier naming discussion and is not required for the current setup.
- If a customer-facing alias is wanted later, it can point to the same app, but do not set it up now unless deliberately needed.

Databases stay private on the server:

```text
MySQL -> localhost only
PostgreSQL -> localhost only
```

Do not open MySQL port `3306` or PostgreSQL port `5432` to the internet.

Local-first and sync note:

- The current portal writes files on whichever machine is running the app.
- In production, if the app runs on the Pueblo server, those files are local to the Pueblo server and reachable over the internet through the portal.
- Future Edgewater-store software can write to a store-local database first so the store can keep working even if the internet is flaky.
- Future database work should support local-first store writes and then sync changed records to the Pueblo-hosted server.
- The preferred future direction is change-triggered sync. When a customer, contract, estimate, invoice, payment, or document changes in Edgewater, the system queues that change and syncs it to Pueblo.
- Hosted reports can then read synced data in near real time from the Pueblo server without forcing every store action to depend on a live internet round trip.
- The sync layer must track conflicts, retries, timestamps, deleted records, and which machine/user made each change.

## 1. What You Need Before Starting

You need:

- The Linux computer.
- A keyboard, mouse, monitor, and internet connection.
- Router admin login.
- Domain/DNS login for `edgewaterhomestores.com`.
- No-IP Dynamic DNS account, unless your ISP/router provides a usable built-in Dynamic DNS or static public IP option.
- Email/SMTP settings if the portal should send emails.
- A place to store backups.

Useful information to write down:

```text
Server computer name:
Server Linux username:
Pueblo server LAN IP address:
Pueblo public IP or dynamic DNS hostname:
Router login address:
Domain registrar/DNS provider:
Dynamic DNS provider:
Customer Portal domain:
TerpTrainer domain:
Edgewater store LAN details, if store-local sync is added later:
```

For this project, the current known computer note is:

```text
Acer Aspire A514-54
11th Gen Intel i5-1135G7 @ 2.40 GHz
8 GB RAM
Intel Iris Xe graphics
```

That is enough for light traffic. Ubuntu Studio is already installed on this machine, so do not reinstall the operating system just for this portal. Because RAM is limited, start simple: Ubuntu Studio, Nginx, systemd services, MySQL for apps that need it, PostgreSQL for the Customer Portal direction, and no heavy VM unless you later decide isolation matters more.

## 2. Confirm The Ubuntu Studio Baseline

This guide is based on Ubuntu Studio already being installed.

```text
Ubuntu Studio
```

Ubuntu Studio is still Ubuntu underneath, so the same `apt`, `systemd`, Nginx, Node.js, PostgreSQL, MySQL, and firewall commands apply.

Check the installed version:

```bash
lsb_release -a
```

Check the computer name:

```bash
hostnamectl
```

Write down:

```text
Ubuntu version:
Computer name:
Linux username:
```

Do not reinstall Ubuntu unless the existing Ubuntu Studio install is broken or you decide to start over on purpose.

## 3. Open Terminal On Ubuntu Studio

On Ubuntu Studio:

```text
Press Ctrl + Alt + T
```

You can also open Terminal from the application launcher.

## 4. Update The Server

In Terminal:

```bash
sudo apt update && sudo apt upgrade -y
```

What this means:

- `sudo` means "run as administrator."
- `apt update` refreshes the software list.
- `apt upgrade -y` installs updates and answers yes.
- `&&` means the upgrade runs only if the update command succeeds.

If it asks for your password, type your Linux password. You will not see dots while typing. That is normal.

Reboot after the first update:

```bash
sudo reboot
```

Log back in and open Terminal again.

## 5. Install Basic Tools

```bash
sudo apt install -y curl wget git unzip ca-certificates gnupg lsb-release software-properties-common nano
```

What these are:

- `curl` and `wget`: download things.
- `git`: fetch project code.
- `nano`: beginner text editor in Terminal.
- The others help package installs work cleanly.

## 6. Give The Server A Fixed LAN IP

Your router must always know where the Linux server is.

Important:

- This is the server's private LAN IP, such as `192.168.1.50`.
- This is not the public internet IP.
- The public internet IP is handled by the ISP/router and Dynamic DNS.
- The LAN IP must stay the same so router port forwarding always points to the Pueblo Linux server.

You can do this in one of two ways.

### Option A - Router/App DHCP Reservation

```text
Use DHCP reservation in the router or router/ISP app.
```

This is usually the safest method if your router or ISP app allows it, because the router keeps giving the same IP to the same server.

Steps, depending on your router/app:

1. Log in to the router.
2. Find LAN, DHCP, or attached devices.
3. Find the Acer/Ubuntu computer.
4. Reserve an IP address for it.
5. Save/apply the router setting.

Example:

```text
192.168.1.50
```

Some routers do not expose this in the web browser and require their phone app. If that is how your router works, use the app.

After reserving it, reboot the Linux computer:

```bash
sudo reboot
```

Check the server IP:

```bash
hostname -I
```

Write down the first address, such as:

```text
192.168.1.50
```

### Option B - Set Static IP Inside Ubuntu Studio

Use this if the router/app does not let you reserve an IP, or if you specifically want the server to set its own LAN IP.

Before changing anything, write down the current network details:

```bash
ip route | grep default
hostname -I
nmcli connection show --active
```

You need:

```text
Server static IP: 192.168.1.50
Gateway/router IP: usually 192.168.1.1
Netmask/prefix: usually /24
DNS servers: router IP, 1.1.1.1, or 8.8.8.8
```

Do not pick an IP already being used by another device. A safe choice is usually outside the router's automatic DHCP pool, or an IP you have reserved for the server.

Find the active connection name:

```bash
nmcli -t -f NAME,DEVICE connection show --active
```

Example connection names might be:

```text
Wired connection 1
Edgewater WiFi
```

Set the static IP. Replace the values if your network is different:

```bash
CONNECTION="Wired connection 1"
STATIC_IP="192.168.1.50/24"
GATEWAY="192.168.1.1"
DNS_SERVERS="192.168.1.1 1.1.1.1 8.8.8.8"
sudo nmcli connection modify "$CONNECTION" ipv4.method manual ipv4.addresses "$STATIC_IP" ipv4.gateway "$GATEWAY" ipv4.dns "$DNS_SERVERS"
sudo nmcli connection down "$CONNECTION" && sudo nmcli connection up "$CONNECTION"
```

Check it:

```bash
hostname -I
ip route | grep default
ping -c 3 1.1.1.1
ping -c 3 google.com
```

If internet stops working, switch the connection back to automatic DHCP:

```bash
sudo nmcli connection modify "$CONNECTION" ipv4.method auto ipv4.addresses "" ipv4.gateway "" ipv4.dns ""
sudo nmcli connection down "$CONNECTION" && sudo nmcli connection up "$CONNECTION"
```

### Which Method Should We Prefer?

Preferred order:

1. Router/app DHCP reservation if the router or ISP app supports it.
2. Ubuntu Studio static IP with `nmcli` if reservation is not available.

Either way, the end result should be the same:

```text
The Pueblo server always has the same LAN IP.
The router forwards ports 80 and 443 to that LAN IP.
Dynamic DNS points the public hostname to the current Pueblo public IP.
```

## 7. Install OpenSSH For Remote Terminal Access

SSH lets you connect to the server from another computer.

```bash
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh
sudo systemctl status ssh
```

If you see `active (running)`, SSH is working.

From another computer on the same network, you can connect with:

```bash
ssh YOUR_LINUX_USERNAME@192.168.1.50
```

Replace:

```text
YOUR_LINUX_USERNAME
```

with your Linux username, and replace `192.168.1.50` with your server IP.

## 8. Turn On The Firewall

Install UFW firewall:

```bash
sudo apt install -y ufw
```

Set safe defaults:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

What this allows:

- SSH on port `22`.
- Normal web traffic on port `80`.
- Secure HTTPS traffic on port `443`.

Do not open database ports to the internet.

## 8A. Should We Use Non-Standard Ports?

For public websites, use the standard public ports:

```text
80  HTTP
443 HTTPS
```

Reasons:

- Browsers expect normal websites on `80` and `443`.
- HTTPS certificate tools expect `80` or `443`.
- Customers should not have to type a strange port number.

Do not expose the app ports:

```text
3000 Customer/Contracts Portal internal app
3011 Installer Portal internal app
3012 Employee Portal internal app
3002 TerpTrainer internal app if used
```

Those app ports should stay behind Nginx and should not be forwarded by the router.

Do not expose database ports:

```text
3306 MySQL
5432 PostgreSQL
```

For SSH, a non-standard external port can reduce automated login noise, but it is not real security by itself. Better security is:

- strong Linux password or SSH keys,
- no root SSH login,
- Fail2Ban,
- firewall rules,
- updates,
- no public database ports,
- no public app ports.

Safer early setup:

- Allow SSH on the Pueblo LAN while configuring the server.
- Do not forward SSH from the internet until you are sure you need remote terminal access.
- If remote SSH is needed later, use a non-standard external router port or change SSH carefully after confirming you can still log in.

## 9. Install Fail2Ban

Fail2Ban blocks repeated bad login attempts.

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo fail2ban-client status
```

## 10. Install Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

When it asks whether to automatically download and install stable updates, choose:

```text
Yes
```

## 11. Install Nginx

Nginx is the public web front door.

Nginx is not cPanel. It is not a full website control panel. It is the web server/reverse proxy that receives public web traffic and sends it to the correct app running privately on the server.

You do not need Apache for this setup. Nginx is the web server/reverse proxy.

Do not install Apache unless there is a separate future reason. Apache and Nginx both try to use public web ports `80` and `443`, so running both can create confusing port conflicts.

Plain-English version:

```text
Customer opens https://contracts.edgewaterhomestores.com
Nginx receives the request on 443
Nginx privately forwards it to http://127.0.0.1:3000
Customer Portal answers
```

Control/interface options:

- Ubuntu Studio gives you the normal desktop, file manager, browser, and terminal.
- Nginx itself is controlled by config files and terminal commands.
- Cockpit can be installed later if you want a simple web dashboard for the Linux machine.
- Do not expose Cockpit, Webmin, database admin panels, or other server control panels publicly until security is planned.

Optional Cockpit install for LAN-only server management:

```bash
sudo apt install -y cockpit
sudo systemctl enable --now cockpit.socket
```

Then open this from the Pueblo LAN only:

```text
https://PUEBLO_SERVER_LAN_IP:9090
```

Do not port-forward `9090` to the internet.

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl status nginx
```

Test locally:

```bash
curl http://localhost
```

If you see HTML, Nginx is running.

You can also open a browser on the server and visit:

```text
http://localhost
```

## 12. Install Node.js

The Customer Portal is a Node.js app.

Recommended: Node.js LTS.

Use NodeSource for a current LTS Node version. Node 24 is LTS as of May 2026. Node 22 LTS is also acceptable if a package needs it.

Do not use the pipe command with `sudo -E bash -`. On this Ubuntu Studio setup, `sudo -E` may be ignored and the pipe method can produce confusing errors.

For Node 24, use this safer download-then-run method:

```bash
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
file nodesource_setup.sh
head -n 5 nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
npm -v
```

The `file` and `head` checks should show that `nodesource_setup.sh` is a readable shell script. If it looks like an error page, HTML, or binary data, do not run it.

If Node 24 causes trouble later, use Node 22 instead:

```bash
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
file nodesource_setup.sh
head -n 5 nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
npm -v
```

Fallback if NodeSource fails:

```bash
sudo apt install -y nodejs npm
node -v
npm -v
```

The Ubuntu package fallback may install an older Node version. Use it only if the NodeSource setup cannot be made to work.

## 13. Install Python PDF Requirements

Customer Portal uses Python to password-protect PDFs.

```bash
sudo apt install -y python3 python3-pip python3-venv
python3 --version
```

Later, each app can have its own Python virtual environment. For Customer Portal we will create one under `/opt/apps/customerportal`.

## 14. Install MySQL

MySQL is for TerpTrainer or other programs that need MySQL.

```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
sudo systemctl status mysql
```

Check that MySQL listens locally:

```bash
sudo ss -tap | grep mysql
```

You want to see loopback/local-only style output.

Good examples:

```text
LISTEN 0 151 127.0.0.1:mysql
LISTEN 0 70  127.0.0.1:33060
```

What that means:

- `127.0.0.1:mysql` means MySQL is listening only on loopback/local computer.
- `127.0.0.1:33060` is the MySQL X Protocol port. It is okay if it is also on loopback/local computer.
- The numbers such as `151` and `70` are queue/backlog values from `ss`; they are not public ports.

Bad examples:

```text
0.0.0.0:mysql
*:mysql
[::]:mysql
0.0.0.0:33060
```

Those would mean MySQL may be listening on every network interface. If you see those, stop and fix MySQL binding before continuing.

You can also check with port numbers:

```bash
sudo ss -ltnp | grep -E '3306|33060'
```

Good output should show `127.0.0.1:3306`, `127.0.0.1:33060`, `[::1]:3306`, or `[::1]:33060`, not `0.0.0.0`.

Secure MySQL:

```bash
sudo mysql_secure_installation
```

Beginner answers:

```text
Validate password component: Yes.
Password validation level: MEDIUM.
Remove anonymous users: Yes.
Disallow root login remotely: Yes.
Remove test database: Yes.
Reload privilege tables: Yes.
```

Password validation note:

- Use `MEDIUM` for this server.
- `LOW` mostly checks password length.
- `MEDIUM` checks length, mixed case, numbers, and special characters.
- `STRONG` also checks against a dictionary/common-password list and can be more annoying during setup.

If MySQL refuses a password, it usually means the password is too short, too simple, missing uppercase/lowercase letters, missing a number, or missing a special character.

Common rejection message:

```text
Your password does not satisfy the current policy requirements
```

You may also see:

```text
ERROR 1819 (HY000): Your password does not satisfy the current policy requirements
```

MySQL may also show a password strength estimate. If the strength is low or the password is rejected, choose a new password that checks every box:

```text
At least 8 characters
At least one uppercase letter
At least one lowercase letter
At least one number
At least one special character, such as ! - _ @ #
Not a common word, store name, customer name, or simple phrase
```

Examples that may fail:

```text
password123
edgewater
customerportal
```

Examples that should pass MEDIUM:

```text
TerpTrainer-DB-2026!
CustPortal-2026-Strong!
Edgewater_SQL-2026!
```

This validation applies to MySQL database passwords. It does not change the customer PDF password rule and does not change the portal admin login unless admin users are later moved into MySQL.

Create a MySQL database for TerpTrainer later:

```bash
sudo mysql
```

Inside MySQL, type:

```sql
CREATE DATABASE terptrainer;
CREATE USER 'terptrainer_user'@'localhost' IDENTIFIED BY 'CHANGE_THIS_TO_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON terptrainer.* TO 'terptrainer_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Write down:

```text
MySQL database: terptrainer
MySQL user: terptrainer_user
MySQL password: the password you chose
```

## 15. Install PostgreSQL

PostgreSQL is the chosen direction for the Customer Portal/customer/order/financial system. The current Customer Portal code does not use it yet, but installing and preparing PostgreSQL now gives the coding team a clear target.

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

Create a future Customer Portal database:

```bash
sudo -u postgres psql
```

Inside PostgreSQL, type:

```sql
CREATE DATABASE customer_portal;
CREATE USER customer_portal_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_TO_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE customer_portal TO customer_portal_user;
\q
```

Write down:

```text
PostgreSQL database: customer_portal
PostgreSQL user: customer_portal_user
PostgreSQL password: the password you chose
```

Give the coding team this connection shape when they adapt the Customer Portal to PostgreSQL:

```text
postgresql://customer_portal_user:YOUR_PASSWORD@localhost:5432/customer_portal
```

Important:

The current Customer Portal still stores data in:

```text
data/packets
data/generated
data/settings
data/logs
```

The database migration is a future coding step.

## 16. Create Folders For Multiple Apps

Use `/opt` for hosted apps.

```bash
sudo mkdir -p /opt/apps
sudo mkdir -p /opt/backups
```

Customer Portal will live here:

```text
/opt/apps/customerportal
```

Installer Portal shell can live here:

```text
/opt/apps/installerportal
```

Employee Portal shell can live here:

```text
/opt/apps/employeeportal
```

TerpTrainer can live here later:

```text
/opt/apps/terptrainer
```

## 17. Create A Dedicated Linux User For Customer Portal

Do not run web apps as root.

```bash
sudo adduser --system --group --home /opt/apps/customerportal customerportal
sudo mkdir -p /opt/apps/customerportal/app
sudo chown -R customerportal:customerportal /opt/apps/customerportal
```

For Installer Portal shell:

```bash
sudo adduser --system --group --home /opt/apps/installerportal installerportal
sudo mkdir -p /opt/apps/installerportal/app
sudo chown -R installerportal:installerportal /opt/apps/installerportal
```

For Employee Portal shell:

```bash
sudo adduser --system --group --home /opt/apps/employeeportal employeeportal
sudo mkdir -p /opt/apps/employeeportal/app
sudo chown -R employeeportal:employeeportal /opt/apps/employeeportal
```

For TerpTrainer later:

```bash
sudo adduser --system --group --home /opt/apps/terptrainer terptrainer
sudo mkdir -p /opt/apps/terptrainer/app
sudo chown -R terptrainer:terptrainer /opt/apps/terptrainer
```

## 18. Pre-Upload Customer Portal Setup

This section is safe to do before the Customer Portal project files are copied to the server.

You can do these now:

- Create the Python environment.
- Create the `.env` file.
- Create and enable the Nginx site file.

Do not do these until after the project files are copied:

- Install Customer Portal Node packages.
- Test the Customer Portal app.
- Start the Customer Portal systemd service.
- Run the final Customer Portal Nginx health check.

### 18A. Create Customer Portal Python Environment

Ubuntu installs virtual-environment support as a separate package. On this server, install the Python 3.14 venv package first:

```bash
python3 --version
sudo apt install -y python3.14-venv
```

If `python3 --version` shows a different version, install the matching package instead, such as `python3.12-venv` or `python3-venv`.

If you see this message:

```text
The virtual environment was not created successfully because ensurepip is not available.
```

it means the venv package is missing. Install the matching `python3.x-venv` package, then run the venv command again.

```bash
sudo -u customerportal python3 -m venv /opt/apps/customerportal/venv
sudo -u customerportal /opt/apps/customerportal/venv/bin/pip install --upgrade pip
sudo -u customerportal /opt/apps/customerportal/venv/bin/pip install pypdf cryptography
```

### 18B. Create Customer Portal Environment File

Create the `.env` file:

```bash
sudo -u customerportal nano /opt/apps/customerportal/app/.env
```

Paste this starter version:

```text
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://contracts.edgewaterhomestores.com
SESSION_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_VALUE
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_THIS_TO_A_STRONG_PASSWORD
PYTHON_BIN=/opt/apps/customerportal/venv/bin/python

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Edgewater Cabinet Store <emailserver@edgewaterhomestores.com>"
SMTP_TO=edgewatercabinetstore@gmail.com

# Optional diagnostics only. The current portal is not SQL-backed yet.
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASS=
MYSQL_DATABASE=

# Future use. Current code does not read this yet.
DATABASE_URL=postgresql://customer_portal_user:CHANGE_THIS_TO_A_STRONG_PASSWORD@localhost:5432/customer_portal
```

SMTP note:

- You do not need to install a full mail server for normal portal email.
- The portal should send email through an SMTP provider using the `.env` settings above.
- Use the LavaCake Estimates SMTP settings later if those are the known working credentials.
- Keep `SMTP_PORT=587` and `SMTP_SECURE=false` for normal STARTTLS SMTP unless the provider tells you otherwise.
- If SMTP fields are blank, signing, PDF download, and printing can still be tested, but email sending will fail or be skipped depending on the code path.
- Do not install Postfix/sendmail for this portal unless we decide later that the Linux server itself must relay mail.

The important SMTP values to collect later are:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
SMTP_TO
```

In nano:

```text
Ctrl + O saves
Enter confirms
Ctrl + X exits
```

Lock down the file:

```bash
sudo chown customerportal:customerportal /opt/apps/customerportal/app/.env
sudo chmod 600 /opt/apps/customerportal/app/.env
```

Generate a good session secret:

```bash
openssl rand -base64 48
```

Copy the output and use it for `SESSION_SECRET`.

### 18C. Pre-Create Nginx Site For Customer Portal

This can be created before the app files are uploaded. Nginx can accept the configuration now, but the website itself will not work until the Node app is installed and running on port `3000`.

This setup also includes one tiny static HTML file that can be used before the full project is copied. That lets you test public access, DNS, router forwarding, and Nginx without needing the Customer Portal app to be running yet.

#### Information

```text
Windows test file:
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment\nginx-access-test.html

Linux temporary test-page location:
/opt/apps/customerportal/nginx-access-test.html

Optional friendly phone test page:
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment\jamie-phone-test.html

Optional Linux friendly phone test location:
/opt/apps/customerportal/jamie-phone-test.html

Optional logo for friendly phone test:
/opt/apps/customerportal/jamie-test-logo.png

Linux real Customer Portal app location:
/opt/apps/customerportal/app
```

What happens:

```text
SFTP moves the test file from Windows to a Linux staging folder.
The Linux cp command installs the test file where Nginx can read it.
Nginx serves /_server-test.html from that temporary test file.
Nginx sends / and everything else to the Customer Portal app on port 3000.
```

#### Step 1 - Create The Linux Staging Folder

Type this on the Linux server:

```bash
mkdir -p ~/uploads/customerportal
```

#### Step 2 - Upload The One Test File From Windows

Use FileZilla or WinSCP on Windows, or use the Windows command-line `sftp` method in Step 20B.

Upload this Windows file:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment\nginx-access-test.html
```

to this Linux folder:

```text
/home/YOUR_LINUX_USERNAME/uploads/customerportal
```

Optional friendly phone test:

Upload this Windows file too if you want a simple animated page for store staff to test from a phone:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment\jamie-phone-test.html
```

If you want the friendly phone test to show a logo, upload the logo too and name it:

```text
jamie-test-logo.png
```

If the logo is not uploaded yet, the friendly phone test page still works and hides the missing image.

#### Step 3 - Install The Test File For Nginx

Type this on the Linux server:

```bash
sudo cp ~/uploads/customerportal/nginx-access-test.html /opt/apps/customerportal/nginx-access-test.html
sudo chown root:root /opt/apps/customerportal/nginx-access-test.html
sudo chmod 644 /opt/apps/customerportal/nginx-access-test.html
```

If you uploaded the optional friendly phone test page, also type:

```bash
sudo cp ~/uploads/customerportal/jamie-phone-test.html /opt/apps/customerportal/jamie-phone-test.html
sudo chown root:root /opt/apps/customerportal/jamie-phone-test.html
sudo chmod 644 /opt/apps/customerportal/jamie-phone-test.html
```

If you uploaded the optional logo, also type:

```bash
sudo cp ~/uploads/customerportal/jamie-test-logo.png /opt/apps/customerportal/jamie-test-logo.png
sudo chown root:root /opt/apps/customerportal/jamie-test-logo.png
sudo chmod 644 /opt/apps/customerportal/jamie-test-logo.png
```

#### Step 4 - Create Or Edit The Nginx Site File

Type this on the Linux server:

```bash
sudo nano /etc/nginx/sites-available/customerportal
```

Paste:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com YOUR_NOIP_HOSTNAME;

    client_max_body_size 35M;

    location = /_server-test.html {
        alias /opt/apps/customerportal/nginx-access-test.html;
        default_type text/html;
    }

    location = /jamie-test.html {
        alias /opt/apps/customerportal/jamie-phone-test.html;
        default_type text/html;
    }

    location = /jamie-test-logo.png {
        alias /opt/apps/customerportal/jamie-test-logo.png;
        default_type image/png;
    }

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

Notes:

- The whole example above is one `server { ... }` block.
- Replace `YOUR_NOIP_HOSTNAME` with the temporary No-IP hostname if you are testing public access before the real Edgewater DNS name is pointed at the server.
- Example: `edgewatercontracts.ddns.net`.
- If you are not testing through the No-IP hostname, you can remove `YOUR_NOIP_HOSTNAME`.
- Do not add `customers.edgewaterhomestores.com` unless you intentionally create that as a future alias.
- Keep `listen [::]:80;` if testing direct IPv6.
- Keep `contracts-v6.edgewaterhomestores.com` if testing the temporary IPv6 DNS name.
- The `location = /_server-test.html { ... }` block goes inside that same `server { ... }` block.
- The optional `location = /jamie-test.html { ... }` block also goes inside that same `server { ... }` block.
- The optional `location = /jamie-test-logo.png { ... }` block serves the logo for the friendly phone test page.
- Put it above the normal `location / { ... }` block.
- Do not paste it inside the `location / { ... }` block.
- If you paste the full example above, it is already in the correct place.

Nginx words in plain English:

- `listen 80;` means this website block answers normal HTTP requests on IPv4 port `80`.
- `listen [::]:80;` means this website block also answers normal HTTP requests on IPv6 port `80`.
- `server_name` lists the domains and subdomains this website block should answer for.
- If a browser asks for a domain that is not listed in the right `server_name`, Nginx may answer from the wrong/default website block and show `404 Not Found`.
- `location = /_server-test.html` means "only match this exact browser path."
- `alias /opt/apps/customerportal/nginx-access-test.html;` means "serve this real Linux file when someone opens `/_server-test.html`."
- `location = /jamie-test.html` is the same idea, but serves the optional friendly phone test page.
- `location = /jamie-test-logo.png` serves the optional logo used by the friendly phone test page.
- This test URL does not expose or use the real Linux file path in the browser.
- `location /` means "everything else."
- In this setup, `location /` sends the normal portal traffic to the Node app on `127.0.0.1:3000`.
- Do not write `location = /` for the portal app. The equals sign means "only the exact homepage." If you use `location = /`, the homepage may load but CSS, JavaScript, and `/api/health` will show `404`.

Plain-English version:

```text
/_server-test.html uses the temporary static test file.
/jamie-test.html uses the optional friendly phone test page.
/jamie-test-logo.png uses the optional logo for the phone test page.
/ and everything else goes to the Customer Portal app on port 3000.
```

#### Step 5 - Enable The Site And Reload Nginx

Type this on the Linux server:

```bash
sudo ln -sfn /etc/nginx/sites-available/customerportal /etc/nginx/sites-enabled/customerportal
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

If `sudo unlink /etc/nginx/sites-enabled/default` says the file does not exist, that is okay. Continue with `sudo nginx -t` and reload.

Why this matters:

```text
Ubuntu Nginx often enables a default website.
If that default site stays enabled, it can answer requests before the Contract Portal site.
That can cause 404 Not Found even when the app is running and the customerportal Nginx site looks correct.
```

Check enabled sites:

```bash
ls -l /etc/nginx/sites-enabled
```

Good current setup:

```text
customerportal -> /etc/nginx/sites-available/customerportal
```

The `default` site should not be listed for this simple Contract Portal setup.

Good result:

```text
syntax is ok
test is successful
```

Do not run the Customer Portal `/api/health` curl test yet. It will fail or show a bad gateway response until the app files are uploaded and the Node app is running.

#### Step 6 - Test The Temporary Static File Locally

Type this on the Linux server:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

If you see HTML that includes this text, the local Nginx test file is working:

```text
Customer Portal Nginx Test OK
```

If the optional friendly phone test page was installed, test it locally too:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/jamie-test.html
```

Good output includes:

```text
Hi, Jamie
```

If you get `502 Bad Gateway`, check the URL carefully.

This is correct:

```text
/_server-test.html
```

This is wrong for the temporary Nginx-only test:

```text
/server-test.html
/
/api/health
```

Those wrong paths go to the Customer Portal Node app on port `3000`. If the app is not uploaded and running yet, Nginx will show `502 Bad Gateway`.

If the exact `/_server-test.html` URL still gives `502 Bad Gateway`, check:

```bash
sudo nginx -t
```

If you are testing with a No-IP hostname in a browser, make sure the No-IP hostname is listed on the `server_name` line:

```bash
sudo grep -n "server_name" /etc/nginx/sites-available/customerportal
```

Example:

```nginx
server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

If the No-IP hostname is missing, edit the site file and add it:

```bash
sudo nano /etc/nginx/sites-available/customerportal
```

Then reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Then check that the test file exists:

```bash
ls -l /opt/apps/customerportal/nginx-access-test.html
```

Then check that the Nginx site has the static test location:

```bash
sudo grep -n "_server-test" /etc/nginx/sites-available/customerportal
```

Reload Nginx after any change:

```bash
sudo systemctl reload nginx
```

#### Step 7 - Test From Outside Later

After router forwarding and DNS are ready, try this from a phone or computer not on the Pueblo Wi-Fi:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

If the optional friendly phone test page was installed, store staff can test:

```text
http://contracts-v6.edgewaterhomestores.com/jamie-test.html
```

Use `https://` only after HTTPS certificates are installed.

## 19. Stop Here If Project Files Are Not Ready

If the Customer Portal files are not ready to copy yet, stop the Customer Portal app setup here.

You may still continue with later general server sections such as internet hosting checks, router forwarding, dynamic DNS, backups, and security planning. Come back to Step 20 when you are ready to copy the project files.

If public internet access is blocked by CGNAT or while waiting for the ISP to assign a static/public IPv4 address, you can still continue with Step 20 and the app install steps.

What works before the app is uploaded:

```text
http://192.168.1.70/_server-test.html
```

What will not work until after the app is uploaded, dependencies are installed, and the `customerportal` service is running:

```text
http://192.168.1.70:3000
http://192.168.1.70/api/health
```

Public testing through `contracts.edgewaterhomestores.com` must wait until the ISP gives the router a real public/static IPv4 address, or until a reverse-proxy solution is added later.

## 20. Copy Customer Portal To The Server

Final server location:

```text
/opt/apps/customerportal/app
```

Do not copy `node_modules` from Windows. Linux should install its own dependencies.

Recommended upload method: SFTP.

SFTP feels like FTP, but it is encrypted and uses the OpenSSH server already installed in Step 7. Do not use old plain FTP unless there is a separate reason, because plain FTP can send usernames, passwords, and files without encryption.

If SFTP will not connect, check the Linux server:

```bash
sudo systemctl status ssh
sudo ufw status
```

SSH/SFTP needs port `22` allowed on the LAN. Do not port-forward SSH to the public internet until the safer SSH settings section is complete.

### 20A. Create The SFTP Upload Folder

Run this on the Linux server, in the Linux Terminal, using your normal Ubuntu login user:

```bash
mkdir -p ~/uploads/customerportal
```

This upload folder is just a staging area. It is not the final app folder.

Plain-English:

```text
Windows has the project files.
Linux has the upload/staging folder.
SFTP moves files from Windows into the Linux upload/staging folder.
Then rsync moves files from the staging folder into the real app folder.
```

### 20B. Connect From Windows With SFTP

Use FileZilla, WinSCP, or another SFTP client.

If you need to install one from Windows PowerShell or Command Prompt, use `winget`.

Install WinSCP:

```powershell
winget install --id WinSCP.WinSCP -e
```

Install FileZilla:

```powershell
winget install --id FileZilla.Client -e
```

If `winget` is not found, install from the Microsoft Store app installer updates, or use the built-in Windows command-line `sftp` method below.

Do not type `Protocol: SFTP` into the Linux terminal. That is a setting in the Windows SFTP program.

If using FileZilla or WinSCP, fill in the connection screen like this:

```text
Protocol: SFTP
Host: PUEBLO_SERVER_LAN_IP
Port: 22
Username: your Ubuntu login username
Password: your Ubuntu login password
Remote folder: /home/YOUR_LINUX_USERNAME/uploads/customerportal
```

Replace:

```text
PUEBLO_SERVER_LAN_IP
```

with the server's LAN IP, such as `192.168.1.70`.

Replace:

```text
YOUR_LINUX_USERNAME
```

with the Ubuntu username you log into the Linux server with.

For example, if the server LAN IP is `192.168.1.70`, use:

```text
sftp://192.168.1.70
```

If using Windows Command Prompt or PowerShell instead of FileZilla/WinSCP, the command shape is:

```powershell
sftp YOUR_LINUX_USERNAME@PUEBLO_SERVER_LAN_IP
```

After it connects and shows an `sftp>` prompt, type:

```text
cd uploads/customerportal
lcd F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment
put nginx-access-test.html
bye
```

That command-line example uploads only the temporary Nginx test file. For uploading the whole project, FileZilla or WinSCP is easier because you can drag the folder contents while skipping `node_modules` and `.env`.

### 20B-2. Command Prompt Upload Method

Use this method if WinSCP or FileZilla hangs.

Important:

```text
Commands that reference F:\ are Windows commands.
Run those from Windows Command Prompt, not from inside the Linux SSH session.

Commands that reference /home, ~/uploads, /opt/apps, sudo, rsync, or systemctl are Linux commands.
Run those on the Linux server, either through ssh or after logging in with ssh.
```

If you accidentally run this from the Linux server:

```text
scp "F:\customerportal-upload.tgz" ...
```

Linux will not understand `F:\`. It may treat `F:` like a remote hostname and fail with a message such as:

```text
Could not resolve hostname f
```

That means the command was run on the wrong computer. Type `exit` to leave SSH, then run the `scp` command from Windows Command Prompt.

On Windows Command Prompt, create a compressed upload file:

```bat
cd /d F:\ONGOINGPROJECTS\CUSTOMERPORTAL

tar -czf "F:\customerportal-upload.tgz" --exclude=.git --exclude=node_modules --exclude=.codex_tmp --exclude=.env --exclude=DEVSERVER.odt --exclude=data/generated --exclude=data/packets --exclude=data/logs --exclude=data/settings .
```

Check that the archive exists:

```bat
dir F:\customerportal-upload.tgz
```

If it shows a file size, continue.

From Windows Command Prompt, create or clear the Linux staging folder:

```bat
ssh YOUR_LINUX_USERNAME@PUEBLO_SERVER_LAN_IP "rm -rf ~/uploads/customerportal && mkdir -p ~/uploads/customerportal"
```

From Windows Command Prompt, upload the archive:

```bat
scp "F:\customerportal-upload.tgz" YOUR_LINUX_USERNAME@PUEBLO_SERVER_LAN_IP:/home/YOUR_LINUX_USERNAME/uploads/customerportal-upload.tgz
```

Then log into the Linux server:

```bat
ssh YOUR_LINUX_USERNAME@PUEBLO_SERVER_LAN_IP
```

On Linux, extract the archive into staging:

```bash
rm -rf ~/uploads/customerportal
mkdir -p ~/uploads/customerportal
tar -xzf ~/uploads/customerportal-upload.tgz -C ~/uploads/customerportal
```

Now verify that staging has the actual app files:

```bash
ls -l ~/uploads/customerportal/package.json
ls -l ~/uploads/customerportal/package-lock.json
ls -l ~/uploads/customerportal/server/index.js
ls -l ~/uploads/customerportal/public/index.html
```

If any of those files are missing, stop.

Do not run the `rsync --delete` command until those files exist in the staging folder.

Upload the Customer Portal project contents into:

```text
/home/YOUR_LINUX_USERNAME/uploads/customerportal
```

From Windows, copy these into the upload folder:

```text
assets
public
scripts
server
data
package.json
package-lock.json
.env.example
README.md
HOW_TO_USE.md
```

For the `data` folder, copy the folder structure only if possible.

The server needs these folders:

```text
data/generated
data/logs
data/packets
data/settings
```

Do not copy your Windows test customer records, generated PDFs, or log files unless you intentionally want those test records on the server.

Do not upload:

```text
node_modules
.git
.codex_tmp
.env
DEVSERVER.odt
data/generated/*.pdf
data/packets/*.json
data/logs/*.log
data/settings/*.json
```

Do not upload `.env` over the server copy.

### 20C. Copy From The Upload Folder Into The App Folder

After upload, copy from the staging folder into the real app folder:

Safety check before using `--delete`:

```bash
ls -l ~/uploads/customerportal/package.json
ls -l ~/uploads/customerportal/server/index.js
```

Both commands must show real files.

If either command says `No such file or directory`, stop. The upload/staging folder is empty or wrong. Running `rsync --delete` from an empty staging folder will delete the existing app files in `/opt/apps/customerportal/app`.

```bash
sudo rsync -av --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .codex_tmp \
  --exclude .env \
  --exclude DEVSERVER.odt \
  --exclude "data/generated/*.pdf" \
  --exclude "data/packets/*.json" \
  --exclude "data/logs/*.log" \
  --exclude "data/settings/*.json" \
  ~/uploads/customerportal/ /opt/apps/customerportal/app/
sudo chown -R customerportal:customerportal /opt/apps/customerportal/app
```

The `.env` file should stay on the server because the `rsync` command excludes it.

If you accidentally ran `rsync --delete` from an empty staging folder:

```text
Do not panic.
Re-upload or re-extract the archive into ~/uploads/customerportal.
Verify package.json and server/index.js exist in staging.
Run the rsync command again.
Then run npm ci and restart the service.
```

For other portals, use the same pattern but change the names:

```text
Customer Portal:
Windows project folder: F:\ONGOINGPROJECTS\CUSTOMERPORTAL
Archive: F:\customerportal-upload.tgz
Linux staging: ~/uploads/customerportal
Linux app folder: /opt/apps/customerportal/app
Linux app user: customerportal
Systemd service: customerportal

Installer Portal:
Windows project folder: F:\ONGOINGPROJECTS\INSTALLERPORTAL
Archive: F:\installerportal-upload.tgz
Linux staging: ~/uploads/installerportal
Linux app folder: /opt/apps/installerportal/app
Linux app user: installerportal
Systemd service: installerportal

Employee Portal:
Windows project folder: F:\ONGOINGPROJECTS\EMPLOYEEPORTAL
Archive: F:\employeeportal-upload.tgz
Linux staging: ~/uploads/employeeportal
Linux app folder: /opt/apps/employeeportal/app
Linux app user: employeeportal
Systemd service: employeeportal
```

### 20D. Verify The Copied Files And Environment File

Before installing Node packages, verify the app files are in the real app folder:

```bash
ls -la /opt/apps/customerportal/app
ls -la /opt/apps/customerportal/app/server
ls -la /opt/apps/customerportal/app/public
```

These files should exist:

```text
/opt/apps/customerportal/app/package.json
/opt/apps/customerportal/app/package-lock.json
/opt/apps/customerportal/app/server/index.js
```

Check whether `.env` exists:

```bash
sudo ls -l /opt/apps/customerportal/app/.env
```

If `.env` already exists because you created it in Step 18B, keep it.

If `.env` does not exist, create it now.

Option 1, if `.env.example` was copied:

```bash
sudo cp /opt/apps/customerportal/app/.env.example /opt/apps/customerportal/app/.env
sudo -u customerportal nano /opt/apps/customerportal/app/.env
```

Option 2, if `.env.example` is not there:

```bash
sudo -u customerportal nano /opt/apps/customerportal/app/.env
```

Then paste the starter `.env` block from Step 18B.

After creating or editing `.env`, lock it down:

```bash
sudo chown customerportal:customerportal /opt/apps/customerportal/app/.env
sudo chmod 600 /opt/apps/customerportal/app/.env
```

Beginner note:

```text
.env.example is only a template.
.env is the real private server settings file.
Do not overwrite .env during normal app uploads.
Do not put real passwords in .env.example.
```

### Optional Direct SFTP Into The Final App Folder

The staging-folder method above is preferred because it avoids permission confusion.

If you really want your Ubuntu login user to SFTP directly into the final app folder, install ACL support and give only your current user write access:

```bash
sudo apt install -y acl
sudo setfacl -R -m u:$USER:rwx /opt/apps/customerportal/app
sudo setfacl -dR -m u:$USER:rwx /opt/apps/customerportal/app
```

Then use this SFTP remote folder:

```text
/opt/apps/customerportal/app
```

Even with direct SFTP, do not upload `node_modules`, and do not overwrite `.env`.

For this setup, do not use `git clone`.

## 21. Install Customer Portal Node Packages

```bash
cd /opt/apps/customerportal/app
sudo -u customerportal npm ci --omit=dev
```

If `npm ci` complains because the lock file is out of date, use:

```bash
sudo -u customerportal npm install --omit=dev
```

## 22. Test Customer Portal Directly

Run the app by hand first:

```bash
cd /opt/apps/customerportal/app
sudo -u customerportal npm test
sudo -u customerportal npm start
```

You should see something like:

```text
Edgewater packet portal listening on http://localhost:3000
```

Open another Terminal and test:

```bash
curl http://127.0.0.1:3000/api/health
```

Expected:

```json
{"ok":true}
```

Stop the manual app with:

```text
Ctrl + C
```

## 23. Run Customer Portal Automatically With systemd

systemd keeps the app running after reboot.

Create a service file:

```bash
sudo nano /etc/systemd/system/customerportal.service
```

Paste:

```ini
[Unit]
Description=Edgewater Contract Portal
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

Save and exit nano.

Before enabling the service, confirm the files and Node path:

```bash
ls -l /opt/apps/customerportal/app/.env
ls -l /opt/apps/customerportal/app/server/index.js
which node
```

Good current Acer result:

```text
/opt/apps/customerportal/app/.env exists and is owned by customerportal
/opt/apps/customerportal/app/server/index.js exists
/usr/bin/node
```

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable customerportal
sudo systemctl start customerportal
sudo systemctl status customerportal
```

If it says `active (running)`, it worked.

If you get this error:

```text
Failed to enable unit: Unit customerportal.service does not exist
Failed to restart customerportal.service: Unit customerportal.service not found.
Unit customerportal.service could not be found.
```

it means the service file was not created or was saved in the wrong place.

Create it again:

```bash
sudo nano /etc/systemd/system/customerportal.service
```

Paste the service file shown above, save it, then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable customerportal
sudo systemctl restart customerportal
sudo systemctl status customerportal --no-pager
```

If it fails after that, check logs:

```bash
journalctl -u customerportal -n 80 --no-pager
```

View logs:

```bash
journalctl -u customerportal -f
```

Exit log view:

```text
Ctrl + C
```

## 24. Test Customer Portal Through Nginx

Only do this after:

- Project files are copied.
- Node packages are installed.
- The Customer Portal app starts successfully.
- The `customerportal` systemd service is active.

Test locally:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/api/health
```

Expected:

```json
{"ok":true}
```

If this fails before the app files are uploaded, that is expected. If it fails after the app is running, check:

```bash
sudo systemctl status customerportal
journalctl -u customerportal -n 80
ls -l /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl status nginx
```

If the enabled sites list includes `default`, disable it:

```bash
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Then retest:

```bash
curl -H "Host: contracts-v6.edgewaterhomestores.com" http://127.0.0.1/api/health
```

If the homepage loads but has no styling, test CSS:

```bash
curl -I http://127.0.0.1:3000/css/styles.css
curl -H "Host: contracts-v6.edgewaterhomestores.com" -I http://127.0.0.1/css/styles.css
```

If direct Node returns `200 OK` but Nginx returns `404`, check the Nginx location block:

```bash
sudo nl -ba /etc/nginx/sites-available/customerportal
```

The app proxy block must be:

```nginx
location / {
```

not:

```nginx
location = / {
```

After fixing it:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

You can also open this browser test page after the app files are uploaded and the Node app is running:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

If HTTPS is installed, use:

```text
https://contracts.edgewaterhomestores.com/_server-test.html
```

Run the deeper server diagnostics from the Linux terminal:

```bash
cd /opt/apps/customerportal/app
sudo -u customerportal npm run test:server
```

This checks:

- Project files.
- Required environment values.
- Customer Portal app port.
- Customer Portal `/api/health`.
- Nginx route to the app.
- Static Nginx access test page.
- SMTP connection and login if SMTP is configured.
- MySQL local port and optional login if MySQL diagnostics values are configured.
- PostgreSQL local port and login if `DATABASE_URL` is configured.

If SMTP is blank, that test will be skipped. If MySQL login values are blank, only the MySQL port check will run.

## 25. Pattern For More Apps Later

Each app gets:

- Its own Linux user.
- Its own folder.
- Its own port.
- Its own `.env`.
- Its own systemd service.
- Its own Nginx site file.

Current app port plan:

```text
Customer Portal / Contracts Portal: 3000
Installer Portal shell: 3011
Employee Portal shell: 3012
```

Example TerpTrainer plan:

```text
Linux user: terptrainer
Folder: /opt/apps/terptrainer/app
Local port: 3002
Public name: terptrainer.edgewaterhomestores.com
Database: MySQL terptrainer
```

Example Nginx site for TerpTrainer:

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

## 26. Check If Your Internet Can Host A Server

You need inbound traffic from the internet.

Do this test on the Pueblo internet connection because the production server is expected to be in Pueblo, Colorado. The Edgewater Florida store does not need inbound router forwarding just to use the Pueblo-hosted portal.

Find your public IP:

```bash
curl ifconfig.me
```

Write it down.

Now log in to your router and find the WAN/Internet IP.

Compare:

```text
Public IP from curl ifconfig.me
Router WAN IP
```

If they match, normal port forwarding should work.

If they do not match, your ISP may be using CGNAT. CGNAT often blocks normal self-hosting.

If CGNAT is present, normal port forwarding and normal Dynamic DNS usually will not work. Use one of these instead:

- A small VPS reverse proxy.
- Ask ISP for a real public IP.
- Ask ISP for static IP service.

## 27. Router Port Forwarding

This is done in your router, not Linux.

Forward:

```text
External TCP 80  -> 192.168.1.50 TCP 80
External TCP 443 -> 192.168.1.50 TCP 443
```

Replace `192.168.1.50` with your server LAN IP.

Do not forward:

```text
3000
3011
3012
3306
5432
```

Port `3000` is the current Customer Portal / Contracts Portal app. Port `3011` is reserved for Installer Portal shell. Port `3012` is reserved for Employee Portal shell. TerpTrainer should use `3002` if it is hosted as a web app.

Nginx is the only public front door.

## 28. Choose Dynamic DNS Method

Because there is no static IP, Dynamic DNS is needed.

Use this order:

1. If the ISP/router offers a usable built-in Dynamic DNS service or static public IP option, use that first.
2. Otherwise, use **No-IP official updater**. This is the active recommendation for this setup.
3. Use the Hostinger DNS API script only as an advanced alternate path.
4. Use DuckDNS only for testing or backup unless it proves reliable enough for production.
5. Use `ddclient` only if the DNS provider is directly supported by `ddclient`.

Important:

- Hostinger shared/business hosting is not the same thing as Dynamic DNS.
- Dynamic DNS is about automatically updating DNS records when the Pueblo public IP changes.
- What matters is where DNS for `edgewaterhomestores.com` is managed.
- Step 29 is the active No-IP path.
- Step 30 is an alternate Hostinger DNS API path.
- Step 31 DuckDNS is a testing/backup option only.
- `ddclient` is separate from Hostinger shared hosting. Skip Step 32 for Hostinger unless current `ddclient` docs or `ddclient --help` explicitly show Hostinger support.

## 29. Dynamic DNS Option A: No-IP

This is the current chosen path for this setup unless the ISP/router provides a better built-in option.

Use this because:

- It is easier to set up and troubleshoot than a custom DNS API script.
- It has a known Linux updater.
- It avoids depending on DuckDNS reliability for the production portal.
- It can point your real domain to a No-IP hostname.

### A. Create No-IP Hostname

1. Create a No-IP account.
2. Add a hostname.
3. For record type, choose **A / DNS Hostname**.

Example:

```text
edgewatercontracts.ddns.net
```

What to enter:

```text
Hostname / Host:
edgewatercontracts

Domain:
Pick one of No-IP's available free domains, such as ddns.net.

Record Type:
A / DNS Hostname

IP Address:
Your current public/global IPv4 address.

Enable Dynamic DNS:
Yes / checked

Wildcard:
No / unchecked
```

Do not enter:

```text
https://edgewatercontracts.ddns.net
edgewatercontracts.ddns.net:443
contracts.edgewaterhomestores.com
```

Beginner note:

- The No-IP hostname is not the final customer-facing address.
- The customer-facing address will still be something like `contracts.edgewaterhomestores.com`.
- The No-IP hostname is the behind-the-scenes moving pointer to your Pueblo public IP.
- Pick any free No-IP domain that is available. Since customers should normally use the Edgewater domain, the exact No-IP free domain is mostly for the server/DNS setup.
- Some free Dynamic DNS services require periodic confirmation. If No-IP asks for monthly confirmation on a free hostname, complete it or consider a paid plan later.

Record type choices:

- Use **A / DNS Hostname** for this setup. This points the hostname to your public IPv4 address.
- Do not use **URL Redirect**. That is only a web redirect and is not the right base for the portal.
- Do not use **CNAME** for the No-IP free hostname. CNAME is used later in your real domain DNS, if needed.
- Do not use **AAAA** unless your ISP gives you a public IPv6 address and you intentionally configure IPv6 on the router, firewall, Nginx, and SSL.
- Check **Enable Dynamic DNS**. This lets No-IP create/use the DDNS update credentials for the hostname.
- Leave **Wildcard** unchecked. Wildcard makes extra subdomains under the No-IP hostname resolve too, and this portal does not need that.

Protocol note:

- DNS records do not use `http` or `https`.
- You do not choose HTTPS in No-IP for an A record.
- HTTPS is handled later by Nginx and Certbot on the Linux server.
- The No-IP updater only keeps the hostname pointed at the correct public IP.

Make sure the No-IP hostname points to your current public IP.

### B. Install No-IP DUC On Linux

No-IP's Linux DUC is the updater that tells No-IP when your public IP changes.

Printed guide note:

- If your printed copy says this is Step 28B, that printed section is stale.
- The current No-IP install section is **Step 29B**.
- Use this Step 29B section instead of the original printed Step 28B.

Run one command at a time.

Go to your home folder:

```bash
cd ~
```

Download the No-IP Linux installer:

```bash
wget --content-disposition https://www.noip.com/download/linux/latest
```

Check that a No-IP `.tar.gz` file downloaded:

```bash
ls noip-duc_*.tar.gz
```

Extract the downloaded file:

```bash
tar xf noip-duc_*.tar.gz
```

Check that the extracted folder exists:

```bash
ls -d noip-duc_*/
```

Go into the installer folder:

```bash
cd noip-duc_*/binaries
```

Install the `.deb` package:

```bash
sudo apt install ./noip-duc_*_amd64.deb
```

If those wildcard commands do not work, use No-IP's current exact version commands from their Linux download page.

As of this guide update, No-IP lists Linux DUC `3.3.0`.

Go to your home folder:

```bash
cd ~
```

Download the installer:

```bash
wget --content-disposition https://www.noip.com/download/linux/latest
```

Extract version `3.3.0`:

```bash
tar xf noip-duc_3.3.0.tar.gz
```

Go into the version `3.3.0` installer folder:

```bash
cd /home/$USER/noip-duc_3.3.0/binaries
```

Install version `3.3.0`:

```bash
sudo apt install ./noip-duc_3.3.0_amd64.deb
```

If No-IP releases a newer version later, replace `3.3.0` with the version shown on No-IP's Linux download page.

If You See `_apt` Permission Denied:

You may see something like:

```text
Download is performed unsandboxed as root...
file could not be accessed by user '_apt'
```

This usually means apt's restricted `_apt` user could not read the local `.deb` file from your home folder. It does not always mean the install failed.

First check whether it installed:

```bash
noip-duc --help
```

If `noip-duc --help` works, continue.

If it did not install, copy the `.deb` file to `/tmp` and install it from there.

Go back to the installer folder:

```bash
cd /home/$USER/noip-duc_3.3.0/binaries
```

Copy the package to `/tmp`:

```bash
sudo cp noip-duc_3.3.0_amd64.deb /tmp/
```

Make the copied package readable:

```bash
sudo chmod 644 /tmp/noip-duc_3.3.0_amd64.deb
```

Install from `/tmp`:

```bash
sudo apt install /tmp/noip-duc_3.3.0_amd64.deb
```

Then check again:

```bash
noip-duc --help
```

If You See `noip-duc.service is disabled or static`:

That means the package installed the program, but Linux did not automatically start it as a background service. That is okay at this point.

Continue by running `noip-duc --help`, then test with your DDNS Key.

Check help:

```bash
noip-duc --help
```

No-IP recommends using DDNS Keys. In your No-IP account, create a DDNS Key, then run:

```bash
noip-duc -g all.ddnskey.com --username 'YOUR_DDNS_KEY_USERNAME' --password 'YOUR_DDNS_KEY_PASSWORD'
```

Important:

- Use the **DDNS Key username** and **DDNS Key password** from No-IP.
- Do not use the normal No-IP account password for this command.
- Keep the single quotes around the username and password. They help protect special characters from being changed by the Linux shell.
- If the DDNS Key password contains a single quote character, generate a new DDNS Key password in No-IP. That is easier and safer than trying to escape it manually.
- DDNS Key passwords are only shown once. If you did not save it, generate a new key/password.

If You See `update failed: Incorrect credentials`:

Check these in order:

1. Confirm you are using the DDNS Key username, not just the No-IP account email.
2. Confirm you are using the DDNS Key password, not the normal No-IP account password.
3. Confirm the DDNS Key is attached to the hostname you created.
4. Regenerate the DDNS Key password if you are not 100% sure it was copied correctly.
5. Retry with quotes:

```bash
noip-duc -g all.ddnskey.com --username 'YOUR_DDNS_KEY_USERNAME' --password 'YOUR_DDNS_KEY_PASSWORD'
```

If it still fails, create a fresh DDNS Key for only this hostname and try again.

### C. Run No-IP Automatically On Boot

Original guide note:

- The original document only said to set No-IP up as a service.
- That was not detailed enough.
- Use this section to make No-IP run in the background every time the Linux server starts.

No-IP's current Linux startup instructions use:

- A systemd service file at `/etc/systemd/system/noip-duc.service`
- A config file at `/etc/default/noip-duc`

Go to the extracted No-IP folder:

```bash
cd /home/$USER/noip-duc_3.3.0
```

Check that the service file exists:

```bash
ls debian/service
```

Copy No-IP's service file into the systemd folder:

```bash
sudo cp debian/service /etc/systemd/system/noip-duc.service
```

Create the No-IP config file:

```bash
sudo nano /etc/default/noip-duc
```

Paste this, replacing the username and password with your DDNS Key values:

```text
NOIP_USERNAME='YOUR_DDNS_KEY_USERNAME'
NOIP_PASSWORD='YOUR_DDNS_KEY_PASSWORD'
NOIP_HOSTNAMES=all.ddnskey.com
```

Important:

- Use the DDNS Key username and DDNS Key password.
- Do not use the normal No-IP account password.
- `all.ddnskey.com` updates all hostnames attached to that DDNS Key.
- If you want to update only one hostname instead, use that hostname in `NOIP_HOSTNAMES`.
- If the password contains a single quote character, generate a new DDNS Key password instead of trying to escape it here.

Save and exit nano:

```text
Ctrl+O
Enter
Ctrl+X
```

Protect the config file because it contains the DDNS Key password:

```bash
sudo chmod 600 /etc/default/noip-duc
```

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Enable No-IP at startup:

```bash
sudo systemctl enable noip-duc
```

Start No-IP now:

```bash
sudo systemctl start noip-duc
```

Check status:

```bash
sudo systemctl status noip-duc --no-pager
```

Check logs:

```bash
sudo journalctl -u noip-duc -n 50 --no-pager
```

If the service is running, No-IP should now run automatically after reboot.

Optional reboot test:

```bash
sudo reboot
```

After the server comes back up, check:

```bash
sudo systemctl status noip-duc --no-pager
```

### D. After A Server Reboot

Use this quick checklist any time the Linux server restarts.

Log back into the Linux server, then check the LAN IP:

```bash
hostname -I
```

Make sure this is still the LAN IP used in the router port forwarding.

Check SSH:

```bash
sudo systemctl status ssh --no-pager
```

Check Nginx:

```bash
sudo systemctl status nginx --no-pager
```

If Nginx is not running:

```bash
sudo systemctl start nginx
```

Check No-IP:

```bash
sudo systemctl status noip-duc --no-pager
```

If No-IP is not running:

```bash
sudo systemctl start noip-duc
```

Check No-IP logs:

```bash
sudo journalctl -u noip-duc -n 30 --no-pager
```

If No-IP says `failed` and the logs say:

```text
Failed to load environment files: No such file or directory
```

then `/etc/default/noip-duc` is missing. Create it:

```bash
sudo nano /etc/default/noip-duc
```

Paste this, replacing the username and password with your DDNS Key values:

```text
NOIP_USERNAME='YOUR_DDNS_KEY_USERNAME'
NOIP_PASSWORD='YOUR_DDNS_KEY_PASSWORD'
NOIP_HOSTNAMES=all.ddnskey.com
```

Save and exit nano:

```text
Ctrl+O
Enter
Ctrl+X
```

Protect the file:

```bash
sudo chmod 600 /etc/default/noip-duc
```

Reset the failed service state:

```bash
sudo systemctl reset-failed noip-duc
```

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Start No-IP again:

```bash
sudo systemctl start noip-duc
```

Check status:

```bash
sudo systemctl status noip-duc --no-pager
```

Test the local Nginx static page:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Good result includes:

```text
Customer Portal Nginx Test OK
```

If the Customer Portal app files have already been uploaded and the app service exists, check it:

```bash
sudo systemctl status customerportal --no-pager
```

If it is not running:

```bash
sudo systemctl start customerportal
```

Do not worry if `customerportal` does not exist yet. That service is only created after the actual portal app files are uploaded and configured.

### E. Connect Your Real Domain To No-IP

In the DNS manager for `edgewaterhomestores.com`, create a CNAME:

```text
Type: CNAME
Host/Name: contracts
Target/Value: edgewatercontracts.ddns.net
TTL: Auto or 5 minutes
```

This makes:

```text
contracts.edgewaterhomestores.com
```

point to:

```text
edgewatercontracts.ddns.net
```

which points to your changing Pueblo IP.

## 30. Dynamic DNS Option B: Hostinger DNS API Script

This is not the current chosen path. Use Step 29 for No-IP unless the No-IP plan changes later.

Use this if:

- Hostinger is managing DNS for `edgewaterhomestores.com`.
- You want the Pueblo Linux server to update the public DNS record directly.
- You already have or create a script like `hostinger-ddns.sh`.
- Your Hostinger API token has permission to read/update DNS zone records.

Do not use this just because you have Hostinger shared/business hosting. The hosting plan can keep hosting other websites, but this portal is being hosted from the Pueblo server. For this portal, Hostinger's useful role is DNS management.

If Hostinger DNS is managing the domain but the API script is not ready, you can temporarily update the `A` record manually in hPanel when the Pueblo public IP changes. That is okay for testing, but it is not reliable long-term because the IP can change while you are not watching it.

Important:

- Treat the Hostinger API token like a password.
- Do not paste the token into documentation.
- Do not commit the token to Git.
- If the token was ever exposed in a screenshot, chat, or public repo, rotate it in Hostinger.
- The existing `hostinger-ddns.sh` file should be reviewed before relying on it. It currently behaves like a Python script even though the filename ends in `.sh`.

Safer file pattern:

```text
/opt/ddns/hostinger-ddns.py
/opt/ddns/hostinger-ddns.env
```

The `.env` file should hold secrets:

```text
HOSTINGER_API_TOKEN=CHANGE_THIS
DDNS_DOMAIN=edgewaterhomestores.com
DDNS_SUBDOMAIN=contracts
```

The script should:

1. Get the current Pueblo public IP.
2. Compare it to the last known IP.
3. Update Hostinger DNS only if it changed.
4. Log success or failure.
5. Leave other DNS records alone.

Install Python support if the script uses Python:

```bash
sudo apt install -y python3 python3-venv
python3 -m venv ~/ddns-venv
~/ddns-venv/bin/pip install requests
```

Run the script manually first:

```bash
~/ddns-venv/bin/python /opt/ddns/hostinger-ddns.py
```

If it works, use a systemd timer so Linux runs it automatically.

Create service:

```bash
sudo nano /etc/systemd/system/hostinger-ddns.service
```

Paste:

```ini
[Unit]
Description=Update Hostinger DNS for Edgewater portals

[Service]
Type=oneshot
EnvironmentFile=/opt/ddns/hostinger-ddns.env
ExecStart=/home/YOUR_LINUX_USERNAME/ddns-venv/bin/python /opt/ddns/hostinger-ddns.py
```

Create timer:

```bash
sudo nano /etc/systemd/system/hostinger-ddns.timer
```

Paste:

```ini
[Unit]
Description=Run Hostinger DDNS update every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Unit=hostinger-ddns.service

[Install]
WantedBy=timers.target
```

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hostinger-ddns.timer
sudo systemctl status hostinger-ddns.timer
```

Check logs:

```bash
journalctl -u hostinger-ddns.service -n 50 --no-pager
```

## 31. Dynamic DNS Option C: DuckDNS

Use this if:

- You only need a testing or backup Dynamic DNS path.
- You are okay using a DuckDNS hostname.

Reliability note:

- DuckDNS can be fine for testing and low-risk projects, but it is not the first recommendation for this portal.
- For the production portal, use the ISP/router option if available or No-IP as the normal fallback.
- If DuckDNS is used, test it for several days before depending on it.

Example hostname:

```text
edgewatercabinets.duckdns.org
```

Install curl if it is not already installed:

```bash
sudo apt install -y curl
```

Create DuckDNS folder:

```bash
mkdir -p ~/duckdns
nano ~/duckdns/duck.sh
```

Paste this, replacing the domain and token:

```bash
echo url="https://www.duckdns.org/update?domains=YOUR_DUCKDNS_NAME&token=YOUR_DUCKDNS_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
```

Save and exit.

Make it executable:

```bash
chmod 700 ~/duckdns/duck.sh
```

Test:

```bash
~/duckdns/duck.sh
cat ~/duckdns/duck.log
```

If it says `OK`, it worked.

Run it every 5 minutes:

```bash
crontab -e
```

Add this line at the bottom:

```text
*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

Then create DNS CNAME records:

```text
contracts.edgewaterhomestores.com -> edgewatercabinets.duckdns.org
customers.edgewaterhomestores.com -> edgewatercabinets.duckdns.org
installer.edgewaterhomestores.com -> edgewatercabinets.duckdns.org
employee.edgewaterhomestores.com -> edgewatercabinets.duckdns.org
terptrainer.edgewaterhomestores.com -> edgewatercabinets.duckdns.org
```

## 32. Dynamic DNS Option D: ddclient

Use this only if:

- Your DNS provider is supported by ddclient.
- You prefer one Linux service that can update Dynamic DNS.
- You understand the provider-specific settings.

Do not use `ddclient` for Hostinger just because the domain or hosting is at Hostinger. `ddclient` only works with providers/protocols it supports. If Hostinger is being used for DNS, use the Hostinger DNS API script route in Step 29, or use No-IP/DuckDNS and point Hostinger DNS records to that dynamic hostname.

Install:

```bash
sudo apt install -y ddclient
```

Main config file:

```bash
sudo nano /etc/ddclient.conf
```

Example shape for many Dynamic DNS services:

```text
daemon=300
ssl=yes
use=web, web=ifconfig.me
protocol=dyndns2
server=YOUR_PROVIDER_UPDATE_SERVER
login=YOUR_LOGIN_OR_KEY
password='YOUR_PASSWORD_OR_TOKEN'
YOUR_DYNAMIC_HOSTNAME
```

Restart:

```bash
sudo systemctl enable ddclient
sudo systemctl restart ddclient
sudo systemctl status ddclient
```

Test:

```bash
sudo ddclient -daemon=0 -debug -verbose -noquiet
```

For Namecheap, ddclient has a `namecheap` protocol. Use Namecheap's Dynamic DNS password, not your normal account password.

For DuckDNS, DuckDNS often uses a simple update URL. You can either use ddclient if your version supports DuckDNS, or use DuckDNS's cron script above.

## 33. DNS Records For Your Domain

There are two common ways.

### If You Have A Static Public IP

Create `A` records:

```text
Type: A
Name: contracts
Value: YOUR_STATIC_PUBLIC_IP

Type: A
Name: customers
Value: YOUR_STATIC_PUBLIC_IP

Type: A
Name: installer
Value: YOUR_STATIC_PUBLIC_IP

Type: A
Name: employee
Value: YOUR_STATIC_PUBLIC_IP

Type: A
Name: terptrainer
Value: YOUR_STATIC_PUBLIC_IP
```

### If You Use Hostinger Direct DDNS Script

The Hostinger script can update normal `A` records directly:

```text
Type: A
Name: contracts
Value: CURRENT_PUEBLO_PUBLIC_IP

Type: A
Name: customers
Value: CURRENT_PUEBLO_PUBLIC_IP

Type: A
Name: installer
Value: CURRENT_PUEBLO_PUBLIC_IP

Type: A
Name: employee
Value: CURRENT_PUEBLO_PUBLIC_IP
```

The script updates the IP value when the Pueblo public IP changes.

### If You Use No-IP Or DuckDNS CNAME

Create one dynamic hostname at No-IP, DuckDNS, or similar:

```text
edgewatercontracts.ddns.net
```

For the current contract portal, create this CNAME record:

```text
Type: CNAME
Name: contracts
Value: edgewatercontracts.ddns.net
```

That one No-IP hostname is enough for the current setup.

Do not create `customers.edgewaterhomestores.com` right now unless you intentionally decide to use that as a future alias.

Future optional CNAME records can point to the same No-IP hostname:

```text
Type: CNAME
Name: installer
Value: edgewatercontracts.ddns.net

Type: CNAME
Name: employee
Value: edgewatercontracts.ddns.net

Type: CNAME
Name: terptrainer
Value: edgewatercontracts.ddns.net

Type: CNAME
Name: customers
Value: edgewatercontracts.ddns.net
```

Important:

- DNS changes can take minutes or hours.
- TTL controls how long records are cached.
- Use low TTL while testing if your DNS provider allows it.

Check DNS from Linux:

```bash
sudo apt install -y dnsutils
dig contracts.edgewaterhomestores.com
```

Only run `dig` for future names after those DNS records are intentionally created.

## 34. Test From Outside The Network

Testing from inside the same building can lie because some routers handle internal domain traffic differently.

For the Pueblo-hosted server, test from outside the Pueblo network. A good test is a phone with Wi-Fi turned off, or someone in Edgewater Florida opening the public URL.

Use a phone with Wi-Fi turned off.

Before the full portal app is uploaded and running, test the temporary Nginx page:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

Good result includes:

```text
Customer Portal Nginx Test OK
```

After the full portal app is uploaded and running, test:

```text
http://contracts.edgewaterhomestores.com/api/health
```

Before HTTPS, expected result:

```json
{"ok":true}
```

If DNS Works But Outside Access Times Out:

If local testing works on the Linux server but outside access times out, the problem is usually not Nginx.

It usually means the public request is not reaching Nginx.

Check DNS from any machine:

```bash
nslookup contracts.edgewaterhomestores.com
```

Good shape for the current setup:

```text
contracts.edgewaterhomestores.com -> edgewatercontracts.ddns.net -> your current Pueblo public IP
```

On the Linux server, check the current public IP:

```bash
curl -4 ifconfig.me
```

Important:

- Use `curl -4`, not plain `curl`.
- Plain `curl ifconfig.me` may return an IPv6 address, such as one starting with `2607:`.
- The No-IP `A / DNS Hostname` record and the router port forwarding steps here are using public IPv4.

Make sure No-IP points to the same public IP:

```bash
dig +short edgewatercontracts.ddns.net A
```

Bad result:

```text
10.x.x.x
192.168.x.x
172.16.x.x through 172.31.x.x
100.64.x.x through 100.127.x.x
```

Those are private or carrier-grade NAT address ranges. They are not reachable directly from the public internet.

If No-IP shows one of those private ranges, outside access will not work.

If this happened after turning on No-IP inside the router, disable the router's No-IP/DDNS updater for now. The router may be sending its private WAN address to No-IP.

Then run the IPv4 public check from the Linux server:

```bash
curl -4 ifconfig.me
```

Compare:

```text
No-IP A record
curl -4 ifconfig.me
Router WAN/Internet IPv4
```

If the router WAN/Internet IPv4 is private, such as `10.101.24.142`, the ISP is probably using CGNAT or there is another router/modem doing NAT in front of this router.

Normal port forwarding will not work until the router has a real public IPv4 address on its WAN/Internet side.

If those IPs do not match, No-IP has not updated yet. Check:

```bash
sudo systemctl status noip-duc --no-pager
sudo journalctl -u noip-duc -n 50 --no-pager
```

If those IPs match but outside access still times out, check the server LAN IP:

```bash
hostname -I
```

Make sure the router port forwarding sends public TCP port `80` to that exact LAN IP on TCP port `80`.

Router forwarding for HTTP should be:

```text
WAN port: 80 - 80
LAN port: 80 - 80
Internal client: Linux server LAN IP
Protocol: TCP
WAN connection: Internet
```

Check Ubuntu firewall:

```bash
sudo ufw status verbose
```

If Nginx is not allowed:

```bash
sudo ufw allow 'Nginx Full'
```

Check that Nginx is listening on port `80`:

```bash
sudo ss -tulpn | grep ':80'
```

Good signs:

```text
ufw allows 80/tcp
nginx is listening on 0.0.0.0:80
local curl to /_server-test.html works
```

If all three are true, the Linux server is ready to receive HTTP traffic.

At that point, an outside timeout is usually router port forwarding, ISP blocking, or CGNAT.

Check Nginx locally:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Then test from another device on the same Pueblo Wi-Fi/LAN:

```text
http://LINUX_SERVER_LAN_IP/_server-test.html
```

Example:

```text
http://192.168.1.70/_server-test.html
```

If LAN access fails too, fix Nginx or the Ubuntu firewall before troubleshooting the router's public port forwarding.

If LAN access works but public access times out, the problem is router forwarding, ISP blocking, or CGNAT.

Prove whether the outside request reaches Nginx:

On the Linux server, start watching Nginx logs:

```bash
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

While that is running, use a phone with Wi-Fi turned off and open:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

If new log lines appear, the public request is reaching Nginx.

If no new log lines appear, the public request is not reaching the Linux server. Focus on router port forwarding, router WAN IP, double NAT, ISP port blocking, or CGNAT.

Stop the log watcher:

```text
Ctrl+C
```

If local works, DNS points correctly, No-IP points to the current public IP, and the outside request still times out, compare:

```text
Public IPv4 from curl -4 ifconfig.me
Router WAN/Internet IPv4 shown in the router app/admin page
```

If they do not match, the ISP may be using CGNAT. Normal router port forwarding will not work through CGNAT.

Example CGNAT/double-NAT result:

```text
Linux curl -4 ifconfig.me:
66.33.12.98

Router WAN/Internet IPv4:
10.101.24.142
```

That means the router itself does not hold the public IPv4 address.

In that situation, router port forwarding on this router cannot receive public IPv4 traffic, even if the port-forwarding screen looks correct.

Will buying a new router fix this?

Usually, no.

If the ISP is giving the router a private WAN IPv4 such as `10.101.24.142`, a new router would usually receive that same kind of private WAN address. Port forwarding would still stop at the ISP's upstream NAT.

A new router only helps if the current router is behind another modem/router that you control. In that case, one of these can fix it:

- Put the upstream modem/router into bridge mode.
- Forward ports 80 and 443 on the upstream modem/router to this router.
- Replace the ISP combo modem/router with equipment that can hold the real public IPv4 directly.

If the upstream NAT belongs to the ISP, only the ISP can fix normal inbound IPv4 hosting by giving you a real public IPv4 address.

If `curl -4 ifconfig.me` fails or does not return a normal IPv4 address, the ISP may not be giving the connection a usable public IPv4 address. In that case, ask the ISP about a real public IPv4/static IPv4 address, or plan for a VPS/reverse-proxy approach later.

If CGNAT is present, options are:

- Ask the ISP for a real public IP.
- Ask the ISP for static IP service.
- Test direct IPv6 as a no-extra-cost public test path.
- Use a small VPS/reverse proxy later.

### Direct IPv6 Test Path

Use this only as a test path until we know the ISP keeps the IPv6 prefix stable and customer networks can reach it.

On the Linux server, list the public IPv6 addresses:

```bash
ip -6 addr show scope global
```

Current example from the Acer server:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3/64 scope global dynamic mngtmpaddr noprefixroute
2607:3640:120:e710:647e:b014:ad36:b46a/64 scope global temporary dynamic
```

Use this address for the temporary DNS `AAAA` test record:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Do not use this one for DNS:

```text
2607:3640:120:e710:647e:b014:ad36:b46a
```

Why:

- The address labeled `temporary dynamic` is a privacy address and is designed to rotate.
- The first address is the better test choice because it is not the temporary privacy address.
- Both addresses are still marked dynamic, so this is a test path until the ISP confirms stability.

Write this down while testing:

```text
IPv6 address used for contracts-v6 DNS:

Date tested:

Device/network tested from:

Result:

Notes:
```

Create the test DNS record:

```text
Type: AAAA
Name: contracts-v6
Value: 2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Make sure the Nginx Customer Portal site includes IPv6 listening and the IPv6 test hostname:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

Then run:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Test from a phone with Wi-Fi off, and from Florida if possible:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

Good result includes:

```text
Customer Portal Nginx Test OK
```

If it times out, the router/eero IPv6 firewall may need inbound TCP `80` allowed to the Acer server, or the testing network may not support IPv6.

If it shows `404 Not Found`, the outside request reached Nginx but landed in the wrong Nginx site. Recheck `listen [::]:80;`, the `server_name` line, and reload Nginx.

If it shows `502 Bad Gateway`, Nginx matched the Customer Portal site but sent the request to the Node app. For the temporary static test, recheck that the URL is exactly `/_server-test.html` and that the Nginx site has the `location = /_server-test.html` block.

### What A Successful Public Test Proves

When the outside test page works from a phone with Wi-Fi off or from another outside network, it proves this part of the chain is working:

```text
outside network
-> DNS
-> public IPv6 address
-> Linux server
-> Nginx
-> temporary test page
```

That is a real milestone. It means outside traffic can reach the server.

It does not prove the full portal app is ready yet.

Still remaining after this point:

- Upload the Customer Portal app files.
- Install Node packages.
- Create/start the `customerportal` service.
- Test the app health endpoint.
- Add HTTPS before real customer use.
- Confirm the signing links use the final public base URL.
- Confirm access from the actual store/customer networks that will use the portal.

Write this down when the outside test succeeds:

```text
Outside test URL:

Network tested from:

Date/time:

Result:

Notes:
```

### When Static/Public IPv4 Is Assigned Later

If the ISP later provides a real static/public IPv4, retest the normal IPv4 path even if IPv6 is already working.

The desired public IPv4 path is:

```text
public domain
-> public/static IPv4
-> router port 80/443 forwarding
-> Linux server LAN IP
-> Nginx
-> Customer Portal
```

On the Linux server:

```bash
curl -4 ifconfig.me
```

In the router/app, compare that value to the router WAN/Internet IPv4.

Good result:

```text
Router WAN/Internet IPv4 matches curl -4 ifconfig.me.
```

If the router WAN IPv4 is still private, such as `10.x.x.x`, `192.168.x.x`, `172.16.x.x` through `172.31.x.x`, or `100.64.x.x` through `100.127.x.x`, normal public IPv4 port forwarding is still blocked.

Check dynamic DNS:

```bash
dig +short YOUR_NOIP_HOSTNAME A
```

Good result:

```text
The dynamic DNS A record matches the public/static IPv4.
```

Then test the production domain from outside the building:

```text
http://YOUR_PUBLIC_DOMAIN/_server-test.html
```

Good result:

```text
Customer Portal Nginx Test OK
```

After HTTP works, configure HTTPS and use the final `https://` domain for real customer signing.

### Temporary Tunnel/Funnel Options While Waiting

The portal server is in Pueblo, Colorado, but Edgewater staff/customers in Florida need access over the web. If CGNAT blocks normal router port forwarding, a tunnel/funnel can provide a temporary public URL without waiting for the ISP.

Do not use Cloudflare for this project.

Recommended testing order:

1. **Tailscale Funnel** for a clean temporary HTTPS test link.
2. **ngrok free plan** for short-term testing if Tailscale Funnel is not convenient.
3. **localhost.run** only for quick temporary tests.
4. **Small VPS reverse proxy** for a more permanent workaround if the ISP cannot provide public/static IPv4.

Important security note:

- Free tunnel/funnel links are okay for testing, training, and dummy data.
- Do not use a casual free tunnel for real customer signatures, payment records, or private customer documents unless login, HTTPS, logging, backups, and access controls are verified.
- For production customer signing, prefer the static/public IPv4 path or a controlled VPS/reverse-proxy path.

#### Tailscale Funnel

Tailscale Funnel can expose a local service to the public internet over HTTPS without port forwarding.

Good for:

- Testing from Florida while the server is still behind CGNAT.
- Showing the portal to staff before the ISP static/public IP is active.
- Temporary access with a stable `ts.net` Funnel URL.

Limitations:

- Funnel uses a `tailnet-name.ts.net` hostname, not `contracts.edgewaterhomestores.com`.
- Funnel only listens on supported HTTPS ports such as `443`, `8443`, and `10000`.
- Funnel has bandwidth limits.
- The app is still exposed to the public internet, so the portal must have real login/security before using real customer data.

Example after the portal app is running on port `3000`:

```bash
sudo tailscale funnel 3000
```

Example after Nginx is serving the app on port `80`:

```bash
sudo tailscale funnel 80
```

Tailscale will show a public HTTPS URL like:

```text
https://acer.YOUR-TAILNET.ts.net
```

Use that temporary URL for testing instead of `contracts.edgewaterhomestores.com` while waiting for the ISP.

#### ngrok

ngrok has a free plan with limits. It can expose a local HTTP service publicly without router forwarding.

Good for:

- Temporary tests.
- Quick demos.
- Short-term access from Florida before the static/public IP is ready.

Limitations:

- Free plan has usage/request/data limits.
- Free endpoints use assigned/development domains.
- Free HTTP/S endpoints may show an interstitial page.
- It is not the preferred final production path for contract signing.

Example after the portal app is running on port `3000`:

```bash
ngrok http 3000
```

Example if Nginx is serving the portal on port `80`:

```bash
ngrok http 80
```

#### localhost.run

localhost.run can create a tunnel using SSH without installing a separate client.

Good for:

- Quick one-off access tests.

Limitations:

- Not the preferred production path.
- Free public URLs are best treated as temporary.
- Keep it for testing only unless deliberately upgraded/configured.

Example if Nginx is serving the test page or app on port `80`:

```bash
ssh -R 80:localhost:80 nokey@localhost.run
```

#### VPS Reverse Proxy

If the ISP cannot provide public/static IPv4, the most stable non-Cloudflare workaround is a small public VPS.

How it works:

```text
contracts.edgewaterhomestores.com
-> public VPS
-> encrypted tunnel back to Pueblo Linux server
-> Customer Portal
```

This is usually not free, but it is the most controllable production workaround if direct public IPv4 is not available.

While waiting for the ISP:

- Continue with Step 20 to upload the portal files.
- Continue with Step 21/22/23 to install dependencies and create/start the app service.
- Test the temporary Nginx page on the LAN with `http://192.168.1.70/_server-test.html`.
- Test the actual Node app on the LAN only after it exists and is running.
- Do not expect public `contracts.edgewaterhomestores.com` testing to work until the router WAN/Internet IPv4 is public/static.

If it does not work after the full portal app is installed:

1. Check Nginx:

```bash
sudo systemctl status nginx
```

2. Check Customer Portal:

```bash
sudo systemctl status customerportal
```

3. Check firewall:

```bash
sudo ufw status verbose
```

4. Check router forwarding.
5. Check DNS records.
6. Check for CGNAT.

## 35. Install HTTPS Certificates

Use Certbot for HTTPS.

```bash
sudo apt install -y snapd
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

Request certificate:

```bash
sudo certbot --nginx -d contracts.edgewaterhomestores.com
```

For future optional names, only include names after they have been intentionally created in DNS and added to the matching Nginx server blocks.

Example future command:

```bash
sudo certbot --nginx -d contracts.edgewaterhomestores.com -d installer.edgewaterhomestores.com -d employee.edgewaterhomestores.com
```

Choose the option to redirect HTTP to HTTPS if Certbot asks.

Test renewal:

```bash
sudo certbot renew --dry-run
```

Now visit:

```text
https://contracts.edgewaterhomestores.com/api/health
```

Expected:

```json
{"ok":true}
```

## 36. Backups

Customer Portal currently stores important data in files, not SQL.

Back up:

```text
/opt/apps/customerportal/app/.env
/opt/apps/customerportal/app/data/packets
/opt/apps/customerportal/app/data/generated
/opt/apps/customerportal/app/data/settings
/opt/apps/customerportal/app/data/logs
```

Create backup folders:

```bash
sudo mkdir -p /opt/backups/customerportal
sudo chown -R customerportal:customerportal /opt/backups/customerportal
```

Manual file backup:

```bash
sudo rsync -av /opt/apps/customerportal/app/data/ /opt/backups/customerportal/data/
sudo cp /opt/apps/customerportal/app/.env /opt/backups/customerportal/customerportal.env
sudo chmod 600 /opt/backups/customerportal/customerportal.env
```

MySQL backup example:

```bash
sudo mysqldump --databases terptrainer --result-file=/opt/backups/terptrainer-mysql.sql
```

PostgreSQL backup example:

```bash
sudo -u postgres pg_dump -f /tmp/customerportal-postgres.sql customer_portal
sudo mv /tmp/customerportal-postgres.sql /opt/backups/customerportal-postgres.sql
```

Later, automate backups after you know where the backup drive or cloud backup will live.

## 37. Log Rotation

Customer Portal writes logs under:

```text
/opt/apps/customerportal/app/data/logs
```

Create logrotate config:

```bash
sudo nano /etc/logrotate.d/customerportal
```

Paste:

```text
/opt/apps/customerportal/app/data/logs/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    copytruncate
}
```

Save and exit.

Test:

```bash
sudo logrotate -d /etc/logrotate.d/customerportal
```

## 38. Safer SSH Settings

Do this after you confirm SSH works.

Edit SSH config:

```bash
sudo nano /etc/ssh/sshd_config
```

Look for or add:

```text
PermitRootLogin no
```

Do not disable password login until SSH keys are working.

Restart SSH:

```bash
sudo systemctl restart ssh
```

## 39. Daily Server Commands

Check app:

```bash
sudo systemctl status customerportal
```

Restart app:

```bash
sudo systemctl restart customerportal
```

View app logs:

```bash
journalctl -u customerportal -f
```

Check Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx
```

Reload Nginx after config changes:

```bash
sudo systemctl reload nginx
```

Update Linux:

```bash
sudo apt update && sudo apt upgrade -y
```

Check disk space:

```bash
df -h
```

Check memory:

```bash
free -h
```

## 40. Updating Customer Portal Later

Stop service:

```bash
sudo systemctl stop customerportal
```

Copy or pull updated files into:

```text
/opt/apps/customerportal/app
```

Install dependencies:

```bash
cd /opt/apps/customerportal/app
sudo -u customerportal npm ci --omit=dev
```

Run test:

```bash
sudo -u customerportal npm test
```

Start service:

```bash
sudo systemctl start customerportal
sudo systemctl status customerportal
```

## 41. Final Go-Live Checklist

Before real customer use:

- Customer Portal works locally on the Pueblo server at `http://127.0.0.1:3000/api/health`.
- Nginx routes the final Customer Portal / Contracts Portal domain.
- If enabled, Installer Portal shell works locally on `http://127.0.0.1:3011/api/health`.
- If enabled, Employee Portal shell works locally on `http://127.0.0.1:3012/api/health`.
- Pueblo router forwards ports `80` and `443`.
- DNS points to the server.
- HTTPS works.
- `.env` has strong admin password and session secret.
- `PUBLIC_BASE_URL` uses the final HTTPS domain before sending real signing links.
- The public URL works from outside the Pueblo network.
- Edgewater Florida staff can reach the portal over the internet.
- If store-local/offline storage is added later, test store-local writes and sync to Pueblo separately before relying on it.
- SMTP is configured if email sending is needed.
- Customer PDF generation works.
- Signing link works from a phone outside Wi-Fi.
- Download works.
- Print works.
- Email final PDF works if SMTP is configured.
- Backups are planned and tested.
- Database ports are not public.
- Admin login is protected by strong password.
- You understand that current Customer Portal data is still file-based until the later database migration.

## 42. End Troubleshooting Quick Guide

Use this section when something is broken and you do not know where to start.

### If The Browser Shows 404 Not Found

Meaning:

```text
The request reached Nginx, but Nginx did not serve the expected site or file.
```

Common causes:

- The domain is missing from the correct `server_name` line.
- The Nginx site file was edited but not reloaded.
- The request landed in the default Nginx site.
- The Ubuntu `default` site is still enabled and is stealing the request.
- The URL path is wrong.

Check:

```bash
sudo grep -n "server_name" /etc/nginx/sites-available/customerportal
sudo grep -n "_server-test" /etc/nginx/sites-available/customerportal
ls -l /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl reload nginx
```

If `default` is listed in `/etc/nginx/sites-enabled`, disable it:

```bash
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

If `unlink` says the file does not exist, that is okay.

For IPv6 testing, the `server_name` line should include:

```text
contracts-v6.edgewaterhomestores.com
```

The temporary test URL must be exactly:

```text
/_server-test.html
```

### If The Browser Shows 502 Bad Gateway

Meaning:

```text
Nginx is working, but the app it tried to talk to is not answering.
```

Common causes:

- The Node app is not running.
- The app crashed.
- The app is on a different port than Nginx expects.
- You opened `/`, `/api/health`, or another app route before the app files were uploaded and started.

Check:

```bash
sudo systemctl status customerportal --no-pager
journalctl -u customerportal -n 80 --no-pager
sudo ss -tulpn | grep ':3000'
```

Restart the app:

```bash
sudo systemctl restart customerportal
```

If the app has not been uploaded yet, use only this test URL:

```text
http://SERVER_LAN_IP/_server-test.html
```

### If The Browser Times Out

Meaning:

```text
The request is probably not reaching Nginx.
```

Common causes:

- DNS points to the wrong place.
- Router port forwarding is wrong.
- Ubuntu firewall is blocking traffic.
- ISP CGNAT/private WAN IPv4 is blocking normal public IPv4 hosting.
- For IPv6, the router/eero IPv6 firewall may be blocking inbound traffic.
- The testing network may not support IPv6.

Check local Nginx first:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Check Nginx is listening:

```bash
sudo ss -tulpn | grep ':80'
```

Check firewall:

```bash
sudo ufw status verbose
```

Check public IPv4:

```bash
curl -4 ifconfig.me
dig +short edgewatercontracts.ddns.net A
```

Compare those with the router WAN/Internet IPv4.

If the router WAN IPv4 is private, such as `10.x.x.x`, normal IPv4 port forwarding will not work until the ISP provides a real public IPv4/static IPv4, or a tunnel/proxy path is used.

### If IPv6 Shows 404 From Outside

This is actually a good sign.

Meaning:

```text
Outside internet -> IPv6 DNS -> Acer server -> Nginx
```

is working.

Fix the Nginx Customer Portal site:

```bash
sudo nano /etc/nginx/sites-available/customerportal
```

Make sure it has:

```nginx
listen [::]:80;
server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### If No-IP Points To A 10.x.x.x Address

Meaning:

```text
No-IP is being updated with a private/router WAN address instead of the true public IPv4.
```

Fix:

- Disable No-IP/DDNS inside the router if it is sending the private WAN address.
- Use the Linux No-IP DUC instead.
- Confirm Linux No-IP DUC sees the public IPv4:

```bash
curl -4 ifconfig.me
sudo systemctl status noip-duc --no-pager
sudo journalctl -u noip-duc -n 50 --no-pager
```

### If BeeBEEP Does Not Detect The Linux User From Windows

This is probably separate from the public website test.

BeeBEEP uses local network discovery. If it cannot see the Linux user from the Windows computer, the Linux firewall or Windows firewall may be blocking BeeBEEP's local LAN ports.

BeeBEEP default ports:

```text
36475 UDP - user discovery/search
6475 TCP - chat/system communication
6476 TCP - file transfer
```

On the Linux server, if the LAN is `192.168.1.x`, allow BeeBEEP from the local network only:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 36475 proto udp comment "BeeBEEP discovery"
sudo ufw allow from 192.168.1.0/24 to any port 6475:6476 proto tcp comment "BeeBEEP chat and files"
sudo ufw reload
sudo ufw status verbose
```

Do not port-forward these BeeBEEP ports through the router.

They are for the local LAN only.

Also check Windows Defender Firewall and make sure BeeBEEP is allowed on the private/local network.

### If A Password Is Rejected During MySQL Password Validation

Meaning:

```text
MySQL password validation is enforcing a password complexity rule.
```

Use a longer password with:

- Uppercase letter
- Lowercase letter
- Number
- Symbol
- No business name, username, or simple word

Write down which validation level was chosen:

```text
MySQL password validation level:

Database admin username:

Password stored in password manager:

Notes:
```

## 43. Restarting And Checking Services

Use these when the server has been rebooted or when a change was made.

### Restart Nginx

Use reload after a normal Nginx config change:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Use restart if Nginx is stuck or after a full service issue:

```bash
sudo systemctl restart nginx
sudo systemctl status nginx --no-pager
```

### Restart Customer Portal

```bash
sudo systemctl restart customerportal
sudo systemctl status customerportal --no-pager
```

Watch Customer Portal logs:

```bash
journalctl -u customerportal -f
```

Stop watching logs:

```text
Ctrl+C
```

### Restart No-IP DUC

```bash
sudo systemctl restart noip-duc
sudo systemctl status noip-duc --no-pager
sudo journalctl -u noip-duc -n 50 --no-pager
```

### Restart MySQL

```bash
sudo systemctl restart mysql
sudo systemctl status mysql --no-pager
```

### Restart PostgreSQL

Only use this if PostgreSQL was installed and is being used:

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
```

### Restart SSH

Only restart SSH after checking the config.

```bash
sudo sshd -t
sudo systemctl restart ssh
```

Important:

```text
Do not close your existing SSH/terminal session until you confirm a new SSH login works.
```

### After A Full Server Reboot

Run:

```bash
sudo systemctl status nginx --no-pager
sudo systemctl status customerportal --no-pager
sudo systemctl status noip-duc --no-pager
sudo ufw status verbose
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

If the app is uploaded and running, also test:

```bash
curl http://127.0.0.1:3000/api/health
```

## 44. Final Printed Manual And Index Notes

The final compiled server manual should be cleaner than this working guide.

Final manual requirements:

- Add a table of contents/index at the front.
- Add page headers.
- Add bottom-right page numbers.
- Center major section headers.
- Keep command blocks visually separated from explanations.
- Add "write this down" boxes near sections with settings that must be remembered later.
- Keep troubleshooting and restart commands at the end for quick emergency reference.
- Include the exact values used for Edgewater only in the Edgewater copy.
- Keep a generic version later so the setup can be tailored for another business.

Suggested index/table-of-contents sections:

```text
1. Server Purpose And Network Diagram
2. Information To Write Down Before Starting
3. Ubuntu Studio Prep
4. Static LAN IP
5. Packages To Install
6. Database Setup
7. Nginx Setup
8. Temporary Nginx Test Page
9. File Upload/SFTP
10. Customer Portal App Setup
11. DNS And No-IP
12. IPv6 Testing
13. HTTPS
14. Backups
15. Security Tightening
16. Daily Commands
17. Troubleshooting
18. Restarting Services
19. Go-Live Checklist
```

## 45. Sources Checked

These official/current references were used while shaping this guide:

- Ubuntu Server documentation: https://ubuntu.com/server/docs
- Ubuntu Nginx tutorial: https://ubuntu.com/tutorials/install-and-configure-nginx
- Ubuntu firewall documentation: https://ubuntu.com/server/docs/how-to/security/firewalls
- Ubuntu MySQL documentation: https://ubuntu.com/server/docs/how-to/databases/install-mysql
- PostgreSQL Ubuntu downloads: https://www.postgresql.org/download/linux/ubuntu
- Node.js releases: https://nodejs.org/en/about/previous-releases
- Nginx reverse proxy documentation: https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy
- Certbot instructions: https://certbot.eff.org/instructions
- No-IP Linux DUC page: https://www.noip.com/download?page=linux
- ddclient documentation: https://ddclient.net
