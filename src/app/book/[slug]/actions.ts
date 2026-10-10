"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { createTenantClient, prisma } from "@/lib/platform/db";
import { AppError, toFailure, type ActionResult } from "@/lib/platform/errors";
import { clientIp, enforceSharedRateLimit } from "@/lib/platform/rate-limit";
import { getEntitlements, assertFeature } from "@/lib/platform/entitlements";
import { createShipment, quoteForInput } from "@/lib/logistics/shipments";
import { shipmentInputSchema } from "@/lib/logistics/schemas";
import type { ServiceCtx } from "@/lib/platform/service";

const bookingSchema = shipmentInputSchema.omit({ customerId: true, deliveryFeeOverride: true, branchId: true, idempotencyKey: true, notes: true, codAmount: true }).extend({ priority: z.enum(["STANDARD", "EXPRESS", "SAME_DAY"]).default("STANDARD"), website: z.string().max(0).optional() /* honeypot */ });

async function publicSvc(slug: string): Promise<ServiceCtx> {
  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!company || company.status !== "ACTIVE") throw new AppError("NOT_FOUND", "Booking page not found");
  assertFeature(await getEntitlements(company.id), "public_booking");
  return { db: createTenantClient(company.id), companyId: company.id, actor: { id: "public", name: "Online booking", role: "PUBLIC" } };
}

export async function publicQuoteAction(raw: { slug: string } & Record<string, unknown>): Promise<ActionResult<any>> {
  try {
    await enforceSharedRateLimit(`pubquote:${clientIp(await headers())}`, 40, 60 * 60_000);
    const { slug, ...rest } = raw;
    const svc = await publicSvc(String(slug));
    const i = bookingSchema.pick({ pickupCity: true, pickupState: true, deliveryCity: true, deliveryState: true, weightKg: true, priority: true, packageType: true, declaredValue: true }).parse(rest);
    return { ok: true, data: (await quoteForInput(svc, { ...i, codAmount: 0 })).quote };
  } catch (e) { return toFailure(e); }
}

export async function publicBookAction(raw: { slug: string } & Record<string, unknown>): Promise<ActionResult<{ trackingNumber: string }>> {
  try {
    await enforceSharedRateLimit(`pubbook:${clientIp(await headers())}`, 8, 60 * 60_000);
    const { slug, ...rest } = raw;
    const input = bookingSchema.parse(rest);
    if (input.website) throw new AppError("VALIDATION", "Could not submit"); // bots fill the hidden field
    const svc = await publicSvc(String(slug));
    const { website: _h, ...data } = input;
    const s = await createShipment(svc, { ...data, codAmount: 0 }, "PUBLIC");
    return { ok: true, data: { trackingNumber: s.trackingNumber } };
  } catch (e) { return toFailure(e); }
}
