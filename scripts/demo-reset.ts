/**
 * Wipes ALL data in the database named by DATABASE_URL and re-seeds the demo company. DESTRUCTIVE.
 * Refuses to run unless DEMO_MODE=1 and CONFIRM_DEMO_RESET=yes are both set, so it can't be pointed at production by accident.
 *   DEMO_MODE=1 CONFIRM_DEMO_RESET=yes npm run demo:reset
 */
import { execSync } from "node:child_process";
import { prisma } from "../src/lib/platform/db";

async function main() {
  if (process.env.DEMO_MODE !== "1" || process.env.CONFIRM_DEMO_RESET !== "yes") {
    throw new Error("Refusing to reset: set DEMO_MODE=1 and CONFIRM_DEMO_RESET=yes (this deletes every row in DATABASE_URL).");
  }
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(unparsable)"; } })();
  console.log(`Resetting demo database on ${host} …`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
  console.log("Demo database reset and re-seeded.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
