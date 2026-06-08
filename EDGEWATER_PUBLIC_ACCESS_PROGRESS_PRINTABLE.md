# Edgewater Public Access Progress Notes

Date: May 24, 2026

Purpose: record how the Pueblo, Colorado Ubuntu Studio server was reached from outside the network for the Edgewater contract portal.

This is the project-specific version. The general instructions are in `BEGINNER_LINUX_SERVER_SETUP_GUIDE.md`.

## Table Of Contents

```text
1. What We Are Trying To Prove
2. Current Edgewater Names
3. Local Nginx Test Worked First
4. IPv4 Port Forwarding Was Not Enough
5. No-IP Status
6. IPv6 Was Tested Because IPv4 Was Blocked
7. DNS Was Set For The IPv6 Test
8. First Outside IPv6 Test Returned 404
9. Nginx Was Updated For IPv6 And The Test Hostname
10. Outside Test Succeeded
11. What This Does Not Prove Yet
12. When The ISP Provides Static/Public IPv4
13. Quick Retest Commands
14. Troubleshooting Results
15. Notes To Write Down
```

## Quick Index

```text
404 Not Found: see 8, 14
502 Bad Gateway: see 14
CGNAT/private router WAN IP: see 4
contracts-v6.edgewaterhomestores.com: see 2, 7, 10
edgewatercontracts.ddns.net: see 2, 5, 13
IPv4/static public IP: see 4, 12
IPv6 address used: see 6, 7, 15
Nginx server_name: see 9
No-IP: see 5, 13
Outside test success: see 10
Retest commands: see 13
Troubleshooting: see 14
```

## 1. What We Are Trying To Prove

The goal is:

```text
Edgewater staff/customer outside the Pueblo network
-> contracts or test domain
-> Pueblo Linux server
-> Nginx
-> Customer Portal / Contracts Portal
```

At this stage, we are not proving the full portal app yet. We are proving that outside internet traffic can reach the server and that Nginx can answer.

## 2. Current Edgewater Names

Production/intended portal name:

```text
contracts.edgewaterhomestores.com
```

Temporary IPv6 test name:

```text
contracts-v6.edgewaterhomestores.com
```

No-IP dynamic DNS hostname:

```text
edgewatercontracts.ddns.net
```

Do not use the older `customers.edgewaterhomestores.com` name right now unless it is intentionally added later as an alias.

## 3. Local Nginx Test Worked First

Before outside testing, the server itself was tested locally.

Command used on the Linux server:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Good result included:

```text
Customer Portal Nginx Test OK
```

Meaning:

```text
Linux server
-> Nginx
-> temporary test page
```

was working.

## 4. IPv4 Port Forwarding Was Not Enough

The router port-forwarding rules were entered:

```text
WAN 80  -> LAN 80  -> 192.168.1.70
WAN 443 -> LAN 443 -> 192.168.1.70
Protocol: TCP
```

Ubuntu firewall allowed:

```text
22/tcp
80/tcp
443/tcp
```

Nginx was listening on port `80`.

But the router WAN IPv4 showed:

```text
10.101.24.142
```

The Linux public IPv4 check showed:

```text
66.33.12.98
```

Meaning:

```text
The router does not directly hold the public IPv4 address.
```

That usually means ISP CGNAT or another upstream NAT.

Result:

```text
Normal public IPv4 port forwarding cannot work until the ISP provides a real public/static IPv4, or another tunnel/proxy method is used.
```

## 5. No-IP Status

No-IP Linux DUC was used instead of the router updater.

Why:

```text
The router can send its private WAN IP to No-IP.
The Linux updater can detect the public IPv4.
```

Good No-IP log result showed:

```text
current=66.33.12.98
update successful
```

Important:

```text
No-IP updating correctly does not bypass CGNAT.
```

It keeps DNS updated, but the router still needs a reachable public IPv4 for normal IPv4 hosting.

## 6. IPv6 Was Tested Because IPv4 Was Blocked

The Linux server showed public IPv6 addresses.

Command:

```bash
ip -6 addr show scope global
```

Addresses seen:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3/64 scope global dynamic mngtmpaddr noprefixroute
2607:3640:120:e710:647e:b014:ad36:b46a/64 scope global temporary dynamic
```

Use this one for DNS testing:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Do not use this one for DNS:

```text
2607:3640:120:e710:647e:b014:ad36:b46a
```

Why:

```text
The second one is labeled temporary dynamic.
That is a privacy address and can rotate.
```

Note:

```text
The first address is still marked dynamic, so this is a test path until stability is confirmed.
```

## 7. DNS Was Set For The IPv6 Test

DNS record:

```text
Type: AAAA
Name: contracts-v6
Value: 2607:3640:120:e710:d17:1bc3:84d8:8b3
TTL: 300
```

Check result:

```text
contracts-v6.edgewaterhomestores.com AAAA 2607:3640:120:e710:d17:1bc3:84d8:8b3
```

## 8. First Outside IPv6 Test Returned 404

Outside test:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

Initial result:

```text
HTTP/1.1 404 Not Found
```

This was good news.

Meaning:

```text
outside network
-> IPv6 DNS
-> Acer server
-> Nginx
```

was working.

The `404` meant Nginx was answering, but from the wrong/default site block.

Later, after the Node app was running, `/api/health` still returned `404` through Nginx even though direct app testing worked:

```text
curl http://127.0.0.1:3000/api/health
{"ok":true}
```

Cause:

```text
The Ubuntu Nginx default site was still enabled.
```

Fix:

```bash
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Good enabled-sites result after the fix:

```text
customerportal -> /etc/nginx/sites-available/customerportal
```

The `default` site should not be listed for this simple Contract Portal setup.

## 9. Nginx Was Updated For IPv6 And The Test Hostname

Nginx site file:

```text
/etc/nginx/sites-available/customerportal
```

The top of the Customer Portal site needed:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name contracts.edgewaterhomestores.com contracts-v6.edgewaterhomestores.com edgewatercontracts.ddns.net;
```

Plain-English meaning:

```text
listen 80       = answer HTTP on IPv4
listen [::]:80  = answer HTTP on IPv6
server_name     = domains/subdomains this Nginx site should answer for
```

The static test route needed:

```nginx
location = /_server-test.html {
    alias /opt/apps/customerportal/nginx-access-test.html;
    default_type text/html;
}
```

Plain-English meaning:

```text
When the browser asks for /_server-test.html,
serve the real Linux test file.
The browser does not see the real Linux file path.
```

After editing Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 10. Outside Test Succeeded

Test URL:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

Good result:

```text
Customer Portal Nginx Test OK
```

This proves:

```text
outside network
-> contracts-v6 DNS
-> Pueblo Acer server IPv6
-> Nginx
-> temporary test page
```

is working.

This is the milestone reached.

## 11. What This Does Not Prove Yet

This does not mean the full Customer Portal app is live yet.

Still needed:

```text
Upload portal project files
Install Node packages
Create/start customerportal service
Test /api/health
Set PUBLIC_BASE_URL correctly
Install HTTPS certificate
Test signing links
Test PDF generation/download/print/email
Review security before real customer data
```

## 12. When The ISP Provides Static/Public IPv4

When the ISP gives the server connection a real public/static IPv4, update this sheet and retest the normal production domain.

The desired final IPv4 path is:

```text
contracts.edgewaterhomestores.com
-> public/static IPv4
-> router port 80/443 forwarding
-> 192.168.1.70
-> Nginx
-> Customer Portal
```

Step 1 - Confirm the router WAN IPv4 is public.

In the router/app, write down:

```text
Router WAN/Internet IPv4:
________________________________________
```

On the Linux server, run:

```bash
curl -4 ifconfig.me
```

Write down:

```text
Linux public IPv4:
________________________________________
```

Good result:

```text
Router WAN/Internet IPv4 matches curl -4 ifconfig.me.
```

Bad result:

```text
Router WAN/Internet IPv4 is still 10.x.x.x, 192.168.x.x, 172.16-31.x.x, or 100.64-127.x.x.
```

If the bad result happens, normal IPv4 port forwarding is still blocked by CGNAT/double NAT.

Step 2 - Confirm No-IP points to the public IPv4.

```bash
dig +short edgewatercontracts.ddns.net A
```

Write down:

```text
No-IP A record:
________________________________________
```

Good result:

```text
No-IP A record matches the public/static IPv4.
```

Step 3 - Confirm `contracts.edgewaterhomestores.com` points correctly.

```bash
dig contracts.edgewaterhomestores.com
```

Expected chain:

```text
contracts.edgewaterhomestores.com
-> edgewatercontracts.ddns.net
-> public/static IPv4
```

Step 4 - Test the normal production domain from outside the Pueblo network.

Use a phone with Wi-Fi off or a computer in Florida:

```text
http://contracts.edgewaterhomestores.com/_server-test.html
```

Good result:

```text
Customer Portal Nginx Test OK
```

Step 5 - After HTTP works, install and test HTTPS.

Do not use customer signatures or private customer documents over plain `http://`.

Final customer-facing links should use:

```text
https://contracts.edgewaterhomestores.com
```

Write down after static/public IPv4 is working:

```text
Static/public IPv4 assigned:

Router WAN IPv4:

No-IP A record:

contracts.edgewaterhomestores.com test result:

HTTPS certificate installed date:

Notes:
```

## 13. Quick Retest Commands

Local test on the Linux server:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

Outside test from phone or outside network:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

Check Nginx config:

```bash
sudo nginx -t
```

Reload Nginx after changes:

```bash
sudo systemctl reload nginx
```

Check Nginx status:

```bash
sudo systemctl status nginx --no-pager
```

Check firewall:

```bash
sudo ufw status verbose
```

Check IPv6 address:

```bash
ip -6 addr show scope global
```

Check public IPv4:

```bash
curl -4 ifconfig.me
```

Check No-IP:

```bash
dig +short edgewatercontracts.ddns.net A
sudo systemctl status noip-duc --no-pager
```

## 14. Troubleshooting Results

If outside test shows:

```text
Customer Portal Nginx Test OK
```

Meaning:

```text
Public test path works.
```

If outside test shows:

```text
404 Not Found
```

Meaning:

```text
The request reached Nginx, but Nginx used the wrong/default site block.
```

Fix:

```text
Check listen [::]:80, server_name, the /_server-test.html location, and whether the default Nginx site is still enabled.
Reload Nginx.
```

If outside test shows:

```text
502 Bad Gateway
```

Meaning:

```text
Nginx matched the site, but tried to send the request to the Node app.
```

Fix:

```text
For the temporary test, make sure the URL is exactly /_server-test.html.
If testing the app later, make sure customerportal service is running.
```

If outside test times out:

Meaning:

```text
The request probably is not reaching Nginx.
```

Fix:

```text
Check DNS, router/eero IPv6 firewall, Ubuntu firewall, and whether the testing network supports IPv6.
```

## 15. Notes To Write Down

IPv6 address used:

```text
2607:3640:120:e710:d17:1bc3:84d8:8b3
```

Outside test URL:

```text
http://contracts-v6.edgewaterhomestores.com/_server-test.html
```

Tested from:

```text
________________________________________
```

Date/time:

```text
________________________________________
```

Result:

```text
________________________________________
```

Notes:

```text
________________________________________
________________________________________
________________________________________
```
