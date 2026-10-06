# Windows setup (Command Prompt)

All commands are for **Windows CMD**. (PowerShell users: the same commands work; use `$env:NAME="value"` instead of `set NAME=value`.)

## 1. Prerequisites

1. **Node.js 22 LTS** — https://nodejs.org (check: `node -v`)
2. **PostgreSQL 16** — https://www.postgresql.org/download/windows/ (remember the `postgres` password; keep port 5432). Or use Docker Desktop (step 2b).
3. **Git** — https://git-scm.com

## 2. Create the database

### 2a. Native PostgreSQL
Open "SQL Shell (psql)" or run (adjust the path to your version):

```cmd
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE USER logistics WITH PASSWORD 'logistics' CREATEDB;"
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE logistics OWNER logistics;"
```

### 2b. Or Docker Desktop
```cmd
docker run -d --name logistics-db -e POSTGRES_USER=logistics -e POSTGRES_PASSWORD=logistics -e POSTGRES_DB=logistics -p 5432:5432 postgres:16
```

## 3. Install and configure

```cmd
git clone https://github.com/oluwadamihelen-ui/logistics.git
cd logistics
npm install
copy .env.example .env
```

Edit `.env` (Notepad):

```
DATABASE_URL="postgresql://logistics:logistics@localhost:5432/logistics?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXTAUTH_SECRET="<paste a long random string>"
```

Generate a secret:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> You may instead set variables for the current window only: `set DATABASE_URL=postgresql://logistics:logistics@localhost:5432/logistics?schema=public`, or permanently with `setx DATABASE_URL "postgresql://..."` (open a new CMD window afterwards). Values in `.env` are picked up automatically.

## 4. Create tables, seed demo data, run

```cmd
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in:

| Who | Email | Password |
|---|---|---|
| Company owner | owner@swiftdrop.test | SwiftDrop#2026 |
| Platform admin | admin@platform.test | SwiftDrop#2026 |
| Driver | driver1@swiftdrop.test | SwiftDrop#2026 |
| Customer portal | portal@meridian.test | SwiftDrop#2026 |

To choose your own demo password: `set SEED_PASSWORD=MyStrongPass123` before `npm run db:seed`.

Public pages: http://localhost:3000/track and http://localhost:3000/book/swiftdrop

## 5. Quality checks

```cmd
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` creates a separate `logistics_test` database automatically (the `logistics` DB user needs the `CREATEDB` privilege — step 2a grants it). To use another one: `set TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/mytest?schema=public`.

## 6. Production build locally

```cmd
npm run build
npm start
```

## 7. Optional integrations (set in `.env`, restart)

| Feature | Variables |
|---|---|
| Paystack billing | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` (webhook URL: `/api/webhooks/paystack`; for local testing use a tunnel such as ngrok) |
| AI assistant | `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` |
| Email / SMS / WhatsApp | `EMAIL_PROVIDER_KEY`+`EMAIL_FROM`, `SMS_PROVIDER_KEY`+`SMS_SENDER_ID`, `WHATSAPP_PROVIDER_KEY`+`WHATSAPP_PHONE_NUMBER_ID` |
| Maps | `MAPS_PROVIDER` (osm/mapbox/google), `MAPS_PROVIDER_KEY` |
| Scheduled jobs | `CRON_SECRET`, then e.g. `curl -X POST -H "Authorization: Bearer YOURSECRET" http://localhost:3000/api/cron/maintenance` (Windows Task Scheduler can run this hourly) |

## 8. Mobile driver app (Capacitor)

```cmd
cd mobile
npm install
set CAPACITOR_SERVER_URL=https://your-deployed-app.example.com/driver
npx cap add android
npx cap sync
npx cap open android
```

See `docs/MOBILE.md`. (iOS builds require macOS.)

## Troubleshooting

| Problem | Fix |
|---|---|
| `P1001: Can't reach database server` | PostgreSQL isn't running or `DATABASE_URL` host/port/user/password is wrong. Test: `psql "postgresql://logistics:logistics@localhost:5432/logistics"`. |
| `permission denied to create database` when running tests | `ALTER USER logistics CREATEDB;` as the `postgres` user. |
| `Environment variable not found: DATABASE_URL` | You didn't create `.env` (`copy .env.example .env`) or are in the wrong folder. |
| Login loops back to /login | `NEXTAUTH_SECRET` missing/changed, or `NEXTAUTH_URL` doesn't match the address in the browser. Clear cookies after changing the secret. |
| Port 3000 busy | `set PORT=3001 && npm run dev` (and update `NEXTAUTH_URL`). |
| Prisma `EPERM` rename error | Stop the dev server (it locks the query engine DLL), run the command again. |
| Map shows no tiles | The server must reach the tile provider (OpenStreetMap by default). Check firewall/proxy, or configure `MAPS_TILE_URL`/Mapbox. |
| Everything says "not configured" | Expected until you add the matching keys — no feature fakes data. |
| `ERESOLVE` on npm install | Use Node 22 and a clean `node_modules` (`rmdir /s /q node_modules` then `npm install`). |
