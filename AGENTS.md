# AGENTS.md instructions for F:\ONGOINGPROJECTS\CUSTOMERPORTAL_NEXT

## Financial Report Grouping Rule

For financial, tax, expense, vendor, sales, bank, merchant, payroll, or reconciliation reports covering `2024-2025`, `2024-25`, or any grouping of years, keep stores separated first, then years.

Default order: store, year, then vendor, category, account, month, invoice, or payment grouping. Do not combine multiple stores and multiple years into one long mixed table unless Michelle explicitly asks for a combined view. If one report per year is requested, keep store sections inside each yearly report.

## Project Location Rule

Michelle's active projects must be treated as living under `F:\ONGOINGPROJECTS`.

Do not use `C:\Users\miche\OneDrive\Documents` as an active project root unless Michelle explicitly says that specific project still belongs there. If the Codex app starts in a `C:` working folder, verify the matching `F:` project location before reading, writing, generating reports, placing agent instructions, or creating project outputs.

For tax, financial, reporting, customer portal, contract portal, and operations projects, prefer the `F:` project root and keep project-level notes, outputs, scripts, and reports under the appropriate `F:\ONGOINGPROJECTS` project folder.

## Scope

This folder is the continued Contract Portal working source.

The legacy comparison copy is `F:\ONGOINGPROJECTS\ContractsPortal\CustomerPortal`.

Use this folder for current Contract Portal customer/login/autosave, installer-photo staff review, session-timeout/reclaim, and related portal work unless Michelle explicitly asks for a different exact path.

## Legacy Boundary

Do not use the legacy `ContractsPortal\CustomerPortal` folder as the active source unless Michelle explicitly requests that legacy path.

## Task Completion Rule

Complete Michelle's tasks in the order requested. Do not start a later "then," "next," "after that," or "when you stop" item until the current requested task is finished and reported as finished.

If Michelle corrects the active task, apply the correction to that active task first. Do not treat the correction as permission to start a separate task.

## Standard Deploy Rule

Use the existing copy/paste deployment process for this portal. Do not replace it with a helper script, a new PowerShell launcher, an auto-opened window, a custom wrapper, a one-line remote deploy command, or a different shell/upload/restart method unless Michelle explicitly approves that change before it is used.

Default deploy source of truth:

`F:\ONGOINGPROJECTS\CUSTOMERPORTAL_NEXT\DEPLOY_COPY_PASTE_STEPS.txt`

Keep the standard sequence: package, `scp` upload, normal SSH login, extract to `~/uploads/customerportal`, verify staged files with `ls`, `rsync` with the documented excludes, `chown`, `npm ci --omit=dev`, `systemctl restart`, local `curl`, then public route checks.

When giving Michelle deploy steps, command sequences, recovery steps, server steps, or other copy/paste instructions, number the steps and clearly label where each step is run, such as `Windows CMD`, `PowerShell`, or `Linux Server`. Do not give an unnumbered block of commands when there is more than one step.

Only change filenames, paths, ports, service names, domains, or exclude rules when required for the current package/server. Before making that change, state the exact difference from the standard steps and wait for Michelle's approval unless she already explicitly instructed that exact change.

If the Contract Portal and InstallerPortal both need deployment, use each app's documented deploy process separately or pause and ask Michelle how to split the package. Do not silently invent a combined deploy flow and do not copy one app into the other app's server folder.

If any deploy attempt fails or the transcript is incomplete, stop. Do not continue by trying alternate methods. Report the last completed step, the exact error, what changed, what did not change, and the rollback/backup path if known.

## DBeaver Tunnel Reminder

When Michelle asks for the DBeaver tunnel or says she cannot get into the database, provide the full command set:

1. `ssh michelle-work@192.168.1.70`
2. On the Linux server: `sudo grep '^DATABASE_URL=' /opt/apps/customerportal/app/.env`
3. In a separate Windows CMD or PowerShell window, leave open: `ssh -N -L 15432:127.0.0.1:5432 michelle-work@192.168.1.70`
4. If port `15432` is busy, use: `ssh -N -L 15433:127.0.0.1:5432 michelle-work@192.168.1.70`

<!-- GLOBAL_SURGICAL_FIX_POLICY_START -->
## Surgical Fix Policy (Non-Negotiable)

Applies to all agents/helpers for this project.

- Only surgical fixes are allowed unless the user explicitly approves a broader refactor.
- Fix issues at the source. Do not stack patch layers over existing broken logic.
- Do not append fallback code that overrides current behavior.
- Do not add duplicate components, duplicate routes, duplicate style declarations, or parallel logic paths.
- Prefer replacing incorrect code over wrapping it.
- Keep edits minimal and targeted to the requested issue.
- If a change could affect other screens/flows, pause and ask before broadening scope.
- Keep one clear style source per UI path; avoid style conflicts and override chains.
- Do not introduce new files/components/pages for a simple bug/style fix unless explicitly requested.
- Preserve existing behavior outside the exact fix scope.
<!-- GLOBAL_SURGICAL_FIX_POLICY_END -->

## Michelle's No Extra Additions Rule

Do not add extra design, layout, content, structure, sections, helper text, filler rows, overlays, decorative lines, borders, shading, colors, advice, assumptions, or process steps unless Michelle explicitly asks for that exact thing.

When Michelle asks for a fix, fix only the thing she asked to fix. Do not redesign the document, do not add new formatting systems, and do not invent additional output.

For printable reports, worksheets, PDFs, forms, and business documents:
- Do not add decorative or extra ruling, overlays, filler rows, extra borders, extra shading, extra colors, icons, or explanatory text unless Michelle specifically asks.
- If Michelle asks for lines, ask or infer the simplest writing-line treatment and do not combine multiple line systems.
- If Michelle complains about borders, colors, spacing, lines, or readability, remove or correct that specific issue only.

When Michelle is upset about repeated errors, provide a factual operational report: what was found, what was changed, what was not changed, and exact file paths.

## Michelle's PDF and Printable Report Readability Rule

PDFs, printable reports, worksheets, and forms must be readable first.

If a PDF uses tables, style the tables for visual reading: clear headers, appropriate row spacing, readable text, and enough structure to follow rows and columns without clutter.

If multiple stores appear as columns, highlight or distinguish the store columns with clear, consistent colors or styling so the stores are easy to track visually.

If the document is meant to be filled in, the fill-in areas must have appropriate borders, ruled lines, or clear boxes so Michelle can see exactly where values or notes should be written.

Do not add these elements as decoration. Use only the amount of structure needed to make the PDF readable and usable for the specific document.

## Michelle's PDF Page Setup Rule

For PDFs, printable reports, worksheets, and forms, use 8.5 x 11 inch paper by default.

Use .3 inch margins by default.

Use landscape orientation only when the document is a large tabular report that genuinely needs the width.

Use 14 inch paper only when a large tabular document cannot be made readable on 8.5 x 11, even in landscape.

Do not change paper size, orientation, or margins for style reasons.

## Michelle's Printable Table Border Rule

For PDFs, worksheets, forms, and printable reports, table borders must be consistently visible when printed.

Do not make regular row borders so light that they are hard to see on paper.
Do not make borders heavier only because the row text is bold.
Use bold text and restrained shading to mark totals or group rows, while keeping border weight consistent across the table unless Michelle explicitly asks for heavier section dividers.

Fill-in cells for handwritten or manual values must have clear, visible borders or ruled areas that line up across the page without adding duplicate inner lines.
