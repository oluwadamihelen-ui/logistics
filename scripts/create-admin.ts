/**
 * Production bootstrap: creates the platform super-admin account and the default plans. Safe to re-run.
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-long-password' npm run admin:create
 * (On Windows CMD: set ADMIN_EMAIL=... & set ADMIN_PASSWORD=... & npm run admin:create)
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/platform/db";
import { ensurePlans, BCRYPT_ROUNDS } from "../src/lib/platform/provisioning";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid email address.");
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("ADMIN_PASSWORD must be at least 12 characters with letters and numbers.");
  await ensurePlans();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== "PLATFORM_SUPER_ADMIN") throw new Error("That email already belongs to a non-admin account. Use a different email.");
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, isActive: true, tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
    console.log(`Updated platform admin ${email} (password reset, sessions revoked).`);
  } else {
    await prisma.user.create({ data: { email, passwordHash, name: "Platform Admin", role: "PLATFORM_SUPER_ADMIN" } });
    console.log(`Created platform admin ${email}.`);
  }
  console.log("Plans are in place. Sign in at /login, then turn on two-factor authentication under Settings → My account.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
