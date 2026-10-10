// Production build for Vercel (or any CI): generate the client, apply database migrations, build the app.
// Migrations use DIRECT_DATABASE_URL when set (Neon's non-pooled connection string): pooled connections can time out on
// the advisory lock Prisma takes while migrating. The running app keeps using DATABASE_URL (the pooled one).
import { spawnSync } from "node:child_process";

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("npx", ["prisma", "generate"]);
if (process.env.SKIP_MIGRATIONS === "1") console.log("SKIP_MIGRATIONS=1 — not applying migrations");
else if (!process.env.DATABASE_URL && !process.env.DIRECT_DATABASE_URL) { console.error("DATABASE_URL is not set; cannot apply migrations."); process.exit(1); }
else run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL });
run("npx", ["next", "build"]);
