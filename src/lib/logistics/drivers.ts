import bcrypt from "bcryptjs";
import type { DriverStatus, Prisma } from "@prisma/client";
import { assertOwned, num, prisma } from "../platform/db";
import { AppError } from "../platform/errors";
import { auditFrom } from "../platform/audit";
import { guardMutation } from "../platform/entitlements";
import { validatePassword, BCRYPT_ROUNDS } from "../platform/provisioning";
import { emitSafe } from "../platform/notifications/engine";
import type { ServiceCtx } from "../platform/service";

export interface DriverInput {
  name: string; phone: string; email?: string; kind: "DRIVER" | "RIDER"; branchId?: string; licenseNumber?: string; licenseExpiry?: Date;
  payModel: "PER_DELIVERY" | "PER_TRIP" | "PERCENTAGE" | "SALARY" | "HYBRID"; payRates?: { perDelivery?: number; perTrip?: number; percentage?: number; salary?: number };
  vehicleId?: string; loginEmail?: string; loginPassword?: string;
}

export async function createDriver(svc: ServiceCtx, input: DriverInput) {
  await guardMutation(svc.companyId, { limit: { key: "drivers" } });
  await assertOwned(svc.db, { branch: input.branchId, vehicle: input.vehicleId });
  if (input.vehicleId && (await svc.db.driver.findFirst({ where: { vehicleId: input.vehicleId } }))) throw new AppError("CONFLICT", "That vehicle is already assigned to another driver");
  let userId: string | undefined;
  if (input.loginEmail) {
    if (!input.loginPassword) throw new AppError("VALIDATION", "Set a password for the driver login");
    validatePassword(input.loginPassword);
    const email = input.loginEmail.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("CONFLICT", "A user with that email already exists");
    const u = await prisma.user.create({ data: { email, name: input.name, phone: input.phone, passwordHash: await bcrypt.hash(input.loginPassword, BCRYPT_ROUNDS), role: input.kind, companyId: svc.companyId, branchId: input.branchId } });
    userId = u.id;
  }
  const d = await svc.db.driver.create({
    data: { userId, name: input.name, phone: input.phone, email: input.email, kind: input.kind, branchId: input.branchId, licenseNumber: input.licenseNumber, licenseExpiry: input.licenseExpiry, payModel: input.payModel, payRates: (input.payRates ?? {}) as Prisma.InputJsonValue, vehicleId: input.vehicleId, status: "OFFLINE" } as any,
  });
  await auditFrom(svc, "driver.created", "Driver", d.id, undefined, { name: d.name, kind: d.kind, hasLogin: !!userId });
  return d;
}

export async function updateDriver(svc: ServiceCtx, id: string, input: Partial<DriverInput> & { isActive?: boolean }) {
  await guardMutation(svc.companyId);
  const before = await svc.db.driver.findFirst({ where: { id } });
  if (!before) throw new AppError("NOT_FOUND", "Driver not found");
  await assertOwned(svc.db, { branch: input.branchId, vehicle: input.vehicleId });
  if (input.vehicleId && input.vehicleId !== before.vehicleId && (await svc.db.driver.findFirst({ where: { vehicleId: input.vehicleId, id: { not: id } } }))) throw new AppError("CONFLICT", "That vehicle is already assigned to another driver");
  const { payRates, ...rest } = input;
  delete (rest as any).loginEmail; delete (rest as any).loginPassword;
  const d = await svc.db.driver.update({ where: { id }, data: { ...rest, ...(payRates ? { payRates: payRates as Prisma.InputJsonValue } : {}) } as any });
  if (input.isActive === false) {
    const open = await svc.db.shipment.count({ where: { driverId: id, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } } });
    if (open) throw new AppError("INVALID_STATE", `Reassign ${open} active shipment(s) before deactivating this driver`);
    if (before.userId) await prisma.user.update({ where: { id: before.userId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
    await svc.db.driver.update({ where: { id }, data: { status: "OFFLINE" } });
  } else if (input.isActive === true && before.userId) await prisma.user.update({ where: { id: before.userId }, data: { isActive: true } });
  await auditFrom(svc, "driver.updated", "Driver", id, before, d);
  return d;
}

export async function setDriverStatus(svc: ServiceCtx, driverId: string, status: Extract<DriverStatus, "AVAILABLE" | "IDLE" | "OFFLINE">) {
  const d = await svc.db.driver.findFirst({ where: { id: driverId } });
  if (!d) throw new AppError("NOT_FOUND", "Driver not found");
  if (d.status === "EMERGENCY") throw new AppError("INVALID_STATE", "Clear the emergency first");
  const active = await svc.db.shipment.count({ where: { driverId, status: { in: ["OUT_FOR_DELIVERY", "PICKUP_ASSIGNED"] } } });
  if (status === "OFFLINE" && active) throw new AppError("INVALID_STATE", "Finish active tasks before going offline");
  await svc.db.driver.update({ where: { id: driverId }, data: { status: active ? d.status : status } });
}

export async function raiseSos(svc: ServiceCtx, driverId: string, loc?: { lat?: number; lng?: number }) {
  const d = await svc.db.driver.findFirst({ where: { id: driverId } });
  if (!d) throw new AppError("NOT_FOUND", "Driver not found");
  await svc.db.driver.update({ where: { id: driverId }, data: { status: "EMERGENCY", ...(loc?.lat !== undefined ? { currentLat: loc.lat, currentLng: loc.lng, lastLocationAt: new Date() } : {}) } });
  const active = await svc.db.shipment.count({ where: { driverId, status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED_TO_SENDER", "CREATED", "CONFIRMED"] } } });
  await auditFrom(svc, "driver.sos", "Driver", driverId, undefined, { loc });
  await emitSafe(svc, { type: "driver.sos", title: `EMERGENCY: ${d.name} needs help`, body: `${d.name} triggered SOS${active ? ` while carrying ${active} active shipment${active > 1 ? "s" : ""}` : ""}. Call them now.`, entity: { type: "Driver", id: driverId }, actionUrl: `/drivers/${driverId}`, branchId: d.branchId });
}

export async function clearSos(svc: ServiceCtx, driverId: string) {
  await svc.db.driver.update({ where: { id: driverId }, data: { status: "AVAILABLE" } });
  await auditFrom(svc, "driver.sos_cleared", "Driver", driverId);
}

/** Store a GPS sample. Caller should throttle (the driver app sends at most every ~15s). */
export async function recordLocation(svc: ServiceCtx, driverId: string, p: { lat: number; lng: number; speedKmh?: number; heading?: number; accuracyM?: number; recordedAt?: Date }) {
  const at = p.recordedAt && p.recordedAt.getTime() <= Date.now() + 60_000 ? p.recordedAt : new Date();
  const d = await svc.db.driver.findFirst({ where: { id: driverId }, select: { id: true, lastLocationAt: true } });
  if (!d) throw new AppError("NOT_FOUND", "Driver not found");
  await svc.db.driverLocation.create({ data: { driverId, lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, heading: p.heading, accuracyM: p.accuracyM, recordedAt: at } as any });
  if (!d.lastLocationAt || d.lastLocationAt <= at) await svc.db.driver.update({ where: { id: driverId }, data: { currentLat: p.lat, currentLng: p.lng, lastLocationAt: at } });
}

export interface DriverStats { delivered: number; failed: number; successRate: number | null; avgDeliveryHours: number | null; codHeld: number; activeTasks: number; deliveries30d: number }

export async function driverStats(svc: ServiceCtx, driverId: string): Promise<DriverStats> {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [att, held, active, avg] = await Promise.all([
    svc.db.deliveryAttempt.groupBy({ by: ["outcome"], where: { driverId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.$queryRaw<{ v: unknown }[]>`SELECT COALESCE(SUM("amountCollected" - "amountRemitted"),0) AS v FROM "CodTransaction" WHERE "companyId" = ${svc.companyId} AND "driverId" = ${driverId}`,
    svc.db.shipment.count({ where: { driverId, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } } }),
    prisma.$queryRaw<{ h: number | null }[]>`SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "pickedUpAt"))/3600.0)::float AS h FROM "Shipment" WHERE "companyId" = ${svc.companyId} AND "driverId" = ${driverId} AND "status" = 'DELIVERED' AND "deliveredAt" >= ${since} AND "pickedUpAt" IS NOT NULL`,
  ]);
  const ok = att.find((a) => a.outcome === "DELIVERED")?._count._all ?? 0;
  const bad = att.find((a) => a.outcome === "FAILED")?._count._all ?? 0;
  return { delivered: ok, failed: bad, successRate: ok + bad ? (ok / (ok + bad)) * 100 : null, avgDeliveryHours: avg[0]?.h ?? null, codHeld: num(held[0]?.v as any), activeTasks: active, deliveries30d: ok };
}
