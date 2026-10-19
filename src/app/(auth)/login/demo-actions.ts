"use server";
import { headers } from "next/headers";
import { DEMO_ACCOUNTS, demoPassword, isDemo } from "@/lib/platform/demo";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { clientIp, enforceSharedRateLimit } from "@/lib/platform/rate-limit";

/** Accounts offered as one-click sign-ins. Empty (and sign-in refused) unless the deployment is in demo mode. */
export async function listDemoAccountsAction(): Promise<{ key: string; label: string; blurb: string }[]> {
  return isDemo() ? DEMO_ACCOUNTS.map(({ key, label, blurb }) => ({ key, label, blurb })) : [];
}

export async function demoCredentialsAction(raw: { key: string }): Promise<ActionResult<{ email: string; password: string }>> {
  try {
    if (!isDemo()) return { ok: false, error: "Not available.", code: "FORBIDDEN" };
    await enforceSharedRateLimit(`demo-login:${clientIp(await headers())}`, 60, 15 * 60_000);
    const a = DEMO_ACCOUNTS.find((x) => x.key === raw?.key);
    if (!a) return { ok: false, error: "Unknown demo account.", code: "NOT_FOUND" };
    return { ok: true, data: { email: a.email, password: demoPassword() } };
  } catch (e) { return toFailure(e); }
}
