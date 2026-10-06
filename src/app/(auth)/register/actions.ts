"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { provisionCompany } from "@/lib/platform/provisioning";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { enforceRateLimit, clientIp } from "@/lib/platform/rate-limit";

const schema = z.object({
  companyName: z.string().trim().min(2).max(100),
  ownerName: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  phone: z.string().trim().min(7).max(20).optional(),
  password: z.string().min(10).max(200),
  planKey: z.enum(["starter", "professional", "premium"]).optional(),
});

export async function registerCompany(raw: unknown): Promise<ActionResult<{ email: string }>> {
  try {
    enforceRateLimit(`register:${clientIp(await headers())}`, 5, 60 * 60_000);
    const input = schema.parse(raw);
    await provisionCompany(input);
    return { ok: true, data: { email: input.email.toLowerCase() } };
  } catch (e) {
    return toFailure(e);
  }
}
