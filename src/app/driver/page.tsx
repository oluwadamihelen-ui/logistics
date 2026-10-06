import { DriverHome, type DriverTask } from "@/components/client/driver/driver-home";
import { requirePageContext } from "@/lib/platform/context";
import { startOfDayInTz } from "@/lib/logistics/dashboard";
import { prisma } from "@/lib/platform/db";

export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const ctx = await requirePageContext("driver.app");
  const driverId = ctx.user.driverId!;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { timezone: true } });
  const [driver, ships, done] = await Promise.all([
    ctx.db.driver.findFirstOrThrow({ where: { id: driverId }, select: { status: true } }),
    ctx.db.shipment.findMany({ where: { driverId, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }, orderBy: [{ createdAt: "asc" }] }),
    ctx.db.shipment.count({ where: { driverId, status: "DELIVERED", deliveredAt: { gte: startOfDayInTz(company.timezone) } } }),
  ]);
  const prio: Record<string, number> = { SAME_DAY: 0, URGENT: 1, EXPRESS: 2, STANDARD: 3 };
  const tasks: DriverTask[] = ships.sort((a, b) => (a.status === "OUT_FOR_DELIVERY" ? -1 : 0) - (b.status === "OUT_FOR_DELIVERY" ? -1 : 0) || prio[a.priority] - prio[b.priority]).map((s) => {
    const pickup = s.status === "PICKUP_ASSIGNED";
    return { id: s.id, trackingNumber: s.trackingNumber, status: s.status, kind: pickup ? "PICKUP" : "DELIVERY", name: pickup ? s.senderName : s.recipientName, address: pickup ? s.pickupAddress : s.deliveryAddress, city: pickup ? s.pickupCity : s.deliveryCity, phone: pickup ? s.senderPhone : s.recipientPhone, cod: pickup ? 0 : Number(s.codAmount), priority: s.priority, accepted: s.driverAccepted };
  });
  return <DriverHome status={driver.status} tasks={tasks} deliveredToday={done} />;
}
