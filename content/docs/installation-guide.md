# Installation guide

This guide installs LogisticOS on your own computer, then on a server. Allow about 20 minutes for a local install.

## 1. Requirements

| Item | Version |
|---|---|
| Node.js | 20 or newer (22 LTS recommended) |
| npm | Included with Node.js |
| PostgreSQL | 14 or newer (local, Docker, Neon, Supabase, RDS) |
| Git | Optional, only for cloning |

Check your versions with `node -v` and `psql --version`.

## 2. Get the code

Unzip the download into a folder, or clone it:

```
git clone <your-repository-url> logisticos
cd logisticos
```

## 3. Create an empty database

Use a **new, empty** database. Never point the installation at a database that already holds another application, because the first migration creates its own tables and types.

**Local PostgreSQL**

```
psql -U postgres -c "CREATE USER logistics WITH PASSWORD 'choose-a-password' CREATEDB;"
psql -U postgres -c "CREATE DATABASE logistics OWNER logistics;"
```

**Docker**

```
docker run -d --name logistics-db -e POSTGRES_USER=logistics -e POSTGRES_PASSWORD=choose-a-password -e POSTGRES_DB=logistics -p 5432:5432 postgres:16
```

**Hosted (Neon and similar):** create a project and database, and copy the connection string.

## 4. Configure

Install packages and create your settings file.

```
npm install
```

Then copy `.env.example` to `.env` (Windows: `copy .env.example .env`) and set at least these three values:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your connection string, for example `postgresql://logistics:password@localhost:5432/logistics?schema=public` |
| `NEXTAUTH_SECRET` | A long random string (see below) |
| `NEXTAUTH_URL` | The address you will open, `http://localhost:3000` locally |

Generate a secret with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Also set `NEXT_PUBLIC_APP_URL` to the same address as `NEXTAUTH_URL`.

> The `.env` file is hidden on some systems and is never included in a ZIP download. If you move to a new folder, copy it across.

## 5. Create the tables

```
npx prisma migrate deploy
```

You should see each migration applied and the message "All migrations have been successfully applied".

## 6. Load sample data (optional)

```
npm run db:seed
```

This creates a fictional company, "SwiftDrop Logistics", with drivers, vehicles and about 230 shipments. Demo logins (password `SwiftDrop#2026` unless you set `SEED_PASSWORD`):

| Role | Email |
|---|---|
| Company owner | owner@swiftdrop.test |
| Dispatch manager | dispatch@swiftdrop.test |
| Accountant | finance@swiftdrop.test |
| Driver | driver1@swiftdrop.test |
| Customer portal | portal@meridian.test |
| Platform admin | admin@platform.test |

Only seed a development or demo database, never production.

## 7. Start the app

```
npm run dev
```

Open `http://localhost:3000`. To check everything, run `npm run typecheck`, `npm run lint` and `npm test` (the tests use their own `logistics_test` database).

## 8. Going to production

### Create your own admin account

Do not seed production. Create the platform administrator and the default plans with:

```
set ADMIN_EMAIL=you@yourcompany.com
set ADMIN_PASSWORD=a-long-unique-password-1
npm run admin:create
```

(On macOS and Linux use `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create`.) Then sign in and turn on two-factor authentication under Settings, My account.

### Deploy on Vercel and Neon

1. Create a Neon database and copy two connection strings: the pooled one (host contains `-pooler`) and the direct one.
2. Import the repository into Vercel.
3. Set the environment variables below.
4. Deploy. The build applies migrations automatically using `DIRECT_DATABASE_URL`.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon pooled string; add `&connection_limit=1` |
| `DIRECT_DATABASE_URL` | Neon direct string, used only for migrations |
| `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://your-domain` |
| `NEXTAUTH_SECRET` | 32 or more random characters |
| `TWO_FACTOR_KEY` | A separate random value. Set it once and never change it. |
| `CRON_SECRET` | 24 or more random characters; Vercel Cron sends it automatically |
| `STORAGE_PROVIDER=s3` and `S3_*` | Required on Vercel, because its disk is not persistent |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | A real inbox, shown on public pages |

The server refuses to start in production if `DATABASE_URL`, `NEXTAUTH_SECRET` or an https `NEXTAUTH_URL` is missing or weak, and it logs a warning for every missing launch item.

### Deploy with Docker

```
docker compose up --build
```

Set `POSTGRES_PASSWORD` and the `.env` values first. The container applies migrations and starts the server. Mount a persistent volume at `/app/uploads`, or use S3.

### Any Node.js server

```
npm ci
npx prisma migrate deploy
npm run build
npm start
```

Run behind HTTPS and forward the `X-Forwarded-For` header.

## 9. Connect the optional services

| Service | What to set | Then |
|---|---|---|
| Paystack | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | Add the webhook `https://your-domain/api/webhooks/paystack` in Paystack. |
| Email (Resend) | `EMAIL_PROVIDER_KEY`, `EMAIL_FROM` | Verify your sending domain. |
| SMS (Termii) | `SMS_PROVIDER_KEY`, `SMS_SENDER_ID` | |
| WhatsApp | `WHATSAPP_PROVIDER_KEY`, `WHATSAPP_PHONE_NUMBER_ID` | |
| Push | `FCM_SERVICE_ACCOUNT_JSON` | See the Developer resources page for the mobile app. |
| AI assistant | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | |
| Scheduled jobs | `CRON_SECRET` | Call `/api/cron/maintenance` daily or hourly with `Authorization: Bearer <CRON_SECRET>`. |

## 10. Check it works

1. Open `/api/health`. You should see `"status":"ok"` and `"db":"up"`.
2. Register a test company, create a shipment, and track it on `/track`.
3. Request a password reset and confirm the email arrives.
4. Upload a document and confirm it is still there after a restart.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Environment variable not found: DATABASE_URL` | There is no `.env` file in this folder. Create it, or set the variable for the current window. |
| `The table ... does not exist` | Migrations have not been applied. Run `npx prisma migrate deploy`. |
| `type "Role" already exists` (P3018) | The database already contains another application. Use a new empty database. |
| Migrations time out on Neon | You used the pooled string. Use the direct connection string for migrations. |
| `EPERM` during `prisma generate` on Windows | Stop the running dev server and try again. |
| `Cannot read properties of undefined (reading 'findMany')` after updating | Run `npx prisma generate` and restart the dev server. |
| Authenticator codes rejected after moving hosts | `TWO_FACTOR_KEY` or `NEXTAUTH_SECRET` differs from the one used when 2FA was enabled. Use the same value in every environment. |
| Nobody receives email or SMS | The provider is not configured; deliveries show as "skipped". |
