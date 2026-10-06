import { randomBytes, randomInt, createHash } from "node:crypto";

// No 0/O/1/I/L — avoids mis-keyed tracking numbers.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateTrackingNumber(prefix = "LX"): string {
  const bytes = randomBytes(9);
  let code = "";
  for (let i = 0; i < 9; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)}${code}`;
}

export function normalizeTracking(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** 6-digit delivery OTP. Only the hash is stored. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(shipmentId: string, otp: string): string {
  return createHash("sha256").update(`${shipmentId}:${otp}`).digest("hex");
}

export function formatOrderNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}
