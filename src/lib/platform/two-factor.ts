/**
 * TOTP two-factor authentication (RFC 6238, SHA-1, 6 digits, 30 s) implemented with node:crypto — no external service.
 * The shared secret is stored AES-256-GCM encrypted; recovery codes are stored as SHA-256 hashes and are single-use.
 * Encryption key = TWO_FACTOR_KEY, falling back to NEXTAUTH_SECRET (rotating the secret then requires re-enrolment).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) throw new Error("bad base32"); value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, timeMs: number, step = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Accepts the current code and ±1 step (clock drift). Constant-time comparison. */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  let ok = false;
  for (const drift of [-1, 0, 1]) {
    const exp = Buffer.from(totpAt(secret, now + drift * 30_000)), got = Buffer.from(c);
    if (exp.length === got.length && timingSafeEqual(exp, got)) ok = true;
  }
  return ok;
}

export const otpauthUrl = (issuer: string, account: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

const key = () => createHash("sha256").update(`2fa:${process.env.TWO_FACTOR_KEY ?? process.env.NEXTAUTH_SECRET ?? ""}`).digest();
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}
export function decryptSecret(stored: string): string {
  const [v, iv, tag, enc] = stored.split(".");
  if (v !== "v1") throw new Error("unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

const hashCode = (c: string) => createHash("sha256").update(c.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
export function generateRecoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => { const h = randomBytes(5).toString("hex"); return `${h.slice(0, 5)}-${h.slice(5)}`; });
  return { codes, hashes: codes.map(hashCode) };
}
/** Returns the remaining hashes if `code` matched one (consuming it), else null. */
export function consumeRecoveryCode(hashes: string[], code: string): string[] | null {
  const h = hashCode(code);
  return hashes.includes(h) ? hashes.filter((x) => x !== h) : null;
}
