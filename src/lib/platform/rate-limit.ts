/**
 * Fixed-window in-memory rate limiter. Adequate for a single instance; for horizontally scaled
 * deployments swap `store` for a Redis-backed implementation (same interface).
 */
import { AppError } from "./errors";

interface Bucket { count: number; resetAt: number }
const store = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  b.count++;
  if (store.size > 10_000) for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const r = rateLimit(key, limit, windowMs);
  if (!r.allowed) throw new AppError("RATE_LIMITED", "Too many requests. Please slow down and try again shortly.");
}

export function clientIp(headers: Headers | { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
