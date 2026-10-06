import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/platform/api-auth";
import { AppError } from "@/lib/platform/errors";
import { normalizeTracking } from "@/lib/logistics/tracking";
import { serializeShipment } from "@/lib/logistics/api-serializers";

export const dynamic = "force-dynamic";

/** Get a shipment (with public timeline) by tracking number or order number. */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const ctx = await authenticateApi(req, "shipments:read");
    const { ref } = await params;
    const s = await ctx.db.shipment.findFirst({ where: { OR: [{ trackingNumber: normalizeTracking(ref) }, { orderNumber: ref }], ...(ctx.customerId ? { customerId: ctx.customerId } : {}) }, include: { events: { orderBy: { createdAt: "asc" } } } });
    if (!s) throw new AppError("NOT_FOUND", "Shipment not found");
    return NextResponse.json(serializeShipment(s));
  } catch (e) { return apiError(e); }
}
