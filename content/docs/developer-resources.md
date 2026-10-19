# Developer resources

For developers who install, customise or extend LogisticOS.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, server actions), React 19, TypeScript |
| Database | PostgreSQL 14+ with Prisma 6 |
| Authentication | NextAuth v4 (credentials, JWT sessions re-validated on every request) |
| Styling | Tailwind CSS 3 |
| Charts and maps | Recharts, Leaflet |
| Validation | zod |
| Tests | Vitest (needs PostgreSQL) |
| Mobile | Capacitor wrapper around the same web app |

## Project layout

```
src/
  config/          brand.ts (name, logo, colours, legal entity), nav.ts (permission-aware menu)
  lib/platform/    shared infrastructure that knows nothing about shipping
    db.ts            tenant-scoped Prisma client and ownership guard
    permissions.ts   permission catalogue and role matrix
    context.ts       request context: user, tenant, permissions
    auth.ts          sign-in, lockout, two-factor
    entitlements.ts  plans, features, usage limits
    billing.ts       checkout, renewals, proration
    payments/        payment provider abstraction (Paystack)
    notifications/   rule engine and channel providers
    rate-limit.ts    in-memory and database-backed limiters
    env.ts           production configuration checks
  lib/logistics/   domain services: shipments, pricing, cod, finance, settlements, routes, analytics
  lib/locations/   state and city lists
  app/             pages and server actions
    (app)/ staff workspace   driver/ driver app   portal/ customer portal
    platform/ admin console  track/ book/ public pages   api/ REST and webhooks
prisma/            schema, migrations, seed
scripts/           vercel-build, create-admin, demo-reset
tests/             Vitest suites
content/docs/      this documentation (Markdown)
mobile/            Capacitor shell
```

## Run it locally

See the Installation guide. Useful scripts:

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Test suite (creates and migrates its own `logistics_test` database) |
| `npm run db:migrate` | Create a new migration from schema changes (development) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Load sample data (development and demo only) |
| `npm run admin:create` | Create the platform admin and default plans |
| `npm run demo:reset` | Wipe and re-seed a **demo** database |

## Core concepts

### Multi-tenancy

Every operational table has a `companyId`. Application code never uses the raw Prisma client for tenant data. It receives a **tenant-scoped client** from the request context (`createTenantClient(companyId)`), which forces `companyId` on every read and write. Models are detected from the schema automatically, so a new model with a `companyId` column is covered with no extra code. Identifiers received from a client must be checked with `assertOwned(db, { customer: id, ... })` before use.

```ts
const ctx = await requirePageContext("shipments.view");   // user, companyId, permissions, db
const rows = await ctx.db.shipment.findMany({ where: { status: "AT_HUB" } }); // already limited to ctx.companyId
```

### Permissions

All access checks use permission names, never role names:

```ts
ctx.can("shipments.assign");                // boolean
const ctx = await requireTenant("finance.manage"); // throws if missing
```

Add a permission in `permissions.ts`, then include it in the roles that need it. The menu in `config/nav.ts` and every server action use the same checks.

### Server actions

Mutations use `defineAction`, which runs the guard chain: authenticate, resolve tenant, check permissions, validate with zod, run, and map errors safely.

```ts
export const updateThingAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ id: z.string(), name: z.string().min(2) }),
  handler: async (ctx, input) => { /* use ctx.db */ return true; },
});
```

### Services

Business rules live in `lib/logistics/*` (for example `createShipment`, `transitionShipment`, `collectShipment`). The UI, API, driver app and AI assistant all call the same functions, so rules such as the status lifecycle, plan limits and proof requirements apply everywhere.

### Entitlements

`guardMutation(companyId, { feature, limit })` checks that the subscription allows the action, the feature is in the plan and the usage limit is not exceeded. Plans are database rows edited in the platform console.

## Extension points

| To add or change | Where |
|---|---|
| Brand name, logo, colours, publisher | `src/config/brand.ts` or `NEXT_PUBLIC_*` variables |
| A payment provider | Implement `PaymentProvider` in `lib/platform/payments/provider.ts` |
| A notification channel | Add a provider in `lib/platform/notifications/providers.ts` |
| A storage driver | Implement `StorageDriver` in `lib/platform/storage.ts` (S3 is in `storage-s3.ts`) |
| An AI provider | `lib/platform/ai/provider.ts` |
| A map provider | `lib/platform/maps.ts` |
| A real route optimiser | Replace `getRouteOptimizer()` in `lib/logistics/routes.ts` |
| A notification rule | `lib/platform/notifications/rules.ts` |
| A new status or lifecycle rule | `lib/logistics/shipment-status.ts` and `shipments.ts`, plus tests |
| Plans and limits | Platform console, or defaults in `entitlements.ts` |

## Database changes

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name describe_change` to generate a migration.
3. Commit the new folder in `prisma/migrations`.
4. Production applies it with `npx prisma migrate deploy`.

Keep changes additive. After any schema change run `npx prisma generate` and restart the dev server, or it will use the old client.

## Testing

`npm test` runs the whole suite against its own database. Suites cover permissions, the lifecycle, pricing, tenant isolation (including attempts to read and write across companies), billing and webhooks, the public API, the AI assistant, 2FA and password reset, hub pickup, locations, startup checks and demo mode. When you add a feature, add a test that tries to break the rule, not only one that follows it.

## Security guidelines for contributors

* Never read or write tenant data with the raw `prisma` client. Use `ctx.db`.
* Check every client-supplied id with `assertOwned`.
* Use permission names. Do not check roles.
* Validate all input with zod. Do not return internal error text to users.
* Keep secrets in environment variables. Never log them.
* Use the shared rate limiter for new public or sensitive endpoints.
* Anything that sends messages, takes money or fetches arbitrary URLs must be disabled in demo mode (`assertNotDemo`).

## Configuration reference

The full list with safe placeholders is in `.env.example`. Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Common optional groups:

| Group | Variables |
|---|---|
| Public details | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_COMPANY_*` |
| Payments | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` |
| Messaging | `EMAIL_PROVIDER_KEY`, `EMAIL_FROM`, `SMS_*`, `WHATSAPP_*`, `FCM_SERVICE_ACCOUNT_JSON` |
| AI | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, `AI_PROVIDER` |
| Maps | `MAPS_PROVIDER`, `MAPS_PROVIDER_KEY`, `MAPS_TILE_URL` |
| Files | `STORAGE_PROVIDER`, `STORAGE_DIR`, `S3_*` |
| Security | `TWO_FACTOR_KEY`, `CRON_SECRET` |
| Deployment | `DIRECT_DATABASE_URL`, `DEMO_MODE` |

## The API

See the [API reference](/docs/api-reference) for endpoints, errors, fields and webhook verification.

## The driver app

The driver experience is a section of the same web app at `/driver`. It stores every action in an IndexedDB outbox first, sends it, and retries on reconnect. Each item carries a `clientEventId` which the server treats as an idempotency key. A service worker (`public/sw.js`, production builds) lets the app open offline.

To build the optional native wrapper:

```
cd mobile
npm install
set CAPACITOR_SERVER_URL=https://app.yourdomain.com/driver
set CAPACITOR_APP_ID=com.yourcompany.driver
npx cap add android
npx cap sync
npx cap open android
```

Add Android permissions for fine, coarse and background location, foreground service location, camera and notifications, and the iOS location, camera and background-location usage strings. Background GPS uses the `@capacitor-community/background-geolocation` plugin and posts to `POST /api/driver/location`. Push uses `@capacitor/push-notifications`, registers a device token at `POST /api/push/register`, and needs `FCM_SERVICE_ACCOUNT_JSON` on the server. Serve the app over HTTPS only and test on real devices, including airplane-mode delivery completion, before publishing.

## Health and operations

* `GET /api/health` returns status, database state and the version.
* `GET` or `POST /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET` runs scheduled jobs: trial notices, subscription transitions, saved-card renewals, expiry alerts, overdue-delivery and uncollected-parcel alerts, and cleanup.
* Logs use prefixes such as `[config]`, `[auth]`, `[billing]` and `[maintenance]`, which are easy to filter.
