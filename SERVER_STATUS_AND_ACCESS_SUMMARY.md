# Server Status And Access Summary

Last updated: May 24, 2026

This is the short catch-up document for the Pueblo, Colorado Linux server that will serve the Edgewater, Florida contract portal over the web.

## Plain-English Status

The Linux server itself is working for local web serving.

The public IPv4 path is not working yet because the router is not holding the public IPv4 address directly.

The direct IPv6 test path has reached the server from outside the Pueblo network, shown the temporary Nginx test page, and reached the running Contract Portal app through Nginx.

The ISP static/public IP request is still the cleanest IPv4 fix. While waiting, we can continue local/LAN setup and use the IPv6 test hostname for additional testing where IPv6 is available.

## What Works Now

- Ubuntu Studio is installed on the Acer server.
- Nginx is installed and listening on port `80`.
- Ubuntu firewall allows `80/tcp` and `443/tcp`.
- Router port forwarding rules for `80` and `443` are entered and pointed at `192.168.1.70`.
- The local Nginx access test works on the Linux server:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Good output includes:

```text
Customer Portal Nginx Test OK
```

- No-IP DUC on Linux is working.
- No-IP DUC updated the hostname to the public IPv4:

```text
66.33.12.98
```

- Direct IPv6 reached Nginx from an outside test. It first showed `404 Not Found`, which proved the request reached Nginx but landed in the wrong/default site.
- After the Customer Portal Nginx site was updated for IPv6 and the `contracts-v6` hostname, the outside IPv6 test reached the temporary Nginx test page successfully.
- The Contract Portal Node app is running on `127.0.0.1:3000`.
- Direct app health check works:

```bash
curl http://127.0.0.1:3000/api/health
```

Good result:

```json
{"ok":true}
```

- Nginx originally returned `404` for `/api/health` even while the app was running because the Ubuntu Nginx `default` site was still enabled. Disabling `/etc/nginx/sites-enabled/default` fixed the routing.

## What Is Blocking Public Access

The router WAN page showed:

```text
Router WAN IPv4:
10.101.24.142
```

The Linux public IPv4 check showed:

```text
curl -4 ifconfig.me:
66.33.12.98
```

Those do not match.

`10.101.24.142` is private address space. That means the router is behind ISP/upstream NAT or CGNAT. Normal port forwarding on this router cannot receive public IPv4 traffic until the router itself gets a real public IPv4 address.

## Current Domain Situation

Current intended public portal:

```text
contracts.edgewaterhomestores.com
```

Current No-IP hostname:

```text
edgewatercontracts.ddns.net
```

The `customers.edgewaterhomestores.com` name was earlier naming confusion and is not needed right now.

For the current setup, focus on:

```text
contracts.edgewaterhomestores.com
```

Temporary IPv6 test hostname:

```text
contracts-v6.edgewaterhomestores.com
```

Use this for IPv6 testing only until the ISP/static IPv4 path is solved or IPv6 proves reliable enough.

Current DNS result:

```text
contracts-v6.edgewaterhomestores.com AAAA 2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Current outside IPv6 test result:

```text
Customer Portal Nginx Test OK
```

This means the public IPv6 request is reaching the Acer/Nginx server and Nginx is serving the intended temporary test page.

Current app health result through Nginx:

```text
{"ok":true}
```

Important Nginx note:

```text
Only the customerportal site should be enabled for this simple setup.
If /etc/nginx/sites-enabled/default is present, it can steal requests and cause 404 responses.
```

The project-specific printable notes for how we got here are in:

```text
EDGEWATER_PUBLIC_ACCESS_PROGRESS_PRINTABLE.md
```

The binder-style page for final server values is:

```text
SERVER_SETUP_TECH_STANDARDS_SUMMARY_PRINTABLE.md
```

Current IPv6 addresses seen on the Acer:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3
2607:3640:120:e710:647e:b014:ad36:b46a
```

Use the first one for the temporary `AAAA` test record:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Do not use the second one for DNS because it was labeled `temporary dynamic`. That is a privacy address and is meant to rotate.

## What Is Waiting On The ISP

The requested ISP static/public IP should allow the normal setup:

```text
contracts.edgewaterhomestores.com
-> public/static IPv4
-> router port 80/443 forwarding
-> 192.168.1.70
-> Nginx
-> Customer Portal
```

When the ISP assigns the static/public IP, check:

```bash
curl -4 ifconfig.me
dig +short edgewatercontracts.ddns.net A
```

Then compare with the router WAN/Internet IPv4.

The router WAN IPv4 must match the public IPv4 for normal port forwarding to work.

## What Can Continue Now

Public IPv4 testing through `contracts.edgewaterhomestores.com` is blocked for now because the router WAN IPv4 is private.

These can still continue:

- Continue testing the Contract Portal through `contracts-v6.edgewaterhomestores.com`.
- Test admin login, contract creation, generated PDF, signing link, signing password, final PDF download/print/email flow.
- Add HTTPS with Certbot after HTTP tests pass.
- Continue security, backup, logging, and service setup.

Before the app is uploaded, this is the valid LAN test:

```text
http://192.168.1.70/_server-test.html
```

These will not work until the app exists and is running:

```text
http://192.168.1.70:3000
http://192.168.1.70/api/health
```

## Temporary Web Access Options To Keep As Backups

Do not use Cloudflare for this project.

### Option 1: Tailscale Funnel

Best temporary testing option.

Use case:

- Let Edgewater/Florida test the Colorado server before the ISP static IP is ready.
- Good for testing and training with dummy data.

Limits:

- Uses a `*.ts.net` URL, not `contracts.edgewaterhomestores.com`.
- Has bandwidth/port limitations.
- Still exposes the app publicly, so security must be checked before real customer data.

Example after the app runs on port `3000`:

```bash
sudo tailscale funnel 3000
```

### Option 2: ngrok

Good quick testing option.

Limits:

- Free plan has usage/request/data limits.
- Free URLs are not ideal as the final production customer signing URL.
- Free endpoints may show an interstitial page.

Example:

```bash
ngrok http 3000
```

### Option 3: localhost.run

Quick one-off testing option using SSH.

Example if Nginx is serving on port `80`:

```bash
ssh -R 80:localhost:80 nokey@localhost.run
```

Use for quick testing only.

### Option 4: VPS Reverse Proxy

Best backup if the ISP cannot provide a usable public/static IPv4.

How it works:

```text
contracts.edgewaterhomestores.com
-> public VPS
-> encrypted tunnel to Pueblo server
-> Customer Portal
```

Usually not free, but more stable and controllable than casual free tunnels.

## Recommended Next Step

Now that the outside IPv6 Nginx test works:

1. Continue Step 20 of the setup guide: upload the portal files by SFTP.
2. Install Node packages.
3. Create/start the `customerportal` service.
4. Test the portal locally/LAN.
5. Test the app through the IPv6 hostname.
6. Add HTTPS before real customer use.
7. Keep waiting on the ISP static/public IPv4 for the clean final IPv4 path.

For real customer signatures and private documents, use the static/public IP path or a controlled VPS/reverse-proxy path. Use free tunnels only for testing unless security is deliberately reviewed first.
