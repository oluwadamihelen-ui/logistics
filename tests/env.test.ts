import { describe, it, expect } from "vitest";
import { checkEnv } from "@/lib/platform/env";

const good = { DATABASE_URL: "postgresql://x", NEXTAUTH_SECRET: "k3V9xQ2mZp7LwR4tYb8NcD1aFgH6jUe0", NEXTAUTH_URL: "https://app.example.org", NODE_ENV: "production" };

describe("production env check", () => {
  it("accepts a sound configuration", () => expect(checkEnv(good, true).errors).toEqual([]));
  it("rejects missing / weak / placeholder secrets and non-https URLs", () => {
    expect(checkEnv({ ...good, NEXTAUTH_SECRET: undefined }, true).errors.join()).toMatch(/NEXTAUTH_SECRET is not set/);
    expect(checkEnv({ ...good, NEXTAUTH_SECRET: "short" }, true).errors.join()).toMatch(/too short/);
    expect(checkEnv({ ...good, NEXTAUTH_SECRET: "change-me-to-a-long-random-string-1234567890" }, true).errors.join()).toMatch(/placeholder/);
    expect(checkEnv({ ...good, NEXTAUTH_URL: "http://app.example.org" }, true).errors.join()).toMatch(/https/);
    expect(checkEnv({ ...good, DATABASE_URL: undefined }, true).errors.join()).toMatch(/DATABASE_URL/);
  });
  it("on Vercel a missing NEXTAUTH_URL is only a warning", () => {
    const r = checkEnv({ ...good, NEXTAUTH_URL: undefined, VERCEL: "1" }, true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/NEXTAUTH_URL/);
  });
  it("warns about launch gaps: cron, 2FA key, payments, email, disk storage on serverless", () => {
    const w = checkEnv({ ...good, VERCEL: "1" }, true).warnings.join("\n");
    for (const k of ["CRON_SECRET", "TWO_FACTOR_KEY", "PAYSTACK_SECRET_KEY", "Email is not configured", "STORAGE_PROVIDER=disk"]) expect(w).toContain(k);
  });
  it("outside production nothing is a launch warning", () => expect(checkEnv({ ...good, NODE_ENV: "development" }, false).warnings).toEqual([]));
});
