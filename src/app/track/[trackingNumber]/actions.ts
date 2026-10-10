"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { AppError, toFailure, type ActionResult } from "@/lib/platform/errors";
import { clientIp, enforceSharedRateLimit } from "@/lib/platform/rate-limit";
import { normalizeTracking } from "@/lib/logistics/tracking";

/** Public: a recipient rates a completed delivery. Possession of the tracking number is the credential; one rating per shipment. */
export async function rateDeliveryAction(raw: { trackingNumber: string; score: number; comment?: string }): Promise<ActionResult<boolean>> {
  try {
    await enforceSharedRateLimit(`rate:${clientIp(await headers())}`, 10, 60 * 60_000);
    const i = z.object({ trackingNumber: z.string().max(30), score: z.number().int().min(1).max(5), comment: z.string().trim().max(300).optional() }).parse(raw);
    const s = await prisma.shipment.findUnique({ where: { trackingNumber: normalizeTracking(i.trackingNumber) }, select: { id: true, companyId: true, driverId: true, status: true } });
    if (!s || s.status !== "DELIVERED") throw new AppError("INVALID_STATE", "Only delivered shipments can be rated.");
    try { await prisma.deliveryRating.create({ data: { companyId: s.companyId, shipmentId: s.id, driverId: s.driverId, score: i.score, comment: i.comment } }); }
    catch (e: any) { if (e?.code === "P2002") throw new AppError("CONFLICT", "This delivery was already rated."); throw e; }
    if (s.driverId) {
      const agg = await prisma.deliveryRating.aggregate({ where: { driverId: s.driverId }, _avg: { score: true } });
      await prisma.driver.update({ where: { id: s.driverId }, data: { rating: agg._avg.score } });
    }
    return { ok: true, data: true };
  } catch (e) { return toFailure(e); }
}
