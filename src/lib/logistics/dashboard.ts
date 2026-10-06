/**
 * Dashboard & analytics queries. Everything here is computed from the database for ONE company.
 * Raw SQL bypasses the tenant client, so every statement carries an explicit "companyId" predicate.
 */
import { Prisma } from "@prisma/client";
import { prisma, num } from "../platform/db";
import type { ServiceCtx } from "../platform/service";

/** Start of "today" in the company's timezone, as a UTC Date. */
export function startOfDayInTz(tz: string, daysAgo = 0, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); // YYYY-MM-DD
  const [y, m, d] = parts.split("-").map(Number);
  // Find the UTC instant at which tz-local midnight occurs.
  const utcGuess = Date.UTC(y, m - 1, d - daysAgo, 0, 0, 0);
  const offsetMin = tzOffsetMinutes(tz, new Date(utcGuess));
  return new Date(utcGuess - offsetMin * 60_000);
}

function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export interface DailyPoint { day: string; created: number; delivered: number; failed: number; revenue: number }

export async function getDashboard(svc: ServiceCtx, tz: string) {
  const { db, companyId } = svc;
  const today = startOfDayInTz(tz);
  const d14 = startOfDayInTz(tz, 13);
  const d30 = startOfDayInTz(tz, 29);
  const wk = startOfDayInTz(tz, 6);
  const prevWk = startOfDayInTz(tz, 13);

  const [
    todayCount, byStatus, deliveredToday, failedToday, returned, attempts30, drivers, vehicles, openTickets, settlementsPending,
    codCollectedToday, codHeld, codUnsettled, codUncollected, revenueToday, revenueMonth,
  ] = await Promise.all([
    db.shipment.count({ where: { createdAt: { gte: today } } }),
    db.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    db.shipment.count({ where: { status: "DELIVERED", deliveredAt: { gte: today } } }),
    db.deliveryAttempt.count({ where: { outcome: "FAILED", createdAt: { gte: today } } }),
    db.shipment.count({ where: { status: { in: ["RETURNING", "RETURNED_TO_HUB", "RETURNED_TO_SENDER"] }, updatedAt: { gte: d30 } } }),
    db.deliveryAttempt.groupBy({ by: ["outcome"], where: { createdAt: { gte: d30 } }, _count: { _all: true } }),
    db.driver.groupBy({ by: ["status"], where: { isActive: true }, _count: { _all: true } }),
    db.vehicle.groupBy({ by: ["status"], where: { isActive: true }, _count: { _all: true } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } } }),
    db.settlement.aggregate({ where: { status: { in: ["DRAFT", "APPROVED"] } }, _count: { _all: true }, _sum: { netPayable: true } }),
    db.codTransaction.aggregate({ where: { collectedAt: { gte: today } }, _sum: { amountCollected: true } }),
    // Cash collected by drivers but not yet handed over to the company
    prisma.$queryRaw<{ held: Prisma.Decimal | null }[]>`SELECT COALESCE(SUM("amountCollected" - "amountRemitted"), 0) AS held FROM "CodTransaction" WHERE "companyId" = ${companyId} AND "amountCollected" > "amountRemitted"`,
    // Collected but not yet paid out to the merchant/sender
    prisma.$queryRaw<{ v: Prisma.Decimal | null }[]>`SELECT COALESCE(SUM("amountCollected" - "amountSettled"), 0) AS v FROM "CodTransaction" WHERE "companyId" = ${companyId} AND "amountCollected" > "amountSettled"`,
    db.codTransaction.aggregate({ where: { status: "PENDING" }, _sum: { amountDue: true } }),
    db.shipment.aggregate({ where: { status: "DELIVERED", deliveredAt: { gte: today } }, _sum: { deliveryFee: true } }),
    db.shipment.aggregate({ where: { status: "DELIVERED", deliveredAt: { gte: startOfDayInTz(tz, Number(new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "2-digit" }).format(new Date())) - 1) } }, _sum: { deliveryFee: true } }),
  ]);

  const st = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const n = (...k: string[]) => k.reduce((a, x) => a + (st[x] ?? 0), 0);
  const ds = Object.fromEntries(drivers.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const vs = Object.fromEntries(vehicles.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const att = Object.fromEntries(attempts30.map((s) => [s.outcome, s._count._all])) as Record<string, number>;
  const okA = att.DELIVERED ?? 0, badA = att.FAILED ?? 0;

  const [avgRow, daily, reasons, byBranch, byZone, byDriver, wow] = await Promise.all([
    prisma.$queryRaw<{ hrs: number | null }[]>`SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 3600.0)::float AS hrs FROM "Shipment" WHERE "companyId" = ${companyId} AND "status" = 'DELIVERED' AND "deliveredAt" >= ${d30}`,
    prisma.$queryRaw<{ day: string; created: bigint; delivered: bigint; failed: bigint; revenue: Prisma.Decimal | null }[]>`
      WITH days AS (SELECT generate_series(${d14}::timestamptz, ${today}::timestamptz, interval '1 day') AS d)
      SELECT to_char((days.d AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
        (SELECT COUNT(*) FROM "Shipment" s WHERE s."companyId" = ${companyId} AND s."createdAt" >= days.d AND s."createdAt" < days.d + interval '1 day') AS created,
        (SELECT COUNT(*) FROM "Shipment" s WHERE s."companyId" = ${companyId} AND s."status" = 'DELIVERED' AND s."deliveredAt" >= days.d AND s."deliveredAt" < days.d + interval '1 day') AS delivered,
        (SELECT COUNT(*) FROM "DeliveryAttempt" a WHERE a."companyId" = ${companyId} AND a."outcome" = 'FAILED' AND a."createdAt" >= days.d AND a."createdAt" < days.d + interval '1 day') AS failed,
        (SELECT COALESCE(SUM(s."deliveryFee"), 0) FROM "Shipment" s WHERE s."companyId" = ${companyId} AND s."status" = 'DELIVERED' AND s."deliveredAt" >= days.d AND s."deliveredAt" < days.d + interval '1 day') AS revenue
      FROM days ORDER BY days.d`,
    db.deliveryAttempt.groupBy({ by: ["failureReason"], where: { outcome: "FAILED", createdAt: { gte: d30 } }, _count: { _all: true }, orderBy: { _count: { failureReason: "desc" } } }),
    prisma.$queryRaw<{ name: string; total: bigint; delivered: bigint; revenue: Prisma.Decimal | null }[]>`
      SELECT COALESCE(b."name", 'Unassigned') AS name, COUNT(*) AS total, COUNT(*) FILTER (WHERE s."status" = 'DELIVERED') AS delivered,
        COALESCE(SUM(s."deliveryFee") FILTER (WHERE s."status" = 'DELIVERED'), 0) AS revenue
      FROM "Shipment" s LEFT JOIN "Branch" b ON b."id" = s."branchId"
      WHERE s."companyId" = ${companyId} AND s."createdAt" >= ${d30} GROUP BY 1 ORDER BY total DESC LIMIT 8`,
    prisma.$queryRaw<{ name: string; total: bigint; delivered: bigint; failed: bigint }[]>`
      SELECT COALESCE(z."name", s."deliveryCity") AS name, COUNT(*) AS total, COUNT(*) FILTER (WHERE s."status" = 'DELIVERED') AS delivered,
        COUNT(*) FILTER (WHERE s."status" IN ('DELIVERY_FAILED','RETURNING','RETURNED_TO_HUB','RETURNED_TO_SENDER') OR s."attemptCount" > 1) AS failed
      FROM "Shipment" s LEFT JOIN "Zone" z ON z."id" = s."deliveryZoneId"
      WHERE s."companyId" = ${companyId} AND s."createdAt" >= ${d30} GROUP BY 1 ORDER BY total DESC LIMIT 8`,
    prisma.$queryRaw<{ id: string; name: string; delivered: bigint; failed: bigint; avg_hrs: number | null }[]>`
      SELECT d."id", d."name",
        COUNT(a.*) FILTER (WHERE a."outcome" = 'DELIVERED') AS delivered,
        COUNT(a.*) FILTER (WHERE a."outcome" = 'FAILED') AS failed,
        NULL::float AS avg_hrs
      FROM "Driver" d LEFT JOIN "DeliveryAttempt" a ON a."driverId" = d."id" AND a."createdAt" >= ${d30}
      WHERE d."companyId" = ${companyId} AND d."isActive" = true GROUP BY d."id", d."name" HAVING COUNT(a.*) > 0 ORDER BY delivered DESC LIMIT 8`,
    prisma.$queryRaw<{ cur_failed: bigint; prev_failed: bigint; cur_total: bigint; prev_total: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "outcome" = 'FAILED' AND "createdAt" >= ${wk}) AS cur_failed,
        COUNT(*) FILTER (WHERE "outcome" = 'FAILED' AND "createdAt" >= ${prevWk} AND "createdAt" < ${wk}) AS prev_failed,
        COUNT(*) FILTER (WHERE "createdAt" >= ${wk}) AS cur_total,
        COUNT(*) FILTER (WHERE "createdAt" >= ${prevWk} AND "createdAt" < ${wk}) AS prev_total
      FROM "DeliveryAttempt" WHERE "companyId" = ${companyId} AND "createdAt" >= ${prevWk}`,
  ]);

  const series: DailyPoint[] = daily.map((r) => ({ day: r.day, created: Number(r.created), delivered: Number(r.delivered), failed: Number(r.failed), revenue: num(r.revenue) }));

  return {
    kpis: {
      todaysShipments: todayCount,
      pendingPickup: n("CREATED", "CONFIRMED", "PICKUP_ASSIGNED"),
      pickedUp: n("PICKED_UP"),
      atHub: n("AT_HUB", "SORTING"),
      readyForDispatch: n("READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY"),
      outForDelivery: n("OUT_FOR_DELIVERY"),
      deliveredToday,
      failedToday,
      returned,
      codCollectedToday: num(codCollectedToday._sum.amountCollected),
      codHeldByDrivers: num(codHeld[0]?.held),
      codUnsettled: num(codUnsettled[0]?.v),
      codAwaitingCollection: num(codUncollected._sum.amountDue),
      revenueToday: num(revenueToday._sum.deliveryFee),
      revenueMonth: num(revenueMonth._sum.deliveryFee),
      successRate: okA + badA > 0 ? (okA / (okA + badA)) * 100 : null,
      avgDeliveryHours: avgRow[0]?.hrs ?? null,
      activeDrivers: (ds.AVAILABLE ?? 0) + (ds.ON_PICKUP ?? 0) + (ds.ON_DELIVERY ?? 0) + (ds.IDLE ?? 0),
      availableDrivers: ds.AVAILABLE ?? 0,
      driversOnDelivery: (ds.ON_DELIVERY ?? 0) + (ds.ON_PICKUP ?? 0),
      vehiclesActive: (vs.AVAILABLE ?? 0) + (vs.ASSIGNED ?? 0) + (vs.ON_TRIP ?? 0),
      vehiclesMaintenance: vs.MAINTENANCE ?? 0,
      openIssues: openTickets,
      pendingSettlements: settlementsPending._count._all,
      pendingSettlementsAmount: num(settlementsPending._sum.netPayable),
    },
    series,
    failureReasons: reasons.map((r) => ({ reason: r.failureReason ?? "OTHER", count: r._count._all })),
    byBranch: byBranch.map((b) => ({ name: b.name, total: Number(b.total), delivered: Number(b.delivered), revenue: num(b.revenue) })),
    byZone: byZone.map((z) => ({ name: z.name, total: Number(z.total), delivered: Number(z.delivered), failed: Number(z.failed) })),
    byDriver: byDriver.map((d) => ({ id: d.id, name: d.name, delivered: Number(d.delivered), failed: Number(d.failed) })),
    weekOverWeek: wow[0] ? { curFailed: Number(wow[0].cur_failed), prevFailed: Number(wow[0].prev_failed), curTotal: Number(wow[0].cur_total), prevTotal: Number(wow[0].prev_total) } : null,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

export interface DataInsight { id: string; severity: "info" | "warning" | "danger"; text: string; href?: string }

/**
 * Deterministic insights derived from real numbers (no model involved).
 * Insights are only emitted when there is enough data to be meaningful.
 */
export function deriveDataInsights(d: Dashboard, currency = "NGN"): DataInsight[] {
  const out: DataInsight[] = [];
  const w = d.weekOverWeek;
  if (w && w.prevTotal >= 10 && w.curTotal >= 10) {
    const curRate = w.curFailed / w.curTotal, prevRate = w.prevFailed / w.prevTotal;
    if (prevRate > 0 && curRate > prevRate * 1.15) out.push({ id: "fail-up", severity: "warning", text: `Failed-attempt rate rose ${Math.round(((curRate - prevRate) / prevRate) * 100)}% week over week (${(prevRate * 100).toFixed(1)}% → ${(curRate * 100).toFixed(1)}%).`, href: "/analytics" });
  }
  const zones = d.byZone.filter((z) => z.total >= 10).map((z) => ({ ...z, rate: z.failed / z.total })).sort((a, b) => b.rate - a.rate);
  if (zones[0] && zones[0].rate >= 0.2) out.push({ id: "zone-fail", severity: "warning", text: `${zones[0].name} has the highest delivery problem rate: ${(zones[0].rate * 100).toFixed(0)}% of ${zones[0].total} shipments in 30 days.`, href: "/analytics" });
  if (d.kpis.codHeldByDrivers > 0) out.push({ id: "cod-held", severity: d.kpis.codHeldByDrivers > 500_000 ? "danger" : "info", text: `${new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(d.kpis.codHeldByDrivers)} of COD is held by drivers awaiting remittance.`, href: "/cod" });
  if (d.kpis.vehiclesMaintenance > 0) out.push({ id: "veh-maint", severity: "info", text: `${d.kpis.vehiclesMaintenance} vehicle${d.kpis.vehiclesMaintenance > 1 ? "s are" : " is"} currently in maintenance.`, href: "/fleet" });
  return out;
}
