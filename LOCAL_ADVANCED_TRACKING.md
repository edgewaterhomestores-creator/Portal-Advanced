# Local Advanced Tracking

Created: 2026-06-05

This copy was created from `F:\ONGOINGPROJECTS\CUSTOMERPORTAL` so local development can move ahead without destabilizing the live portal.

## Current Purpose

- Current continued Contract Portal working source after the 2026-06-06 consolidation.
- Preview the newer local version.
- Continue advanced Contract Portal work in isolation.
- Keep live `contracts.edgefam.us` stable while this copy evolves.
- Prepare for a future move/rename under `F:\ONGOINGPROJECTS\CONTRACTSPORTAL` once Michelle creates that folder and approves the structure.

## 2026-06-06 Consolidation

- `F:\ONGOINGPROJECTS\ContractsPortal\CustomerPortal` is marked legacy and should not be used for new Contract Portal development unless Michelle explicitly names that path.
- Installer-photo staff review, installer directory management, and staff session timeout/reclaim behavior were merged forward into this folder.
- The separate Installer Portal upload app remains under `F:\ONGOINGPROJECTS\ContractsPortal\InstallerPortal` and works with this Contract Portal through the installer upload/data paths.

## Named Packages

- `Contracts-PreCustomerPortal-20260605-2004.tgz` - checkpoint before building the separate customer portal side. SHA256: `E14C225210258D082283887584CB75123821E5FB3C3437CB44EADBCEC84C9BDC`.
- `Contracts-CustomerPortalStart-20260605-2026.tgz` - first limited customer access boundary. Full `/customer` dashboard is gated behind `CUSTOMER_PORTAL_ENABLED=true`; default customer landing is `/customer-limited` for document-link guidance and store messages. SHA256: `8E51500DC0104675B239E38ADE6247735590181AD15FFB07637DF1629BF97CEA`.
- `Contracts-AutosaveLimit-20260605-2050.tgz` - autosave draft cleanup checkpoint. Limits server autosave drafts to one active draft per staff user, clears that user's drafts after packet create/update/revision succeeds, and keeps only the current browser session draft snapshot. SHA256: `24F044DFEA9B80AAA7FE40855B7644B9798234928C963FDA52D8B62072739314`.
- `Contracts-AutosaveLimitRetireV6-20260605-2142.tgz` - deploy candidate with autosave draft limit plus current domain handoff/retired `contracts-v6` notes. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `BDB8D15B67C968EF2B02FCA076DF83EE286D7C880779B47DF121FADE4A01210A`.
- `Contracts-AutosaveLimitCompactLogin-20260605-2210.tgz` - deploy candidate with autosave draft limit, retired `contracts-v6` notes, and compact one-spot registered login. Staff login is handled through the registered login box first; customer accounts fall back by email; first-contract password access remains separate. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `74891ED9694FC9EE4C71F236C625F8EF207F591E5B3E9FDD26C463BF9AC47F6C`.
- `Contracts-AutosaveLimitCompactLoginSwap-20260605-2215.tgz` - deploy candidate with first-contract access on the left, `Customer, Staff or Installer (registered)` login on the right, tighter entry row spacing, autosave draft limit, and retired `contracts-v6` notes. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `5799A458DEE6934CF15EAEA63C378D1D0840A3E511CDCF0DAF93AE9BA8F6C304`.
- `Contracts-UnifiedPortal-20260606-0617.tgz` - earlier unified package candidate after marking `F:\ONGOINGPROJECTS\ContractsPortal\CustomerPortal` legacy and merging its installer photo review/session features forward into this continued source. Superseded by `Contracts-UnifiedPortal-20260606-0619.tgz` after deploy-note correction. SHA256: `A78FE9F52202B96D490E227A340F609F64603B6AED5447EDFB195EA3DE026AC3`.
- `Contracts-UnifiedPortal-20260606-0619.tgz` - current unified package candidate. Includes this continued Contract Portal source plus the separate nested `InstallerPortal` app code in the same archive while excluding `.env`, `node_modules`, live settings/data, generated contracts, uploaded installer data, and prior archive files. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `FAF0707EE6B5DC745F4BE9C2A0CCFD42438425873C19E018BB8EB38B378B4CEB`.
- `Contracts-UnifiedPortal-20260606-0637.tgz` - current deploy package. Same unified Contract Portal plus nested InstallerPortal code, with corrected deploy instructions and helper scripts that copy Contract Portal and InstallerPortal to separate server app folders. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `A8B9706766DD6106735CE50ADAEA6F0D2E4E919CA01A749B343D38F15620F5B7`.
- `Contracts-UnifiedPortal-20260606-0642.tgz` - current deploy package with corrected interactive deploy helper that pauses on errors. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `0364A9496BF6729619CBDF28148774FDB4D279FC7DA8CBD39DF9347F9A6E46FE`.
- `Contracts-UnifiedPortal-20260606-0645.tgz` - current deploy package with corrected deploy helper hash comparison. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `A09F4359199CCB10B6A367C7A4F7F33F611042B8E2D207029D17DC728198F2F8`.
- `Contracts-UnifiedPortal-20260606-0654.tgz` - current deploy package with password-only SSH/scp launcher and skipped redundant remote-folder prepare step. Copied to `F:\customerportal-upload.tgz` for upload. SHA256: `DD8D58F9415D79BEB23A72B8AC957413A727BFAEDFD12A54BFCF79158519B2E6`.

## Runtime

- Local folder: `F:\ONGOINGPROJECTS\CUSTOMERPORTAL_NEXT`
- Default local URL: `http://127.0.0.1:3010`
- Local env file: `.env`
- Database: disabled by default
- Email sending: disabled by default
- Runtime data folder: `data`

## Cleanup Principle

The local advanced copy may create test records. Cleanup should be deliberate:

1. Confirm the tested feature works.
2. List the exact files/tables created during the test.
3. Clear only test records.
4. Confirm linked/cascade deletes do not remove real source documents.
5. Keep cleanup commands documented before using them on any live-like database.

## IPv4 / IPv6 Deployment Goal

The finished hosted portal should support both IPv4 and IPv6. Current live testing showed IPv4 working for `contracts.edgefam.us`, while IPv6 timed out from this environment. That should be treated as an infrastructure/DNS/Nginx/router follow-up, not a reason to break the app code.

## Current Live Domain Rule

- `contracts-v6.edgewaterhomestores.com` is retired and should not be used for new deploy checks, generated customer links, setup links, or documentation.
- Current canonical contract portal URL is `https://contracts.edgefam.com`.
- `https://contracts.edgefam.us` can remain a working alternate.
- Root domains such as `edgefam.com` and `edgefam.us` should show the EdgeFam home/placeholder site, not the contracts portal.
- See `LIVE_DOMAIN_ROUTING_HANDOFF.md` before changing Nginx, Certbot, DNS, or generated app links.
