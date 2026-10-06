import { execSync } from "node:child_process";
import { Client } from "pg";

/** Creates (if needed) and migrates an isolated test database. Works on Windows CMD and Linux. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://logistics:logistics@localhost:5432/logistics_test?schema=public";
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  u.pathname = "/postgres";
  u.search = "";
  const admin = new Client({ connectionString: u.toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
