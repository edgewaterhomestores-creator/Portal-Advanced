# Server Setup Tech Standards Summary

Use this page for the business tech standards binder or server file.

This is not the full install guide. It is the short record of the final settings chosen for this server.

Do not write real passwords on this page. Write where the password is stored, such as the password manager entry name.

## Table Of Contents

```text
Business And Project
Server Identity
Domains And DNS
Router And Firewall
Web Server And App Services
Database
Email / SMTP
Storage, Backups, And Logs
Security Review
Public Test Results
Static/Public IPv4 Follow-Up
Emergency Commands
Change Log
```

## Quick Index

```text
App folder: see Web Server And App Services
Backups: see Storage, Backups, And Logs
Database: see Database
DNS: see Domains And DNS
Emergency restart commands: see Emergency Commands
Firewall: see Router And Firewall
HTTPS: see Security Review, Public Test Results
LAN IP: see Server Identity, Router And Firewall
Nginx site file: see Web Server And App Services
No-IP/dynamic DNS: see Domains And DNS
Ports: see Router And Firewall, Web Server And App Services
SMTP/email: see Email / SMTP
Static/public IPv4: see Static/Public IPv4 Follow-Up
```

## Business And Project

| Item | Value |
|---|---|
| Business name | ________________________________________ |
| Project/app name | ________________________________________ |
| Main portal domain | ________________________________________ |
| Test domain or subdomain | ________________________________________ |
| Server location | ________________________________________ |
| Primary users/location served | ________________________________________ |
| Date installed | ________________________________________ |
| Installed by | ________________________________________ |
| Last reviewed | ________________________________________ |

## Server Identity

| Item | Value |
|---|---|
| Server nickname | ________________________________________ |
| Hardware/model | ________________________________________ |
| Operating system | ________________________________________ |
| Linux login username | ________________________________________ |
| Password manager entry for Linux login | ________________________________________ |
| Server LAN IPv4 | ________________________________________ |
| Server IPv6 used for testing | ________________________________________ |
| SSH port | ________________________________________ |

## Domains And DNS

| Item | Value |
|---|---|
| Production domain | ________________________________________ |
| Temporary/test domain | ________________________________________ |
| Dynamic DNS provider | ________________________________________ |
| Dynamic DNS hostname | ________________________________________ |
| Public IPv4 shown by server | ________________________________________ |
| Router WAN IPv4 | ________________________________________ |
| IPv6 AAAA record value | ________________________________________ |
| DNS provider login/password manager entry | ________________________________________ |

## Router And Firewall

| Item | Value |
|---|---|
| Router/admin app | ________________________________________ |
| Router admin/password manager entry | ________________________________________ |
| Internal server IP used for forwarding | ________________________________________ |
| HTTP forward | WAN ____ -> LAN ____ |
| HTTPS forward | WAN ____ -> LAN ____ |
| IPv6 firewall rule needed? | Yes / No / Unknown |
| Ubuntu firewall command used | ________________________________________ |
| Notes | ________________________________________ |

## Web Server And App Services

| Item | Value |
|---|---|
| Web server | Nginx |
| Nginx site file | /etc/nginx/sites-available/customerportal |
| Main app folder | /opt/apps/customerportal/app |
| Temporary test file | /opt/apps/customerportal/nginx-access-test.html |
| Customer Portal service name | customerportal |
| Customer Portal app port | 3000 |
| Installer Portal app port | 3011 |
| Employee Portal app port | 3012 |
| Public base URL | ________________________________________ |

## Database

| Item | Value |
|---|---|
| Database chosen | MySQL / PostgreSQL / SQLite / Not yet |
| Database server | ________________________________________ |
| Database name | ________________________________________ |
| Database app user | ________________________________________ |
| Password manager entry for DB user | ________________________________________ |
| Backup method | ________________________________________ |
| Notes about legacy import | ________________________________________ |

## Email / SMTP

| Item | Value |
|---|---|
| SMTP provider | ________________________________________ |
| SMTP host | ________________________________________ |
| SMTP port | ________________________________________ |
| SMTP security | SSL / TLS / STARTTLS / Other |
| SMTP username | ________________________________________ |
| Password manager entry for SMTP | ________________________________________ |
| From name | ________________________________________ |
| From email | ________________________________________ |
| Store notification email | ________________________________________ |

## Storage, Backups, And Logs

| Item | Value |
|---|---|
| Generated PDF folder | ________________________________________ |
| Uploaded document folder | ________________________________________ |
| App log folder | /opt/apps/customerportal/app/data/logs |
| Backup folder | /opt/backups/customerportal |
| Backup drive/location | ________________________________________ |
| Backup schedule | ________________________________________ |
| Backup tested date | ________________________________________ |
| Restore tested date | ________________________________________ |

## Security Review

| Item | Status / Notes |
|---|---|
| HTTPS certificate installed | ________________________________________ |
| Admin password changed from default | ________________________________________ |
| Session secret set | ________________________________________ |
| Database ports closed to public internet | ________________________________________ |
| Only ports 80/443 public | ________________________________________ |
| Customer PDFs protected | ________________________________________ |
| Signature IP/browser logging enabled | ________________________________________ |
| Error logging enabled | ________________________________________ |
| Backup encryption needed? | ________________________________________ |
| Production security review completed | ________________________________________ |

## Public Test Results

| Test | Result |
|---|---|
| Local Nginx test | ________________________________________ |
| LAN test | ________________________________________ |
| Outside IPv4 test | ________________________________________ |
| Outside IPv6 test | ________________________________________ |
| HTTPS test | ________________________________________ |
| Customer signing link test | ________________________________________ |
| PDF download/print/email test | ________________________________________ |

## Static/Public IPv4 Follow-Up

Complete this section after the ISP provides a real static/public IPv4.

| Item | Value |
|---|---|
| Static/public IPv4 assigned by ISP | ________________________________________ |
| Router WAN IPv4 after ISP change | ________________________________________ |
| `curl -4 ifconfig.me` result | ________________________________________ |
| No-IP A record result | ________________________________________ |
| `contracts.edgewaterhomestores.com` outside test | ________________________________________ |
| HTTPS certificate installed | ________________________________________ |
| Final production URL | ________________________________________ |

Notes:

```text
________________________________________
________________________________________
________________________________________
```

## Emergency Commands

Check Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
```

Reload Nginx after a config change:

```bash
sudo systemctl reload nginx
```

Restart Customer Portal:

```bash
sudo systemctl restart customerportal
sudo systemctl status customerportal --no-pager
```

View Customer Portal logs:

```bash
journalctl -u customerportal -n 80 --no-pager
```

Check firewall:

```bash
sudo ufw status verbose
```

Check local Nginx test page:

```bash
curl -H "Host: contracts.edgewaterhomestores.com" http://127.0.0.1/_server-test.html
```

## Change Log

| Date | Change | Done By |
|---|---|---|
| __________ | ________________________________________ | __________ |
| __________ | ________________________________________ | __________ |
| __________ | ________________________________________ | __________ |
