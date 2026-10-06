/**
 * Delivery runs (multi-stop routes).
 *
 * Route ORDERING: stops keep the order the dispatcher gives them. A simple nearest-neighbour heuristic is
 * available (clearly labelled — it is NOT an optimisation engine). `RouteOptimizer` is the extension point
 * for a real provider (e.g. Google Route Optimization, Mapbox Optimization, OR-Tools service).
 */
import { assertOwned } from "../platform/db";
import { AppError } from "../platform/errors";
import { auditFrom } from "../platform/audit";
import { guardMutation } from "../platform/entitlements";
import type { ServiceCtx } from "../platform/service";
import { assignShipments } from "./shipments";
import { haversineKm } from "./pricing";

export interface Point { id: string; lat: number | null; lng: number | null }

export interface RouteOptimizer {
  name: string;
  isConfigured(): boolean;
  optimize(start: { lat: number; lng: number } | null, stops: Point[]): Promise<{ order: string[]; distanceKm?: number; durationMin?: number }>;
}
/** No external optimiser is bundled. Returns null until one is implemented and configured. */
export function getRouteOptimizer(): RouteOptimizer | null {
  return null;
}

export function orderByNearestNeighbour(start: { lat: number; lng: number } | null, stops: Point[]): string[] {
  const withGeo = stops.filter((s) => s.lat !== null && s.lng !== null) as (Point & { lat: number; lng: number })[];
  const without = stops.filter((s) => s.lat === null || s.lng === null).map((s) => s.id);
  const left = [...withGeo];
  const out: string[] = [];
  let cur = start ?? (left[0] ? { lat: left[0].lat, lng: left[0].lng } : null);
  while (left.length && cur) {
    let bi = 0, bd = Infinity;
    left.forEach((s, i) => { const d = haversineKm(cur!, s); if (d < bd) { bd = d; bi = i; } });
    const [n] = left.splice(bi, 1);
    out.push(n.id);
    cur = { lat: n.lat, lng: n.lng };
  }
  return [...out, ...without];
}

export function routeDistanceKm(start: { lat: number; lng: number } | null, ordered: Point[]): number | null {
  const pts = ordered.filter((p) => p.lat !== null && p.lng !== null) as { lat: number; lng: number }[];
  if (pts.length < (start ? 1 : 2)) return null;
  let total = 0, prev = start ?? pts[0];
  for (const p of start ? pts : pts.slice(1)) { total += haversineKm(prev, p); prev = p; }
  return Math.round(total * 10) / 10;
}

export async function createRun(svc: ServiceCtx, input: { name?: string; driverId: string; shipmentIds: string[]; plannedDate?: Date; sort?: "manual" | "nearest" }) {
  await guardMutation(svc.companyId, { feature: "routes" });
  if (!input.shipmentIds.length) throw new AppError("VALIDATION", "Select at least one shipment");
  await assertOwned(svc.db, { driver: input.driverId });
  const driver = await svc.db.driver.findFirstOrThrow({ where: { id: input.driverId } });
  const ships = await svc.db.shipment.findMany({ where: { id: { in: input.shipmentIds } }, select: { id: true, deliveryLat: true, deliveryLng: true, trackingNumber: true } });
  if (ships.length !== new Set(input.shipmentIds).size) throw new AppError("NOT_FOUND", "One or more shipments were not found");
  const results = await assignShipments(svc, input.shipmentIds, input.driverId);
  const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
  if (!okIds.size) throw new AppError("INVALID_STATE", results[0]?.error ?? "No shipment could be assigned");
  const points: Point[] = ships.filter((s) => okIds.has(s.id)).map((s) => ({ id: s.id, lat: s.deliveryLat, lng: s.deliveryLng }));
  const start = driver.currentLat !== null && driver.currentLng !== null ? { lat: driver.currentLat, lng: driver.currentLng } : null;
  let order = input.shipmentIds.filter((i) => okIds.has(i));
  let optimizedBy: string | null = null;
  if (input.sort === "nearest") { order = orderByNearestNeighbour(start, points); optimizedBy = "nearest-neighbour-heuristic"; }
  const ordered = order.map((id) => points.find((p) => p.id === id)!);
  const route = await svc.db.route.create({
    data: {
      name: input.name || `Run ${new Date().toISOString().slice(0, 10)} · ${driver.name}`, driverId: driver.id, vehicleId: driver.vehicleId, branchId: driver.branchId, plannedDate: input.plannedDate ?? new Date(),
      estDistanceKm: routeDistanceKm(start, ordered), optimizedBy, createdById: svc.actor?.id,
      stops: { create: order.map((shipmentId, i) => ({ companyId: svc.companyId, shipmentId, sequence: i + 1, type: "DELIVERY" as const })) },
    } as any,
  });
  await auditFrom(svc, "route.created", "Route", route.id, undefined, { driverId: driver.id, stops: order.length });
  return { route, assigned: okIds.size, failed: results.filter((r) => !r.ok) };
}

export async function setRouteStatus(svc: ServiceCtx, id: string, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
  const r = await svc.db.route.findFirst({ where: { id } });
  if (!r) throw new AppError("NOT_FOUND", "Route not found");
  await svc.db.route.update({ where: { id }, data: { status, ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}), ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) } });
  await auditFrom(svc, "route.status_changed", "Route", id, { status: r.status }, { status });
}
