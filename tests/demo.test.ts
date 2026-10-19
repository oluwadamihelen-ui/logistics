import { describe, it, expect, afterEach, vi } from "vitest";
import { z } from "zod";
import { DEMO_ACCOUNTS, assertNotDemo, demoPassword, isDemo } from "@/lib/platform/demo";
import { defineAction } from "@/lib/platform/action";
import { listDemoAccountsAction, demoCredentialsAction } from "@/app/(auth)/login/demo-actions";
import { checkEnv } from "@/lib/platform/env";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));

afterEach(() => { delete process.env.DEMO_MODE; delete process.env.DEMO_PASSWORD; });

describe("demo mode", () => {
  it("is off unless DEMO_MODE=1; guards only fire in demo", () => {
    expect(isDemo()).toBe(false);
    expect(() => assertNotDemo("Billing")).not.toThrow();
    process.env.DEMO_MODE = "1";
    expect(isDemo()).toBe(true);
    expect(() => assertNotDemo("Billing")).toThrow(/turned off in the demo/);
  });

  it("offers no accounts and hands out no credentials outside demo mode", async () => {
    expect(await listDemoAccountsAction()).toEqual([]);
    const r = await demoCredentialsAction({ key: "owner" });
    expect(r.ok).toBe(false);
  });

  it("in demo mode lists the roles and returns credentials only for known keys", async () => {
    process.env.DEMO_MODE = "1";
    expect((await listDemoAccountsAction()).map((a) => a.key)).toEqual(DEMO_ACCOUNTS.map((a) => a.key));
    const ok = await demoCredentialsAction({ key: "owner" });
    expect(ok).toMatchObject({ ok: true, data: { email: "owner@swiftdrop.test", password: demoPassword() } });
    expect((await demoCredentialsAction({ key: "root" })).ok).toBe(false);
    process.env.DEMO_PASSWORD = "Custom#Demo99";
    expect(demoPassword()).toBe("Custom#Demo99");
  });

  it("defineAction({ blockInDemo }) refuses before authentication in demo mode", async () => {
    const act = defineAction({ blockInDemo: "Adding users", schema: z.object({}), handler: async () => "ran" });
    process.env.DEMO_MODE = "1";
    const r = await act({});
    expect(r).toMatchObject({ ok: false });
    expect((r as any).error).toMatch(/Adding users is turned off/);
  });

  it("warns at startup when demo mode is on", () => {
    const w = checkEnv({ DATABASE_URL: "x", NEXTAUTH_SECRET: "k3V9xQ2mZp7LwR4tYb8NcD1aFgH6jUe0", NEXTAUTH_URL: "https://d.example.org", DEMO_MODE: "1" }, true).warnings.join();
    expect(w).toMatch(/DEMO_MODE=1/);
  });
});
