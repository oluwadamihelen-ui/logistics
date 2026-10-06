import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/platform/context";
import { AppError } from "@/lib/platform/errors";

export const dynamic = "force-dynamic";

/** Live-operations snapshot for the map: drivers, hubs/branches and active destinations. Tenant-scoped + permission-checked. */
export async function GET() {
  try {
    const ctx = await requireTenant("map.view");
    const [drivers, hubs, branches, ships] = await Promise.all([
      ctx.db.driver.findMany({ where: { isActive: true }, select: { id: true, name: true, kind: true, status: true, currentLat: true, currentLng: true, lastLocationAt: true, vehicle: { select: { registrationNumber: true } } } }),
      ctx.db.hub.findMany({ where: { isActive: true, lat: { not: null } }, select: { id: true, name: true, type: true, lat: true, lng: true } }),
      ctx.db.branch.findMany({ where: { isActive: true, lat: { not: null } }, select: { id: true, name: true, lat: true, lng: true } }),
      ctx.db.shipment.findMany({ where: { status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "READY_FOR_DISPATCH"] }, deliveryLat: { not: null } }, take: 500, select: { id: true, trackingNumber: true, status: true, deliveryLat: true, deliveryLng: true, deliveryAddress: true, driverId: true } }),
    ]);
    const active = await ctx.db.shipment.findMany({ where: { driverId: { in: drivers.map((d) => d.id) }, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }, select: { driverId: true, trackingNumber: true, status: true }, orderBy: { updatedAt: "desc" } });
    const current = new Map<string, { trackingNumber: string; status: string; count: number }>();
    for (const a of active) { const c = current.get(a.driverId!); if (c) c.count++; else current.set(a.driverId!, { trackingNumber: a.trackingNumber, status: a.status, count: 1 }); }
    return NextResponse.json({
      at: new Date().toISOString(),
      drivers: drivers.map((d) => ({ id: d.id, name: d.name, kind: d.kind, status: d.status, lat: d.currentLat, lng: d.currentLng, lastAt: d.lastLocationAt, vehicle: d.vehicle?.registrationNumber ?? null, current: current.get(d.id) ?? null })),
      hubs, branches, destinations: ships.map((s) => ({ id: s.id, tn: s.trackingNumber, status: s.status, lat: s.deliveryLat, lng: s.deliveryLng, address: s.deliveryAddress, driverId: s.driverId })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
