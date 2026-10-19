# Software update information

How to find out what changed, and how to update an installation safely.

## Versions

* The current version is shown in `package.json` and returned by `/api/health` (field `version`).
* Releases are numbered `MAJOR.MINOR.PATCH`:
  * **Patch** (1.0.1): fixes. Safe to apply at any time.
  * **Minor** (1.1.0): new features. Backwards compatible, and may include additive database migrations.
  * **Major** (2.0.0): changes that may need manual steps. Always read the release notes first.
* Every release is described on the **Release notes** page.

## How long updates are provided

Update and support terms depend on your licence or purchase. Check your order or licence for how long updates are included. Without a current update entitlement, the version you have continues to work.

## Before you update

1. **Read the release notes** for the versions between yours and the new one.
2. **Back up the database.** On Neon, create a branch or confirm point-in-time restore is on. On other hosts, run `pg_dump`:

```
pg_dump "postgresql://USER:PASSWORD@HOST:5432/DBNAME" -Fc -f backup-before-update.dump
```

3. **Back up your files.** Your `.env` settings, and the `uploads` folder if you store files on disk.
4. If you have changed the code, merge the new version into your changes on a branch and test there first.
5. Update a staging or demo copy first if you have one.

## Updating

### Hosted on Vercel
1. Replace your repository's code with the new version (merge or push it to the production branch).
2. Vercel builds and deploys. The build applies database migrations automatically.
3. Check `/api/health` and sign in.

### From a ZIP download (local or your own server)
1. Stop the running app.
2. Unzip the new version into a new folder.
3. Copy your `.env` (and `uploads`, if used) into it.
4. Run:

```
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

Use `npm run dev` instead of `build` and `start` for local development.

### From git

```
git pull
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
```

Then restart the app.

### Docker

```
git pull
docker compose up --build -d
```

The container applies migrations on start.

## Database migrations

* Migrations are applied in order and are recorded in the database, so running `npx prisma migrate deploy` repeatedly is safe.
* Migrations in minor and patch releases only **add** things, such as tables, columns and values. They do not delete your data.
* Always run `npx prisma generate` after updating, and restart any running server. A server started before the update does not know about new tables and may show errors such as "Cannot read properties of undefined".
* If a migration fails, stop. Do not edit the database by hand. Restore from your backup and contact support with the error text.

## Scheduled jobs and settings after an update

* Check the release notes for new environment variables. Everything new is optional unless the notes say otherwise.
* The daily maintenance job (`/api/cron/maintenance`) needs `CRON_SECRET`. It continues to work unchanged.
* The server logs a `[config]` warning at startup for each missing or weak setting.

## Rolling back

1. Put the previous version of the code back.
2. Restore the database backup you took before updating. Do not try to undo migrations manually, because newer data may not fit the older version.
3. Run `npx prisma generate` and restart.

Anything entered between the update and the rollback is lost with the restore, so decide quickly and keep updates for quiet periods.

## After the update: a quick check

1. `/api/health` shows `"status":"ok"` and the new version.
2. Sign in and open the dashboard.
3. Create a test shipment and track it.
4. If you use payments, open the Subscription page. If you use email, request a password reset.

## Staying informed

Read the Release notes page before each update. Security fixes are published as patch releases; apply them promptly.

## Getting help

Email the support address shown in the website footer, and include your version number, what you ran, and the full error text.
