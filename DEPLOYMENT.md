# Deploying to production (Vercel + Neon)

This is the launch checklist. Work top to bottom.

## 1. Database (Neon)
1. Create a Neon project and a database (for example `logistics`). **Use an empty database** — never one that already holds another app.
2. Copy two connection strings:
   * **Pooled** (host contains `-pooler`) → `DATABASE_URL`. Append `&connection_limit=1` for serverless.
   * **Direct** (no `-pooler`) → `DIRECT_DATABASE_URL`. Only the build uses it, to apply migrations.
3. Turn on Neon's point-in-time restore / backups for the project.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables, *Production*)
| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled string |
| `DIRECT_DATABASE_URL` | Neon direct string |
| `NEXTAUTH_URL` | `https://your-domain` |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain` |
| `NEXTAUTH_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) |
| `TWO_FACTOR_KEY` | another random value. **Set once and never change** (changing it resets everyone's 2FA) |
| `CRON_SECRET` | 24+ random characters. Vercel Cron sends it automatically |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` | live keys from Paystack |
| `EMAIL_PROVIDER_KEY`, `EMAIL_FROM` | Resend key and a verified sender (needed for password reset) |
| `STORAGE_PROVIDER=s3` + `S3_*` | **required on Vercel**: the disk is not persistent. See `.env.example` |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL` | real inboxes shown on public and legal pages |
| `NEXT_PUBLIC_COMPANY_NAME` etc. | publisher details (defaults to Numi Innovations LTD) |
| Optional | `SMS_*`, `WHATSAPP_*`, `FCM_SERVICE_ACCOUNT_JSON`, `AI_*` (see `.env.example`) |

The server **refuses to start** in production if `DATABASE_URL`, `NEXTAUTH_SECRET` (weak/placeholder) or `NEXTAUTH_URL` (non-https) are wrong, and logs a `[config]` warning for each missing launch item (cron, Paystack, email, 2FA key, S3).

## 3. Deploy
Vercel uses `vercel.json`: the build runs `node scripts/vercel-build.mjs` (generate client → `prisma migrate deploy` → `next build`), and a daily cron calls `/api/cron/maintenance` (trial/renewal/expiry jobs; Vercel's Hobby plan allows daily schedules only; upgrade for more frequent runs, since auto-renewal charges are attempted about 24 h before a plan ends).

## 4. First-run bootstrap (once)
Do **not** run `npm run db:seed` in production (it creates demo accounts with a known password; it refuses to run unless forced).
From a machine with the production `DATABASE_URL` in `.env` (or exported):
```
set ADMIN_EMAIL=you@yourcompany.com
set ADMIN_PASSWORD=a-long-unique-password-1
npm run admin:create
```
This creates the platform super-admin and the default plans. Sign in at `/login`, go to **Settings → My account** and enable two-factor authentication, then save the recovery codes.

## 5. Configure external services
* **Paystack**: webhook URL `https://your-domain/api/webhooks/paystack`, using the same secret as `PAYSTACK_WEBHOOK_SECRET`.
* **Email (Resend)**: verify your sending domain (SPF/DKIM) so reset emails arrive.
* **Domain**: add it in Vercel; HTTPS and HSTS are automatic.

## 6. Smoke test before announcing
1. `https://your-domain/api/health` → `{"status":"ok","db":"up"}`.
2. Register a test company, create a shipment, track it on `/track`.
3. Request a password reset; confirm the email arrives.
4. Subscribe with a Paystack test/live card; confirm the plan activates and the webhook is recorded (Platform → Payments).
5. Upload a document; confirm it persists after a redeploy (S3).
6. Trigger the cron once: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/maintenance`.

## 7. Operations
* **Backups**: Neon point-in-time restore. Test a restore once.
* **Monitoring**: point an uptime monitor at `/api/health`; watch Vercel logs for `[config]`, `[auth]`, `[billing]`, `[maintenance]` lines.
* **Rotating secrets**: `NEXTAUTH_SECRET` rotation signs everyone out (fine). Do not rotate `TWO_FACTOR_KEY`.
* **Updating**: push to the production branch; migrations run in the build. Migrations are additive; review them before merging.
* **Legal**: the Terms and Privacy pages are a solid starting draft. Have your lawyer review them and add your registered address (`NEXT_PUBLIC_COMPANY_ADDRESS`) before launch.
