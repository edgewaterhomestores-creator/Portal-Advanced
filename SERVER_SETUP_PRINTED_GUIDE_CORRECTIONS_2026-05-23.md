# Printed Server Guide Corrections - 2026-05-23

Use this sheet with the server setup guide that was already printed. Do not reprint the whole guide just for these corrections.

## How To Read This Sheet

This sheet uses the same basic pattern as the main guide:

- **Information** explains what is going on.
- **Do This** means follow the instruction, but it may not be a terminal command.
- **Type this on the Linux server** means paste the command into the Ubuntu Studio Terminal.
- **Type this on Windows** means paste the command into Windows PowerShell or Command Prompt.
- **Paste this** means paste the block into a file, such as an Nginx config file.
- **Good result** means what you should see before moving on.

Some command lines may wrap visually on paper.

Rule:

- If the printed command does not show a trailing backslash, treat it as one command even if it wraps onto the next printed line.
- If a correction here replaces a command, use the correction here.
- If you see missing connector characters such as `&&`, mark it on the printout and use this sheet as the source of truth.

## Correction 1 - Ubuntu Studio Is Already Installed

Where the printed guide talks about choosing or installing Ubuntu:

- Cross out any instruction to download Ubuntu, create an installer USB, or reinstall Ubuntu.

- Write: `Ubuntu Studio is already installed. Use Ubuntu Studio as the baseline. Start with the update and setup steps.`

The server is the Acer Aspire machine:

```text
Acer Aspire A514-54
11th Gen Intel i5-1135G7 @ 2.40 GHz
8 GB RAM
Intel Iris Xe graphics
Ubuntu Studio already installed
```

## Correction 2 - Step 4 Update Command

In Step 4, replace separate update/upgrade commands with:

```text
sudo apt update && sudo apt upgrade -y
```

Reason:

```text
&& means the upgrade runs only if the update succeeds.
```

## Correction 3 - Remove The Tunnel Option

Cross out references to the tunnel option that was removed from the plan.

This setup should use one of these instead:

- ISP/router built-in Dynamic DNS or static public IP option, if offered.

- No-IP official updater.

- Hostinger DDNS/API script on the Pueblo Linux server, only as an advanced alternate path.

- DuckDNS only for testing/backup unless tested and reliable enough.

- If the ISP uses CGNAT, ask for a real public IP/static IP or consider a small VPS reverse proxy later.

## Correction 4 - Dynamic DNS Preference

Preferred direction:

```text
Pueblo Linux server checks its public IP.
If the IP changed, it updates DNS.
The public domain points to the current Pueblo IP.
```

The existing `hostinger-ddns.sh` file needs review before relying on it:

- It appears to behave like a Python script even though it ends in `.sh`.

- Its token should be treated like a password.

- Do not commit or print the real token.

- If the token was exposed anywhere public, rotate it in Hostinger.

Safer future file pattern:

```text
/opt/ddns/hostinger-ddns.py
/opt/ddns/hostinger-ddns.env
```

## Correction 5 - Nginx Is Not cPanel

Nginx is not a control panel.

Nginx is the public web front door:

```text
Public HTTPS request
-> Nginx
-> private app port such as 127.0.0.1:3000
```

The control/interface options are separate:

- Ubuntu Studio desktop for normal local control.

- Terminal commands for exact server setup.

- Cockpit can be added as a LAN-only web dashboard.

Do not expose server control panels publicly until security is planned.

## Correction 6 - Ports

Do use public web ports:

```text
80  HTTP
443 HTTPS
```

Do not expose app/database ports publicly:

```text
3000 Customer/Contracts Portal internal app
3011 Installer Portal internal app
3012 Employee Portal internal app
3306 MySQL
5432 PostgreSQL
```

Non-standard ports are not a magic security fix.

Best rule:

- Keep public websites on 80/443.

- Keep app/database ports private.

- Keep SSH LAN-only at first.

- If remote SSH is needed later, consider a non-standard external SSH port plus strong SSH settings.

## Correction 7 - Pueblo Server / Edgewater Users

The server is expected to be in Pueblo, Colorado.

Edgewater, Florida staff/customers will use it over the internet.

Future local-first sync means:

```text
Edgewater-side computer/database writes locally first
-> changed records sync to Pueblo server
-> Pueblo server hosts reporting and portal access
```

This is different from the Pueblo server's own internal `localhost` ports.

## Correction 8 - Fixed LAN IP

The fixed IP section is about the Pueblo server's private LAN IP, not the public internet IP.

Use one of these methods:

1. Router/app DHCP reservation, if the router or ISP app supports it.

2. Static IP inside Ubuntu Studio using NetworkManager/`nmcli`.

The goal is:

```text
Pueblo server always has the same LAN IP, such as 192.168.1.50.
Router forwards ports 80 and 443 to that LAN IP.
Dynamic DNS handles the changing public IP.
```

Ubuntu Studio static IP command pattern:

```text
CONNECTION="Wired connection 1"
STATIC_IP="192.168.1.50/24"
GATEWAY="192.168.1.1"
DNS_SERVERS="192.168.1.1 1.1.1.1 8.8.8.8"
sudo nmcli connection modify "$CONNECTION" ipv4.method manual ipv4.addresses "$STATIC_IP" ipv4.gateway "$GATEWAY" ipv4.dns "$DNS_SERVERS"
sudo nmcli connection down "$CONNECTION" && sudo nmcli connection up "$CONNECTION"
```

Check with:

```text
hostname -I
ip route | grep default
ping -c 3 google.com
```

## Correction 9 - Step 12 Node.js Install

Cross out any Node install command that looks like this:

```text
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
```

Use this safer method instead:

```text
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
file nodesource_setup.sh
head -n 5 nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
npm -v
```

If Node 24 fails, use Node 22:

```text
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
file nodesource_setup.sh
head -n 5 nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
npm -v
```

Reason:

```text
Do not use sudo -E with the pipe method on this Ubuntu Studio setup. Download the setup script first, verify it is readable text, then run it with sudo bash.
```


## Correction 10 - Step 14 MySQL `ss` Output

If Step 14 shows something like this:

```text
LISTEN 0 151 127.0.0.1:mysql
LISTEN 0 70  127.0.0.1:33060
```

that is okay.

Meaning:

- `127.0.0.1:mysql` means MySQL is local only.

- `127.0.0.1:33060` is the MySQL X Protocol port and is okay if it is local only.

- `151` and `70` are queue/backlog numbers, not public ports.

Bad output would be:

```text
0.0.0.0:mysql
*:mysql
[::]:mysql
0.0.0.0:33060
```

If you see those bad examples, stop and fix MySQL binding before continuing.

## Correction 11 - Step 14 MySQL Password Validation

For `mysql_secure_installation`:

```text
Validate password component: Yes
Password validation level: MEDIUM
```

Why:

- `LOW` mostly checks length.

- `MEDIUM` checks length, mixed case, numbers, and special characters.

- `STRONG` also checks against common/dictionary passwords and can be annoying during setup.

If MySQL refuses a password, it usually means it is too short, too simple, missing uppercase/lowercase letters, missing a number, or missing a special character.

Common messages:

```text
Your password does not satisfy the current policy requirements
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

This only affects MySQL database passwords. It does not change the customer PDF password rule.

## Correction 12 - Customer Portal Steps 18 Through 24 Were Restructured

The Customer Portal setup section has been reordered so you can keep working before the project files are uploaded.

New order:

```text
18  Pre-upload Customer Portal setup
18A Create Python environment
18B Create .env file
18C Pre-create Nginx site file
19  Stop here if project files are not ready
20  Copy Customer Portal files to the server
21  Install Customer Portal Node packages
22  Test Customer Portal directly
23  Run Customer Portal automatically with systemd
24  Test Customer Portal through Nginx
```

Old printed-step translation:

```text
Old Step 18 copy files        -> New Step 20
Old Step 19 Node packages     -> New Step 21
Old Step 20 Python venv       -> New Step 18A
Old Step 21 .env file         -> New Step 18B
Old Step 24 Nginx setup       -> New Step 18C
Old Step 24 /api/health test  -> New Step 24
```

Important:

- You are not using `git clone` for this setup.

- Use the `rsync` copy method when ready.

- The `.env` file can be created before copying because the `rsync` command excludes `.env`.

- The Nginx site file can be created before copying, but the website may show bad gateway until the Node app is running.

- Do not run Node package install, app tests, systemd start, or the final Nginx health test until after project files are copied.

## Correction 13 - New Step 18A Missing Python venv / ensurepip

Before creating the Customer Portal Python environment, install the venv package.

On this server, use:

```text
python3 --version
sudo apt install -y python3.14-venv
```

If `python3 --version` shows a different version, install the matching package instead, such as:

```text
sudo apt install -y python3.12-venv
```

or:

```text
sudo apt install -y python3-venv
```

If old printed Step 20 / new Step 18A says:

```text
The virtual environment was not created successfully because ensurepip is not available.
```

that means the Python venv package is missing. Install the matching `python3.x-venv` package, then run the Step 18A venv command again.

## Correction 14 - Apache And SMTP Clarification

You do not need Apache for this setup.

Nginx is the web server/reverse proxy:

```text
Public web request on 80/443
-> Nginx
-> Customer Portal app on 127.0.0.1:3000
```

Do not install Apache unless there is a separate future reason. Apache and Nginx both try to use ports `80` and `443`, so running both can create confusing conflicts.

For outgoing email, you do not need to install a full mail server on the Linux box.

Use SMTP provider settings in the Customer Portal `.env` file:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
SMTP_TO
```

Use the LavaCake Estimates SMTP credentials later if those are the known working settings.

If SMTP fields are blank, signing/PDF download/printing can still be tested, but email sending will fail or be skipped depending on the code path.

Do not install Postfix/sendmail for this portal unless we decide later that the Linux server itself must relay mail.

## Correction 15 - Test Page, SFTP Upload, And Diagnostics

This correction has two parts:

- **Part A** tests public access before the full portal is uploaded.
- **Part B** is for later, when the full portal project is ready to upload.

### Part A - Test Public Access Before Uploading The Full Portal

#### Step 1 - Create The Linux Staging Folder

**Type this on the Linux server:**

```bash
mkdir -p ~/uploads/customerportal
```

**What this means:**

This creates a temporary upload folder on the Linux server. It is not the real app folder.

#### Step 2 - Upload One Test File From Windows

**Use FileZilla or WinSCP on Windows.**

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

Fill in the SFTP connection screen like this:

```text
Protocol: SFTP
Host: PUEBLO_SERVER_LAN_IP
Port: 22
Username: your Ubuntu login username
Password: your Ubuntu login password
Remote folder: /home/YOUR_LINUX_USERNAME/uploads/customerportal
```

Replace `PUEBLO_SERVER_LAN_IP` with the Linux server LAN IP, such as `192.168.1.70`.

Replace `YOUR_LINUX_USERNAME` with the Ubuntu username you use to log into the Linux server.

**Important:** Do not type `Protocol: SFTP` into the Linux terminal. It is a setting in the Windows SFTP program.

Upload this Windows file:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment\nginx-access-test.html
```

to this Linux folder:

```text
/home/YOUR_LINUX_USERNAME/uploads/customerportal
```

#### Optional - Windows Command-Line SFTP

If you are using Windows PowerShell instead of FileZilla/WinSCP, type this on Windows:

```powershell
sftp YOUR_LINUX_USERNAME@PUEBLO_SERVER_LAN_IP
```

At the `sftp>` prompt, type:

```text
cd uploads/customerportal
lcd F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment
put nginx-access-test.html
bye
```

#### Step 3 - Install The Test Page Where Nginx Can Read It

**Type this on the Linux server:**

```bash
sudo cp ~/uploads/customerportal/nginx-access-test.html /opt/apps/customerportal/nginx-access-test.html
sudo chown root:root /opt/apps/customerportal/nginx-access-test.html
sudo chmod 644 /opt/apps/customerportal/nginx-access-test.html
```

#### Step 4 - Make Nginx Serve The Test Page

**Type this on the Linux server:**

```bash
sudo nano /etc/nginx/sites-available/customerportal
```

Inside the existing `server { ... }` block, paste this above the normal `location / { ... }` block:

```nginx
location = /_server-test.html {
    alias /opt/apps/customerportal/nginx-access-test.html;
    default_type text/html;
}
```

If you already pasted the full Nginx example from the main guide, this part is already done.

Save the file in nano:

```text
Ctrl + O
Enter
Ctrl + X
```

Then check and reload Nginx:

```bash
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

If `sudo unlink /etc/nginx/sites-enabled/default` says the file does not exist, that is okay. Continue with `sudo nginx -t` and reload.

Why:

```text
Ubuntu Nginx often enables a default site.
If the default site stays enabled, it can answer requests before the Contract Portal site.
That can cause 404 Not Found even when the app is running.
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

#### Step 5 - Test The Page Locally On The Linux Server

**Type this on the Linux server:**

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

**Good result:**

The output includes:

```text
Customer Portal Nginx Test OK
```

**If You Get 502 Bad Gateway**

Check the URL carefully.

This is correct:

```text
/_server-test.html
```

These are wrong for the temporary Nginx-only test:

```text
/server-test.html
/
/api/health
```

Those wrong paths go to the Customer Portal Node app on port `3000`.

If the app is not uploaded and running yet, Nginx will show `502 Bad Gateway`.

If the exact `/_server-test.html` URL still gives `502 Bad Gateway`, check Nginx:

```bash
sudo nginx -t
```

If you are testing with a No-IP hostname in a browser, make sure the No-IP hostname is listed on the Nginx `server_name` line.

Check:

```bash
sudo grep -n "server_name" /etc/nginx/sites-available/customerportal
```

Example:

```nginx
server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

Do not add `customers.edgewaterhomestores.com` unless you intentionally create that as a future alias.

If testing direct IPv6, the customerportal Nginx site also needs:

```nginx
listen [::]:80;
```

The top of the Nginx site should look like:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

Plain-English Nginx meaning:

- Nginx is the web server/reverse proxy, similar to Apache, but commonly used for Node apps.
- `listen 80;` answers normal HTTP on IPv4 port `80`.
- `listen [::]:80;` answers normal HTTP on IPv6 port `80`.
- `server_name` lists the domains/subdomains this Nginx website block should answer for.
- If the domain is not listed in the right `server_name`, Nginx may answer from the wrong/default website and show `404 Not Found`.
- `location = /_server-test.html` matches only that exact browser path.
- `alias /opt/apps/customerportal/nginx-access-test.html;` serves the real Linux file without exposing the real Linux file path in the browser.
- `location /` is the normal catch-all route that sends portal traffic to the Node app on port `3000`.

If the No-IP hostname is missing, edit the site file:

```bash
sudo nano /etc/nginx/sites-available/customerportal
```

Add the No-IP hostname to the `server_name` line, then reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Check that the test file exists:

```bash
ls -l /opt/apps/customerportal/nginx-access-test.html
```

Check that the Nginx site has the static test location:

```bash
sudo grep -n "_server-test" /etc/nginx/sites-available/customerportal
```

Reload Nginx after any change:

```bash
sudo systemctl reload nginx
```

#### Step 6 - Test From Outside Later

After DNS and router forwarding are ready, try this from a phone or computer not on the Pueblo Wi-Fi:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

Use `https://` only after HTTPS certificates are installed.

Optional friendly phone test:

Upload this file if you want a simple animated page for store staff to test from a phone:

```text
F:\ONGOINGPROJECTS\CUSTOMERPORTAL\deployment\jamie-phone-test.html
```

Install it on Linux:

```bash
sudo cp ~/uploads/customerportal/jamie-phone-test.html /opt/apps/customerportal/jamie-phone-test.html
sudo chown root:root /opt/apps/customerportal/jamie-phone-test.html
sudo chmod 644 /opt/apps/customerportal/jamie-phone-test.html
```

If using a logo, upload it as:

```text
jamie-test-logo.png
```

Install the logo on Linux:

```bash
sudo cp ~/uploads/customerportal/jamie-test-logo.png /opt/apps/customerportal/jamie-test-logo.png
sudo chown root:root /opt/apps/customerportal/jamie-test-logo.png
sudo chmod 644 /opt/apps/customerportal/jamie-test-logo.png
```

Add these inside the same Nginx `server { ... }` block and above `location / { ... }`:

```nginx
location = /jamie-test.html {
    alias /opt/apps/customerportal/jamie-phone-test.html;
    default_type text/html;
}

location = /jamie-test-logo.png {
    alias /opt/apps/customerportal/jamie-test-logo.png;
    default_type image/png;
}
```

Then reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Phone test URL:

```text
http://contracts-v6.edgewaterhomestores.com/jamie-test.html
```

### Part B - Later, Upload The Full Portal Project

When ready, upload the Customer Portal project files from Windows into:

```text
/home/YOUR_LINUX_USERNAME/uploads/customerportal
```

Copy these from Windows:

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

The `data` folders are needed, but local test PDFs, packet JSON files, logs, and local business settings should not be copied unless intentionally moving test records.

Do not overwrite the server `.env`.

Then type this on the Linux server:

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

Before installing Node packages, check the app files:

```bash
ls -la /opt/apps/customerportal/app
ls -la /opt/apps/customerportal/app/server
ls -la /opt/apps/customerportal/app/public
```

These should exist:

```text
/opt/apps/customerportal/app/package.json
/opt/apps/customerportal/app/package-lock.json
/opt/apps/customerportal/app/server/index.js
```

Check `.env`:

```bash
sudo ls -l /opt/apps/customerportal/app/.env
```

If `.env` already exists from Step 18B, keep it.

If `.env` does not exist and `.env.example` was copied:

```bash
sudo cp /opt/apps/customerportal/app/.env.example /opt/apps/customerportal/app/.env
sudo -u customerportal nano /opt/apps/customerportal/app/.env
```

If `.env.example` was not copied, create `.env` manually and paste the Step 18B starter block:

```bash
sudo -u customerportal nano /opt/apps/customerportal/app/.env
```

Lock it down:

```bash
sudo chown customerportal:customerportal /opt/apps/customerportal/app/.env
sudo chmod 600 /opt/apps/customerportal/app/.env
```

After the app is uploaded, installed, and running, open this browser test page:

```text
https://contracts.edgewaterhomestores.com/_server-test.html
```

Run deeper server diagnostics from the Linux terminal:

```bash
cd /opt/apps/customerportal/app
sudo -u customerportal npm run test:server
```

The diagnostics script checks app reachability, Nginx, SMTP if configured, MySQL port/login if configured, and PostgreSQL port/login if configured.

## Correction 16 - Step 29 Hostinger Hosting vs Dynamic DNS

**Information**

Hostinger shared/business hosting is not the same thing as Dynamic DNS.

Dynamic DNS means:

```text
Pueblo public IP changes
-> DNS record gets updated automatically
-> contracts.edgewaterhomestores.com keeps pointing to Pueblo
```

What matters is where DNS for `edgewaterhomestores.com` is managed.

Use Step 29 only if:

- Hostinger DNS/nameservers are managing `edgewaterhomestores.com`.
- The Hostinger API token can read/update DNS zone records.
- The Pueblo Linux server will run a Hostinger DNS API update script.

Do not use Step 29 just because you have Hostinger shared/business hosting. The hosting plan can still host other websites, but this portal is being hosted from the Pueblo server.

**ddclient Note**

`ddclient` is separate from Hostinger hosting.

Use Step 32 only if the DNS provider is supported by `ddclient`.

Do not use `ddclient` for Hostinger unless current `ddclient` docs or `ddclient --help` explicitly show Hostinger support.

**Fallback**

If Hostinger API access does not work for DNS records:

- Use No-IP official updater, or
- Use DuckDNS for testing/backup, or
- Manually update the Hostinger `A` record in hPanel for temporary testing.

## Correction 17 - Dynamic DNS Choice Is No-IP

**Information**

The active Dynamic DNS choice is now No-IP official updater unless the ISP/router offers a better built-in Dynamic DNS or static public IP option.

Use Step 29 as the active No-IP path.

Step 30 Hostinger DNS API script is an alternate path only.

Step 31 DuckDNS is testing/backup only because reliability is not trusted enough for the production portal right now.

Step 32 `ddclient` is only for DNS providers that `ddclient` directly supports.

## Correction 18 - Step 29 No-IP Hostname Type

**Information**

When creating the No-IP hostname, choose:

```text
Record Type:
A / DNS Hostname

Enable Dynamic DNS:
Yes / checked

Wildcard:
No / unchecked
```

Do not choose:

```text
URL Redirect
CNAME
AAAA
```

Use `AAAA` only if the ISP gives the server a public IPv6 address and IPv6 is intentionally configured.

Enable Dynamic DNS should be checked. This lets the No-IP updater/DDNS Key update the hostname when the Pueblo public IP changes.

Wildcard should be unchecked. Wildcard would make extra subdomains under the No-IP hostname resolve too, and this portal does not need that.

**What The Host Means**

If No-IP asks for a host/hostname, enter the No-IP name you are creating.

Example:

```text
Host:
edgewatercontracts

Domain:
ddns.net

Full No-IP hostname:
edgewatercontracts.ddns.net
```

This No-IP hostname is not the final customer-facing portal address.

The customer-facing address can still be:

```text
contracts.edgewaterhomestores.com
```

Later, the real domain DNS can point `contracts.edgewaterhomestores.com` to the No-IP hostname.

For the current setup, one No-IP hostname is enough:

```text
edgewatercontracts.ddns.net
```

Only create the real DNS record for:

```text
contracts.edgewaterhomestores.com
```

Do not create `customers.edgewaterhomestores.com` right now unless you intentionally decide to use it as a future alias.

**Protocol Note**

No-IP DNS records do not use `http` or `https`.

Do not type:

```text
https://edgewatercontracts.ddns.net
edgewatercontracts.ddns.net:443
```

For the IP address, use the current public/global IPv4 address. The No-IP updater will keep this updated later.

HTTPS is handled later on the Linux server with Nginx and Certbot.

## Correction 19 - Original Printed 28B Was Replaced

**Information**

If the original printed guide says **Step 28B**, that printed section is stale.

The current No-IP install section is:

```text
Step 29B - Install No-IP DUC On Linux
```

Use current Step 29B instead of original printed Step 28B.

**Current No-IP Linux DUC Commands**

Run one command at a time. Do not paste the whole block at once.

Try the flexible version first.

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

If that does not work, use No-IP's current exact version commands.

As of this correction, No-IP lists Linux DUC `3.3.0`:

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

Then check:

```bash
noip-duc --help
```

## Correction 20 - No-IP `_apt` Permission Denied Notice

**Information**

During the No-IP `.deb` install, you may see something like:

```text
Download is performed unsandboxed as root...
file could not be accessed by user '_apt'
```

This usually means apt's restricted `_apt` user could not read the local `.deb` file from your home folder.

It does not always mean the install failed.

First check:

```bash
noip-duc --help
```

If that works, continue.

If it did not install, copy the `.deb` package to `/tmp` and install it from there.

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

**Service Notice**

If you see:

```text
noip-duc.service is a disabled or a static unit, not starting it
```

That means the package installed the program, but Linux did not automatically start it as a background service.

That is okay at this point. Continue by checking `noip-duc --help`, then test with the DDNS Key.

## Correction 21 - No-IP Incorrect Credentials

**Information**

If the test command says:

```text
update failed: Incorrect credentials
```

it usually means one of these:

- The normal No-IP account password was used instead of the DDNS Key password.
- The normal No-IP account email/login was used instead of the DDNS Key username.
- The DDNS Key is not attached to the hostname.
- The DDNS Key password was copied wrong.
- The Linux shell changed a special character because the password was not quoted.

**Retry Command**

Use the DDNS Key username and DDNS Key password from No-IP.

Keep the single quotes:

```bash
noip-duc -g all.ddnskey.com --username 'YOUR_DDNS_KEY_USERNAME' --password 'YOUR_DDNS_KEY_PASSWORD'
```

Do not use the normal No-IP account password here.

**If It Still Fails**

In No-IP:

1. Open the hostname.
2. Confirm Dynamic DNS is enabled.
3. Confirm a DDNS Key exists for that hostname.
4. If the DDNS Key password was not saved exactly, generate a new DDNS Key password.
5. Copy the new DDNS Key username/password and retry.

DDNS Key passwords are shown only once. If it was missed or copied wrong, generate a new one.

If the password contains a single quote character, generate a new DDNS Key password. That is easier and safer than trying to escape the quote manually.

## Correction 22 - Run No-IP Automatically On Boot

**Information**

The original guide only said to set No-IP up as a service.

Use this correction to make No-IP run in the background every time the Linux server starts.

No-IP's current Linux startup instructions use:

```text
/etc/systemd/system/noip-duc.service
/etc/default/noip-duc
```

**Step 1 - Go To The Extracted No-IP Folder**

```bash
cd /home/$USER/noip-duc_3.3.0
```

**Step 2 - Check That The Service File Exists**

```bash
ls debian/service
```

**Step 3 - Copy The Service File**

```bash
sudo cp debian/service /etc/systemd/system/noip-duc.service
```

**Step 4 - Create The Config File**

```bash
sudo nano /etc/default/noip-duc
```

Paste this, replacing the username and password with the DDNS Key values:

```text
NOIP_USERNAME='YOUR_DDNS_KEY_USERNAME'
NOIP_PASSWORD='YOUR_DDNS_KEY_PASSWORD'
NOIP_HOSTNAMES=all.ddnskey.com
```

Use DDNS Key credentials, not the normal No-IP account password.

`all.ddnskey.com` updates all hostnames attached to that DDNS Key.

Save and exit nano:

```text
Ctrl+O
Enter
Ctrl+X
```

**Step 5 - Protect The Config File**

```bash
sudo chmod 600 /etc/default/noip-duc
```

**Step 6 - Reload systemd**

```bash
sudo systemctl daemon-reload
```

**Step 7 - Enable No-IP At Startup**

```bash
sudo systemctl enable noip-duc
```

**Step 8 - Start No-IP Now**

```bash
sudo systemctl start noip-duc
```

**Step 9 - Check Status**

```bash
sudo systemctl status noip-duc --no-pager
```

**Step 10 - Check Logs**

```bash
sudo journalctl -u noip-duc -n 50 --no-pager
```

If the service is running, No-IP should now run automatically after reboot.

Optional reboot test:

```bash
sudo reboot
```

After the server comes back up:

```bash
sudo systemctl status noip-duc --no-pager
```

## Correction 23 - After A Server Reboot

**Information**

Use this quick checklist any time the Linux server restarts.

**Step 1 - Check The Server LAN IP**

```bash
hostname -I
```

Make sure this is still the LAN IP used in the router port forwarding.

**Step 2 - Check SSH**

```bash
sudo systemctl status ssh --no-pager
```

**Step 3 - Check Nginx**

```bash
sudo systemctl status nginx --no-pager
```

If Nginx is not running:

```bash
sudo systemctl start nginx
```

**Step 4 - Check No-IP**

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

then `/etc/default/noip-duc` is missing.

Create it:

```bash
sudo nano /etc/default/noip-duc
```

Paste this, replacing the username and password with the DDNS Key values:

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

**Step 5 - Test The Local Nginx Static Page**

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Good result includes:

```text
Customer Portal Nginx Test OK
```

**Step 6 - Check Customer Portal App Service Later**

Only do this after the app files have been uploaded and the `customerportal` service has been created:

```bash
sudo systemctl status customerportal --no-pager
```

If it is not running:

```bash
sudo systemctl start customerportal
```

## Correction 23A - If customerportal.service Does Not Exist

**Information**

If these commands fail:

```bash
sudo systemctl daemon-reload
sudo systemctl enable customerportal
sudo systemctl restart customerportal
sudo systemctl status customerportal --no-pager
```

with:

```text
Failed to enable unit: Unit customerportal.service does not exist
Failed to restart customerportal.service: Unit customerportal.service not found.
Unit customerportal.service could not be found.
```

then the app may still be copied correctly, but systemd does not have the service file yet.

**Step 1 - Confirm The Needed Files**

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

**Step 2 - Create The Service File**

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

Save and exit nano:

```text
Ctrl+O
Enter
Ctrl+X
```

**Step 3 - Reload And Start**

```bash
sudo systemctl daemon-reload
sudo systemctl enable customerportal
sudo systemctl restart customerportal
sudo systemctl status customerportal --no-pager
```

If it fails, check:

```bash
journalctl -u customerportal -n 80 --no-pager
```

Do not worry if `customerportal` does not exist yet. That service is only created after the actual portal app files are uploaded and configured.

## Correction 24 - Outside Access Times Out

**Information**

If the temporary Nginx test works on the Linux server but the public URL times out from outside, DNS and Nginx may not be the problem.

A timeout usually means the public request is not reaching Nginx.

Current outside test before the app is uploaded:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

After the app is uploaded and running, use:

```text
http://contracts.edgewaterhomestores.com/api/health
```

**Step 1 - Confirm DNS**

From any machine:

```bash
nslookup contracts.edgewaterhomestores.com
```

Good shape:

```text
contracts.edgewaterhomestores.com -> edgewatercontracts.ddns.net -> current Pueblo public IP
```

**Step 2 - Confirm No-IP Matches The Current Public IP**

On the Linux server:

```bash
curl -4 ifconfig.me
```

Then:

```bash
dig +short edgewatercontracts.ddns.net A
```

The IPs should match.

Important:

- Use `curl -4`, not plain `curl`.
- Plain `curl ifconfig.me` may return an IPv6 address, such as one starting with `2607:`.
- The No-IP `A / DNS Hostname` record and router port forwarding steps here are using public IPv4.
- If `curl -4 ifconfig.me` fails or does not return a normal IPv4 address, the ISP may not be giving the connection a usable public IPv4 address.

Bad No-IP result:

```text
10.x.x.x
192.168.x.x
172.16.x.x through 172.31.x.x
100.64.x.x through 100.127.x.x
```

Those are private or carrier-grade NAT address ranges.

They are not reachable directly from the public internet.

If No-IP shows one of those private ranges, outside access will not work.

If this happened after turning on No-IP inside the router, disable the router's No-IP/DDNS updater for now. The router may be sending its private WAN address to No-IP.

Then compare:

```text
No-IP A record
curl -4 ifconfig.me
Router WAN/Internet IPv4
```

If the router WAN/Internet IPv4 is private, such as `10.101.24.142`, the ISP is probably using CGNAT or there is another router/modem doing NAT in front of this router.

Normal port forwarding will not work until the router has a real public IPv4 address on its WAN/Internet side.

If they do not match, check No-IP:

```bash
sudo systemctl status noip-duc --no-pager
sudo journalctl -u noip-duc -n 50 --no-pager
```

**Step 3 - Confirm The Server LAN IP**

```bash
hostname -I
```

Make sure the router port forwarding sends traffic to that exact LAN IP.

**Step 4 - Confirm Router Port Forwarding**

Router forwarding for HTTP should be:

```text
WAN port: 80 - 80
LAN port: 80 - 80
Internal client: Linux server LAN IP
Protocol: TCP
WAN connection: Internet
```

Do not forward port `3000`.

Nginx is the public front door.

**Step 5 - Confirm Ubuntu Firewall**

```bash
sudo ufw status verbose
```

If Nginx is not allowed:

```bash
sudo ufw allow 'Nginx Full'
```

**Step 6 - Confirm Nginx Is Listening On Port 80**

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

**Step 7 - Test Nginx Locally Again**

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Good result includes:

```text
Customer Portal Nginx Test OK
```

**Step 8 - Test From Another Device On The Same Pueblo LAN**

Use another device connected to the same Pueblo Wi-Fi/LAN:

```text
http://LINUX_SERVER_LAN_IP/_server-test.html
```

Example:

```text
http://192.168.1.70/_server-test.html
```

If LAN access fails too, fix Nginx or the Ubuntu firewall before troubleshooting public router forwarding.

If LAN access works but public access times out, the problem is router forwarding, ISP blocking, or CGNAT.

**Step 9 - Check For CGNAT**

Compare:

```text
Public IPv4 from curl -4 ifconfig.me
Router WAN/Internet IPv4 shown in the router app/admin page
```

If they do not match, the ISP may be using CGNAT.

Normal router port forwarding will not work through CGNAT.

**Will Buying A New Router Fix This?**

Usually, no.

If the ISP is giving the router a private WAN IPv4 such as `10.101.24.142`, a new router would usually receive that same kind of private WAN address.

Port forwarding would still stop at the ISP's upstream NAT.

A new router only helps if the current router is behind another modem/router that you control.

In that case, one of these can fix it:

- Put the upstream modem/router into bridge mode.
- Forward ports 80 and 443 on the upstream modem/router to this router.
- Replace the ISP combo modem/router with equipment that can hold the real public IPv4 directly.

If the upstream NAT belongs to the ISP, only the ISP can fix normal inbound IPv4 hosting by giving you a real public IPv4 address.

Options:

- Ask the ISP for a real public IP.
- Ask the ISP for static IP service.
- Test direct IPv6 as a no-extra-cost public test path.
- Use a small VPS/reverse proxy later.

## Correction 24C - Direct IPv6 Test Address

**Information**

The Acer server has public IPv6 addresses. This can be tested while waiting for the ISP/static IPv4 issue.

Use IPv6 as a test path first. It should not be treated as the final production answer until we know the IPv6 prefix stays stable and Florida/customer networks can reach it reliably.

**Command**

On the Linux server:

```bash
ip -6 addr show scope global
```

**Current Example From The Acer**

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3/64 scope global dynamic mngtmpaddr noprefixroute
2607:3640:120:e710:647e:b014:ad36:b46a/64 scope global temporary dynamic
```

Use the first address for the temporary DNS `AAAA` test:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Do not use the address labeled `temporary dynamic` for DNS:

```text
2607:3640:120:e710:647e:b014:ad36:b46a
```

**Why**

- The `temporary dynamic` IPv6 address is a privacy address and is meant to rotate.
- The first address is the better test address because it is not the temporary privacy address.
- Both are still marked dynamic, so this is a test until the ISP confirms stable IPv6 behavior.

**Write Down**

```text
IPv6 address used for contracts-v6 DNS:

Date tested:

Device/network tested from:

Result:

Notes:
```

**DNS Test Record**

```text
Type: AAAA
Name: contracts-v6
Value: 2607:3640:120:e710:d17:1bc3:84d8:8b3
```

**Nginx Reminder**

The Customer Portal Nginx site must include IPv6 listening and the IPv6 test hostname:

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

**Test URL**

Test from a phone with Wi-Fi off, and from Florida if possible:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

Good result includes:

```text
Customer Portal Nginx Test OK
```

**What The Bad Results Mean**

- Timeout: router/eero IPv6 firewall may need inbound TCP `80` allowed to the Acer server, or the testing network may not support IPv6.
- `404 Not Found`: the request reached Nginx but landed in the wrong Nginx site. Recheck `listen [::]:80;`, the `server_name` line, and reload Nginx.
- `502 Bad Gateway`: Nginx matched the Customer Portal site but proxied to Node. For the static test, confirm the URL is exactly `/_server-test.html` and confirm the Nginx static test location exists.

## Correction 25A - Temporary Tunnel/Funnel Options

**Information**

The portal server is in Pueblo, Colorado, but Edgewater staff/customers in Florida need access over the web.

If CGNAT blocks normal router port forwarding, a tunnel/funnel can provide a temporary public URL without waiting for the ISP.

Do not use Cloudflare for this project.

Recommended testing order:

1. Tailscale Funnel for a clean temporary HTTPS test link.
2. ngrok free plan for short-term testing if Tailscale Funnel is not convenient.
3. localhost.run only for quick temporary tests.
4. Small VPS reverse proxy for a more permanent workaround if the ISP cannot provide public/static IPv4.

**Security Note**

- Free tunnel/funnel links are okay for testing, training, and dummy data.
- Do not use a casual free tunnel for real customer signatures, payment records, or private customer documents unless login, HTTPS, logging, backups, and access controls are verified.
- For production customer signing, prefer the static/public IPv4 path or a controlled VPS/reverse-proxy path.

**Tailscale Funnel**

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

**ngrok**

ngrok has a free plan with limits. It can expose a local HTTP service publicly without router forwarding.

Good for temporary tests, quick demos, and short-term access from Florida before the static/public IP is ready.

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

**localhost.run**

localhost.run can create a tunnel using SSH without installing a separate client.

Good for quick one-off access tests.

Limitations:

- Not the preferred production path.
- Free public URLs are best treated as temporary.
- Keep it for testing only unless deliberately upgraded/configured.

Example if Nginx is serving the test page or app on port `80`:

```bash
ssh -R 80:localhost:80 nokey@localhost.run
```

**VPS Reverse Proxy**

If the ISP cannot provide public/static IPv4, the most stable non-Cloudflare workaround is a small public VPS.

How it works:

```text
contracts.edgewaterhomestores.com
-> public VPS
-> encrypted tunnel back to Pueblo Linux server
-> Customer Portal
```

This is usually not free, but it is the most controllable production workaround if direct public IPv4 is not available.

## Correction 25 - What To Do While Waiting For Static/Public IP

**Information**

If public internet access is blocked by CGNAT or while waiting for the ISP to assign a static/public IPv4 address, public testing through `contracts.edgewaterhomestores.com` will not work yet.

That does not mean the setup has to stop.

You can still continue with the app upload and local/LAN testing.

**What Works Before The App Is Uploaded**

The temporary Nginx test page:

```text
http://192.168.1.70/_server-test.html
```

Replace `192.168.1.70` with the Linux server LAN IP if it is different.

**What Will Not Work Until The App Exists**

Do not expect these to work until after the portal files are uploaded, dependencies are installed, and the `customerportal` service is running:

```text
http://192.168.1.70:3000
http://192.168.1.70/api/health
```

**What To Continue Doing**

- Continue with Step 20 to upload the portal files.
- Continue with Step 21/22/23 to install dependencies and create/start the app service.
- Test the temporary Nginx page on the LAN with `http://192.168.1.70/_server-test.html`.
- Test the actual Node app on the LAN only after it exists and is running.
- Wait to test public `contracts.edgewaterhomestores.com` until the router WAN/Internet IPv4 is public/static.

## Correction 26 - End Troubleshooting And Restart Sections

**Information**

The final server manual should have troubleshooting and restart sections at the end so the person using it does not have to search through the whole guide when something breaks.

**Troubleshooting: 404 Not Found**

Meaning:

```text
The request reached Nginx, but Nginx did not serve the expected site or file.
```

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

For IPv6 testing, make sure the `server_name` line includes:

```text
contracts-v6.edgewaterhomestores.com
```

**Troubleshooting: 502 Bad Gateway**

Meaning:

```text
Nginx is working, but the app it tried to talk to is not answering.
```

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

**Troubleshooting: Timeout**

Meaning:

```text
The request is probably not reaching Nginx.
```

Check:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
sudo ss -tulpn | grep ':80'
sudo ufw status verbose
curl -4 ifconfig.me
dig +short edgewatercontracts.ddns.net A
```

If the router WAN IPv4 is private, such as `10.x.x.x`, normal IPv4 port forwarding will not work until the ISP provides a real public/static IPv4 or a tunnel/proxy path is used.

**Troubleshooting: BeeBEEP Does Not Detect The Linux User**

This is probably separate from the public website test.

BeeBEEP uses local network discovery, so Linux UFW or Windows Defender Firewall may block it even when Nginx works.

BeeBEEP default ports:

```text
36475 UDP - user discovery/search
6475 TCP - chat/system communication
6476 TCP - file transfer
```

If the LAN is `192.168.1.x`, allow BeeBEEP from the local network only:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 36475 proto udp comment "BeeBEEP discovery"
sudo ufw allow from 192.168.1.0/24 to any port 6475:6476 proto tcp comment "BeeBEEP chat and files"
sudo ufw reload
sudo ufw status verbose
```

Do not port-forward BeeBEEP ports through the router.

Also check Windows Defender Firewall and make sure BeeBEEP is allowed on the private/local network.

**Restart Nginx**

```bash
sudo nginx -t
sudo systemctl reload nginx
```

If reload does not fix it:

```bash
sudo systemctl restart nginx
sudo systemctl status nginx --no-pager
```

**Restart Customer Portal**

```bash
sudo systemctl restart customerportal
sudo systemctl status customerportal --no-pager
```

**Restart No-IP DUC**

```bash
sudo systemctl restart noip-duc
sudo systemctl status noip-duc --no-pager
sudo journalctl -u noip-duc -n 50 --no-pager
```

**After A Server Reboot**

```bash
sudo systemctl status nginx --no-pager
sudo systemctl status customerportal --no-pager
sudo systemctl status noip-duc --no-pager
sudo ufw status verbose
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

If the app is uploaded and running:

```bash
curl http://127.0.0.1:3000/api/health
```

**Final Manual Index Note**

The final compiled server manual should include:

- Table of contents/index at the front.
- Page headers.
- Bottom-right page numbers.
- Centered major section headers.
- Troubleshooting and restart commands at the end.
- Write-in blanks for settings that must be remembered later.

---

## Correction 2026-05-25 - Safe Command Prompt Upload And Rsync Warning

Add this warning to the Customer Portal file upload section and reuse it for Installer Portal, Employee Portal, and future portals.

**Which Computer Runs Which Command**

```text
Windows drive paths like F:\ONGOINGPROJECTS\CUSTOMERPORTAL only work from Windows Command Prompt.
Linux paths like ~/uploads/customerportal and /opt/apps/customerportal/app only work on the Linux server.
```

If this is run inside an SSH session on Linux:

```bat
scp "F:\customerportal-upload.tgz" michelle-work@192.168.1.70:/home/michelle-work/uploads/customerportal-upload.tgz
```

Linux may fail with:

```text
Could not resolve hostname f
```

That means the command was run from the wrong computer. Type `exit` to leave SSH, then run the `scp` command from Windows Command Prompt.

**Safe Windows Command Prompt Upload**

From Windows Command Prompt:

```bat
cd /d F:\ONGOINGPROJECTS\CUSTOMERPORTAL

tar -czf "F:\customerportal-upload.tgz" --exclude=.git --exclude=node_modules --exclude=.codex_tmp --exclude=.env --exclude=DEVSERVER.odt --exclude=data/generated --exclude=data/packets --exclude=data/logs --exclude=data/settings .

dir F:\customerportal-upload.tgz

ssh michelle-work@192.168.1.70 "rm -rf ~/uploads/customerportal && mkdir -p ~/uploads/customerportal"

scp "F:\customerportal-upload.tgz" michelle-work@192.168.1.70:/home/michelle-work/uploads/customerportal-upload.tgz
```

Then log into Linux:

```bat
ssh michelle-work@192.168.1.70
```

On Linux:

```bash
rm -rf ~/uploads/customerportal
mkdir -p ~/uploads/customerportal
tar -xzf ~/uploads/customerportal-upload.tgz -C ~/uploads/customerportal
```

**Required Staging Verification Before Rsync**

Before running `rsync --delete`, verify staging is not empty:

```bash
ls -l ~/uploads/customerportal/package.json
ls -l ~/uploads/customerportal/package-lock.json
ls -l ~/uploads/customerportal/server/index.js
ls -l ~/uploads/customerportal/public/index.html
```

If any of those files are missing, stop.

Do not run this command from an empty staging folder:

```bash
sudo rsync -av --delete ~/uploads/customerportal/ /opt/apps/customerportal/app/
```

Why:

```text
--delete makes the real app folder match the staging folder.
If staging is empty, the real app files will be deleted.
```

If that happens, re-upload/extract the archive, verify staging, then run rsync again.
