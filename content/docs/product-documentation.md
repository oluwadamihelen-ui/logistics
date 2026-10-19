# Product documentation

LogisticOS is a multi-tenant operating system for delivery and logistics companies. One installation serves many independent companies ("tenants"). Each company runs its own shipments, dispatch, drivers, fleet, cash on delivery, finance and customer tracking inside a private workspace.

## What the product covers

| Area | What you can do |
|---|---|
| **Shipments** | Book shipments for home delivery or hub collection, price them from your rules, print labels, and follow each one through a strict status lifecycle. |
| **Dispatch** | Assign drivers and riders from a dispatch board, group work into multi-stop routes, and watch driver positions on a live map. |
| **Driver app** | A mobile-first web app (and optional native wrapper) for tasks, navigation, proof of delivery, failed-delivery reasons, SOS and GPS sharing. It works offline and syncs later. |
| **Hubs and pickup points** | Record hub arrivals and sorting, and let recipients collect parcels at a hub or service centre with a one-time code. |
| **Cash on delivery** | Track cash collected by each driver, remittance to the office, and payout to senders. |
| **Finance** | Invoices and payments, expenses, and driver settlements with statements. |
| **Pricing** | Rules by zone, weight band, priority, interstate, customer type, COD fee and insurance, with a price simulator. |
| **Customers** | Customer records, corporate accounts, a customer portal, a public tracking page and a public booking page. |
| **Insights** | Dashboard, analytics, reports with Excel and PDF export, and an AI assistant. |
| **Platform** | Subscription plans, billing, entitlements, audit log, and a platform admin console for the product owner. |

## Shipment lifecycle

Every shipment moves through these statuses. The system only allows valid moves, so a parcel can never jump from "Created" to "Delivered".

| Status | Meaning |
|---|---|
| Created | Booked, not yet confirmed. |
| Confirmed | Accepted and ready for pickup. |
| Pickup assigned | A rider has been assigned to collect it from the sender. |
| Picked up | Collected from the sender. |
| At hub | Arrived at a hub (the hub is recorded). |
| Sorting | Being sorted at a hub. |
| Ready for dispatch | Waiting for a rider for the delivery leg. |
| Ready for pickup | Waiting at a hub or pickup point for the recipient to collect. |
| Assigned for delivery | A rider is assigned to deliver it. |
| Out for delivery | The rider is on the way. |
| Delivered | Delivered, or collected at the pickup point. |
| Delivery failed | An attempt failed; a reason is recorded. |
| Rescheduled | A new delivery date was set after a failed attempt. |
| Returning | On its way back to the hub or sender. |
| Returned to hub | Back at the hub. |
| Returned to sender | Handed back to the sender. |
| Cancelled | Cancelled while the lifecycle still allowed it. |

Delivered, Returned to sender and Cancelled are final.

### Two ways to receive a parcel

* **Home delivery.** A rider delivers to the recipient's address and captures proof of delivery.
* **Hub pickup.** The recipient collects at a hub or pickup point that has customer collection enabled. When the parcel is marked **Ready for pickup**, the recipient receives a 6-digit collection code by SMS or email (if those channels are configured). Staff hand the parcel over with that code and record the collector's name. Cash on delivery is taken at the counter and recorded as already remitted.

## Proof of delivery

Each company chooses which proof is required: recipient name, photo, signature, one-time code (OTP) and GPS location. A stricter profile can apply to high-value shipments. A delivery cannot be completed unless every required proof is provided.

## Roles and permissions

Access is controlled by roles. A role is a set of permissions, and an administrator can add or remove individual permissions per user.

| Role | Typical use |
|---|---|
| Company owner / admin | Full access to the company workspace. |
| Operations manager | Shipments, dispatch, fleet, hubs, documents. |
| Branch manager | Operations limited to their branch. |
| Dispatch manager / Dispatcher | Dispatch board, assignment, drivers. |
| Fleet manager | Vehicles, maintenance, documents. |
| Warehouse / hub staff | Hub arrivals, sorting, hand-over at the pickup counter. |
| Customer service | Shipments, customers, support tickets. |
| Accountant | COD, invoices, expenses, settlements. |
| Sales staff, HR admin | Customer and staff management respectively. |
| Driver / Rider | The driver app only, and only their own tasks. |
| Customer (portal) | Their own shipments and bookings. |
| Platform super admin | The platform console; has no access to a company's workspace data. |

Changing a user's role, permissions or active status signs them out everywhere immediately.

## Plans and limits

Plans are data, edited in the platform admin console, not hard-coded. The default catalogue is:

| Plan | Shipments / month | Drivers | Vehicles | Staff users | Branches |
|---|---|---|---|---|---|
| Starter | 500 | 10 | 10 | 5 | 1 |
| Professional | 5,000 | 50 | 50 | 25 | 5 |
| Premium | 25,000 | 200 | 200 | 100 | 20 |
| Enterprise | Custom | Custom | Custom | Custom | Custom |

Higher plans add features such as the live map, routes, pricing engine, customer portal, public booking, AI assistant, settlements, inventory, SMS, corporate accounts, API access, advanced analytics and WhatsApp. New workspaces start with a 14-day trial. After a plan expires, the workspace becomes read-only until it is renewed. Nothing is deleted.

## Security and data separation

* **Tenant isolation.** Every record belongs to one company. The server forces every database read and write to the signed-in user's company, and every identifier sent by a client is checked for ownership before use.
* **Sign-in.** Passwords are stored as salted hashes. Accounts lock after repeated failures, sign-in attempts are rate limited, and sessions are re-checked against the database on every request. Optional two-factor authentication (authenticator app and recovery codes) is available.
* **Audit log.** Sensitive actions are recorded in an append-only log. A database rule blocks any edit or deletion of log entries.
* **Uploads.** Files are checked by their real content type, size-limited and served only through authenticated routes.
* **API.** Keys are stored as hashes and shown once. Webhook addresses must be public HTTPS addresses, and each delivery is signed.

## Integrations

Each integration is optional. When one is not configured, the product says so instead of pretending to send.

| Integration | Purpose |
|---|---|
| Paystack | Subscription payments, saved-card auto-renewal, signed webhooks. |
| Resend | Email: password reset and notifications. |
| Termii | SMS notifications. |
| WhatsApp Cloud API | WhatsApp notifications. |
| Firebase Cloud Messaging | Push notifications to the driver app. |
| S3-compatible storage | Document storage (AWS S3, Cloudflare R2, MinIO). |
| OpenStreetMap, Mapbox, Google | Map tiles and navigation links. |
| Anthropic or OpenAI | The AI assistant. |

## Known limitations

* The route optimiser is a labelled nearest-neighbour heuristic using straight-line distances, not a full routing engine.
* Auto-assignment of drivers is not active.
* Paystack saved-card renewal, push notifications and S3 storage are implemented and tested with simulated services; test them with your own live accounts before relying on them.
* The native Android and iOS wrapper is included but must be built and tested on devices by you.
* Email invitations for new users are not implemented; administrators set a temporary password.
* Two-factor authentication is optional per user and cannot yet be required company-wide.
