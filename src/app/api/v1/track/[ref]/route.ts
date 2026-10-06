import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/platform/api-auth";
import { AppError } from "@/lib/platform/errors";
import { normalizeTracking } from "@/lib/logistics/tracking";

export const dynamic = "force-dynamic";

/** Lightweight delivery status for a tracking number. */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const ctx = await authenticateApi(req, "tracking:read");
    const { ref } = await params;
    const s = await ctx.db.shipment.findFirst({ where: { trackingNumber: normalizeTracking(ref), ...(ctx.customerId ? { customerId: ctx.customerId } : {}) }, select: { trackingNumber: true, status: true, expectedDeliveryAt: true, deliveredAt: true } });
    if (!s) throw new AppError("NOT_FOUND", "Shipment not found");
    return NextResponse.json(s);
  } catch (e) { return apiError(e); }
}
