"use server";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { z } from "zod";
import { requireTenant } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { AppError, toFailure, type ActionResult } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { enforceSharedRateLimit } from "@/lib/platform/rate-limit";
import { consumeRecoveryCode, decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, otpauthUrl, verifyTotp } from "@/lib/platform/two-factor";
import { brand } from "@/config/brand";

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof requireTenant>>) => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await fn(await requireTenant()) }; } catch (e) { return toFailure(e); }
}

export async function beginTwoFactorAction() {
  return run(async (ctx) => {
    await enforceSharedRateLimit(`2fa:begin:${ctx.user.id}`, 10, 60 * 60_000);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (u.totpEnabled) throw new AppError("INVALID_STATE", "Two-factor authentication is already on.");
    const secret = generateSecret();
    await prisma.user.update({ where: { id: u.id }, data: { totpSecret: encryptSecret(secret), totpEnabled: false } });
    const qr = await QRCode.toDataURL(otpauthUrl(brand.APP_NAME, u.email, secret), { margin: 1, width: 220 });
    return { secret, qr };
  });
}

export async function confirmTwoFactorAction(raw: { code: string }) {
  return run(async (ctx) => {
    await enforceSharedRateLimit(`2fa:confirm:${ctx.user.id}`, 10, 15 * 60_000);
    const { code } = z.object({ code: z.string().min(6).max(8) }).parse(raw);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (u.totpEnabled || !u.totpSecret) throw new AppError("INVALID_STATE", "Start setup first.");
    let valid = false;
    try { valid = verifyTotp(decryptSecret(u.totpSecret), code); } catch { throw new AppError("INVALID_STATE", "Couldn't read the pending setup secret. Start setup again."); }
    if (!valid) throw new AppError("VALIDATION", "That code isn't right. Check your authenticator app's clock and try again.");
    const { codes, hashes } = generateRecoveryCodes();
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true, totpRecoveryHashes: hashes } });
    await auditFrom(ctx, "auth.2fa_enabled", "User", u.id);
    return { recoveryCodes: codes };
  });
}

export async function disableTwoFactorAction(raw: { password: string; code: string }) {
  return run(async (ctx) => {
    await enforceSharedRateLimit(`2fa:disable:${ctx.user.id}`, 6, 15 * 60_000);
    const i = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(12) }).parse(raw);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!u.totpEnabled || !u.totpSecret) throw new AppError("INVALID_STATE", "Two-factor authentication is off.");
    if (!(await bcrypt.compare(i.password, u.passwordHash))) throw new AppError("VALIDATION", "Password is incorrect.");
    // A recovery code must work even if the stored secret can't be decrypted (e.g. the server's encryption key changed).
    let totpOk = false, undecryptable = false;
    try { totpOk = verifyTotp(decryptSecret(u.totpSecret), i.code); } catch { undecryptable = true; }
    const ok = totpOk || consumeRecoveryCode(u.totpRecoveryHashes, i.code) !== null;
    if (!ok) {
      throw new AppError("VALIDATION", undecryptable
        ? "Authenticator codes can't be checked on this server (its encryption key differs from the one used when 2FA was set up). Use one of your recovery codes instead."
        : "That code isn't right.");
    }
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpRecoveryHashes: [] } });
    await auditFrom(ctx, "auth.2fa_disabled", "User", u.id);
    return true;
  });
}
