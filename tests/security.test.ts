import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/platform/db";
import { authOptions } from "@/lib/platform/auth";
import { base32Decode, base32Encode, consumeRecoveryCode, decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, totpAt, verifyTotp } from "@/lib/platform/two-factor";
import { requestPasswordReset, resetPassword } from "@/lib/platform/password-reset";
import { makeTenant, uniq, type TestTenant } from "./helpers";

const authorize = (authOptions.providers[0] as any).options.authorize as (c: Record<string, string>, req: any) => Promise<any>;
const req = { headers: { "x-forwarded-for": "7.7.7.7" } };

describe("TOTP (RFC 6238)", () => {
  const SECRET = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    expect(totpAt(SECRET, 59_000)).toBe("287082");
    expect(totpAt(SECRET, 1_111_111_109_000)).toBe("081804");
    expect(totpAt(SECRET, 1_234_567_890_000)).toBe("005924");
    expect(totpAt(SECRET, 2_000_000_000_000)).toBe("279037");
  });
  it("base32 round-trips", () => { const b = Buffer.from("hello world!!"); expect(base32Decode(base32Encode(b)).equals(b)).toBe(true); });
  it("accepts ±1 step of drift, rejects older codes and garbage", () => {
    const s = generateSecret(), t = 1_700_000_000_000;
    expect(verifyTotp(s, totpAt(s, t), t)).toBe(true);
    expect(verifyTotp(s, totpAt(s, t - 30_000), t)).toBe(true);
    expect(verifyTotp(s, totpAt(s, t + 30_000), t)).toBe(true);
    expect(verifyTotp(s, totpAt(s, t - 120_000), t)).toBe(false);
    for (const bad of ["", "abcdef", "12345", "1234567", "000000"]) if (bad !== totpAt(s, t)) expect(verifyTotp(s, bad, t)).toBe(false);
  });
  it("encrypts secrets (tamper-evident) and recovery codes are single use", () => {
    const s = generateSecret(), enc = encryptSecret(s);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc)).toBe(s);
    const parts = enc.split("."); parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
    const { codes, hashes } = generateRecoveryCodes(3);
    const left = consumeRecoveryCode(hashes, codes[1].toUpperCase());
    expect(left).toHaveLength(2);
    expect(consumeRecoveryCode(left!, codes[1])).toBeNull();
    expect(consumeRecoveryCode(hashes, "nope-nope")).toBeNull();
  });
});

describe("login with two-factor", () => {
  let T: TestTenant, email: string, secret: string, codes: string[];
  beforeAll(async () => {
    T = await makeTenant("TwoFA");
    email = `owner-2fa-${uniq()}@test.dev`;
    secret = generateSecret();
    const rc = generateRecoveryCodes(2); codes = rc.codes;
    await prisma.user.update({ where: { id: T.owner.id }, data: { email, totpEnabled: true, totpSecret: encryptSecret(secret), totpRecoveryHashes: rc.hashes } });
  });
  it("wrong password never reveals that 2FA exists", async () => {
    await expect(authorize({ email, password: "wrong-password-1" }, req)).resolves.toBeNull();
  });
  it("correct password without a code asks for one; no session is issued", async () => {
    await expect(authorize({ email, password: "Passw0rd!long" }, req)).rejects.toThrow("TOTP_REQUIRED");
  });
  it("rejects wrong codes (counted toward lockout) and accepts a valid code", async () => {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: T.owner.id } })).failedLoginCount;
    await expect(authorize({ email, password: "Passw0rd!long", totp: "000000" }, req)).rejects.toThrow("TOTP_INVALID");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: T.owner.id } })).failedLoginCount).toBe(before + 1);
    const u = await authorize({ email, password: "Passw0rd!long", totp: totpAt(secret, Date.now()) }, req);
    expect(u.id).toBe(T.owner.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: T.owner.id } })).failedLoginCount).toBe(0);
  });
  it("recovery code works exactly once", async () => {
    expect((await authorize({ email, password: "Passw0rd!long", totp: codes[0] }, req)).id).toBe(T.owner.id);
    await expect(authorize({ email, password: "Passw0rd!long", totp: codes[0] }, req)).rejects.toThrow("TOTP_INVALID");
  });
  it("repeated bad codes lock the account", async () => {
    const e2 = `lock-2fa-${uniq()}@test.dev`;
    await prisma.user.create({ data: { email: e2, name: "L", passwordHash: await bcrypt.hash("Passw0rd!long", 4), role: "DISPATCHER", companyId: T.companyId, totpEnabled: true, totpSecret: encryptSecret(generateSecret()) } });
    for (let i = 0; i < 5; i++) await expect(authorize({ email: e2, password: "Passw0rd!long", totp: "111111" }, req)).rejects.toThrow();
    await expect(authorize({ email: e2, password: "Passw0rd!long", totp: "111111" }, req)).rejects.toThrow("LOCKED");
  });
});

describe("password reset by email", () => {
  let sent: { to: string; body: string }[] = [];
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    process.env.EMAIL_PROVIDER_KEY = "re_test"; process.env.EMAIL_FROM = "t@test.dev";
    globalThis.fetch = vi.fn(async (url: any, init: any) => { if (String(url).includes("resend")) { const b = JSON.parse(init.body); sent.push({ to: b.to[0], body: b.text }); return new Response("{}", { status: 200 }); } return realFetch(url, init); }) as any;
  });
  afterEach(() => { sent = []; });
  const tokenFrom = (body: string) => /token=([a-f0-9]{64})/.exec(body)![1];
  const mk = async () => { const T = await makeTenant("Reset"); const e = `r-${uniq()}@test.dev`; await prisma.user.update({ where: { id: T.owner.id }, data: { email: e } }); return { T, e }; };

  it("emails a single-use link; the reset changes the password and revokes sessions", async () => {
    const { T, e } = await mk();
    const tv = (await prisma.user.findUniqueOrThrow({ where: { id: T.owner.id } })).tokenVersion;
    await requestPasswordReset(e, "http://app");
    expect(sent).toHaveLength(1);
    const token = tokenFrom(sent[0].body);
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0); // only the hash is stored
    await expect(resetPassword(token, "short")).rejects.toThrow();
    await resetPassword(token, "BrandNew#Pass99");
    await expect(resetPassword(token, "AnotherPass#123")).rejects.toThrow(/invalid or has expired/);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: T.owner.id } });
    expect(await bcrypt.compare("BrandNew#Pass99", u.passwordHash)).toBe(true);
    expect(u.tokenVersion).toBe(tv + 1);
    expect((await authorize({ email: e, password: "BrandNew#Pass99" }, { headers: { "x-forwarded-for": "8.8.8.8" } })).id).toBe(T.owner.id);
  });
  it("only the newest link works; expired links fail", async () => {
    const { e } = await mk();
    await requestPasswordReset(e, "http://app"); await requestPasswordReset(e, "http://app");
    const [old, fresh] = sent.map((m) => tokenFrom(m.body));
    await expect(resetPassword(old, "BrandNew#Pass99")).rejects.toThrow();
    const { createHash } = await import("node:crypto");
    await prisma.passwordResetToken.updateMany({ where: { tokenHash: createHash("sha256").update(fresh).digest("hex") }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPassword(fresh, "BrandNew#Pass99")).rejects.toThrow(/expired/);
  });
  it("is silent for unknown / disabled accounts (no enumeration) and honest when email isn't configured", async () => {
    await expect(requestPasswordReset("nobody@nowhere.test", "http://app")).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
    const { T, e } = await mk();
    await prisma.user.update({ where: { id: T.owner.id }, data: { isActive: false } });
    await requestPasswordReset(e, "http://app"); expect(sent).toHaveLength(0);
    delete process.env.EMAIL_PROVIDER_KEY;
    await expect(requestPasswordReset(e, "http://app")).rejects.toThrow(/isn't configured/);
    process.env.EMAIL_PROVIDER_KEY = "re_test";
  });
});
