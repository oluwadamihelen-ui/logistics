/**
 * Shipment application service. All business rules for the shipment lifecycle live here;
 * UI, server actions, the driver app and the public API all go through these functions.
 */
import type { Prisma, ShipmentStatus, DriverStatus } from "@prisma/client";
import { assertOwned, nextSequence, num, prisma } from "../platform/db";
import { AppError } from "../platform/errors";
import { audit } from "../platform/audit";
import { guardMutation, getEntitlements, assertWritable } from "../platform/entitlements";
import { emitSafe } from "../platform/notifications/engine";
import type { ServiceCtx } from "../platform/service";
import { canTransition, ACTIVE_STATUSES, TRANSITIONS, PICKUP_HOLD_DAYS } from "./shipment-status";
import { formatOrderNumber, generateOtp, generateTrackingNumber, hashOtp } from "./tracking";
import { computeQuote, type PricingRuleLike, type QuoteRequest } from "./pricing";
import { ensureCod, recordCodCollected } from "./cod";
import type { FailureInput, ProofInput, ShipmentInput } from "./schemas";
import { sendCustomerMessage } from "./customer-messages";
import { emitWebhook } from "./webhooks";

export type ProofRequirements = { signature: boolean; photo: boolean; otp: boolean; gps: boolean; recipientName: boolean };
const NO_PROOF: ProofRequirements = { signature: false, photo: false, otp: false, gps: false, recipientName: false };

// ───────────────────────── helpers ─────────────────────────

const lc = (s: string) => s.trim().toLowerCase();

/** Match a city/state against the company's zones (zone.areas lists cities/areas/states). */
export async function resolveZoneId(svc: ServiceCtx, city: string, state: string): Promise<string | null> {
  const zones = await svc.db.zone.findMany({ where: { isActive: true }, select: { id: true, areas: true } });
  const c = lc(city), s = lc(state);
  return (zones.find((z) => z.areas.some((a) => lc(a) === c)) ?? zones.find((z) => z.areas.some((a) => lc(a) === s)))?.id ?? null;
}

export async function loadPricingRules(svc: ServiceCtx): Promise<PricingRuleLike[]> {
  const rules = await svc.db.pricingRule.findMany({ where: { isActive: true } });
  return rules.map((r) => ({
    ...r,
    minWeightKg: r.minWeightKg === null ? null : num(r.minWeightKg),
    maxWeightKg: r.maxWeightKg === null ? null : num(r.maxWeightKg),
    baseFee: num(r.baseFee), perKgFee: num(r.perKgFee), includedKg: num(r.includedKg), perKmFee: num(r.perKmFee),
    insurancePercent: num(r.insurancePercent), codFeePercent: num(r.codFeePercent),
    priorityMultiplier: num(r.priorityMultiplier), minimumFee: num(r.minimumFee),
  }));
}

export type QuoteInput = Pick<ShipmentInput, "pickupCity" | "pickupState" | "weightKg" | "priority" | "packageType" | "declaredValue" | "codAmount" | "customerId"> & { deliveryCity?: string; deliveryState?: string };

export async function quoteForInput(svc: ServiceCtx, rawInput: QuoteInput) {
  if (!rawInput.deliveryCity || !rawInput.deliveryState) throw new AppError("VALIDATION", "Enter the delivery city and state to get a price");
  const input = { ...rawInput, deliveryCity: rawInput.deliveryCity, deliveryState: rawInput.deliveryState };
  const [originZoneId, destinationZoneId, rules] = await Promise.all([
    resolveZoneId(svc, input.pickupCity, input.pickupState),
    resolveZoneId(svc, input.deliveryCity, input.deliveryState),
    loadPricingRules(svc),
  ]);
  let customerType = null as QuoteRequest["customerType"];
  let corporateAccountId: string | null = null;
  let discountPercent = 0;
  if (input.customerId) {
    const cust = await svc.db.customer.findFirst({ where: { id: input.customerId }, include: { corporate: true } });
    if (cust) {
      customerType = cust.type;
      corporateAccountId = cust.corporate?.id ?? null;
      discountPercent = num(cust.corporate?.discountPercent);
    }
  }
  const quote = computeQuote(rules, {
    originZoneId, destinationZoneId, weightKg: Number(input.weightKg), priority: input.priority, packageType: input.packageType,
    declaredValue: Number(input.declaredValue), codAmount: Number(input.codAmount), customerType, corporateAccountId, discountPercent,
    interstate: lc(input.pickupState) !== lc(input.deliveryState),
  });
  return { quote, originZoneId, destinationZoneId };
}

export async function addEvent(
  svc: ServiceCtx,
  shipmentId: string,
  e: { status?: ShipmentStatus; type: string; description: string; hubId?: string | null; lat?: number; lng?: number; isPublic?: boolean; metadata?: Prisma.InputJsonValue },
) {
  const ev = await svc.db.shipmentEvent.create({
    data: {
      shipmentId, status: e.status, type: e.type, description: e.description, hubId: e.hubId ?? undefined,
      actorId: svc.actor?.id, actorName: svc.actor?.name ?? "System", lat: e.lat, lng: e.lng,
      isPublic: e.isPublic ?? true, metadata: e.metadata,
    } as any,
  });
  if (e.status && e.isPublic !== false) {
    const sh = await svc.db.shipment.findFirst({ where: { id: shipmentId }, select: { trackingNumber: true, orderNumber: true } });
    if (sh) void emitWebhook(svc.companyId, "shipment.status_changed", { trackingNumber: sh.trackingNumber, orderNumber: sh.orderNumber, status: e.status, description: e.description, at: ev.createdAt });
  }
  return ev;
}

async function getShipmentOrThrow(svc: ServiceCtx, id: string) {
  const s = await svc.db.shipment.findFirst({ where: { id } });
  if (!s) throw new AppError("NOT_FOUND", "Shipment not found");
  return s;
}

export function proofRequirementsFor(settings: { proofRequirements: unknown; highValueProof: unknown; highValueThreshold: unknown } | null, declaredValue: number): ProofRequirements {
  if (!settings) return { ...NO_PROOF, photo: true };
  const hv = num(settings.highValueThreshold as any);
  const src = hv > 0 && declaredValue >= hv ? settings.highValueProof : settings.proofRequirements;
  return { ...NO_PROOF, ...(src as Partial<ProofRequirements>) };
}

/** Keep a driver's availability status consistent with their active workload. */
export async function syncDriverStatus(svc: ServiceCtx, driverId: string | null | undefined) {
  if (!driverId) return;
  const d = await svc.db.driver.findFirst({ where: { id: driverId }, select: { status: true } });
  if (!d || d.status === "OFFLINE" || d.status === "EMERGENCY") return;
  const [delivering, pickups] = await Promise.all([
    svc.db.shipment.count({ where: { driverId, status: "OUT_FOR_DELIVERY" } }),
    svc.db.shipment.count({ where: { driverId, status: { in: ["PICKUP_ASSIGNED"] } } }),
  ]);
  const next: DriverStatus = delivering > 0 ? "ON_DELIVERY" : pickups > 0 ? "ON_PICKUP" : "AVAILABLE";
  if (next !== d.status) await svc.db.driver.update({ where: { id: driverId }, data: { status: next } });
}

// ───────────────────────── create ─────────────────────────

/** Where the shipment goes: the recipient's address, or the chosen collection point. */
export async function resolveDestination(svc: ServiceCtx, input: Pick<ShipmentInput, "deliveryMethod" | "collectionHubId" | "deliveryAddress" | "deliveryCity" | "deliveryState">) {
  if (input.deliveryMethod === "HUB_PICKUP") {
    if (!input.collectionHubId) throw new AppError("VALIDATION", "Choose the hub or pickup point where the recipient will collect");
    const hub = await svc.db.hub.findFirst({ where: { id: input.collectionHubId } });
    if (!hub) throw new AppError("NOT_FOUND", "Collection point not found");
    if (!hub.isActive || !hub.allowsCollection) throw new AppError("INVALID_STATE", `${hub.name} is not open for customer collection`);
    const city = hub.city ?? input.deliveryCity;
    const state = hub.state ?? input.deliveryState;
    if (!city || !state) throw new AppError("INVALID_STATE", `${hub.name} has no city/state set. Add its location in Hubs & branches.`);
    return { method: "HUB_PICKUP" as const, hub, address: `${hub.name} (collection point)${hub.addressLine ? ` — ${hub.addressLine}` : ""}`, city, state, lat: hub.lat ?? undefined, lng: hub.lng ?? undefined };
  }
  if (!input.deliveryAddress || !input.deliveryCity || !input.deliveryState) throw new AppError("VALIDATION", "Delivery address, city and state are required for home delivery", { fields: ["deliveryAddress", "deliveryCity", "deliveryState"] });
  return { method: "HOME_DELIVERY" as const, hub: null, address: input.deliveryAddress, city: input.deliveryCity, state: input.deliveryState, lat: undefined, lng: undefined };
}

export async function createShipment(svc: ServiceCtx, input: ShipmentInput, source: "DASHBOARD" | "PORTAL" | "PUBLIC" | "API" = "DASHBOARD") {
  await guardMutation(svc.companyId, { limit: { key: "shipmentsPerMonth" } });
  await assertOwned(svc.db, { customer: input.customerId, branch: input.branchId });

  if (input.idempotencyKey) {
    const existing = await svc.db.shipment.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing; // safe retry
  }

  const settings = await svc.db.companySettings.findFirst();
  if (!settings) throw new AppError("INVALID_STATE", "Company is not configured yet");
  if (input.codAmount > 0 && !settings.codEnabled) throw new AppError("VALIDATION", "Cash on delivery is disabled for this company");

  const dest = await resolveDestination(svc, input);
  const { quote, originZoneId, destinationZoneId } = await quoteForInput(svc, { ...input, deliveryCity: dest.city, deliveryState: dest.state });
  let deliveryFee = quote.total;
  if (input.deliveryFeeOverride !== undefined) {
    if (svc.actor && !["PORTAL", "PUBLIC"].includes(source)) deliveryFee = input.deliveryFeeOverride;
  } else if (!quote.matched && source !== "DASHBOARD") {
    throw new AppError("NOT_CONFIGURED", "This route has no configured price. Please contact the company.");
  }

  const seq = await nextSequence(svc.companyId, "shipment");
  const orderNumber = formatOrderNumber(settings.shipmentPrefix, seq);
  const proof = proofRequirementsFor(settings, input.declaredValue);
  const expected = new Date(Date.now() + settings.defaultServiceHours * 3600_000);
  const hours = input.priority === "SAME_DAY" ? 12 : input.priority === "URGENT" ? 24 : input.priority === "EXPRESS" ? 36 : settings.defaultServiceHours;
  expected.setTime(Date.now() + Math.min(hours, settings.defaultServiceHours) * 3600_000);

  let shipment;
  for (let attempt = 0; ; attempt++) {
    try {
      shipment = await svc.db.shipment.create({
        data: {
          trackingNumber: generateTrackingNumber(settings.trackingPrefix),
          orderNumber, source, idempotencyKey: input.idempotencyKey,
          customerId: input.customerId, status: "CREATED",
          senderName: input.senderName, senderPhone: input.senderPhone, senderEmail: input.senderEmail,
          pickupAddress: input.pickupAddress, pickupCity: input.pickupCity, pickupState: input.pickupState,
          pickupLat: input.pickupLat, pickupLng: input.pickupLng, pickupZoneId: originZoneId,
          recipientName: input.recipientName, recipientPhone: input.recipientPhone, recipientEmail: input.recipientEmail,
          deliveryAddress: dest.address, deliveryCity: dest.city, deliveryState: dest.state,
          deliveryLat: dest.lat ?? input.deliveryLat, deliveryLng: dest.lng ?? input.deliveryLng, deliveryZoneId: destinationZoneId,
          deliveryMethod: dest.method, collectionHubId: dest.hub?.id,
          packageDescription: input.packageDescription, packageType: input.packageType, weightKg: input.weightKg,
          lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm, quantity: input.quantity,
          declaredValue: input.declaredValue, codAmount: input.codAmount, deliveryFee, feePayer: input.feePayer,
          priceBreakdown: quote as unknown as Prisma.InputJsonValue,
          priority: input.priority, branchId: input.branchId, pickupScheduledAt: input.pickupScheduledAt,
          expectedDeliveryAt: expected, specialInstructions: input.specialInstructions, notes: input.notes,
          proofRequirements: proof as unknown as Prisma.InputJsonValue, createdById: svc.actor?.id,
        } as any,
      });
      break;
    } catch (e: any) {
      // Tracking number collision (astronomically unlikely) — retry with a fresh code.
      if (e?.code === "P2002" && String(e?.meta?.target ?? "").includes("trackingNumber") && attempt < 4) continue;
      throw e;
    }
  }

  await addEvent(svc, shipment.id, { status: "CREATED", type: "created", description: "Shipment created", metadata: { source } });
  await ensureCod(svc, shipment);
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.created", resourceType: "Shipment", resourceId: shipment.id, after: { trackingNumber: shipment.trackingNumber, deliveryFee, codAmount: input.codAmount, source, deliveryMethod: dest.method }, ip: svc.ip, userAgent: svc.userAgent });
  await emitSafe(svc, {
    type: "shipment.created", title: `New shipment ${shipment.trackingNumber}`,
    body: `${input.senderName} → ${input.recipientName} (${dest.method === "HUB_PICKUP" ? `collect at ${dest.hub!.name}` : dest.city})`, entity: { type: "Shipment", id: shipment.id },
    actionUrl: `/shipments/${shipment.id}`, branchId: shipment.branchId,
  });
  if (source === "PORTAL" || source === "PUBLIC") {
    await emitSafe(svc, { type: "pickup.requested", title: `Pickup requested: ${shipment.trackingNumber}`, body: `${input.senderName}, ${input.pickupAddress}`, entity: { type: "Shipment", id: shipment.id }, actionUrl: `/shipments/${shipment.id}`, branchId: shipment.branchId });
  }
  void sendCustomerMessage(svc, shipment, "shipment.created");
  return shipment;
}

// ───────────────────────── transitions ─────────────────────────

export interface TransitionOptions {
  note?: string;
  hubId?: string | null;
  lat?: number;
  lng?: number;
  clientEventId?: string;
  /** Internal: lets completeDelivery/failDelivery reach terminal-ish states. */
  allowSpecial?: boolean;
}

const EVENT_TEXT: Partial<Record<ShipmentStatus, string>> = {
  CONFIRMED: "Shipment confirmed", PICKUP_ASSIGNED: "Pickup assigned", PICKED_UP: "Picked up from sender",
  AT_HUB: "Arrived at hub", SORTING: "Sorting in progress", READY_FOR_DISPATCH: "Ready for dispatch", READY_FOR_PICKUP: "Ready for pickup",
  ASSIGNED_FOR_DELIVERY: "Assigned for delivery", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery attempt failed", RESCHEDULED: "Delivery rescheduled", RETURNING: "Returning to sender",
  RETURNED_TO_HUB: "Returned to hub", RETURNED_TO_SENDER: "Returned to sender", CANCELLED: "Shipment cancelled",
};

export async function transitionShipment(svc: ServiceCtx, shipmentId: string, to: ShipmentStatus, opts: TransitionOptions = {}) {
  assertWritable(await getEntitlements(svc.companyId));
  const s = await getShipmentOrThrow(svc, shipmentId);

  if (opts.clientEventId) {
    const dup = await svc.db.shipmentEvent.findFirst({ where: { shipmentId, metadata: { path: ["clientEventId"], equals: opts.clientEventId } }, select: { id: true } });
    if (dup) return s; // idempotent replay (offline sync)
  }
  if (!opts.allowSpecial && (to === "DELIVERED" || to === "DELIVERY_FAILED")) {
    throw new AppError("INVALID_STATE", to === "DELIVERED" ? "Use proof of delivery to complete a delivery" : "Record a failed delivery with a reason");
  }
  if (s.status === to && to !== "AT_HUB") return s;
  if (!canTransition(s.status, to)) {
    throw new AppError("INVALID_STATE", `Cannot move a shipment from ${s.status} to ${to}`, { allowed: TRANSITIONS[s.status] });
  }
  if (opts.hubId) await assertOwned(svc.db, { hub: opts.hubId });

  const hubPickup = s.deliveryMethod === "HUB_PICKUP";
  if (hubPickup && ["READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"].includes(to)) {
    throw new AppError("INVALID_STATE", "This shipment is collected by the recipient at the pickup point, not delivered by a rider. Use “Ready for pickup”.");
  }
  if (!hubPickup && to === "READY_FOR_PICKUP") throw new AppError("INVALID_STATE", "Only shipments booked for hub pickup can be marked ready for pickup");
  if (to === "READY_FOR_PICKUP") {
    const here = opts.hubId ?? s.currentHubId;
    if (!here) throw new AppError("VALIDATION", "Record which hub the shipment is at first (Arrived at hub)");
    if (s.collectionHubId && here !== s.collectionHubId) {
      const target = await svc.db.hub.findFirst({ where: { id: s.collectionHubId }, select: { name: true } });
      throw new AppError("INVALID_STATE", `The recipient will collect at ${target?.name ?? "the chosen pickup point"}. Move the shipment there (Arrived at hub) before marking it ready.`);
    }
  }

  const data: Prisma.ShipmentUncheckedUpdateInput = { status: to };
  const now = new Date();
  if (to === "PICKED_UP") data.pickedUpAt = now;
  if (to === "CANCELLED") data.cancelledAt = now;
  if (to === "AT_HUB" || to === "RETURNED_TO_HUB") { if (opts.hubId) data.currentHubId = opts.hubId; }
  if (to === "AT_HUB" || to === "READY_FOR_DISPATCH" || to === "READY_FOR_PICKUP" || to === "RETURNED_TO_HUB") { data.driverId = null; data.vehicleId = null; data.driverAccepted = false; }
  let collectionCode: string | null = null;
  if (to === "READY_FOR_PICKUP") {
    collectionCode = generateOtp();
    data.otpHash = hashOtp(s.id, collectionCode);
    data.otpExpiresAt = new Date(Date.now() + (PICKUP_HOLD_DAYS + 7) * 86400_000);
    data.readyForPickupAt = now;
    if (opts.hubId) data.currentHubId = opts.hubId;
  }
  if (to === "OUT_FOR_DELIVERY") {
    const reqs = (s.proofRequirements as ProofRequirements | null) ?? NO_PROOF;
    if (reqs.otp && !s.otpHash) {
      const otp = generateOtp();
      data.otpHash = hashOtp(s.id, otp);
      data.otpExpiresAt = new Date(Date.now() + 24 * 3600_000);
      void sendCustomerMessage(svc, s, "shipment.otp", { otp });
    }
  }
  if (to === "RESCHEDULED") data.rescheduledFor = null;

  // Optimistic concurrency: only update if status is still what we validated.
  const res = await svc.db.shipment.updateMany({ where: { id: s.id, status: s.status }, data });
  if (res.count === 0) throw new AppError("CONFLICT", "This shipment was just updated by someone else. Refresh and try again.");

  const hub = opts.hubId ? await svc.db.hub.findFirst({ where: { id: opts.hubId }, select: { name: true } }) : null;
  await addEvent(svc, s.id, {
    status: to, type: "status", hubId: opts.hubId, lat: opts.lat, lng: opts.lng,
    description: `${EVENT_TEXT[to] ?? to}${hub ? ` — ${hub.name}` : ""}${opts.note ? `: ${opts.note}` : ""}`,
    metadata: { from: s.status, ...(opts.clientEventId ? { clientEventId: opts.clientEventId } : {}) },
  });
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.status_changed", resourceType: "Shipment", resourceId: s.id, before: { status: s.status }, after: { status: to }, ip: svc.ip, userAgent: svc.userAgent });

  if (to === "CANCELLED") {
    await svc.db.codTransaction.deleteMany({ where: { shipmentId: s.id, status: "PENDING", amountCollected: 0 } });
    await emitSafe(svc, { type: "shipment.cancelled", title: `Shipment ${s.trackingNumber} cancelled`, body: opts.note ?? "Shipment was cancelled", entity: { type: "Shipment", id: s.id }, actionUrl: `/shipments/${s.id}`, branchId: s.branchId });
  }
  if (to === "RETURNED_TO_SENDER" || to === "RETURNED_TO_HUB") {
    await emitSafe(svc, { type: "shipment.returned", title: `Shipment ${s.trackingNumber} ${to === "RETURNED_TO_HUB" ? "returned to hub" : "returned to sender"}`, body: opts.note ?? "", entity: { type: "Shipment", id: s.id }, actionUrl: `/shipments/${s.id}`, branchId: s.branchId });
  }
  if (to === "OUT_FOR_DELIVERY") void sendCustomerMessage(svc, s, "shipment.out_for_delivery");
  if (to === "READY_FOR_PICKUP" && collectionCode) {
    const point = s.collectionHubId ? await svc.db.hub.findFirst({ where: { id: s.collectionHubId }, select: { name: true, addressLine: true, city: true } }) : null;
    void sendCustomerMessage(svc, s, "shipment.ready_for_pickup", { otp: collectionCode, pickupPoint: point ? `${point.name}${point.addressLine ? `, ${point.addressLine}` : ""}${point.city ? `, ${point.city}` : ""}` : "the pickup point" });
    await emitSafe(svc, { type: "shipment.ready_for_pickup", title: `Ready for pickup: ${s.trackingNumber}`, body: `${s.recipientName} can collect at ${point?.name ?? "the pickup point"}`, entity: { type: "Shipment", id: s.id }, actionUrl: `/shipments/${s.id}`, branchId: s.branchId });
  }
  await syncDriverStatus(svc, s.driverId);
  return svc.db.shipment.findFirst({ where: { id: s.id } });
}

// ───────────────────────── assignment ─────────────────────────

const ASSIGNABLE: Record<string, ShipmentStatus> = {
  CONFIRMED: "PICKUP_ASSIGNED",
  PICKUP_ASSIGNED: "PICKUP_ASSIGNED",
  PICKED_UP: "ASSIGNED_FOR_DELIVERY",
  READY_FOR_DISPATCH: "ASSIGNED_FOR_DELIVERY",
  ASSIGNED_FOR_DELIVERY: "ASSIGNED_FOR_DELIVERY",
  RESCHEDULED: "ASSIGNED_FOR_DELIVERY",
  DELIVERY_FAILED: "ASSIGNED_FOR_DELIVERY",
};

export async function assignShipments(svc: ServiceCtx, shipmentIds: string[], driverId: string, vehicleId?: string | null) {
  assertWritable(await getEntitlements(svc.companyId));
  if (!shipmentIds.length) throw new AppError("VALIDATION", "Select at least one shipment");
  if (shipmentIds.length > 200) throw new AppError("VALIDATION", "Assign at most 200 shipments at a time");
  const driver = await svc.db.driver.findFirst({ where: { id: driverId } });
  if (!driver) throw new AppError("NOT_FOUND", "Driver not found");
  if (!driver.isActive) throw new AppError("INVALID_STATE", "Driver is inactive");
  if (driver.status === "EMERGENCY") throw new AppError("INVALID_STATE", "Driver has an active emergency");
  const vId = vehicleId === undefined ? driver.vehicleId : vehicleId;
  if (vId) {
    await assertOwned(svc.db, { vehicle: vId });
    const v = await svc.db.vehicle.findFirst({ where: { id: vId } });
    if (v && (v.status === "MAINTENANCE" || v.status === "INACTIVE" || !v.isActive)) throw new AppError("INVALID_STATE", "Vehicle is not available");
  }

  const shipments = await svc.db.shipment.findMany({ where: { id: { in: shipmentIds } } });
  if (shipments.length !== new Set(shipmentIds).size) throw new AppError("NOT_FOUND", "One or more shipments were not found");

  const results: { id: string; ok: boolean; error?: string }[] = [];
  const previousDrivers = new Set<string>();
  for (const s of shipments) {
    const target = ASSIGNABLE[s.status];
    if (!target) { results.push({ id: s.id, ok: false, error: `Cannot assign a shipment that is ${s.status}` }); continue; }
    if (s.deliveryMethod === "HUB_PICKUP" && target === "ASSIGNED_FOR_DELIVERY") { results.push({ id: s.id, ok: false, error: "Hub-pickup shipments are collected by the recipient — move it to the pickup point instead of assigning a rider" }); continue; }
    const res = await svc.db.shipment.updateMany({
      where: { id: s.id, status: s.status },
      data: { status: target, driverId: driver.id, vehicleId: vId ?? null, driverAccepted: false },
    });
    if (res.count === 0) { results.push({ id: s.id, ok: false, error: "Changed by someone else" }); continue; }
    if (s.driverId && s.driverId !== driver.id) previousDrivers.add(s.driverId);
    const reassigned = !!s.driverId && s.driverId !== driver.id;
    await addEvent(svc, s.id, {
      status: target, type: reassigned ? "reassigned" : "assigned", isPublic: target !== s.status || !reassigned,
      description: `${target === "PICKUP_ASSIGNED" ? "Pickup" : "Delivery"} ${reassigned ? "reassigned" : "assigned"} to ${driver.name}`,
      metadata: { driverId: driver.id, previousDriverId: s.driverId },
    });
    await audit({ companyId: svc.companyId, actor: svc.actor, action: reassigned ? "shipment.reassigned" : "shipment.assigned", resourceType: "Shipment", resourceId: s.id, before: { driverId: s.driverId, status: s.status }, after: { driverId: driver.id, status: target }, ip: svc.ip, userAgent: svc.userAgent });
    results.push({ id: s.id, ok: true });
  }
  const okCount = results.filter((r) => r.ok).length;
  if (okCount && driver.userId) {
    await emitSafe(svc, {
      type: "shipment.assigned", title: `${okCount} shipment${okCount > 1 ? "s" : ""} assigned to you`,
      body: okCount === 1 ? `Tracking ${shipments.find((s) => s.id === results.find((r) => r.ok)!.id)?.trackingNumber}` : "Open the driver app to view your tasks.",
      userIds: [driver.userId], actionUrl: "/driver", dedupeKey: `assign:${driver.id}:${Date.now() >> 14}`,
    });
  }
  await syncDriverStatus(svc, driver.id);
  for (const id of previousDrivers) await syncDriverStatus(svc, id);
  return results;
}

export async function unassignShipment(svc: ServiceCtx, shipmentId: string) {
  const s = await getShipmentOrThrow(svc, shipmentId);
  const back: Partial<Record<ShipmentStatus, ShipmentStatus>> = { PICKUP_ASSIGNED: "CONFIRMED", ASSIGNED_FOR_DELIVERY: "READY_FOR_DISPATCH" };
  const target = back[s.status];
  if (!target) throw new AppError("INVALID_STATE", `A ${s.status} shipment cannot be unassigned`);
  const prev = s.driverId;
  const res = await svc.db.shipment.updateMany({ where: { id: s.id, status: s.status }, data: { status: target, driverId: null, vehicleId: null, driverAccepted: false } });
  if (res.count === 0) throw new AppError("CONFLICT", "Shipment changed — refresh and retry");
  await addEvent(svc, s.id, { status: target, type: "unassigned", description: "Driver unassigned", isPublic: false });
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.unassigned", resourceType: "Shipment", resourceId: s.id, before: { driverId: prev }, after: { driverId: null }, ip: svc.ip });
  await syncDriverStatus(svc, prev);
}

export async function driverAcceptShipment(svc: ServiceCtx, shipmentId: string, driverId: string) {
  const s = await getShipmentOrThrow(svc, shipmentId);
  if (s.driverId !== driverId) throw new AppError("FORBIDDEN", "This shipment is not assigned to you");
  if (s.driverAccepted) return s;
  await svc.db.shipment.update({ where: { id: s.id }, data: { driverAccepted: true } });
  await addEvent(svc, s.id, { type: "accepted", description: "Driver accepted the task", isPublic: false });
  return { ...s, driverAccepted: true };
}

// ───────────────────────── delivery outcome ─────────────────────────

/** Complete a delivery after validating the company's required proof-of-delivery methods. */
export async function completeDelivery(svc: ServiceCtx, shipmentId: string, proof: ProofInput, opts: { driverId?: string | null } = {}) {
  assertWritable(await getEntitlements(svc.companyId));
  const s = await getShipmentOrThrow(svc, shipmentId);
  if (s.status === "DELIVERED") return s; // idempotent
  if (opts.driverId !== undefined && s.driverId !== opts.driverId) throw new AppError("FORBIDDEN", "This shipment is not assigned to you");
  if (s.status !== "OUT_FOR_DELIVERY") throw new AppError("INVALID_STATE", "Shipment must be out for delivery before it can be delivered");

  const req = { ...NO_PROOF, ...((s.proofRequirements as Partial<ProofRequirements> | null) ?? {}) };
  const missing: string[] = [];
  if (req.recipientName && !proof.recipientName) missing.push("recipient name");
  if (req.signature && !proof.signatureData) missing.push("signature");
  if (req.photo && !proof.photoUrl) missing.push("delivery photo");
  if (req.gps && (proof.lat === undefined || proof.lng === undefined)) missing.push("GPS location");
  if (req.otp && !proof.otp) missing.push("OTP");
  if (missing.length) throw new AppError("VALIDATION", `Proof required: ${missing.join(", ")}`, { missing });

  let otpVerified = false;
  if (req.otp) {
    if (!s.otpHash || !s.otpExpiresAt || s.otpExpiresAt < new Date()) throw new AppError("VALIDATION", "OTP has expired. Ask dispatch to resend it.");
    if (hashOtp(s.id, proof.otp!) !== s.otpHash) {
      await addEvent(svc, s.id, { type: "otp_failed", description: "Incorrect OTP entered", isPublic: false });
      throw new AppError("VALIDATION", "Incorrect OTP");
    }
    otpVerified = true;
  }

  const cod = num(s.codAmount);
  const collected = proof.codCollected ?? (cod > 0 ? cod : 0);
  if (cod > 0 && proof.codCollected === undefined) throw new AppError("VALIDATION", "Enter the cash amount collected");

  const claimed = await svc.db.shipment.updateMany({
    where: { id: s.id, status: "OUT_FOR_DELIVERY" },
    data: { status: "DELIVERED", deliveredAt: new Date(), attemptCount: { increment: 1 }, otpHash: null },
  });
  if (claimed.count === 0) return getShipmentOrThrow(svc, s.id);

  await svc.db.proofOfDelivery.create({
    data: {
      shipmentId: s.id, driverId: s.driverId, recipientName: proof.recipientName, signatureData: proof.signatureData,
      photoUrl: proof.photoUrl, otpVerified, lat: proof.lat, lng: proof.lng, clientEventId: proof.clientEventId,
    } as any,
  }).catch((e: any) => { if (e?.code !== "P2002") throw e; });
  await svc.db.deliveryAttempt.create({
    data: { shipmentId: s.id, driverId: s.driverId, attemptNo: s.attemptCount + 1, outcome: "DELIVERED", lat: proof.lat, lng: proof.lng } as any,
  });
  await addEvent(svc, s.id, {
    status: "DELIVERED", type: "delivered", lat: proof.lat, lng: proof.lng,
    description: `Delivered${proof.recipientName ? ` to ${proof.recipientName}` : ""}`,
    metadata: { ...(proof.clientEventId ? { clientEventId: proof.clientEventId } : {}), proof: { otp: otpVerified, signature: !!proof.signatureData, photo: !!proof.photoUrl, gps: proof.lat !== undefined } },
  });
  if (cod > 0) {
    await ensureCod(svc, s);
    const rec = await recordCodCollected(svc, s.id, s.driverId, collected);
    if (rec?.status === "DISPUTED") {
      await emitSafe(svc, { type: "cod.mismatch", title: `COD mismatch on ${s.trackingNumber}`, body: `Collected ${collected} but ${cod} was due.`, entity: { type: "Shipment", id: s.id }, actionUrl: `/cod`, branchId: s.branchId });
    }
  }
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.delivered", resourceType: "Shipment", resourceId: s.id, after: { codCollected: collected, otpVerified }, ip: svc.ip, userAgent: svc.userAgent });
  await emitSafe(svc, { type: "shipment.delivered", title: `Delivered: ${s.trackingNumber}`, body: `${s.recipientName}, ${s.deliveryCity}`, entity: { type: "Shipment", id: s.id }, actionUrl: `/shipments/${s.id}`, branchId: s.branchId });
  void sendCustomerMessage(svc, s, "shipment.delivered");
  await syncDriverStatus(svc, s.driverId);
  return getShipmentOrThrow(svc, s.id);
}

/**
 * Hand a shipment over to the recipient at the collection point. Requires the collection code the recipient was
 * sent, unless a manager overrides it with a recorded reason (e.g. lost phone, ID verified in person).
 * Cash due on collection is taken at the counter, so it goes straight to the company (no driver float).
 */
export async function collectShipment(
  svc: ServiceCtx, shipmentId: string,
  input: { code?: string; collectorName: string; idNote?: string; codCollected?: number; overrideReason?: string },
  opts: { canOverride?: boolean } = {},
) {
  assertWritable(await getEntitlements(svc.companyId));
  const s = await getShipmentOrThrow(svc, shipmentId);
  if (s.status === "DELIVERED" && s.deliveryMethod === "HUB_PICKUP") return s; // idempotent
  if (s.status !== "READY_FOR_PICKUP") throw new AppError("INVALID_STATE", "Only shipments that are ready for pickup can be handed over");
  if (!input.collectorName.trim()) throw new AppError("VALIDATION", "Enter the name of the person collecting");

  let overridden = false;
  if (input.code) {
    if (!s.otpHash || !s.otpExpiresAt || s.otpExpiresAt < new Date()) throw new AppError("VALIDATION", "The collection code has expired. Generate a new one.");
    if (hashOtp(s.id, input.code) !== s.otpHash) {
      await addEvent(svc, s.id, { type: "collection_code_failed", description: "Incorrect collection code entered", isPublic: false });
      throw new AppError("VALIDATION", "Incorrect collection code");
    }
  } else if (input.overrideReason?.trim()) {
    if (!opts.canOverride) throw new AppError("FORBIDDEN", "Only a manager can hand over without the collection code");
    overridden = true;
  } else {
    throw new AppError("VALIDATION", "Enter the collection code, or have a manager override with a reason");
  }

  const cod = num(s.codAmount);
  if (cod > 0 && input.codCollected === undefined) throw new AppError("VALIDATION", "Enter the cash amount collected");
  const collected = cod > 0 ? input.codCollected! : 0;

  const claimed = await svc.db.shipment.updateMany({
    where: { id: s.id, status: "READY_FOR_PICKUP" },
    data: { status: "DELIVERED", deliveredAt: new Date(), otpHash: null, collectedByName: input.collectorName.trim() },
  });
  if (claimed.count === 0) return getShipmentOrThrow(svc, s.id);

  await svc.db.proofOfDelivery.create({ data: { shipmentId: s.id, recipientName: input.collectorName.trim(), otpVerified: !overridden } as any }).catch((e: any) => { if (e?.code !== "P2002") throw e; });
  const hub = s.collectionHubId ? await svc.db.hub.findFirst({ where: { id: s.collectionHubId }, select: { name: true } }) : null;
  await addEvent(svc, s.id, {
    status: "DELIVERED", type: "collected", hubId: s.collectionHubId,
    description: `Collected by ${input.collectorName.trim()}${hub ? ` at ${hub.name}` : ""}`,
    metadata: { codeVerified: !overridden, ...(input.idNote ? { idNote: input.idNote } : {}), ...(overridden ? { overrideReason: input.overrideReason } : {}) },
  });
  if (cod > 0) {
    await ensureCod(svc, s);
    const rec = await recordCodCollected(svc, s.id, null, collected);
    if (rec?.status === "DISPUTED") {
      await emitSafe(svc, { type: "cod.mismatch", title: `COD mismatch on ${s.trackingNumber}`, body: `Collected ${collected} but ${cod} was due.`, entity: { type: "Shipment", id: s.id }, actionUrl: `/cod`, branchId: s.branchId });
    } else if (rec) {
      // Cash taken at the counter is already with the company: record it as remitted.
      await svc.db.codTransaction.update({ where: { id: rec.id }, data: { amountRemitted: collected, remittedAt: new Date() } });
    }
  }
  await audit({ companyId: svc.companyId, actor: svc.actor, action: overridden ? "shipment.collected_override" : "shipment.collected", resourceType: "Shipment", resourceId: s.id, after: { collector: input.collectorName, codCollected: collected, ...(overridden ? { overrideReason: input.overrideReason } : {}) }, ip: svc.ip, userAgent: svc.userAgent });
  await emitSafe(svc, { type: "shipment.delivered", title: `Collected: ${s.trackingNumber}`, body: `${input.collectorName}${hub ? ` at ${hub.name}` : ""}`, entity: { type: "Shipment", id: s.id }, actionUrl: `/shipments/${s.id}`, branchId: s.branchId });
  void sendCustomerMessage(svc, s, "shipment.delivered");
  return getShipmentOrThrow(svc, s.id);
}

export async function failDelivery(svc: ServiceCtx, shipmentId: string, input: FailureInput, opts: { driverId?: string | null } = {}) {
  assertWritable(await getEntitlements(svc.companyId));
  const s = await getShipmentOrThrow(svc, shipmentId);
  if (opts.driverId !== undefined && s.driverId !== opts.driverId) throw new AppError("FORBIDDEN", "This shipment is not assigned to you");
  if (input.clientEventId) {
    const dup = await svc.db.shipmentEvent.findFirst({ where: { shipmentId, metadata: { path: ["clientEventId"], equals: input.clientEventId } }, select: { id: true } });
    if (dup) return s;
  }
  if (s.status !== "OUT_FOR_DELIVERY") throw new AppError("INVALID_STATE", "Only shipments that are out for delivery can fail");

  const settings = await svc.db.companySettings.findFirst({ select: { maxDeliveryAttempts: true } });
  const attemptNo = s.attemptCount + 1;
  const claimed = await svc.db.shipment.updateMany({ where: { id: s.id, status: "OUT_FOR_DELIVERY" }, data: { status: "DELIVERY_FAILED", attemptCount: attemptNo } });
  if (claimed.count === 0) throw new AppError("CONFLICT", "Shipment changed — refresh and retry");

  const exhausted = attemptNo >= (settings?.maxDeliveryAttempts ?? 3);
  await svc.db.deliveryAttempt.create({
    data: { shipmentId: s.id, driverId: s.driverId, attemptNo, outcome: "FAILED", failureReason: input.reason, notes: input.notes, lat: input.lat, lng: input.lng, rescheduledFor: input.rescheduleFor, resolution: "PENDING" } as any,
  });
  await addEvent(svc, s.id, {
    status: "DELIVERY_FAILED", type: "delivery_failed", lat: input.lat, lng: input.lng,
    description: `Delivery attempt ${attemptNo} failed: ${input.reason.replace(/_/g, " ").toLowerCase()}${input.notes ? ` — ${input.notes}` : ""}`,
    metadata: { reason: input.reason, attemptNo, ...(input.clientEventId ? { clientEventId: input.clientEventId } : {}) },
  });
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.delivery_failed", resourceType: "Shipment", resourceId: s.id, after: { reason: input.reason, attemptNo }, ip: svc.ip });
  await emitSafe(svc, {
    type: "shipment.delivery_failed", title: `Delivery failed for ${s.trackingNumber}`,
    body: `${input.reason.replace(/_/g, " ").toLowerCase()} (attempt ${attemptNo}${exhausted ? ", attempts exhausted — decide return or retry" : ""})`,
    entity: { type: "Shipment", id: s.id }, actionUrl: `/shipments/${s.id}`, branchId: s.branchId, dedupeKey: `fail:${s.id}:${attemptNo}`,
  });
  void sendCustomerMessage(svc, s, "shipment.delivery_failed");
  await syncDriverStatus(svc, s.driverId);

  if (input.rescheduleFor) await resolveFailure(svc, s.id, { resolution: "RESCHEDULED", rescheduleFor: input.rescheduleFor });
  return getShipmentOrThrow(svc, s.id);
}

/** Dispatcher decision after a failed attempt. */
export async function resolveFailure(
  svc: ServiceCtx, shipmentId: string,
  d: { resolution: "RESCHEDULED" | "RETRY" | "RETURN_TO_HUB" | "RETURN_TO_SENDER"; rescheduleFor?: Date; note?: string },
) {
  const s = await getShipmentOrThrow(svc, shipmentId);
  if (!["DELIVERY_FAILED", "RESCHEDULED", "RETURNED_TO_HUB"].includes(s.status)) throw new AppError("INVALID_STATE", "No failed delivery to resolve");
  const lastAttempt = await svc.db.deliveryAttempt.findFirst({ where: { shipmentId, outcome: "FAILED" }, orderBy: { createdAt: "desc" } });
  if (lastAttempt) await svc.db.deliveryAttempt.update({ where: { id: lastAttempt.id }, data: { resolution: d.resolution, rescheduledFor: d.rescheduleFor ?? lastAttempt.rescheduledFor } });

  switch (d.resolution) {
    case "RESCHEDULED": {
      if (!d.rescheduleFor || d.rescheduleFor.getTime() < Date.now() - 60_000) throw new AppError("VALIDATION", "Choose a future date to reschedule");
      if (s.status === "DELIVERY_FAILED") await transitionShipment(svc, s.id, "RESCHEDULED", { note: d.note });
      await svc.db.shipment.update({ where: { id: s.id }, data: { rescheduledFor: d.rescheduleFor, expectedDeliveryAt: d.rescheduleFor } });
      await addEvent(svc, s.id, { type: "rescheduled", description: `Delivery rescheduled for ${d.rescheduleFor.toISOString().slice(0, 10)}` });
      break;
    }
    case "RETRY":
      if (s.status === "DELIVERY_FAILED") await transitionShipment(svc, s.id, "READY_FOR_DISPATCH", { note: d.note ?? "Retry delivery" });
      else if (s.status === "RETURNED_TO_HUB") await transitionShipment(svc, s.id, "READY_FOR_DISPATCH", { note: d.note ?? "Retry delivery" });
      break;
    case "RETURN_TO_HUB":
    case "RETURN_TO_SENDER":
      if (s.status !== "RETURNING") await transitionShipment(svc, s.id, "RETURNING", { note: d.note });
      if (d.resolution === "RETURN_TO_SENDER" ) { /* final step recorded by recordReturned */ }
      break;
  }
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.failure_resolved", resourceType: "Shipment", resourceId: s.id, after: { resolution: d.resolution }, ip: svc.ip });
  return getShipmentOrThrow(svc, s.id);
}

/** Generate a fresh OTP for a shipment (staff-only; the plaintext is returned once, never stored). */
export async function regenerateOtp(svc: ServiceCtx, shipmentId: string) {
  const s = await getShipmentOrThrow(svc, shipmentId);
  if (!ACTIVE_STATUSES.includes(s.status)) throw new AppError("INVALID_STATE", "Shipment is closed");
  const otp = generateOtp();
  await svc.db.shipment.update({ where: { id: s.id }, data: { otpHash: hashOtp(s.id, otp), otpExpiresAt: new Date(Date.now() + 24 * 3600_000) } });
  const sent = s.status === "READY_FOR_PICKUP"
    ? await (async () => {
        const point = s.collectionHubId ? await svc.db.hub.findFirst({ where: { id: s.collectionHubId }, select: { name: true, addressLine: true, city: true } }) : null;
        return sendCustomerMessage(svc, s, "shipment.ready_for_pickup", { otp, pickupPoint: point ? `${point.name}${point.addressLine ? `, ${point.addressLine}` : ""}${point.city ? `, ${point.city}` : ""}` : "the pickup point" });
      })()
    : await sendCustomerMessage(svc, s, "shipment.otp", { otp });
  await audit({ companyId: svc.companyId, actor: svc.actor, action: "shipment.otp_regenerated", resourceType: "Shipment", resourceId: s.id, ip: svc.ip });
  return { otp, sentToRecipient: sent };
}

// ───────────────────────── queries ─────────────────────────

export interface ShipmentFilters {
  q?: string;
  status?: ShipmentStatus[];
  driverId?: string;
  branchId?: string;
  customerId?: string;
  priority?: string;
  codOnly?: boolean;
  unassigned?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export function buildShipmentWhere(f: ShipmentFilters): Prisma.ShipmentWhereInput {
  const where: Prisma.ShipmentWhereInput = {};
  if (f.q) {
    const q = f.q.trim();
    where.OR = [
      { trackingNumber: { startsWith: q.toUpperCase().replace(/[\s-]/g, "") } },
      { orderNumber: { contains: q, mode: "insensitive" } },
      { recipientPhone: { contains: q } },
      { senderPhone: { contains: q } },
      { recipientName: { contains: q, mode: "insensitive" } },
      { senderName: { contains: q, mode: "insensitive" } },
    ];
  }
  if (f.status?.length) where.status = { in: f.status };
  if (f.driverId) where.driverId = f.driverId;
  if (f.unassigned) where.driverId = null;
  if (f.branchId) where.branchId = f.branchId;
  if (f.customerId) where.customerId = f.customerId;
  if (f.priority) where.priority = f.priority as any;
  if (f.codOnly) where.codAmount = { gt: 0 };
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  return where;
}

export async function listShipments(svc: ServiceCtx, f: ShipmentFilters) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where = buildShipmentWhere(f);
  const [rows, total] = await Promise.all([
    svc.db.shipment.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, trackingNumber: true, orderNumber: true, status: true, priority: true, recipientName: true, recipientPhone: true,
        deliveryCity: true, deliveryState: true, senderName: true, codAmount: true, deliveryFee: true, createdAt: true, expectedDeliveryAt: true,
        driver: { select: { id: true, name: true } }, branch: { select: { name: true } },
      },
    }),
    svc.db.shipment.count({ where }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getShipmentDetail(svc: ServiceCtx, id: string) {
  const s = await svc.db.shipment.findFirst({
    where: { id },
    include: {
      driver: { select: { id: true, name: true, phone: true, kind: true } },
      vehicle: { select: { id: true, registrationNumber: true, type: true } },
      branch: { select: { id: true, name: true } },
      currentHub: { select: { id: true, name: true } },
      collectionHub: { select: { id: true, name: true, openingHours: true } },
      customer: { select: { id: true, name: true, phone: true } },
      events: { orderBy: { createdAt: "asc" } },
      attempts: { orderBy: { createdAt: "asc" }, include: { driver: { select: { name: true } } } },
      proof: true,
      cod: true,
      items: true,
    },
  });
  if (!s) throw new AppError("NOT_FOUND", "Shipment not found");
  return s;
}

/** Public tracking: resolves tenant from the tracking number and exposes only customer-safe data. */
export async function getPublicTracking(trackingNumber: string) {
  const s = await prisma.shipment.findUnique({
    where: { trackingNumber },
    select: {
      id: true, trackingNumber: true, status: true, pickupCity: true, pickupState: true, deliveryCity: true, deliveryState: true,
      expectedDeliveryAt: true, deliveredAt: true, packageType: true, priority: true, driverId: true,
      deliveryMethod: true, readyForPickupAt: true, collectionHub: { select: { name: true, addressLine: true, city: true, state: true, openingHours: true } },
      driver: { select: { name: true, kind: true } },
      proof: { select: { recipientName: true, capturedAt: true, photoUrl: true, signatureData: true } },
      events: { where: { isPublic: true }, orderBy: { createdAt: "asc" }, select: { description: true, status: true, createdAt: true } },
      companyId: true,
    },
  });
  if (!s) return null;
  const company = await prisma.company.findUnique({ where: { id: s.companyId }, select: { name: true, logoUrl: true, phone: true } });
  const showDriver = s.status === "OUT_FOR_DELIVERY" && s.driver;
  const delivered = s.status === "DELIVERED";
  return {
    trackingNumber: s.trackingNumber, status: s.status,
    origin: `${s.pickupCity}, ${s.pickupState}`, destination: `${s.deliveryCity}, ${s.deliveryState}`,
    expectedDeliveryAt: s.expectedDeliveryAt, deliveredAt: s.deliveredAt, priority: s.priority, packageType: s.packageType,
    deliveryMethod: s.deliveryMethod,
    pickupPoint: s.deliveryMethod === "HUB_PICKUP" && s.collectionHub ? { name: s.collectionHub.name, address: [s.collectionHub.addressLine, s.collectionHub.city, s.collectionHub.state].filter(Boolean).join(", "), openingHours: s.collectionHub.openingHours, readySince: s.readyForPickupAt } : null,
    driver: showDriver ? { firstName: s.driver!.name.split(" ")[0], kind: s.driver!.kind } : null,
    proof: delivered && s.proof ? { recipientName: s.proof.recipientName, at: s.proof.capturedAt, hasPhoto: !!s.proof.photoUrl, hasSignature: !!s.proof.signatureData } : null,
    timeline: s.events,
    company: company ? { name: company.name, logoUrl: company.logoUrl, phone: company.phone } : null,
  };
}
