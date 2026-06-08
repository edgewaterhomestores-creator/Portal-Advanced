# PDF Output Standard

Use this standard for every Contract Portal module that has a live preview, print, save/download, or email document output.

## Source Of Truth

- The final customer/business document is always the server-generated PDF.
- Live preview is only for staff guidance while entering data.
- Do not use browser print of the live preview as the official saved, emailed, or customer-facing document unless that path is explicitly designed and tested as a PDF output path.
- Store/business name, address, phone, email, website, and logo must come from portal settings at PDF-generation time.

## Live Preview

- Live preview should be fast, readable, and contained inside its preview frame.
- Live preview may be close to the PDF layout, but it does not have to be pixel-perfect.
- Preview CSS must prevent overflow: no inherited wide table minimums, no amount columns spilling outside the preview page, and no content crossing preview boundaries.
- The preview should use the same normalized data concepts as the PDF: formatted dates, phone numbers, currency, line labels, totals, and customer/store fields.
- Any visible preview label should make sense for staff entry; avoid extra chrome such as "Live" if it does not help the workflow.

## Final PDF

- Save, download, print, and email actions should create or use a server-generated PDF.
- Final PDFs should use stable letter-size pages, predictable margins, and server-side formatting.
- Final PDFs should not depend on the browser viewport, browser zoom, local print settings, or live-preview CSS.
- Customer-visible PDFs must exclude internal-only pages and data unless the workflow explicitly allows them.
- Signed/accepted PDFs are records. They should not be overwritten; changes require a revision, addendum, or event record.

## Shared Formatting

- Dates should display as `MM/DD/YYYY`.
- Phone numbers should display as `(xxx) xxx-xxxx` after validation/normalization.
- Currency should display with two decimals.
- File names should be readable and predictable, using customer/contract/estimate identifiers where available.
- Business settings should be injected by the server for PDF generation, even if hidden fields also exist in the UI.

## Verification Checklist

When changing any PDF-related field or layout:

1. Check the live preview for containment and readability.
2. Generate/download the PDF and inspect that output.
3. Confirm print/email uses the generated PDF path, not the live preview DOM.
4. Verify required customer-visible pages are included and internal pages are excluded.
5. Run the relevant syntax/API/self tests.
