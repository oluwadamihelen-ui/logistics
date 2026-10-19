# Running a public demo (for marketplace listings)

A demo is a **second deployment** of the same code, with **its own database**, switched into demo mode. It must never share a database with your production site: demo mode publishes login buttons and a known password.

## What demo mode does (`DEMO_MODE=1`)
* The login page shows one-click buttons for six roles: company owner, dispatch manager, accountant, driver (mobile app), customer portal and platform admin. Visitors need no sign-up.
* A yellow strip on every page says it is a demo with sample data that resets daily.
* These are switched off, with a clear message: sign-up, password changes and resets, two-factor, billing and payments, user management, webhooks, document uploads and all platform-admin changes. Visitors can't lock anyone out, take payments or point the server at other addresses.
* Search engines are told not to index it.
* The sample company is "SwiftDrop Logistics": about 230 shipments in every status, drivers, vehicles, hubs (two with customer pickup enabled), COD records, invoices, settlements and a customer account. It is fictional.

## Set it up (about 15 minutes)
1. **New database.** In Neon create a separate project or branch, for example `logisticos-demo`. Copy its connection strings.
2. **New Vercel project** from the same repository, with these environment variables:

   | Variable | Value |
   |---|---|
   | `DEMO_MODE` | `1` |
   | `DATABASE_URL` | the demo database (pooled) |
   | `DIRECT_DATABASE_URL` | the demo database (direct) |
   | `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://demo.yourdomain.com` (or the `.vercel.app` URL) |
   | `NEXTAUTH_SECRET` | 32+ random characters (different from production) |
   | `NEXT_PUBLIC_SUPPORT_EMAIL` | a real inbox |

   Leave payment, email, SMS, AI and storage variables **unset**, so the demo can't spend money or send messages.
3. **Deploy.** The build applies the migrations to the demo database.
4. **Load the sample data once**, from your computer with the *demo* `DATABASE_URL` set (Windows CMD):
   ```
   set DATABASE_URL=postgresql://...demo-connection-string...
   set DEMO_MODE=1
   npm run db:seed
   ```
5. **Check it.** Open the demo URL, click "Try the live demo", and sign in as each role.

## Keep it fresh
Visitors create and change data, so reset it daily. Either run by hand:
```
set DEMO_MODE=1
set CONFIRM_DEMO_RESET=yes
npm run demo:reset
```
or let GitHub do it: add the repository secret `DEMO_DATABASE_URL` (the demo connection string, **never production**) and the repository variable `DEMO_RESET_ENABLED=true`. The workflow `.github/workflows/demo-reset.yml` then wipes and re-seeds at 02:30 UTC every day.
`demo:reset` deletes **every row** in the database it points at and refuses to run unless `DEMO_MODE=1` and `CONFIRM_DEMO_RESET=yes` are both set. Double-check `DATABASE_URL` before running it.

## What to paste into the marketplace form
* **Button text:** `Try the live demo`
* **Link:** your demo URL, for example `https://demo.yourdomain.com/login`
* **Demo note for reviewers:** "Click *Company owner* on the login page. No registration needed. Sample data resets daily; billing, sign-up and uploads are disabled in the demo."
* If the marketplace asks for credentials, use the owner login below.

| Role | Email | Password |
|---|---|---|
| Company owner | `owner@swiftdrop.test` | `SwiftDrop#2026` (or your `DEMO_PASSWORD`) |
| Dispatch manager | `dispatch@swiftdrop.test` | same |
| Accountant | `finance@swiftdrop.test` | same |
| Driver | `driver1@swiftdrop.test` | same |
| Customer portal | `portal@meridian.test` | same |
| Platform admin | `admin@platform.test` | same |

Public pages to mention: `/track` (try a tracking number from Shipments in the owner view), `/book/swiftdrop` (public booking page) and `/driver` (driver app, best viewed on a phone).

## Rules
* Never set `DEMO_MODE=1` on the production deployment, and never point the demo at the production database. The server logs a warning at startup when demo mode is on.
* To change the demo password, set `DEMO_PASSWORD` and `SEED_PASSWORD` to the same value before seeding.
