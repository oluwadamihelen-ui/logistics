import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/platform/api-auth";
import { AppError } from "@/lib/platform/errors";
import { normalizeTracking } from "@/lib/logistics/tracking";
import { transitionShipment } from "@/lib/logistics/shipments";
import { serializeShipment } from "@/lib/logistics/api-serializers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const ctx = await authenticateApi(req, "shipments:cancel");
    const { ref } = await params;
    const s = await ctx.db.shipment.findFirst({ where: { OR: [{ trackingNumber: normalizeTracking(ref) }, { orderNumber: ref }], ...(ctx.customerId ? { customerId: ctx.customerId } : {}) }, select: { id: true } });
    if (!s) throw new AppError("NOT_FOUND", "Shipment not found");
    const out = await transitionShipment(ctx, s.id, "CANCELLED", { note: "Cancelled via API" });
    return NextResponse.json(serializeShipment(out!));
  } catch (e) { return apiError(e); }
}
