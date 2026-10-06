import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticateApi } from "@/lib/platform/api-auth";
import { createShipment } from "@/lib/logistics/shipments";
import { shipmentInputSchema } from "@/lib/logistics/schemas";
import { serializeShipment } from "@/lib/logistics/api-serializers";
import { AppError } from "@/lib/platform/errors";

export const dynamic = "force-dynamic";

/** Create a shipment. Send an `Idempotency-Key` header so retries never create duplicates. */
export async function POST(req: Request) {
  try {
    const ctx = await authenticateApi(req, "shipments:create");
    const idem = req.headers.get("idempotency-key") ?? undefined;
    if (idem && idem.length > 100) throw new AppError("VALIDATION", "Idempotency-Key too long");
    const body = shipmentInputSchema.omit({ customerId: true, deliveryFeeOverride: true, branchId: true, idempotencyKey: true }).parse(await req.json().catch(() => { throw new AppError("VALIDATION", "Body must be JSON"); }));
    const s = await createShipment(ctx, { ...body, customerId: ctx.customerId ?? undefined, idempotencyKey: idem ? `api:${ctx.keyId}:${idem}` : undefined }, "API");
    return NextResponse.json(serializeShipment(s), { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticateApi(req, "shipments:read");
    const sp = new URL(req.url).searchParams;
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 25));
    const status = sp.get("status");
    const where: any = { ...(ctx.customerId ? { customerId: ctx.customerId } : {}), ...(status ? { status } : {}) };
    const cursor = sp.get("cursor");
    const rows = await ctx.db.shipment.findMany({ where, orderBy: { createdAt: "desc" }, take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const page = rows.slice(0, limit);
    return NextResponse.json({ data: page.map(serializeShipment), nextCursor: rows.length > limit ? page[page.length - 1].id : null });
  } catch (e) { return apiError(e); }
}
