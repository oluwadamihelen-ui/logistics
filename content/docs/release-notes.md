# Release notes

## Version 1.0.0 (October 2026)

First public release.

### Shipments and delivery
* Shipment booking with tracking and order numbers, label printing with QR code, and a strict 17-status lifecycle with a full timeline.
* Home delivery and **hub or pickup-point collection** with a one-time collection code, counter hand-over, manager override with a recorded reason, and uncollected-parcel alerts after 7 days.
* Proof of delivery with recipient name, photo, signature, one-time code and GPS, configurable per company with a stricter profile for high-value parcels.
* Failed-delivery handling: reasons, rescheduling, retry or return, and attempt limits.
* **State and city drop-downs** for all Nigerian states and FCT, with administrator-added cities per company.

### Dispatch and drivers
* Dispatch board, driver and vehicle assignment, multi-stop routes with a labelled heuristic ordering, live map with real GPS positions.
* Driver web app with an offline outbox (no duplicates on retry), offline cold start, SOS, issue reporting and earnings view.
* Optional Capacitor wrapper for Android and iOS, background location and push notifications.

### Money
* Cash on delivery tracking: collection, remittance, payout to senders and disputes.
* Invoices, payments, expenses and driver settlements with statements.
* Rule-based pricing by zone, weight, priority, interstate, customer type, COD fee and insurance, with a price simulator.

### Customers
* Public tracking page, public booking page and customer portal.
* Corporate accounts with discounts, and a public REST API with scoped keys, idempotent requests and signed webhooks.

### Platform
* Multi-tenant isolation enforced on the server in several layers, role-based permissions with per-user overrides, and an append-only audit log protected by a database rule.
* Plans, entitlements and usage limits; Paystack subscription checkout verified server-side, **saved-card auto-renewal** and prorated plan changes.
* Platform admin console for companies, plans, payments and settings.
* Notifications by in-app alert, email, SMS, WhatsApp and push, with rules, preferences and de-duplication.
* AI assistant with permission-filtered tools where every change is a proposal a person must confirm.
* Optional two-factor authentication (authenticator app and recovery codes) and password reset by email.
* S3-compatible file storage.

### Experience and launch features
* Redesigned dashboard, landing page with pricing, documentation site, legal pages, and show/hide password fields.
* Production safeguards: startup configuration checks, database-backed rate limiting for sign-in and public forms, error pages, daily maintenance job, and a Vercel and Neon deployment setup.
* Public demo mode with one-click role logins, risky actions disabled and a daily data reset.

### Quality
* 172 automated tests covering permissions, the shipment lifecycle, pricing, tenant isolation, billing and webhooks, the API, the AI assistant, the driver workflow, 2FA, hub pickup, locations and startup checks.

### Known limitations in 1.0.0
* The route optimiser is a heuristic using straight-line distances.
* Automatic driver assignment is not active.
* Paystack saved-card renewal, push notifications and S3 storage were verified with simulated services; verify them with your own live accounts.
* The native Android and iOS wrapper must be built and tested by you.
* Email invitations for new users are not implemented.
* Two-factor authentication cannot yet be required company-wide.
* The public booking page and customer portal book home delivery only.
