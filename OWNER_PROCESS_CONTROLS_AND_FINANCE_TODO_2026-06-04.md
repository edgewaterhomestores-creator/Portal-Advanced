# Owner Process Controls And Finance To-Do

Created: 2026-06-04

Purpose: capture the process problems that caused emergency contract work, and define the future finance-program rule for changing invoices after payments exist.

## Owner Process Controls

These are the plain-English rules to discuss with the owner so the store does not repeat the same problems.

1. Contract before payment.
   - Staff should send the customer the contract/estimate packet before taking payment whenever possible.
   - If payment is taken before signature, it becomes an exception that must be cleaned up the same day.

2. Paid-before-signing exception process.
   - Use the Quick Contract fallback only when a customer has already paid before the normal contract flow was completed.
   - Staff must enter or verify customer name, email, phone, job address, estimate number, acknowledgement/order/invoice number, receipt number, invoice amount, amount paid, balance due, payment method, sale date, payment date, and store rep.
   - Staff should attach the estimate, acknowledgement/order/invoice, and receipt when available.
   - If a supporting document is missing, mark it as unavailable or to be attached later. Do not invent or rename support to make the record look complete.

3. Record what actually happened.
   - Do not backdate, overwrite, or change old documents to make the sequence look cleaner.
   - Keep the original document, the emergency follow-up contract, the sent date/time, signed date/time, and customer response.
   - If the customer signs after payment, the system should flag the file as a paid-before-signing exception.

4. Staff workflow discipline.
   - Store staff should not rely on "I will send it later" for contracts.
   - Before ordering material or treating a sale as accepted, staff should confirm the estimate/contract was sent and accepted/signed.
   - Owner or manager should periodically review paid-before-signing exceptions.

5. Customer communication.
   - Customer emails should clearly identify whether the customer is receiving a contract, estimate, receipt, acknowledgement/order/invoice, or a combination.
   - Customer-facing PDFs must be PDFs, not HTML pages or plain text pretending to be the final document.

## Future Finance Program To-Do

Paid invoices must not be edited in place.

Custom cabinet sale control rule:

- Every customer order/job should be able to reconcile income, customer documents, and receiving.
- Income/payment records must link to the customer, estimate, contract/order, acknowledgement/invoice, and receipt when those identifiers exist.
- Receiving/material records must link to the same customer order/job when material is ordered or received for that customer.
- Reports should show unmatched items: income without a matching customer order, customer orders without expected payment records, receiving without a customer/job link, customer jobs with payments but no receiving, and duplicate/suspicious receiving or receipt entries.
- This is especially important for custom cabinet sales because deposits, final payments, ordered materials, received materials, delivery/pickup, and installation readiness need to line up before the job is treated as complete.

Products / AP final review rule:

- During the products/AP final review with bank and credit-card support, anything marked as a sale but paid store-to-store must be reviewed as an inter-store inventory transfer, not a customer sale.
- The amount should be removed from sales/customer income reporting and recorded as a transfer or inter-store settlement.
- Inventory should be reduced at the store the product was taken from, and recorded at the receiving store when applicable.
- Until the businesses are consolidated into one store/inventory pool, the preferred process is for stores to pay each other for transferred product so the bank/card record, inventory movement, and store books line up.
- After everything is one store with one inventory pool, this store-to-store transfer problem should no longer need separate handling.

When staff wants to change an invoice that already has payments, payouts, or other financial activity attached, the program should force a controlled change workflow:

1. Lock the original invoice.
   - The original invoice lines, totals, tax, discounts, payments, and payout history stay unchanged.
   - Staff cannot delete or overwrite paid invoice lines.

2. Require a change reason and action.
   - Staff chooses one of these actions: add item, remove item, quantity change, price change, discount/markup change, tax correction, freight correction, void/correction, or other approved adjustment.
   - Staff enters the reason for the change.
   - Manager approval may be required for refunds, removals, large discounts, or payout-impacting changes.

3. Generate a linked adjustment invoice or revision.
   - The system creates a new invoice revision, adjustment invoice, or credit memo linked to the original invoice.
   - The new record shows what changed without destroying the original record.
   - The invoice history should answer both: "What did we know at the time?" and "What is the current final state?"

4. Apply existing payments correctly.
   - Payments remain separate linked records.
   - The system calculates the adjusted customer balance after applying payments and credits.
   - If the adjusted balance is positive, show additional payment required.
   - If the adjusted balance is negative, show refund due or customer credit due.
   - If the adjusted balance is zero, mark the revised invoice as paid in full.

5. Preserve audit details.
   - Store who made the change, when, what changed, why it changed, source document, approval status, and affected customer/order/invoice numbers.
   - Keep every payment, refund, credit, void, donation, warranty adjustment, and correction as an event.

6. Update downstream records.
   - If the change affects vendor cost, commission, job costing, inventory, sales tax, or payout reports, flag those areas for review.
   - If a refund is due, generate a refund task and refund receipt.
   - If more money is due, generate a payment request.

7. Customer-facing output.
   - Send the customer the revised invoice, adjustment invoice, credit memo, refund receipt, or payment request as appropriate.
   - The customer should see the current amount due or refund due without losing the original signed/paid history.

8. Cash target total / sales-tax-equivalent discount.
   - Future finance module needs a guided calculator for cash sales where the store wants the customer to pay a round target total, such as $5,000 cash.
   - This is a customer-facing cash discount, not a supplier/dealer/vendor cost discount.
   - Supplier discount, dealer cost, catalog multiplier, product cost, and margin/markup rules belong in a separate purchasing/pricing area.
   - The system should calculate the correct taxable sale amount, sales tax, and a store discount equal to the sales-tax impact needed to land on the desired cash total.
   - The invoice should still record tax correctly and show the discount as a separate discount line or discount event, not as deleted tax or hidden math.
   - Reports must preserve gross sale, taxable amount, tax collected/owed, discount amount, final cash received, who entered/operationally approved it, and why the discount was used.
   - The person entering the cash-target sale is also the operational approver for the store workflow. Do not add a second approval step for Jamie/store staff at the point of entry.
   - This should create an audit/review flag because it affects discount reporting, sales tax review, margin, and cash reconciliation. Review happens later by Michelle/superadmin/financial user, not as a blocking store-staff approval popup.
   - Preferred software treatment: use a "Cash Target / Discount Calculator" button that adds an explicit discount line or discount event. Do not silently lower the sale without recording the original intended sale amount, calculated tax, and discount reason.
   - The calculator should support at least two modes for review: (1) calculate the discount needed so the final customer cash total equals a target amount, and (2) calculate the final total after entering a manual discount.
   - Customer-facing wording can say "cash discount" or another owner-approved discount label. Internal reporting should flag it as a cash-target/tax-equivalent discount so the financial/superadmin user can review it later.
   - Cash received should feed a petty-cash/cash-drawer review flow. Store staff should not see or manage the reconciliation detail beyond normal payment entry. Non-financial managers should get a simple view they can understand; Michelle/superadmin/financial user gets the full petty-cash/cash-drawer reconciliation view.
   - The full review flow should show target total, cash received, taxable sale, tax, discount, payment method, drawer/petty-cash batch, who entered/approved it, later reviewer, review notes, and reconciliation status.
   - This belongs after estimates/contracts are stable and before native invoices/payments are released broadly. Do not release invoice/payment posting until the owner/financial workflow is reviewed.

## Implementation Notes

- This belongs in the future financial program, not as a quick patch in the current Contract Portal.
- Use append-only financial events instead of editable paid records.
- Build this as a guided workflow so staff cannot accidentally erase payment history.
- Reports should show original invoice total, adjustment total, payment total, refund/credit total, and final net balance.
