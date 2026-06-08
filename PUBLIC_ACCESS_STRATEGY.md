# Public Access Strategy

Last updated: May 24, 2026

This page is the proactive public-access plan for getting the Pueblo, Colorado Customer/Contracts Portal reachable by Edgewater, Florida staff and customers over the web.

## Goal

Run the portal on the Pueblo server as much as possible, avoid Cloudflare, avoid moving the whole app to outside hosting unless truly necessary, and still make the portal reachable from Florida.

## Current Facts

The Linux server is working locally:

- Nginx is installed.
- Nginx listens on port `80`.
- Ubuntu firewall allows `80` and `443`.
- The local Nginx test page works.
- No-IP on Linux can detect the public IPv4 `66.33.12.98`.

The current public IPv4 problem:

```text
Linux public IPv4:
66.33.12.98

Router WAN IPv4:
10.101.24.142
```

`10.101.24.142` is private address space. That means the router is behind ISP/upstream NAT or CGNAT. Normal IPv4 port forwarding cannot work until the router itself receives a real public IPv4 address.

The ISP static/public IPv4 request is still the cleanest production path, but work should not stop while waiting.

## Non-Negotiables And Preferences

- Do not use Cloudflare.
- Keep the main portal on the Pueblo server if possible.
- Do not make the Florida store eero/router the main production proxy.
- Free tunnels are acceptable for testing and training, not final production customer signing unless security is deliberately reviewed.
- Real customer signatures and private documents need HTTPS, login/security, backups, logging, and controlled access.

## Access Options

### Option 1: Pueblo Public/Static IPv4

Best production path if the ISP provides it.

Shape:

```text
contracts.edgewaterhomestores.com
-> Pueblo public/static IPv4
-> router port 80/443
-> 192.168.1.70
-> Nginx
-> Customer Portal
```

Why it is good:

- Keeps the portal on the Pueblo server.
- Uses normal DNS, Nginx, HTTPS, and firewall setup.
- No extra tunnel dependency.

What must be true:

- Router WAN IPv4 must be public, not `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`, or `100.64-127.x.x`.
- Router forwards `80` and `443` to the server LAN IP.
- DNS points to the public/static IPv4 or No-IP hostname that resolves to it.

### Option 2: Direct IPv6

This is the no-wait, no-extra-company path to test immediately.

Why it may work:

- The server already showed public-looking IPv6 addresses.
- Nginx is listening on IPv6.
- UFW allows `80/tcp (v6)`.
- IPv6 does not use IPv4 CGNAT.
- A direct outside IPv6 test reached Nginx. It returned `404`, which means the IPv6 path reached the server but landed in the wrong Nginx site block.

Why it may not be enough:

- Not every customer network has IPv6.
- Some cell carriers and business networks are still inconsistent with IPv6.
- The router/eero may need an IPv6 firewall rule.
- The IPv6 prefix may change unless the ISP provides stable IPv6 delegation.

Use this as an immediate test path and possible backup, not the only final plan until it is proven from Florida and customer-like networks.

Current IPv6 addresses seen on the Acer:

```text
Non-temporary-looking address to test in DNS:
2607:3640:120:e710:d17:1bc3:84d8:8b3

Temporary privacy address seen by curl -6:
2607:3640:120:e710:647e:b014:ad36:b46a
```

Use the first address for the temporary `AAAA` test record. Do not use the address labeled `temporary dynamic` for DNS because it is meant to rotate.

Both addresses are still marked dynamic, so this should be treated as a test until we know whether the IPv6 prefix stays stable.

Plain-English IPv6 explanation:

IPv4 is the old style address, like:

```text
66.33.12.98
192.168.1.70
10.101.24.142
```

IPv6 is the newer style address, like:

```text
2607:3640:120:e710:647e:b014:ad36:b46a
```

With old IPv4 home/business networks, most devices hide behind one public address. That is why port forwarding exists:

```text
Public IPv4
-> router port forward
-> private LAN device
```

With IPv6, devices can often have their own globally routable IPv6 address. That means the router may not need traditional port forwarding. Instead, the router/eero firewall must allow the inbound traffic to that specific device.

So for this project:

```text
IPv4 problem:
Router WAN is private 10.101.24.142, so public IPv4 port forwarding cannot work.

IPv6 possibility:
The Acer server may already have a public IPv6, so outside IPv6 traffic may be able to reach it if the router firewall allows it.
```

Important safety rule:

Do not expose the Node app port `3000` directly. Public traffic should go through Nginx on `80` now and `443` after HTTPS is installed.

IPv6 is not a magic replacement for security. It only changes how the outside request can reach the server. The portal still needs login, HTTPS, logging, backups, and careful access rules.

### Option 3: Tailscale Funnel For Temporary Testing

Best temporary testing path if direct IPv6 does not work.

Shape:

```text
Temporary ts.net URL
-> Tailscale Funnel
-> Pueblo server
-> Customer Portal
```

Good for:

- Staff testing from Florida.
- Training.
- Dummy/test contracts.
- Avoiding a week of waiting for the ISP.

Not ideal for:

- Final production signing URL.
- Real private customer documents before security review.
- Using `contracts.edgewaterhomestores.com` directly.

### Option 4: ngrok Or localhost.run For Quick Tests

These are fast tunnel options.

Good for:

- A quick "can Florida reach this?" test.
- Short demo sessions.

Not good for:

- Production customer signing.
- Stable long-term URLs.
- Reducing dependency on outside services.

### Option 5: Controlled VPS Reverse Proxy

This is the fallback if the ISP cannot provide a public/static IPv4 and IPv6 is not reliable enough.

Shape:

```text
contracts.edgewaterhomestores.com
-> small public VPS
-> encrypted tunnel to Pueblo server
-> Customer Portal
```

This still keeps the app and data on the Pueblo server, but uses a tiny public front door because CGNAT blocks direct inbound traffic.

Downside:

- It adds a paid outside dependency.
- It needs setup, monitoring, and security.

Use only if the ISP/public IPv4 path fails or is too expensive.

### Option 6: Florida Store Relay

Possible, but not recommended as the main plan.

Shape:

```text
contracts.edgewaterhomestores.com
-> Florida store Wire3/eero
-> store relay computer
-> tunnel to Pueblo server
-> Customer Portal
```

Problems:

- Store internet must stay up.
- Store power must stay up.
- Store relay computer must stay on.
- eero forwarding must work.
- Pueblo server must still stay up.

This adds more failure points. Keep it as an emergency/experimental idea, not the main architecture.

## Immediate No-Wait Action Plan

Do these in order.

### 1. Keep Building The App Locally/LAN

Continue with the upload and install steps.

The public URL is blocked by CGNAT, but the server can still be prepared.

Valid before the app is uploaded:

```text
http://192.168.1.70/_server-test.html
```

Only after the app is uploaded and running:

```text
http://192.168.1.70:3000
http://192.168.1.70/api/health
```

### 2. Test Direct IPv6

On the Linux server:

```bash
ip -6 addr show scope global
```

```bash
curl -6 ifconfig.me
```

```bash
sudo ss -tulpn | grep ':80'
```

```bash
sudo ufw status verbose
```

Confirm Nginx local test still works:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

In the router/eero app, look for IPv6 firewall rules. If available, allow inbound TCP `80` and `443` to the Acer/Linux server.

Do not open port `3000` publicly.

Make Nginx handle the IPv6 hostname:

```bash
sudo nano /etc/nginx/sites-available/customerportal
```

The top of the site should include:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

Then test and reload:

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

If UFW does not show `443/tcp (v6)` later when HTTPS is being configured, add it:

```bash
sudo ufw allow 443/tcp
```

In DNS, create a test-only IPv6 hostname first:

```text
Type: AAAA
Name: contracts-v6
Value: SERVER_PUBLIC_IPV6
```

Then test from a phone with Wi-Fi off and from Florida if possible:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

If that works, IPv6 gives a no-cost public testing route.

If it fails from some devices, those devices/networks may not support IPv6. That does not mean the server is broken.

### 3. If IPv6 Fails, Use A Temporary Tunnel For Testing

Use Tailscale Funnel first if practical.

After the portal app is running on port `3000`:

```bash
sudo tailscale funnel 3000
```

If testing Nginx on port `80`:

```bash
sudo tailscale funnel 80
```

Use the generated `ts.net` URL for staff testing.

Use dummy/test customer data until security is reviewed.

### 4. Keep The ISP Static/Public IPv4 Request Open

Ask for:

```text
A real public IPv4 address on the router WAN.
Removal from CGNAT if applicable.
Inbound TCP 80 and 443 allowed.
Static IPv4 price if dynamic public IPv4 is not available.
```

When they change it, compare:

```bash
curl -4 ifconfig.me
```

with the router WAN IPv4.

They must match for normal IPv4 port forwarding to work.

## Decision Rule

Use this rule:

```text
If Pueblo gets public/static IPv4:
    Use normal production hosting from Pueblo.

If IPv6 works reliably from Florida/customer networks:
    Consider IPv6 as a temporary or supplemental direct path.

If public access is needed this weekend:
    Use Tailscale Funnel for testing.

If ISP refuses public IPv4 and IPv6 is not enough:
    Discuss controlled VPS reverse proxy.

Do not use Florida store/eero relay unless there is a deliberate reason.
```

## What Not To Do

- Do not wait a week doing nothing.
- Do not open port `3000` to the public internet.
- Do not rely on the Florida store eero as the production proxy.
- Do not use Cloudflare.
- Do not use free tunnel URLs for real customer signatures until security is reviewed.
