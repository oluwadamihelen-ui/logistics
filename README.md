# RouteWise — multi-tenant operating system for delivery & logistics companies

> "RouteWise" is a placeholder name. Everything brand-related lives in [`src/config/brand.ts`](src/config/brand.ts) (override with `NEXT_PUBLIC_*` env vars) — nothing else hard-codes it.

A production-oriented SaaS where many independent logistics companies (couriers, last-mile, dispatch, 3PL, food/pharmacy delivery, freight, own-fleet operators) run their operations on one platform: shipments → dispatch → drivers/riders → proof of delivery → COD → invoices → driver settlements, with a customer portal, public tracking/booking, an API, notifications, an AI assistant and subscription billing.

Windows user? Start with **[WINDOWS_SETUP.md](WINDOWS_SETUP.md)**. API reference: [docs/API.md](docs/API.md). Mobile: [docs/MOBILE.md](docs/MOBILE.md).

---

## Quick start

```bash
npm install
cp .env.example .env        # Windows CMD: copy .env.example .env   — then edit DATABASE_URL and NEXTAUTH_SECRET
npx prisma migrate deploy   # create tables
npm run db:seed             # demo company "SwiftDrop Logistics" (fictional data)
npm run dev                 # http://localhost:3000
```

Demo logins (password `SwiftDrop#2026`, or `SEED_PASSWORD`): `owner@swiftdrop.test`, `admin@platform.test` (platform admin), `driver1@swiftdrop.test` (driver app), `portal@meridian.test` (customer portal). Public pages: `/track`, `/book/swiftdrop`.

Quality gates: `npm run typecheck` · `npm run lint` · `npm test` (needs Postgres) · `npm run build`.

---

## Architecture

```
src/
  config/            brand.ts (rebrandable), nav.ts (permission/feature-aware menu)
  lib/platform/      SHARED INFRASTRUCTURE — knows nothing about shipping
    db.ts              unscoped prisma + tenant-scoped client, FK ownership guard, atomic sequences
    permissions.ts     central permission catalogue + role matrix
    context.ts         authenticated request context (user + tenant + permissions)
    auth.ts            NextAuth credentials, lockout, rate limits
    entitlements.ts    plans → features/limits/access level (single source of truth)
    billing.ts         checkout, idempotent payment confirmation, cancel/resume
    payments/          PaymentProvider abstraction (Paystack)
    notifications/     rule engine + channel providers (email/SMS/WhatsApp)
    ai/provider.ts     LlmProvider abstraction (Anthropic, OpenAI)
    maps.ts            MapProvider abstraction (osm, mapbox, google-links)
    storage.ts         StorageDriver (disk) · audit.ts · rate-limit.ts · api-auth.ts · jobs.ts
  lib/logistics/     LOGISTICS DOMAIN LOGIC (services; UI/API/AI/driver app all call these)
    shipments.ts       lifecycle state machine, assignment, proof of delivery, failures
    pricing.ts         rule-based pricing engine (pure)        cod.ts · finance.ts · settlements.ts
    routes.ts          delivery runs + optimiser extension point    analytics.ts · reports.ts
    ai-tools.ts        AI tool registry          ai-assistant.ts    orchestration
  app/               Next.js App Router
    (app)/             staff workspace            driver/   mobile-first driver app
    portal/            customer portal            platform/ super-admin console
    track/ · book/     PUBLIC tracking + booking  api/v1/   public REST API
prisma/              schema, migrations (incl. DB triggers), seed
tests/               vitest (needs Postgres)       mobile/   Capacitor shell
```

Stack: Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL + Prisma 6 · NextAuth (JWT, credentials) · Tailwind · Recharts · Leaflet.

### Multi-tenancy & tenant isolation

Hierarchy: Platform → Company (tenant) → Branches/Hubs → Users/Drivers → Customers/Shipments/Finance.

Isolation is enforced **server-side in layers**:

1. **Tenant-scoped Prisma client** (`createTenantClient(companyId)` in `src/lib/platform/db.ts`). Every operation on every model that has a `companyId` column (derived from the schema, so new models are covered automatically) is forced to the caller's company: `where` is ANDed with `companyId`, creates get the tenant id (a caller-supplied one is overwritten), updates cannot change `companyId`, and `AuditLog` is append-only. Application code receives only this client via the request context.
2. **Foreign-key guard** (`assertOwned`): scalar FKs are not tenant-aware, so every client-supplied id (customer, driver, vehicle, branch, hub, zone…) is verified to belong to the tenant before use.
3. **Request context** (`getTenantContext`): the user is re-read from the database on **every** request (deactivation, role changes, permission changes, suspended companies and `tokenVersion` bumps take effect immediately even though the cookie is a JWT).
4. **Middleware** rejects unauthenticated access to protected routes (defence in depth).
5. **Customer-level isolation inside a tenant**: portal users carry a `customerId`; portal queries are forced to it. API keys can be bound to one corporate customer.
6. Raw SQL (analytics) always carries an explicit `"companyId"` predicate.

`tests/tenant-isolation.test.ts`, `tests/api.test.ts`, `tests/ai.test.ts`, `tests/portal-and-rbac.test.ts` deliberately attempt cross-tenant reads/writes/assignments/AI lookups/API access and assert they fail. Recommended extra hardening for very large deployments: add PostgreSQL Row-Level Security as a second net (the app-layer guard is the primary control today).

### RBAC

Roles map to permission sets in one file (`permissions.ts`); app code uses `ctx.can("shipments.assign")` / `requireTenant("finance.manage")` — never role-name checks. Per-user `extraPermissions` / `deniedPermissions` layer on top (UI: Settings → Team & roles). `platform.admin` can never be granted to a tenant user. Role/permission/active changes bump `tokenVersion`, signing the user out everywhere.

### Subscriptions & entitlements

`SubscriptionPlan` rows (price in kobo, `limits`, `features[]`) are data editable in **Platform → Plans**; seed defaults: Starter ₦30k/₦300k, Professional ₦75k/₦750k, Premium ₦150k/₦1.5m, Enterprise custom — *not hard-coded in components*. States: `TRIALING → ACTIVE → PAST_DUE (7-day grace) → EXPIRED`, plus `CANCELLED` (access until period end) and `SUSPENDED`. `resolveAccess()` is a pure time-based function; `guardMutation()` enforces read-only mode after expiry, feature gates and usage limits (shipments/month, drivers, vehicles, users, branches) inside the services, so UI, API, AI and driver app all obey the same rules.

Billing (`billing.ts`, Paystack): checkout creates a PENDING `BillingPayment` with a unique reference; success is decided **only** by server-side `verify` against Paystack (amount/currency re-checked) — never by the browser. `confirmPayment` is idempotent (atomic PENDING→SUCCESSFUL claim) so callback + webhook + retries extend the subscription exactly once. The webhook (`/api/webhooks/paystack`) verifies the HMAC-SHA512 signature over the raw body (timing-safe), records each event once in `WebhookEvent`, and re-verifies charges via the API.

### Notifications

`emit(event)` → rule table (`rules.ts`: category/priority/audience permission) → affected users → permission + branch-scope check → per-user preferences & company-enabled channels → de-duplication window → persist → deliver. In-app is the persisted row; EMAIL (Resend), SMS (Termii), WHATSAPP (Meta Cloud API) deliver only when credentials exist, otherwise the delivery is recorded `SKIPPED: provider not configured` — nothing pretends to be sent. The Notification Center also shows a live "What needs attention" list computed from real data (SOS, overdue deliveries, failed deliveries awaiting decision, COD held, expiring documents…). Scheduled jobs (expiry alerts, overdue/offline-driver alerts, subscription transitions) run via `POST /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET`.

### AI assistant & insights

`USER → LLM (intent/tool selection) → permission check → application services → result → answer`. The model is only *offered* tools the user's permissions allow; every call is re-checked server-side, arguments are zod-validated, results are size-capped, everything runs through the tenant-scoped services. **Write tools only propose** (`create_shipment`, `assign_driver`, `reschedule_delivery`); a human clicks Confirm, which re-checks permission and executes once (audited). Insights are layered: **Real data** (deterministic statistical detectors with minimum sample sizes) → **AI analysis** → **Recommendation**, with the AI layer generated only when a provider is configured *and* there are real findings. With too little data the product says so instead of inventing insights. Providers: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.

### Maps, routes, pricing

* Map provider abstraction (`maps.ts`): OSM (default) / Mapbox tiles are fetched through an authenticated server proxy so keys never reach the browser; Google = navigation deep-links only. Driver positions are real GPS reports from the driver app (with "last update" times and stale marking).
* Routes: multi-stop delivery runs keep the dispatcher's order; an optional **nearest-neighbour heuristic** is clearly labelled as a heuristic, distances are straight-line estimates, and `getRouteOptimizer()` is the integration point for a real engine. No optimisation is claimed.
* Pricing: company-authored rules (zone→zone, weight bands, priority multiplier, interstate, customer type, corporate discount, COD fee, insurance, minimum). No matching rule ⇒ no price (public booking/API refuse rather than guess).

### Driver / rider app & offline

`/driver` is a mobile-first part of the same app (same login, same APIs). Status changes, proof of delivery (photo, signature, OTP, recipient name, GPS, COD amount) and failed deliveries go through an **IndexedDB outbox**: persist first, send, retry on reconnect, with a visible sync state. Every item carries a `clientEventId` which the server treats as an idempotency key, so duplicates are impossible. Required proof methods are configurable per company, with a stricter profile for high-value shipments. See [docs/MOBILE.md](docs/MOBILE.md).

### Security summary

bcrypt(12) hashing; account lockout + IP/email rate limits on login; JWT sessions that are revalidated against the DB every request; zod validation on all inputs; safe error mapping (no internals leaked); CSV formula-injection neutralised; uploads validated by magic bytes (not client MIME), size-capped, stored outside `public/`, served only via authenticated tenant-checked routes; API keys stored as SHA-256 hashes and shown once; webhook URLs must be public https (SSRF guard); append-only audit log with a **database trigger** blocking UPDATE/DELETE; secrets only via environment variables; security headers (+HSTS in production).

---

## Environment variables

See [`.env.example`](.env.example) — every variable with a safe placeholder. Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Everything else enables an integration; an unconfigured integration shows a "not configured" state in the UI.

## Deployment

* **Docker**: `docker compose up --build` (set `POSTGRES_PASSWORD` and the `.env` values). The container applies migrations then starts the standalone server. Mount a persistent volume at `/app/uploads`.
* **Any Node host**: `npm ci && npx prisma migrate deploy && npm run build && npm start`.
* Point Paystack's webhook at `https://YOUR_DOMAIN/api/webhooks/paystack` and schedule `POST /api/cron/maintenance` (hourly is fine).
* Behind a proxy, forward `X-Forwarded-For` (used for rate limiting and audit IPs). The in-memory rate limiter is per-instance — use a shared store (Redis) if you run several instances.

## Testing

`npm test` creates/migrates an isolated `logistics_test` database (override with `TEST_DATABASE_URL`). 119 tests cover: RBAC matrix, shipment state machine, pricing, entitlements, tenant isolation (data layer, FK injection, services, audit immutability at DB level), shipment lifecycle/proof/failed-delivery/COD/idempotency, finance & settlements, billing + signed/idempotent webhooks, AI permission/tenant/confirmation enforcement, public API auth/scopes/idempotency, portal isolation, public booking.

## Honest limitations / not implemented yet

* **Push notifications**: channel exists, provider not implemented (reported "not configured"). No device-token registry.
* **Route optimisation engine**: not bundled (see above).
* **Auto-assignment**: setting is reserved, not active.
* **Paystack auto-renewal / proration**: renewal is a manual checkout each period; plan changes charge the new plan's full price (no proration).
* **Offline cold start**: the outbox works while the driver app is open; opening the app with no connectivity needs a service worker/native cache (not included). Only a PWA manifest ships.
* **Proof photos/signatures** are stored (size-limited, compressed on device) in the database; documents use disk storage. No S3 driver yet.
* **No 2FA / email invitation / password-reset-by-email** (admins set temporary passwords; users can change their own).
* Google Maps embedded map, full-text search, keyset pagination for lists (offset + indexes are used; the API uses cursors) are not implemented.
* The Capacitor shell is provided and configured but an Android/iOS binary was **not built or tested** in this environment.
* Demo seed driver GPS positions are fictional demo data (the UI shows real timestamps, so seeded positions appear stale).
* Verified on Linux; Windows CMD instructions are provided but were not executed on Windows.
