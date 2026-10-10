"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { clientIp, enforceSharedRateLimit } from "@/lib/platform/rate-limit";
import { resetPassword } from "@/lib/platform/password-reset";

export async function resetPasswordAction(raw: { token: string; password: string }): Promise<ActionResult<boolean>> {
  try {
    const ip = clientIp(await headers());
    await enforceSharedRateLimit(`reset:ip:${ip}`, 15, 60 * 60_000);
    const i = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(10).max(200) }).parse(raw);
    await resetPassword(i.token, i.password, ip);
    return { ok: true, data: true };
  } catch (e) { return toFailure(e); }
}
