# Internal Operations UI Brief

Use this design direction for Contract Portal UI work unless Michelle explicitly asks for a different style.

## Primary Direction

Design the portal as an internal operations application for office staff, not a public marketing website or SaaS landing page.

The UI should feel like polished business software for Edgewater Floors, Cabinets & More: RFMS-adjacent, desktop-first, workflow-focused, and built for repeated daily use by sales/admin staff.

## Visual Style

- Clean, structured, professional, and slightly enterprise.
- Slate gray, white, and soft neutral colors.
- Restrained color use; avoid playful, flashy, or overly colorful styling.
- Compact spacing with enough room to read labels and values.
- Rounded cards, subtle borders, and light shadows only where they clarify grouping.
- No hero sections, oversized marketing layouts, decorative gradients, or big empty whitespace.

## Layout Preferences

- Prefer a dark slate left sidebar for primary workflow navigation.
- Use a white top header bar for page title, short instructions, and primary actions.
- Main content should be organized into clear panels/cards.
- Use two-column layouts on desktop where they help data entry.
- Include right-side progress/status panels where useful.
- Keep important workflow actions visible and predictable.

## Entry / Module Page Pattern

- Preserve the current portal/admin entry page direction unless Michelle explicitly asks to change a specific element or behavior.
- Keep the top menu bar structure.
- Every staff, customer, signing, estimate, and future role-specific portal page after the public landing/login flow should use the shared portal navigation pattern so users can leave the page, go home, get help, and move back/forward.
- Use compact module cards with the icon in the top-left row and the module title/summary to the right.
- Avoid bordered image boxes inside the module cards; icons should feel like functional module markers, not large decorative tiles.
- Each module card should start with search when search is relevant, then compact Add New / View-style actions underneath.
- Print/document cards can use compact grouped links for blank forms, such as blank contract pages, blank estimate, or customer information sheets.
- This pattern should carry forward to module pages for Contracts, Estimates, Customers, Installers, Vendors/Receiving, purchasing/products, and related operations modules.

## PDF / Preview Rule

- Follow `PDF_OUTPUT_STANDARD.md` for any live preview, print, save/download, or email document output.
- Live previews are staff guidance; server-generated PDFs are the official saved, printed, emailed, and customer-facing documents.

## Form Preferences

- Labels above inputs.
- Clear groupings for related fields.
- Dense but readable field spacing.
- Inputs should be easy to click, but not oversized.
- Avoid plain browser-default styling.
- Use icons sparingly and only when they clarify common concepts such as customer, phone, email, documents, notes, payments, and signatures.

## Button Preferences

- Primary buttons: dark slate with white text.
- Secondary buttons: white with slate borders.
- Important actions should be named plainly, such as Save Draft, Send Signing Link, Generate Contract, Mark Done, Complete, or Create E Revision.
- Avoid vague action labels where a workflow-specific label would be clearer.

## Customer Information Screen

The Step 1 Customer Information Sheet should include:

- First name
- Last name
- Phone 1
- Phone 2
- Email
- Email signing link
- Text messages yes/no
- Heard about us
- Mailing address
- Billing address
- Customer notes
- Customer record/status summary
- A DONE or Mark Customer Info DONE action
- Intake progress/status panel on the right

## Density Standard

The target is internal operations UI:

- More compact than a modern marketing/SaaS website.
- More readable and polished than old Windows business software.
- Optimized for scanning, data entry, lookup, customer/job workflow, and avoiding mistakes.
