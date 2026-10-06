"use server";
import { z } from "zod";
import { requireTenant, type TenantContext } from "@/lib/platform/context";
import { toFailure, AppError, type ActionResult } from "@/lib/platform/errors";
import { enforceRateLimit } from "@/lib/platform/rate-limit";
import { completeDelivery, driverAcceptShipment, failDelivery, transitionShipment } from "@/lib/logistics/shipments";
import { failureInputSchema, proofInputSchema } from "@/lib/logistics/schemas";
import { raiseSos, recordLocation, setDriverStatus } from "@/lib/logistics/drivers";
import { emitSafe } from "@/lib/platform/notifications/engine";
import { auditFrom } from "@/lib/platform/audit";

/** Every driver action runs as the signed-in driver and can only touch shipments assigned to them. */
async function driverCtx(): Promise<TenantContext & { driverId: string }> {
  const ctx = await requireTenant("driver.app");
  if (!ctx.user.driverId) throw new AppError("FORBIDDEN", "No driver profile is linked to this login.");
  return Object.assign(ctx, { driverId: ctx.user.driverId });
}
async function run<T>(fn: (c: TenantContext & { driverId: string }) => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await fn(await driverCtx()) }; } catch (e) { return toFailure(e); }
}
async function ownShipment(c: TenantContext & { driverId: string }, id: string) {
  const s = await c.db.shipment.findFirst({ where: { id }, select: { id: true, driverId: true, status: true } });
  if (!s || s.driverId !== c.driverId) throw new AppError("FORBIDDEN", "This shipment is not assigned to you");
  return s;
}

export async function driverAcceptAction(raw: { id: string }) {
  return run(async (c) => { const { id } = z.object({ id: z.string() }).parse(raw); await ownShipment(c, id); await driverAcceptShipment(c, id, c.driverId); return true; });
}

export async function driverTransitionAction(raw: unknown) {
  return run(async (c) => {
    const i = z.object({ id: z.string(), to: z.enum(["PICKED_UP", "OUT_FOR_DELIVERY"]), clientEventId: z.string().max(100).optional(), lat: z.number().optional(), lng: z.number().optional() }).parse(raw);
    await ownShipment(c, i.id);
    await transitionShipment(c, i.id, i.to, { clientEventId: i.clientEventId, lat: i.lat, lng: i.lng });
    return true;
  });
}

export async function driverCompleteAction(raw: unknown) {
  return run(async (c) => {
    const i = proofInputSchema.extend({ id: z.string() }).parse(raw);
    await ownShipment(c, i.id).catch(async (e) => {
      // Offline replay after success: already delivered by this driver → treat as done.
      const s = await c.db.shipment.findFirst({ where: { id: i.id }, select: { status: true, driverId: true } });
      if (s?.status === "DELIVERED" && s.driverId === c.driverId) return;
      throw e;
    });
    const { id, ...proof } = i;
    const s = await completeDelivery(c, id, proof, { driverId: c.driverId });
    return { status: s.status };
  });
}

export async function driverFailAction(raw: unknown) {
  return run(async (c) => {
    const i = failureInputSchema.extend({ id: z.string() }).parse(raw);
    await ownShipment(c, i.id);
    const { id, ...f } = i;
    await failDelivery(c, id, f, { driverId: c.driverId });
    return true;
  });
}

export async function driverLocationAction(raw: unknown) {
  return run(async (c) => {
    enforceRateLimit(`gps:${c.driverId}`, 12, 60_000);
    const pts = z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), speedKmh: z.number().min(0).max(400).optional(), heading: z.number().min(0).max(360).optional(), accuracyM: z.number().min(0).optional(), recordedAt: z.coerce.date().optional() })).min(1).max(50).parse(raw);
    for (const p of pts) await recordLocation(c, c.driverId, p);
    return { stored: pts.length };
  });
}

export async function driverStatusAction(raw: { status: "AVAILABLE" | "OFFLINE" | "IDLE" }) {
  return run(async (c) => { const { status } = z.object({ status: z.enum(["AVAILABLE", "OFFLINE", "IDLE"]) }).parse(raw); await setDriverStatus(c, c.driverId, status); return true; });
}

export async function driverSosAction(raw: { lat?: number; lng?: number }) {
  return run(async (c) => { const loc = z.object({ lat: z.number().optional(), lng: z.number().optional() }).parse(raw ?? {}); await raiseSos(c, c.driverId, loc); return true; });
}

export async function driverReportIssueAction(raw: unknown) {
  return run(async (c) => {
    const i = z.object({ shipmentId: z.string().optional(), kind: z.enum(["VEHICLE_BREAKDOWN", "ACCIDENT", "ADDRESS_PROBLEM", "CUSTOMER_PROBLEM", "OTHER"]), note: z.string().trim().min(3).max(500) }).parse(raw);
    if (i.shipmentId) await ownShipment(c, i.shipmentId);
    const d = await c.db.driver.findFirstOrThrow({ where: { id: c.driverId } });
    const active = await c.db.shipment.count({ where: { driverId: c.driverId, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "PICKED_UP"] } } });
    await auditFrom(c, "driver.issue_reported", "Driver", c.driverId, undefined, i);
    await emitSafe(c, { type: "driver.issue_reported", priority: i.kind === "VEHICLE_BREAKDOWN" || i.kind === "ACCIDENT" ? "CRITICAL" : "HIGH", title: `${d.name} reported: ${i.kind.replace(/_/g, " ").toLowerCase()}`, body: `${i.note}${active ? ` (${active} active shipment${active > 1 ? "s" : ""})` : ""}`, entity: { type: "Driver", id: c.driverId }, actionUrl: `/drivers/${c.driverId}`, branchId: d.branchId });
    return true;
  });
}
