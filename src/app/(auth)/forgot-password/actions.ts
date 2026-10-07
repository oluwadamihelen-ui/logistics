"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { clientIp, enforceRateLimit } from "@/lib/platform/rate-limit";
import { requestPasswordReset } from "@/lib/platform/password-reset";

export async function forgotPasswordAction(raw: { email: string }): Promise<ActionResult<boolean>> {
  try {
    const ip = clientIp(await headers());
    enforceRateLimit(`forgot:ip:${ip}`, 8, 60 * 60_000);
    const { email } = z.object({ email: z.string().email().max(254) }).parse(raw);
    enforceRateLimit(`forgot:email:${email.toLowerCase()}`, 3, 60 * 60_000);
    await requestPasswordReset(email, process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000", ip);
    return { ok: true, data: true };
  } catch (e) { return toFailure(e); }
}
