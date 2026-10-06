/**
 * Deterministic analytics used by the analytics pages, reports, AI tools and insight generation.
 * All numbers come from SQL over the company's own rows. Raw SQL always carries "companyId".
 */
import { prisma, num } from "../platform/db";
import type { ServiceCtx } from "../platform/service";
import { UNDELIVERED_STATUSES } from "./shipment-status";

export interface Range { from: Date; to: Date }
const days = (n: number) => new Date(Date.now() - n * 86400_000);
export const lastDays = (n: number): Range => ({ from: days(n), to: new Date() });

export async function deliveryStats(svc: ServiceCtx, r: Range) {
  const id = svc.companyId;
  const [created, byStatus, att, avg, fees, cod] = await Promise.all([
    svc.db.shipment.count({ where: { createdAt: { gte: r.from, lte: r.to } } }),
    svc.db.shipment.groupBy({ by: ["status"], where: { createdAt: { gte: r.from, lte: r.to } }, _count: { _all: true } }),
    svc.db.deliveryAttempt.groupBy({ by: ["outcome"], where: { createdAt: { gte: r.from, lte: r.to } }, _count: { _all: true } }),
    prisma.$queryRaw<{ h: number | null; p90: number | null }[]>`SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt"))/3600.0)::float AS h, PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt"))/3600.0)::float AS p90 FROM "Shipment" WHERE "companyId" = ${id} AND "status" = 'DELIVERED' AND "deliveredAt" >= ${r.from} AND "deliveredAt" <= ${r.to}`,
    svc.db.shipment.aggregate({ where: { status: "DELIVERED", deliveredAt: { gte: r.from, lte: r.to } }, _sum: { deliveryFee: true } }),
    svc.db.codTransaction.aggregate({ where: { collectedAt: { gte: r.from, lte: r.to } }, _sum: { amountCollected: true } }),
  ]);
  const s = Object.fromEntries(byStatus.map((x) => [x.status, x._count._all])) as Record<string, number>;
  const a = Object.fromEntries(att.map((x) => [x.outcome, x._count._all])) as Record<string, number>;
  const delivered = s.DELIVERED ?? 0;
  const returned = (s.RETURNING ?? 0) + (s.RETURNED_TO_HUB ?? 0) + (s.RETURNED_TO_SENDER ?? 0);
  const attempts = (a.DELIVERED ?? 0) + (a.FAILED ?? 0);
  return {
    from: r.from, to: r.to, shipmentsCreated: created, delivered, failedAttempts: a.FAILED ?? 0, returned, cancelled: s.CANCELLED ?? 0,
    deliverySuccessRatePct: attempts ? Math.round(((a.DELIVERED ?? 0) / attempts) * 1000) / 10 : null,
    returnRatePct: created ? Math.round((returned / created) * 1000) / 10 : null,
    avgDeliveryHours: avg[0]?.h == null ? null : Math.round(avg[0].h * 10) / 10, p90DeliveryHours: avg[0]?.p90 == null ? null : Math.round(avg[0].p90 * 10) / 10,
    revenue: num(fees._sum.deliveryFee), codCollected: num(cod._sum.amountCollected),
  };
}

export async function failedDeliveries(svc: ServiceCtx, r: Range) {
  const id = svc.companyId;
  const [reasons, byZone, byDriver, recent] = await Promise.all([
    svc.db.deliveryAttempt.groupBy({ by: ["failureReason"], where: { outcome: "FAILED", createdAt: { gte: r.from, lte: r.to } }, _count: { _all: true }, orderBy: { _count: { failureReason: "desc" } } }),
    prisma.$queryRaw<{ zone: string; failed: bigint; total: bigint }[]>`SELECT COALESCE(z."name", s."deliveryCity") AS zone, COUNT(*) FILTER (WHERE a."outcome" = 'FAILED') AS failed, COUNT(*) AS total FROM "DeliveryAttempt" a JOIN "Shipment" s ON s."id" = a."shipmentId" LEFT JOIN "Zone" z ON z."id" = s."deliveryZoneId" WHERE a."companyId" = ${id} AND a."createdAt" >= ${r.from} AND a."createdAt" <= ${r.to} GROUP BY 1 HAVING COUNT(*) FILTER (WHERE a."outcome" = 'FAILED') > 0 ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<{ id: string; name: string; failed: bigint; total: bigint }[]>`SELECT d."id", d."name", COUNT(*) FILTER (WHERE a."outcome" = 'FAILED') AS failed, COUNT(*) AS total FROM "DeliveryAttempt" a JOIN "Driver" d ON d."id" = a."driverId" WHERE a."companyId" = ${id} AND a."createdAt" >= ${r.from} AND a."createdAt" <= ${r.to} GROUP BY d."id", d."name" HAVING COUNT(*) FILTER (WHERE a."outcome" = 'FAILED') > 0 ORDER BY 3 DESC LIMIT 10`,
    svc.db.deliveryAttempt.findMany({ where: { outcome: "FAILED", createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: 20, include: { shipment: { select: { trackingNumber: true, deliveryCity: true } }, driver: { select: { name: true } } } }),
  ]);
  return {
    total: reasons.reduce((a, x) => a + x._count._all, 0),
    reasons: reasons.map((x) => ({ reason: x.failureReason ?? "OTHER", count: x._count._all })),
    zones: byZone.map((z) => ({ zone: z.zone, failed: Number(z.failed), attempts: Number(z.total), ratePct: Math.round((Number(z.failed) / Number(z.total)) * 1000) / 10 })),
    drivers: byDriver.map((d) => ({ driverId: d.id, driver: d.name, failed: Number(d.failed), attempts: Number(d.total), ratePct: Math.round((Number(d.failed) / Number(d.total)) * 1000) / 10 })),
    recent: recent.map((x) => ({ tracking: x.shipment.trackingNumber, city: x.shipment.deliveryCity, reason: x.failureReason, driver: x.driver?.name ?? null, at: x.createdAt })),
  };
}

export async function driverPerformance(svc: ServiceCtx, r: Range, driverId?: string) {
  const id = svc.companyId;
  const rows = await prisma.$queryRaw<{ id: string; name: string; delivered: bigint; failed: bigint; avg_h: number | null; revenue: unknown; cod: unknown; held: unknown }[]>`
    SELECT d."id", d."name",
      COUNT(a.*) FILTER (WHERE a."outcome" = 'DELIVERED') AS delivered, COUNT(a.*) FILTER (WHERE a."outcome" = 'FAILED') AS failed,
      (SELECT AVG(EXTRACT(EPOCH FROM (s."deliveredAt" - s."pickedUpAt"))/3600.0)::float FROM "Shipment" s WHERE s."driverId" = d."id" AND s."status" = 'DELIVERED' AND s."deliveredAt" >= ${r.from} AND s."deliveredAt" <= ${r.to} AND s."pickedUpAt" IS NOT NULL) AS avg_h,
      (SELECT COALESCE(SUM(s."deliveryFee"),0) FROM "Shipment" s WHERE s."driverId" = d."id" AND s."status" = 'DELIVERED' AND s."deliveredAt" >= ${r.from} AND s."deliveredAt" <= ${r.to}) AS revenue,
      (SELECT COALESCE(SUM(c."amountCollected"),0) FROM "CodTransaction" c WHERE c."driverId" = d."id" AND c."collectedAt" >= ${r.from} AND c."collectedAt" <= ${r.to}) AS cod,
      (SELECT COALESCE(SUM(c."amountCollected" - c."amountRemitted"),0) FROM "CodTransaction" c WHERE c."driverId" = d."id") AS held
    FROM "Driver" d LEFT JOIN "DeliveryAttempt" a ON a."driverId" = d."id" AND a."createdAt" >= ${r.from} AND a."createdAt" <= ${r.to}
    WHERE d."companyId" = ${id} AND d."isActive" = true
    GROUP BY d."id", d."name" ORDER BY delivered DESC`;
  const out = rows.filter((x) => !driverId || x.id === driverId).map((x) => {
    const del = Number(x.delivered), fail = Number(x.failed);
    return { driverId: x.id, driver: x.name, delivered: del, failedAttempts: fail, successRatePct: del + fail ? Math.round((del / (del + fail)) * 1000) / 10 : null, avgPickupToDeliveryHours: x.avg_h == null ? null : Math.round(x.avg_h * 10) / 10, revenue: num(x.revenue as any), codCollected: num(x.cod as any), codHeld: num(x.held as any) };
  });
  return out;
}

export async function branchPerformance(svc: ServiceCtx, r: Range) {
  const id = svc.companyId;
  const rows = await prisma.$queryRaw<{ name: string; total: bigint; delivered: bigint; failed: bigint; revenue: unknown }[]>`
    SELECT COALESCE(b."name",'Unassigned') AS name, COUNT(*) AS total, COUNT(*) FILTER (WHERE s."status" = 'DELIVERED') AS delivered,
      COUNT(*) FILTER (WHERE s."status" IN ('DELIVERY_FAILED','RETURNING','RETURNED_TO_HUB','RETURNED_TO_SENDER')) AS failed,
      COALESCE(SUM(s."deliveryFee") FILTER (WHERE s."status" = 'DELIVERED'),0) AS revenue
    FROM "Shipment" s LEFT JOIN "Branch" b ON b."id" = s."branchId" WHERE s."companyId" = ${id} AND s."createdAt" >= ${r.from} AND s."createdAt" <= ${r.to} GROUP BY 1 ORDER BY total DESC`;
  return rows.map((x) => ({ branch: x.name, shipments: Number(x.total), delivered: Number(x.delivered), problem: Number(x.failed), deliveredPct: Number(x.total) ? Math.round((Number(x.delivered) / Number(x.total)) * 1000) / 10 : null, revenue: num(x.revenue as any) }));
}

export async function zonePerformance(svc: ServiceCtx, r: Range) {
  const id = svc.companyId;
  const rows = await prisma.$queryRaw<{ name: string; total: bigint; delivered: bigint; failed: bigint; avg_h: number | null }[]>`
    SELECT COALESCE(z."name", s."deliveryCity") AS name, COUNT(*) AS total, COUNT(*) FILTER (WHERE s."status" = 'DELIVERED') AS delivered,
      COUNT(*) FILTER (WHERE s."status" IN ('DELIVERY_FAILED','RETURNING','RETURNED_TO_HUB','RETURNED_TO_SENDER') OR s."attemptCount" > 1) AS failed,
      AVG(EXTRACT(EPOCH FROM (s."deliveredAt" - s."createdAt"))/3600.0) FILTER (WHERE s."status" = 'DELIVERED')::float AS avg_h
    FROM "Shipment" s LEFT JOIN "Zone" z ON z."id" = s."deliveryZoneId" WHERE s."companyId" = ${id} AND s."createdAt" >= ${r.from} AND s."createdAt" <= ${r.to} GROUP BY 1 ORDER BY total DESC LIMIT 15`;
  return rows.map((x) => ({ zone: x.name, shipments: Number(x.total), delivered: Number(x.delivered), problem: Number(x.failed), problemPct: Number(x.total) ? Math.round((Number(x.failed) / Number(x.total)) * 1000) / 10 : null, avgDeliveryHours: x.avg_h == null ? null : Math.round(x.avg_h * 10) / 10 }));
}

export async function codOverview(svc: ServiceCtx) {
  const id = svc.companyId;
  const [tot, drivers, mismatches, oldest] = await Promise.all([
    svc.db.codTransaction.aggregate({ _sum: { amountDue: true, amountCollected: true, amountRemitted: true, amountSettled: true } }),
    prisma.$queryRaw<{ id: string; name: string; held: unknown; oldest: Date | null }[]>`SELECT d."id", d."name", SUM(c."amountCollected" - c."amountRemitted") AS held, MIN(c."collectedAt") FILTER (WHERE c."amountCollected" > c."amountRemitted") AS oldest FROM "CodTransaction" c JOIN "Driver" d ON d."id" = c."driverId" WHERE c."companyId" = ${id} AND c."amountCollected" > c."amountRemitted" GROUP BY d."id", d."name" ORDER BY 3 DESC LIMIT 15`,
    svc.db.codTransaction.count({ where: { status: "DISPUTED" } }),
    svc.db.codTransaction.findFirst({ where: { status: "COLLECTED" }, orderBy: { collectedAt: "asc" }, select: { collectedAt: true } }),
  ]);
  const t = tot._sum;
  return {
    totalDue: num(t.amountDue), collected: num(t.amountCollected), heldByDrivers: num(t.amountCollected) - num(t.amountRemitted), owedToSenders: num(t.amountCollected) - num(t.amountSettled), disputedRecords: mismatches,
    oldestUnsettledCollection: oldest?.collectedAt ?? null,
    driversHoldingCash: drivers.map((d) => ({ driverId: d.id, driver: d.name, held: num(d.held as any), oldestCollectionAt: d.oldest, daysHeld: d.oldest ? Math.floor((Date.now() - d.oldest.getTime()) / 86400_000) : null })),
  };
}

export async function dailySeries(svc: ServiceCtx, nDays: number) {
  const id = svc.companyId;
  const rows = await prisma.$queryRaw<{ d: string; n: bigint }[]>`SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Shipment" WHERE "companyId" = ${id} AND "createdAt" >= ${days(nDays)} GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ day: r.d, count: Number(r.n) }));
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const h = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2) : 0; };

export interface Anomaly { kind: string; severity: "info" | "warning" | "critical"; subject: string; detail: string; metrics: Record<string, number | string | null> }

/** Statistical detectors. Each requires a minimum sample size — with too little data it says nothing rather than guess. */
export async function detectAnomalies(svc: ServiceCtx): Promise<{ anomalies: Anomaly[]; insufficientData: string[] }> {
  const out: Anomaly[] = [];
  const skipped: string[] = [];
  const r30 = lastDays(30), r7 = lastDays(7);

  const drivers = await driverPerformance(svc, r30);
  const eligible = drivers.filter((d) => d.delivered + d.failedAttempts >= 15);
  if (eligible.length >= 3) {
    const fleetFail = eligible.reduce((a, d) => a + d.failedAttempts, 0) / eligible.reduce((a, d) => a + d.delivered + d.failedAttempts, 0);
    for (const d of eligible) {
      const rate = d.failedAttempts / (d.delivered + d.failedAttempts);
      if (fleetFail > 0 && rate >= fleetFail * 1.8 && rate >= 0.15) out.push({ kind: "driver_failure_rate", severity: "warning", subject: d.driver, detail: `${(rate * 100).toFixed(1)}% failed attempts vs ${(fleetFail * 100).toFixed(1)}% fleet average (last 30 days, ${d.delivered + d.failedAttempts} attempts).`, metrics: { driverId: d.driverId, ratePct: Math.round(rate * 1000) / 10, fleetPct: Math.round(fleetFail * 1000) / 10 } });
    }
    const times = eligible.map((d) => d.avgPickupToDeliveryHours).filter((x): x is number => x !== null);
    const med = median(times);
    if (times.length >= 3) for (const d of eligible) if (d.avgPickupToDeliveryHours !== null && med > 0 && d.avgPickupToDeliveryHours > med * 1.6) out.push({ kind: "slow_driver", severity: "info", subject: d.driver, detail: `Average pickup→delivery ${d.avgPickupToDeliveryHours}h vs median ${Math.round(med * 10) / 10}h across drivers.`, metrics: { driverId: d.driverId, avgHours: d.avgPickupToDeliveryHours, medianHours: Math.round(med * 10) / 10 } });
  } else skipped.push("driver failure/slow-delivery detection (needs ≥3 drivers with ≥15 attempts in 30 days)");

  const zones = (await zonePerformance(svc, r30)).filter((z) => z.shipments >= 15);
  if (zones.length >= 2) {
    const overall = zones.reduce((a, z) => a + z.problem, 0) / zones.reduce((a, z) => a + z.shipments, 0);
    for (const z of zones) if (z.problemPct !== null && overall > 0 && z.problemPct / 100 >= overall * 1.5 && z.problemPct >= 15) out.push({ kind: "zone_problem_rate", severity: "warning", subject: z.zone, detail: `${z.problemPct}% of ${z.shipments} shipments had failed/returned attempts vs ${(overall * 100).toFixed(1)}% overall.`, metrics: { problemPct: z.problemPct, overallPct: Math.round(overall * 1000) / 10 } });
  } else skipped.push("zone problem-rate detection (needs ≥2 zones with ≥15 shipments in 30 days)");

  const w = await failedDeliveries(svc, r7), p = await failedDeliveries(svc, { from: days(14), to: days(7) });
  if (w.total + p.total >= 12 && p.total >= 4 && w.total >= p.total * 1.4) out.push({ kind: "failure_trend", severity: "warning", subject: "Company-wide", detail: `Failed attempts rose from ${p.total} to ${w.total} week over week (+${Math.round(((w.total - p.total) / p.total) * 100)}%).`, metrics: { thisWeek: w.total, lastWeek: p.total } });

  const series = await dailySeries(svc, 21);
  if (series.length >= 14) {
    const hist = series.slice(0, -1).map((s) => s.count), last = series[series.length - 1].count;
    const m = mean(hist), s = sd(hist);
    if (s > 0 && Math.abs(last - m) > 2.5 * s && hist.length >= 10) out.push({ kind: "volume_anomaly", severity: "info", subject: "Shipment volume", detail: `Latest day had ${last} shipments vs ${m.toFixed(1)} ± ${s.toFixed(1)} typical.`, metrics: { latest: last, mean: Math.round(m * 10) / 10, sd: Math.round(s * 10) / 10 } });
  } else skipped.push("volume anomaly detection (needs ≥14 days of shipment history)");

  const cod = await codOverview(svc);
  for (const d of cod.driversHoldingCash) if ((d.daysHeld ?? 0) >= 3 && d.held >= 20_000) out.push({ kind: "cod_unremitted", severity: (d.daysHeld ?? 0) >= 7 ? "critical" : "warning", subject: d.driver, detail: `Holds ${d.held.toLocaleString()} in COD, oldest collection ${d.daysHeld} days ago.`, metrics: { driverId: d.driverId, held: d.held, daysHeld: d.daysHeld } });
  if (cod.disputedRecords > 0) out.push({ kind: "cod_mismatch", severity: "warning", subject: "COD reconciliation", detail: `${cod.disputedRecords} COD collection(s) don't match the amount due.`, metrics: { disputed: cod.disputedRecords } });

  const tickets = await svc.db.supportTicket.groupBy({ by: ["category"], where: { createdAt: { gte: days(14) } }, _count: { _all: true } });
  const prevTickets = await svc.db.supportTicket.groupBy({ by: ["category"], where: { createdAt: { gte: days(28), lt: days(14) } }, _count: { _all: true } });
  for (const t of tickets) { const prev = prevTickets.find((x) => x.category === t.category)?._count._all ?? 0; if (t._count._all >= 5 && t._count._all >= prev * 2) out.push({ kind: "complaint_pattern", severity: "info", subject: `${t.category} tickets`, detail: `${t._count._all} tickets in 14 days vs ${prev} in the previous 14.`, metrics: { now: t._count._all, before: prev } }); }

  const maint = await svc.db.vehicle.count({ where: { status: "MAINTENANCE", isActive: true } });
  const total = await svc.db.vehicle.count({ where: { isActive: true } });
  if (total >= 4 && maint / total >= 0.25) out.push({ kind: "vehicle_downtime", severity: "warning", subject: "Fleet availability", detail: `${maint} of ${total} vehicles (${Math.round((maint / total) * 100)}%) are in maintenance.`, metrics: { maintenance: maint, total } });

  const rank = { critical: 0, warning: 1, info: 2 };
  return { anomalies: out.sort((a, b) => rank[a.severity] - rank[b.severity]), insufficientData: skipped };
}

/** Day-of-week average forecast. A transparent statistical baseline — not a machine-learning model. */
export async function forecastVolume(svc: ServiceCtx) {
  const series = await dailySeries(svc, 56);
  if (series.length < 28) return { available: false as const, reason: "Needs at least 28 days of shipment history." };
  const byDow = new Map<number, number[]>();
  for (const s of series) { const d = new Date(s.day + "T00:00:00Z").getUTCDay(); byDow.set(d, [...(byDow.get(d) ?? []), s.count]); }
  const out = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() + i * 86400_000);
    const h = byDow.get(d.getUTCDay()) ?? [];
    out.push({ day: d.toISOString().slice(0, 10), expected: Math.round(mean(h)), low: Math.max(0, Math.round(mean(h) - sd(h))), high: Math.round(mean(h) + sd(h)) });
  }
  return { available: true as const, method: "day-of-week average over the last 8 weeks (±1 standard deviation)", forecast: out };
}

export async function undeliveredToday(svc: ServiceCtx, limit = 25) {
  const rows = await svc.db.shipment.findMany({ where: { status: { in: UNDELIVERED_STATUSES } }, orderBy: [{ expectedDeliveryAt: "asc" }], take: limit, select: { trackingNumber: true, status: true, recipientName: true, deliveryCity: true, expectedDeliveryAt: true, driver: { select: { name: true } } } });
  const total = await svc.db.shipment.count({ where: { status: { in: UNDELIVERED_STATUSES } } });
  return { total, shown: rows.length, shipments: rows.map((s) => ({ tracking: s.trackingNumber, status: s.status, recipient: s.recipientName, city: s.deliveryCity, expected: s.expectedDeliveryAt, driver: s.driver?.name ?? null, overdue: !!s.expectedDeliveryAt && s.expectedDeliveryAt < new Date() })) };
}
