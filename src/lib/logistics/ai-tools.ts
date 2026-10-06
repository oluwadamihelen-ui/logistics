/**
 * AI tool registry. Every tool:
 *  - declares the permission(s) required (the model only SEES tools the user may call, and the call is re-checked),
 *  - runs through the same tenant-scoped services/analytics as the UI (never raw SQL from model text),
 *  - returns bounded JSON,
 *  - for writes, only PROPOSES the action — a human must confirm it in the UI (see confirmProposal).
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Permission } from "../platform/permissions";
import type { TenantContext } from "../platform/context";
import { AppError } from "../platform/errors";
import { num, prisma } from "../platform/db";
import { assignShipments, createShipment, getShipmentDetail, resolveFailure } from "./shipments";
import { shipmentInputSchema } from "./schemas";
import { branchPerformance, codOverview, deliveryStats, detectAnomalies, driverPerformance, failedDeliveries, forecastVolume, lastDays, undeliveredToday, zonePerformance } from "./analytics";
import { DEFAULT_TEMPLATES } from "./customer-messages";
import { normalizeTracking } from "./tracking";

export interface AiTool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  permissions: Permission[];
  mutating?: boolean;
  /** Human-readable one-liner for confirmation UI. */
  summarize?: (input: any) => string;
  run: (ctx: TenantContext, input: any) => Promise<unknown>;
}

const daysSchema = z.object({ days: z.number().int().min(1).max(365).default(30).describe("Look-back window in days") });
const q = (d: string) => z.string().min(1).max(100).describe(d);

async function findShipment(ctx: TenantContext, query: string) {
  const t = normalizeTracking(query);
  const s = await ctx.db.shipment.findFirst({ where: { OR: [{ trackingNumber: t }, { orderNumber: { equals: query.trim(), mode: "insensitive" } }] }, select: { id: true } });
  if (!s) throw new AppError("NOT_FOUND", `No shipment matches "${query}"`);
  return s.id;
}
async function findDriver(ctx: TenantContext, query: string) {
  const d = await ctx.db.driver.findFirst({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] }, orderBy: { isActive: "desc" } });
  if (!d) throw new AppError("NOT_FOUND", `No driver matches "${query}"`);
  return d;
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const AI_TOOLS: AiTool[] = [
  { name: "get_shipment", description: "Look up one shipment by tracking number or order number: status, parties, driver, fees, COD, recent timeline.", schema: z.object({ query: q("Tracking number or order number") }), permissions: ["shipments.view"],
    run: async (ctx, i) => {
      const s = await getShipmentDetail(ctx, await findShipment(ctx, i.query));
      return { tracking: s.trackingNumber, order: s.orderNumber, status: s.status, priority: s.priority, sender: s.senderName, recipient: s.recipientName, to: `${s.deliveryCity}, ${s.deliveryState}`, driver: s.driver?.name ?? null, vehicle: s.vehicle?.registrationNumber ?? null, deliveryFee: num(s.deliveryFee), codAmount: num(s.codAmount), codStatus: s.cod?.status ?? null, attempts: s.attemptCount, expectedDelivery: iso(s.expectedDeliveryAt), deliveredAt: iso(s.deliveredAt), timeline: s.events.slice(-8).map((e) => ({ at: iso(e.createdAt), event: e.description })) };
    } },
  { name: "list_shipments", description: "List shipments filtered by status group. Use for 'today's undelivered shipments', 'unassigned', 'failed', etc.", schema: z.object({ filter: z.enum(["undelivered", "unassigned", "failed", "out_for_delivery", "delivered_today", "cod"]).describe("Which set to list"), limit: z.number().int().min(1).max(25).default(15) }), permissions: ["shipments.view"],
    run: async (ctx, i) => {
      if (i.filter === "undelivered") return undeliveredToday(ctx, i.limit);
      const where: any = i.filter === "unassigned" ? { driverId: null, status: { in: ["CONFIRMED", "READY_FOR_DISPATCH"] } } : i.filter === "failed" ? { status: { in: ["DELIVERY_FAILED", "RESCHEDULED"] } } : i.filter === "out_for_delivery" ? { status: "OUT_FOR_DELIVERY" } : i.filter === "cod" ? { codAmount: { gt: 0 }, status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED_TO_SENDER"] } } : { status: "DELIVERED", deliveredAt: { gte: new Date(Date.now() - 86400_000) } };
      const [rows, total] = await Promise.all([ctx.db.shipment.findMany({ where, take: i.limit, orderBy: { createdAt: "desc" }, select: { trackingNumber: true, status: true, recipientName: true, deliveryCity: true, codAmount: true, driver: { select: { name: true } } } }), ctx.db.shipment.count({ where })]);
      return { total, shown: rows.length, shipments: rows.map((s) => ({ tracking: s.trackingNumber, status: s.status, recipient: s.recipientName, city: s.deliveryCity, cod: num(s.codAmount), driver: s.driver?.name ?? null })) };
    } },
  { name: "get_delivery_status", description: "Current delivery status and latest events for a tracking number.", schema: z.object({ query: q("Tracking or order number") }), permissions: ["shipments.view"],
    run: async (ctx, i) => { const s = await getShipmentDetail(ctx, await findShipment(ctx, i.query)); return { tracking: s.trackingNumber, status: s.status, expectedDelivery: iso(s.expectedDeliveryAt), attempts: s.attemptCount, latest: s.events.slice(-3).map((e) => ({ at: iso(e.createdAt), event: e.description })) }; } },
  { name: "get_customer", description: "Find a customer by name/phone/business and return their shipment statistics.", schema: z.object({ query: q("Name, phone or business name") }), permissions: ["customers.view"],
    run: async (ctx, i) => {
      const c = await ctx.db.customer.findFirst({ where: { OR: [{ name: { contains: i.query, mode: "insensitive" } }, { phone: { contains: i.query } }, { businessName: { contains: i.query, mode: "insensitive" } }] }, include: { corporate: true } });
      if (!c) throw new AppError("NOT_FOUND", `No customer matches "${i.query}"`);
      const by = await ctx.db.shipment.groupBy({ by: ["status"], where: { customerId: c.id }, _count: { _all: true } });
      return { name: c.name, type: c.type, business: c.businessName, phone: c.phone, email: c.email, shipmentsByStatus: Object.fromEntries(by.map((b) => [b.status, b._count._all])), corporate: c.corporate ? { creditLimit: num(c.corporate.creditLimit), terms: c.corporate.paymentTermsDays } : null };
    } },
  { name: "get_driver", description: "Driver/rider profile, status, workload and 30-day performance.", schema: z.object({ query: q("Driver name or phone") }), permissions: ["drivers.view"],
    run: async (ctx, i) => { const d = await findDriver(ctx, i.query); const perf = await driverPerformance(ctx, lastDays(30), d.id); const active = await ctx.db.shipment.count({ where: { driverId: d.id, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } } }); return { name: d.name, kind: d.kind, status: d.status, activeTasks: active, payModel: d.payModel, licenseExpiry: iso(d.licenseExpiry), performance30d: perf[0] ?? null }; } },
  { name: "get_vehicle", description: "Vehicle details, status, document expiry and recent maintenance.", schema: z.object({ query: q("Registration number") }), permissions: ["fleet.view"],
    run: async (ctx, i) => {
      const v = await ctx.db.vehicle.findFirst({ where: { registrationNumber: { contains: i.query.trim(), mode: "insensitive" } }, include: { driver: { select: { name: true } }, maintenance: { orderBy: { performedAt: "desc" }, take: 3 } } });
      if (!v) throw new AppError("NOT_FOUND", `No vehicle matches "${i.query}"`);
      return { registration: v.registrationNumber, type: v.type, status: v.status, driver: v.driver?.name ?? null, mileageKm: v.mileageKm, insuranceExpiry: iso(v.insuranceExpiry), inspectionExpiry: iso(v.inspectionExpiry), roadworthinessExpiry: iso(v.roadworthinessExpiry), nextServiceAt: iso(v.nextServiceAt), recentMaintenance: v.maintenance.map((m) => ({ type: m.type, at: iso(m.performedAt), cost: num(m.cost) })) };
    } },
  { name: "get_driver_location", description: "Last known GPS position and freshness for a driver (from the driver app).", schema: z.object({ query: q("Driver name") }), permissions: ["map.view"],
    run: async (ctx, i) => { const d = await findDriver(ctx, i.query); if (d.currentLat === null) return { driver: d.name, status: d.status, location: null, note: "This driver has not reported a GPS position." }; return { driver: d.name, status: d.status, lat: d.currentLat, lng: d.currentLng, lastUpdate: iso(d.lastLocationAt), minutesAgo: d.lastLocationAt ? Math.round((Date.now() - d.lastLocationAt.getTime()) / 60000) : null }; } },
  { name: "get_cod_balance", description: "Company-wide COD position, or the cash held by a specific driver.", schema: z.object({ driver: z.string().max(100).optional().describe("Optional driver name") }), permissions: ["cod.view"],
    run: async (ctx, i) => { const o = await codOverview(ctx); if (i.driver) { const d = await findDriver(ctx, i.driver); return { driver: d.name, held: o.driversHoldingCash.find((x) => x.driverId === d.id) ?? { held: 0 } }; } return o; } },
  { name: "get_customer_balance", description: "Outstanding invoices and COD owed for a customer.", schema: z.object({ query: q("Customer name or phone") }), permissions: ["finance.view"],
    run: async (ctx, i) => {
      const c = await ctx.db.customer.findFirst({ where: { OR: [{ name: { contains: i.query, mode: "insensitive" } }, { phone: { contains: i.query } }] } });
      if (!c) throw new AppError("NOT_FOUND", `No customer matches "${i.query}"`);
      const [inv, cod] = await Promise.all([ctx.db.invoice.findMany({ where: { customerId: c.id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, select: { number: true, total: true, amountPaid: true, dueDate: true } }), ctx.db.codTransaction.aggregate({ where: { customerId: c.id }, _sum: { amountCollected: true, amountSettled: true } })]);
      return { customer: c.name, openInvoices: inv.map((x) => ({ number: x.number, balance: num(x.total) - num(x.amountPaid), due: iso(x.dueDate) })), outstandingInvoiceTotal: inv.reduce((a, x) => a + num(x.total) - num(x.amountPaid), 0), codOwedToCustomer: num(cod._sum.amountCollected) - num(cod._sum.amountSettled) };
    } },
  { name: "get_delivery_statistics", description: "Delivery KPIs for the last N days: volume, success rate, average delivery time, returns, revenue, COD collected.", schema: daysSchema, permissions: ["analytics.view"], run: async (ctx, i) => deliveryStats(ctx, lastDays(i.days)) },
  { name: "get_failed_deliveries", description: "Failed delivery analysis: reasons, zones, drivers and recent failures.", schema: daysSchema, permissions: ["analytics.view"], run: async (ctx, i) => failedDeliveries(ctx, lastDays(i.days)) },
  { name: "get_branch_performance", description: "Shipments, delivered %, problems and revenue per branch.", schema: daysSchema, permissions: ["analytics.view"], run: async (ctx, i) => branchPerformance(ctx, lastDays(i.days)) },
  { name: "get_driver_performance", description: "Deliveries, failed attempts, success rate, speed, revenue and COD per driver. Use to rank drivers (e.g. highest failed rate).", schema: daysSchema, permissions: ["analytics.view", "drivers.view"], run: async (ctx, i) => (await driverPerformance(ctx, lastDays(i.days))).sort((a, b) => b.failedAttempts - a.failedAttempts) },
  { name: "analyze_delivery_performance", description: "Combined delivery performance data: KPIs, zones and drivers, for you to analyse.", schema: daysSchema, permissions: ["analytics.view"], run: async (ctx, i) => ({ stats: await deliveryStats(ctx, lastDays(i.days)), zones: await zonePerformance(ctx, lastDays(i.days)), drivers: (await driverPerformance(ctx, lastDays(i.days))).slice(0, 10) }) },
  { name: "analyze_failed_deliveries", description: "Failed delivery data (reasons/zones/drivers) for root-cause analysis.", schema: daysSchema, permissions: ["analytics.view"], run: async (ctx, i) => failedDeliveries(ctx, lastDays(i.days)) },
  { name: "analyze_cod", description: "COD position, drivers holding cash with ageing, disputes — for reconciliation analysis.", schema: z.object({}), permissions: ["cod.view"], run: async (ctx) => codOverview(ctx) },
  { name: "identify_operational_anomalies", description: "Statistical anomaly detection (driver failure rates, slow drivers, zone problems, COD ageing, volume, complaints, fleet downtime). Returns insufficientData notes when there isn't enough history.", schema: z.object({}), permissions: ["analytics.view"], run: async (ctx) => detectAnomalies(ctx) },
  { name: "forecast_shipment_volume", description: "7-day shipment volume forecast using a day-of-week average baseline (not ML).", schema: z.object({}), permissions: ["analytics.view"], run: async (ctx) => forecastVolume(ctx) },
  { name: "generate_delivery_summary", description: "Plain-language numbers for a delivery summary of the last N days.", schema: daysSchema, permissions: ["reports.view"], run: async (ctx, i) => { const s = await deliveryStats(ctx, lastDays(i.days)); const f = await failedDeliveries(ctx, lastDays(i.days)); return { period: `last ${i.days} days`, ...s, topFailureReasons: f.reasons.slice(0, 3) }; } },
  { name: "generate_operations_report", description: "Full operations report data: KPIs, branches, zones, drivers, failures, COD.", schema: daysSchema, permissions: ["reports.view"], run: async (ctx, i) => { const r = lastDays(i.days); return { stats: await deliveryStats(ctx, r), branches: await branchPerformance(ctx, r), zones: await zonePerformance(ctx, r), drivers: (await driverPerformance(ctx, r)).slice(0, 10), failures: await failedDeliveries(ctx, r), cod: ctx.can("cod.view") ? await codOverview(ctx) : undefined }; } },
  { name: "draft_customer_message", description: "Draft (do NOT send) a customer message about a shipment. Purpose: created, out_for_delivery, delivered, delivery_failed or custom.", schema: z.object({ query: q("Tracking number"), purpose: z.enum(["created", "out_for_delivery", "delivered", "delivery_failed"]) }), permissions: ["shipments.view"],
    run: async (ctx, i) => { const s = await ctx.db.shipment.findFirst({ where: { id: await findShipment(ctx, i.query) } }); const co = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { name: true } }); const key = `shipment.${i.purpose}` as keyof typeof DEFAULT_TEMPLATES; return { to: s!.recipientName, draft: DEFAULT_TEMPLATES[key].replace(/\{\{(\w+)\}\}/g, (_, k) => ({ recipientName: s!.recipientName, senderName: s!.senderName, trackingNumber: s!.trackingNumber, company: co?.name ?? "", trackingUrl: `/track/${s!.trackingNumber}`, otp: "" } as Record<string, string>)[k] ?? ""), note: "Draft only — nothing was sent." }; } },

  // ── writes: proposal only ──
  { name: "create_shipment", description: "PROPOSE creating a shipment (requires user confirmation). Provide all required sender/recipient/package fields.", schema: shipmentInputSchema.pick({ senderName: true, senderPhone: true, pickupAddress: true, pickupCity: true, pickupState: true, recipientName: true, recipientPhone: true, deliveryAddress: true, deliveryCity: true, deliveryState: true, packageDescription: true, weightKg: true, codAmount: true, priority: true }).partial({ weightKg: true, codAmount: true, priority: true }) as any, permissions: ["shipments.create"], mutating: true,
    summarize: (i) => `Create shipment ${i.senderName} → ${i.recipientName} (${i.deliveryCity})`,
    run: async (ctx, i) => { const s = await createShipment(ctx, shipmentInputSchema.parse(i), "DASHBOARD"); return { created: s.trackingNumber }; } },
  { name: "assign_driver", description: "PROPOSE assigning a driver to a shipment (requires user confirmation).", schema: z.object({ tracking: q("Tracking number"), driver: q("Driver name") }), permissions: ["shipments.assign"], mutating: true,
    summarize: (i) => `Assign ${i.tracking} to ${i.driver}`,
    run: async (ctx, i) => { const sid = await findShipment(ctx, i.tracking); const d = await findDriver(ctx, i.driver); const r = await assignShipments(ctx, [sid], d.id); if (!r[0].ok) throw new AppError("INVALID_STATE", r[0].error ?? "Could not assign"); return { assigned: i.tracking, driver: d.name }; } },
  { name: "reschedule_delivery", description: "PROPOSE rescheduling a failed delivery to a future date (requires user confirmation).", schema: z.object({ tracking: q("Tracking number"), date: z.string().describe("ISO date/time in the future") }), permissions: ["shipments.dispatch"], mutating: true,
    summarize: (i) => `Reschedule ${i.tracking} for ${i.date}`,
    run: async (ctx, i) => { const sid = await findShipment(ctx, i.tracking); await resolveFailure(ctx, sid, { resolution: "RESCHEDULED", rescheduleFor: new Date(i.date) }); return { rescheduled: i.tracking, for: i.date }; } },
];

export const toolByName = new Map(AI_TOOLS.map((t) => [t.name, t]));
export function toolsFor(ctx: Pick<TenantContext, "can">): AiTool[] {
  return AI_TOOLS.filter((t) => t.permissions.every((p) => ctx.can(p)));
}
export function toolSpec(t: AiTool) {
  const js = zodToJsonSchema(t.schema, { target: "openApi3", $refStrategy: "none" }) as Record<string, unknown>;
  delete js.$schema;
  return { name: t.name, description: t.description, parameters: js };
}
