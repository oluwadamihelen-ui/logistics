/**
 * Fixed-window in-memory rate limiter. Adequate for a single instance; for horizontally scaled
 * deployments swap `store` for a Redis-backed implementation (same interface).
 */
import { AppError } from "./errors";
import { prisma } from "./db";

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

/**
 * Shared (database-backed) limiter for security-sensitive endpoints. Serverless hosts run many instances, so an
 * in-memory counter alone can be bypassed; this one is atomic in Postgres and works across all instances.
 * The in-memory check runs first so abusive bursts are rejected without touching the database. If the database
 * itself is unreachable we fail open (the request would fail on its own database access anyway).
 */
export async function enforceSharedRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  enforceRateLimit(key, limit * 2, windowMs); // cheap local guard against floods
  try {
    const resetAt = new Date(Date.now() + windowMs);
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count"`;
    if ((rows[0]?.count ?? 0) > limit) throw new AppError("RATE_LIMITED", "Too many requests. Please slow down and try again shortly.");
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error("[rate-limit] shared limiter unavailable", e instanceof Error ? e.message : e);
  }
}

/** Housekeeping: remove expired counters (called from the maintenance job). */
export async function purgeRateLimits(): Promise<number> {
  return prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 day'`;
}

export function clientIp(headers: Headers | { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
