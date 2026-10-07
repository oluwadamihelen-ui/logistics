import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { AppError } from "./errors";
import { audit } from "./audit";
import { emailProvider } from "./notifications/providers";
import { BCRYPT_ROUNDS, validatePassword } from "./provisioning";
import { brand } from "@/config/brand";

const TTL_MS = 60 * 60_000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export const passwordResetAvailable = () => emailProvider.isConfigured();

/** Always resolves the same way whether or not the account exists (no account enumeration). */
export async function requestPasswordReset(emailRaw: string, appUrl: string, ip?: string | null) {
  if (!passwordResetAvailable()) throw new AppError("NOT_CONFIGURED", "Email isn't configured on this server. Ask your administrator to reset your password.");
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }); // only the newest link works
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MS) } });
  await emailProvider.send({ to: user.email, subject: `Reset your ${brand.APP_NAME} password`, body: `Hi ${user.name},\n\nUse this link within 1 hour to choose a new password:\n${appUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, ignore this email — your password hasn't changed.` })
    .catch((e) => console.error("[password-reset] email failed", e instanceof Error ? e.message : e));
  await audit({ companyId: user.companyId, actor: { id: user.id, name: user.name, role: user.role }, action: "auth.password_reset_requested", resourceType: "User", resourceId: user.id, ip });
}

export async function resetPassword(token: string, newPassword: string, ip?: string | null) {
  validatePassword(newPassword);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("VALIDATION", "This reset link is invalid or has expired. Request a new one.");
  // Claim the token first so it can't be used twice, even concurrently.
  const claimed = await prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) throw new AppError("VALIDATION", "This reset link is invalid or has expired. Request a new one.");
  const u = await prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
  await audit({ companyId: u.companyId, actor: { id: u.id, name: u.name, role: u.role }, action: "auth.password_reset_completed", resourceType: "User", resourceId: u.id, ip });
}
