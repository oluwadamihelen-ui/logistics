import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";
import { enforceRateLimit, clientIp } from "./rate-limit";
import { AppError } from "./errors";
import { consumeRecoveryCode, decryptSecret, verifyTotp } from "./two-factor";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Pre-computed hash so unknown-email logins take the same time as wrong-password logins.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8e0V0n0r3Z1kq0rM9qJQ0m3b3bX8Wy";

export const SESSION_MAX_AGE = 60 * 60 * 12;

const credentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200), totp: z.string().max(20).optional() });

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: {}, password: {}, totp: {} },
      async authorize(raw, req) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const headers = new Headers((req?.headers ?? {}) as Record<string, string>);
        const ip = clientIp(headers);
        try {
          enforceRateLimit(`login:ip:${ip}`, 30, 15 * 60_000);
          // The email limiter counts password attempts; a second-step submission (same password) shouldn't be double counted.
          if (!parsed.data.totp) enforceRateLimit(`login:email:${email}`, 10, 15 * 60_000);
        } catch (e) {
          if (e instanceof AppError) throw new Error("RATE_LIMITED");
          throw e;
        }

        const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { status: true } } } });
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const valid = await bcrypt.compare(parsed.data.password, hash);

        if (!user || !user.isActive) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("LOCKED");

        if (!valid) {
          const failed = user.failedLoginCount + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: failed >= MAX_FAILED
              ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
              : { failedLoginCount: failed },
          });
          await audit({ companyId: user.companyId, actor: { id: user.id, name: user.name, role: user.role }, action: "auth.login_failed", resourceType: "User", resourceId: user.id, ip });
          return null;
        }
        if (user.company && (user.company.status === "SUSPENDED" || user.company.status === "CLOSED")) throw new Error("COMPANY_SUSPENDED");

        // Second factor. Only revealed AFTER the password was verified, so it can't be used to probe which accounts have 2FA.
        if (user.totpEnabled && user.totpSecret) {
          const code = parsed.data.totp?.trim();
          if (!code) throw new Error("TOTP_REQUIRED");
          enforceRateLimit(`login:totp:${user.id}`, 10, 15 * 60_000);
          let ok = false, remaining: string[] | null = null;
          try { ok = verifyTotp(decryptSecret(user.totpSecret), code); } catch (e) {
          // Almost always: this deployment's TWO_FACTOR_KEY / NEXTAUTH_SECRET differs from the one used when 2FA was set up.
          console.error("[auth] cannot decrypt the 2FA secret for user", user.id, "- check that TWO_FACTOR_KEY / NEXTAUTH_SECRET match across environments", e instanceof Error ? e.message : "");
          ok = false;
        }
          if (!ok) { remaining = consumeRecoveryCode(user.totpRecoveryHashes, code); ok = remaining !== null; }
          if (!ok) {
            const failed = user.failedLoginCount + 1;
            await prisma.user.update({ where: { id: user.id }, data: failed >= MAX_FAILED ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failed } });
            await audit({ companyId: user.companyId, actor: { id: user.id, name: user.name, role: user.role }, action: "auth.2fa_failed", resourceType: "User", resourceId: user.id, ip });
            throw new Error("TOTP_INVALID");
          }
          if (remaining) await prisma.user.update({ where: { id: user.id }, data: { totpRecoveryHashes: remaining } });
        }

        await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await audit({ companyId: user.companyId, actor: { id: user.id, name: user.name, role: user.role }, action: "auth.login", resourceType: "User", resourceId: user.id, ip });
        return { id: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.tv = (user as any).tokenVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      // Only the id travels in the token. Role/company/permissions are ALWAYS re-read from the
      // database in getContext(), so revocations take effect immediately.
      if (session.user) (session.user as any).id = token.uid;
      (session as any).tv = token.tv;
      return session;
    },
  },
};
