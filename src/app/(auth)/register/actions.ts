"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { provisionCompany } from "@/lib/platform/provisioning";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { enforceRateLimit, clientIp } from "@/lib/platform/rate-limit";
import { prisma } from "@/lib/platform/db";
import { AppError } from "@/lib/platform/errors";

const schema = z.object({
  companyName: z.string().trim().min(2).max(100),
  ownerName: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  phone: z.string().trim().min(7).max(20).optional(),
  password: z.string().min(10).max(200),
  confirmPassword: z.string().max(200),
  planKey: z.enum(["starter", "professional", "premium"]).optional(),
});

export async function registerCompany(raw: unknown): Promise<ActionResult<{ email: string }>> {
  try {
    enforceRateLimit(`register:${clientIp(await headers())}`, 5, 60 * 60_000);
    const flag = await prisma.platformSetting.findUnique({ where: { key: "signupsEnabled" } });
    if (flag?.value === false) throw new AppError("FORBIDDEN", "New registrations are currently closed.");
    const { confirmPassword, ...input } = schema.parse(raw);
    if (confirmPassword !== input.password) throw new AppError("VALIDATION", "The two passwords don't match", { fields: ["confirmPassword"] });
    await provisionCompany(input);
    return { ok: true, data: { email: input.email.toLowerCase() } };
  } catch (e) {
    return toFailure(e);
  }
}
