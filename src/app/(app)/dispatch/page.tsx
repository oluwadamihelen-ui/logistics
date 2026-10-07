import { PageHeader } from "@/components/ui";
import { DispatchBoard } from "@/components/client/dispatch-board";
import { requirePageContext } from "@/lib/platform/context";
import { getEntitlements } from "@/lib/platform/entitlements";
import { startOfDayInTz } from "@/lib/logistics/dashboard";
import { prisma } from "@/lib/platform/db";
import { relativeTime } from "@/lib/utils/format";

export const metadata = { title: "Dispatch" };
export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const ctx = await requirePageContext("dispatch.view");
  const [company, ent] = await Promise.all([prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { timezone: true } }), getEntitlements(ctx.companyId)]);
  const today = startOfDayInTz(company.timezone);
  const [ships, drivers, active, zones] = await Promise.all([
    ctx.db.shipment.findMany({
      // Hub-pickup shipments only need a rider for the sender pickup; once picked up they go to the hub, not to dispatch.
      where: { AND: [{ OR: [{ status: { in: ["CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERY_FAILED", "RESCHEDULED"] } }, { status: "DELIVERED", deliveredAt: { gte: today } }] }, { NOT: { deliveryMethod: "HUB_PICKUP", status: "PICKED_UP" } }] },
      orderBy: { createdAt: "asc" }, take: 400,
      select: { id: true, trackingNumber: true, status: true, priority: true, recipientName: true, deliveryCity: true, deliveryAddress: true, driverId: true, driverAccepted: true, codAmount: true, deliveryZoneId: true },
    }),
    ctx.db.driver.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { vehicle: { select: { registrationNumber: true } } } }),
    ctx.db.shipment.groupBy({ by: ["driverId"], where: { driverId: { not: null }, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }, _count: { _all: true } }),
    ctx.db.zone.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));
  const cnt = new Map(active.map((a) => [a.driverId, a._count._all]));
  return (
    <>
      <PageHeader title="Dispatch center" subtitle="Drag shipments onto a driver, or select several and assign in bulk. Priority shipments sort first." />
      <DispatchBoard
        shipments={ships.map((s) => ({ id: s.id, trackingNumber: s.trackingNumber, status: s.status, priority: s.priority, recipientName: s.recipientName, deliveryCity: s.deliveryCity, deliveryAddress: s.deliveryAddress, zone: s.deliveryZoneId ? zoneMap.get(s.deliveryZoneId) ?? null : null, driverId: s.driverId, accepted: s.driverAccepted, cod: Number(s.codAmount) }))}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name, status: d.status, kind: d.kind, active: cnt.get(d.id) ?? 0, vehicle: d.vehicle?.registrationNumber ?? null, lastGps: d.lastLocationAt ? relativeTime(d.lastLocationAt) : null }))}
        zones={zones.map((z) => z.name)} canAssign={ctx.can("shipments.assign")} canRun={ctx.can("routes.manage") && ent.features.has("routes")} />
    </>
  );
}
