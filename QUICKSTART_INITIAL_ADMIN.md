# Quickstart For The First Admin

Audience: the first manager/admin after the server is installed.

## First Setup

Open:

```text
/setup
```

On a true first run, the normal customer/staff entry page should redirect here until the first admin is created.

Enter:

- Business name.
- Phone, email, website, and address.
- Sales tax rate.
- First admin name.
- First admin username.
- First admin password.

After saving, you will be signed in and sent to Admin.

## Add Staff Users

Go to:

```text
Admin Menu > Users
```

For each staff person:

1. Enter name.
2. Confirm or edit the suggested username.
3. Enter a temporary password.
4. Leave `Must change password` checked.
5. Check `Manager/admin` only for someone allowed to manage users/settings.
6. Save.

Use `Disabled` when someone should no longer log in.

## Business Settings

Go to:

```text
Admin Menu > Business
```

Check:

- Business name.
- Address.
- Phone.
- Email.
- Website.
- Logo.
- Sales tax rate.

Save business settings after changes.

## Representatives And Signatures

Go to:

```text
Admin Menu > Representatives
```

Create each store representative profile. A signature image is optional.

If a saved digital signature is used, the rep must know it is an official store representative signature.

## Preimport

Go to:

```text
Admin Menu > Preimport
```

Use this area to import reviewed:

- Customers.
- Suppliers.
- Products.

For documents, use OCR staging only after files are organized and ready for review.

## Before Staff Uses It Live

Confirm:

- PostgreSQL is connected.
- Staff users are created.
- Business settings are correct.
- Logo appears.
- Sales tax rate is correct.
- Email settings are tested if sending links/PDFs.
- Old test records are backed up and cleared if this is a first live run.

## What Not To Do

- Do not share one admin login for everyone.
- Do not open PostgreSQL to the public internet.
- Do not clear records without a backup.
- Do not put first-contract password rules in customer emails.
