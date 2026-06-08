# How To Use The Contract Portal

## 1. Open The Portal

Go to:

```text
https://contracts.edgewaterhomestores.com
```

For local testing, use:

```text
http://localhost:3000
```

From another device on the same network, use:

```text
http://192.168.1.69:3000
```

The portal is designed for tablets, large phones, laptops, and desktops. Smaller phone screens show a notice and a request form for phone app, dedicated tablet, signature pad, and installer/delivery app features.

## 2. Store Employee Login

Store employees use the small Admin button on the entry page.

For local testing:

```text
Username: admin
Password: admin
```

Password fields include a Show/Hide button so staff or signers can confirm what they typed before submitting.

## 3. Create A Contract Packet

After logging in, the store employee lands on the admin menu.

The admin menu has:

- Settings in the top bar for Store Information and Signatures.
- Create Contract.
- View Contract.
- Print Contract Pages.
- Log out.

On first run, the system asks whether the store rep wants to enter store information, logo, and signature now.

To create a packet, choose Create Contract.

Create Contract asks whether the store employee is starting with a new customer or an existing customer.

The Contract Portal is the umbrella system. The admin/store employee starts the contract, prepares the right document packet, and sends it to the person who needs to sign. That signer may be a customer, employee, installer, delivery driver, or other role added later.

The store employee can:

- Start with Step 1: Customer Information Sheet.
- Choose whether to continue to the Quick Measurement form, skip it, or stop for now.
- After Quick Measurement is accepted or skipped, continue to the Estimate step.
- Open CabQuotes2 from Step 3 when the sales rep needs to create the estimate.
- Attach the Estimate PDF manually, or record the source folder/path/URL for where it should be found.
- Enter the Estimate number if available. Downloaded contract PDFs are named like `CONTRACT-LAST-YYYYMMDD-ESTNUM.pdf`; if no estimate number is available, the estimate number part is left off.
- Fill in order/job/project information in separate sections.
- Save the customer mailing address and billing address.
- Save the installation address on the contract/job, not as permanent customer information.
- Copy mailing or billing address into the installation address if they are the same.
- Choose which packet sections to include.
- The visible template page number is only there because the current starter PDF uses it for field placement. It should not be treated as the permanent document identity once estimates, acknowledgements, receipts, and scans are attached.
- Page 4 is required and is always included in the customer PDF and stored PDF.
- Page 10 is for customer-facing POS acknowledgements and receipts, not vendor paperwork.
- Pages 11 and 13 are internal vendor/receiving paperwork and are not included in customer-facing PDFs.
- Pages 14 through 18, plus Exhibit A when it is added, are customer final-packet pages when they apply to the job. They can be selected for delivery, installer, pickup, and customer checklist backup paperwork.
- Installer Job Agreement and Delivery/Installation Checklist should travel together in the customer packet when the installer agreement applies.
- Choose a saved store representative profile if one exists, or type the representative manually.
- Choose a saved store signature image only if a digital store signature is needed. If no signature image exists, print for manual signature when needed.
- Use the Manage reps/signatures link if a representative profile or optional signature image needs to be added first.
- After the initial contract signature section, answer whether Detachable Addendum A for split payment is needed.
- If Addendum A is needed, the store rep fills it out. Customers can review/sign where needed, but they cannot edit it.
- If Addendum A is not needed, it is skipped and page 9 is not included.
- Page 11/vendor order information can be entered manually now. Later, it should fill automatically as vendor/estimate/order documents are attached or generated.
- Receiving/material information can be entered manually now. Later, receiving forms should be scannable and used to fill matching fields.
- Use **Generate / Save contract packet** at the bottom when the packet is ready.
- Use **Save and exit** to save the packet, go back to the home page, and end the session.
- Use **Exit without saving** to leave the packet without saving changes, go back to the home page, and end the session.
- Email the signing link to the customer.
- Download the fillable PDF if needed.

## 3A. View/Edit Contract

Choose View Contract from the admin menu.

Search by:

- Phone.
- Address.
- Customer name.
- Invoice or contract number.
- Any other identifying information saved in the record.

Current behavior:

- Matching packet records are displayed.
- Use **View details** to see customer/job information, included sections, signature audit details, and contract history.
- Signed PDFs, signable PDFs, and signing links can be opened from the result.
- Use **Print PDF** to open the current PDF for printing.
- Use **Email signing link** if the customer needs the signing email sent again.
- Use **Email signed PDF** if the signed packet needs to be emailed to the customer again.
- Draft/signable records can be opened with **Edit draft** and saved again.
- Signed, accepted, or completed records show **Create E revision** instead of direct edit.

## 3B. Print Blank Contract Pages

Choose Print Contract Pages from the admin menu.

The store employee can:

- Select the blank packet pages needed for handwritten signatures or the paper file.
- Use the initial contract set as a shortcut.
- Use all pages as a shortcut.
- Open the selected pages as a PDF and print them.

Revision rule:

- If an order/contract has been accepted, the original cannot be overwritten.
- Any later edit creates an `E1`, `E2`, etc. version of the contract.

## 4. Customer Password

The generated PDF and customer signing page require a packet password.

Customer-facing screens should tell customers:

```text
Use the password provided by the store representative.
```

Do not publish the temporary password structure in customer-facing instructions. The store rep should give the password directly, verbally, by phone, or by another store-approved method. The signing-link email should not explain the password pattern.

Staff-only temporary password pattern:

```text
First 4 letters of customer last name + street/building number + last 4 digits of phone
```

Example for staff:

```text
Customer: Smith
Address: 123 Main Street
Phone: (386) 555-1234
Packet password: SMIT1231234
```

The customer can also use the entry page login with their last name and the portal password provided by the store. That opens the simple customer portal.

The staff login page no longer has a separate Customer Lookup button because customers should start from the main portal page. When full customer accounts are added, the customer choice on the main page should offer normal login/register options.

## 5. Future Customer Accounts

Full customer accounts are not built yet.

Right now, the portal login is based on existing packet records and the packet password provided by the store.

Later, if customer registration is added, customers should be able to create a portal account and change their password for future purchases.

Password reset should be added when real customer/admin users are moved into the database.

Future customer accounts should also let customers:

- See all past and current orders.
- Email/message Edgewater from the portal if they need help.
- Access uploaded acknowledgements, receipts, contracts, and related order documents.
- See delivery/material release forms when Edgewater makes them available.

## 5A. Final Packet Document Rules

The long-term system should track documents by type, not by final PDF page number.

Initial customer signing packet should include:

- Estimate if it exists.
- Legal Disclaimers always.
- Purchase Agreement sections always, with the screen showing whether they are signed or unsigned.
- Addendum A only if the store filled it out.

Customer information and Quick Measurement stay in-house.

Later customer-facing finalized documents can include:

- Any customer acknowledgements or receipts attached.
- Chain-of-Custody / Material Release when applicable.
- Installer Agreement plus Delivery/Installation Checklist together when installer paperwork applies.
- Delivery Signoff Summary or Customer Pickup Release depending on how the material is delivered or picked up.

Internal/store archive can include everything, including customer information, quick measurement, vendor invoices, vendor receipts, job orders, receiving paperwork, and job-costing documents.

## 6. Customer Signing

The customer opens the signing link, enters their password, reviews the packet, adds notes if needed, and signs digitally.

The customer must agree to sign electronically before the portal will finalize the signed PDF.

If the customer does not agree to electronic signing, or if the store is not comfortable with identity confidence for that situation, the customer should come into the store or sign on paper.

If the customer has trouble signing online, they can download the fillable PDF.

The signing page also records communication permissions:

- Account and contract emails are accepted as part of signing and portal/account use.
- Marketing emails are optional and must be selected by the customer.
- Account/order text messages are optional and must be selected by the customer.
- Marketing text messages are optional and must be selected by the customer.

Before sending a signing link, the store should have permission to email the customer. That permission may be verbal during the sales process, but it should eventually be tracked in the customer/account record.

The signing screen asks whether the customer wants a step-by-step review or wants to open the full document first. Future versions should guide the customer to every required initial and signature location.

Future signing input should include a connected signature pad for in-store/customer counter use, in addition to mouse, touch, and typed/download fallback options.

## 7. After Signing

After signing, the customer can choose:

- Download/save the signed PDF.
- Print the signed PDF.
- Email the signed PDF to themselves.

The store can also receive a copy by email.

After the customer finishes the selected actions, the signing link is marked complete. If they open it again, they are sent toward their customer portal instead of signing the same packet again.

When a customer is logged into their customer portal, each contract/order card shows the packet password for that specific contract. Signed documents are view-only. Changes after signing must be handled by the store through a new signed revision or addendum.

## 7A. Delivery And Material Release

The customer portal only shows Delivery & Material Release when that stage applies to the order.

Current prototype behavior:

- The release is hidden until Edgewater marks the order stage so it applies.
- Until the workflow is fully live, release signing/printing/email actions remain disabled.

Planned behavior:

- Customer can digitally sign the customer portion when delivery or pickup happens.
- Customer can print or email the form from the portal when allowed.
- Store reps can print or email the form for the customer.
- If the installer picks up or handles the delivery, the installer signs their portion and the customer signs the customer release/checklist portion.
- If the customer picks up, the customer pickup release and customer checklist portion should be used so the customer is told exactly what to inspect.
- If Edgewater's delivery driver delivers, the delivery driver/store rep portion and the customer delivery signoff should be used.
- These delivery, pickup, and customer checklist forms are available to the customer as part of the final contract packet when they apply.
- Store reps, delivery drivers, and installers should each have role-limited access for their own portion.
- If the form is printed and handwritten, it can be scanned/imported into the customer file.

## 8. In-Store Signing

If the customer is physically in the store, still use the digital signing version.

The customer signs through the portal. Then the store can print a copy for them and email it to them if they want.

## 9. Business Settings

The admin settings page lets the store:

- Update basic business information.
- Add store representative profiles. A representative profile can be saved without a digital signature image.
- Add optional saved store representative signature images by uploading an image or drawing on a phone/tablet/touchscreen.
- Delete saved signatures.

## 10. Logs

The server keeps logs in:

```text
data/logs
```

These logs help troubleshoot errors, email problems, signing issues, and other server events.

## 11. Current Scope

Right now, this program is focused on the contract/signature workflow.

Later, it can become part of the larger customer, estimate, invoice, and financial system.
