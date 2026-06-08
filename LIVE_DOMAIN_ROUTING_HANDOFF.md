# Live Domain Routing Handoff

Updated: 2026-06-05

## Current Rule

`contracts-v6.edgewaterhomestores.com` is retired and no longer viable.

Do not use `contracts-v6.edgewaterhomestores.com` for deploy checks, customer links, staff links, email links, setup links, or future generated instructions.

## Current Contract Portal Domains

Canonical staff/contracts URL:

`https://contracts.edgefam.com`

Also supported:

`https://contracts.edgefam.us`

Possible legacy/alternate contract URL if Michelle keeps it:

`https://contracts.edgewatercabinetsfloorsandmore.com`

## Removed / Retired Contract Aliases

Do not rely on these:

- `contracts-v6.edgewaterhomestores.com`
- `edgewatercontracts.ddns.net`
- `contracts.edgewaterhomestores.com`

The `edgewaterhomestores.com` website and outgoing email can stay with Hostinger. That does not mean the old contract subdomains should be used for the portal.

## Server Nginx Direction

The active `customerportal` Nginx site should route only current contract portal names to the contracts app. The contract server_name lines should be kept to:

```nginx
server_name contracts.edgefam.com contracts.edgefam.us contracts.edgewatercabinetsfloorsandmore.com;
```

Root domains such as `edgefam.com` and `edgefam.us` should not route to the contracts portal. They belong to the EdgeFam home/placeholder site.

## App Environment Direction

The contracts app should use the canonical base URL:

```env
PUBLIC_BASE_URL=https://contracts.edgefam.com
```

This is what generated email links and signing links should prefer.

## Notes For Future Agents

Many old setup documents in this folder still mention `contracts-v6.edgewaterhomestores.com`, DDNS, No-IP, and `contracts.edgewaterhomestores.com`. Treat those as historical notes unless Michelle specifically asks to recover that setup.

For current work, use this handoff and `LOCAL_ADVANCED_TRACKING.md` first.
