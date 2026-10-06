import type { Prisma } from "@prisma/client";
import { assertOwned } from "../platform/db";
import { AppError } from "../platform/errors";
import { auditFrom } from "../platform/audit";
import { guardMutation } from "../platform/entitlements";
import { emitSafe } from "../platform/notifications/engine";
import type { ServiceCtx } from "../platform/service";

export interface VehicleInput {
  registrationNumber: string; type: "MOTORCYCLE" | "CAR" | "VAN" | "TRUCK" | "BUS" | "OTHER"; make?: string; model?: string; year?: number; capacityKg?: number;
  mileageKm?: number; fuelType?: string; insuranceExpiry?: Date; inspectionExpiry?: Date; roadworthinessExpiry?: Date; nextServiceAt?: Date; nextServiceKm?: number;
}

export async function createVehicle(svc: ServiceCtx, input: VehicleInput) {
  await guardMutation(svc.companyId, { limit: { key: "vehicles" } });
  const reg = input.registrationNumber.trim().toUpperCase();
  if (await svc.db.vehicle.findFirst({ where: { registrationNumber: reg } })) throw new AppError("CONFLICT", "A vehicle with this registration number already exists");
  const v = await svc.db.vehicle.create({ data: { ...input, registrationNumber: reg } as any });
  await auditFrom(svc, "vehicle.created", "Vehicle", v.id, undefined, { registrationNumber: reg, type: v.type });
  return v;
}

export async function updateVehicle(svc: ServiceCtx, id: string, input: Partial<VehicleInput> & { status?: "AVAILABLE" | "ASSIGNED" | "ON_TRIP" | "MAINTENANCE" | "INACTIVE"; isActive?: boolean }) {
  await guardMutation(svc.companyId);
  const before = await svc.db.vehicle.findFirst({ where: { id } });
  if (!before) throw new AppError("NOT_FOUND", "Vehicle not found");
  if (input.status === "MAINTENANCE" || input.status === "INACTIVE" || input.isActive === false) {
    const open = await svc.db.shipment.count({ where: { vehicleId: id, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } } });
    if (open) throw new AppError("INVALID_STATE", `Vehicle carries ${open} active shipment(s). Reassign them first.`);
  }
  if (input.registrationNumber) input.registrationNumber = input.registrationNumber.trim().toUpperCase();
  const v = await svc.db.vehicle.update({ where: { id }, data: input as any });
  await auditFrom(svc, "vehicle.updated", "Vehicle", id, before, v);
  return v;
}

export async function deleteVehicle(svc: ServiceCtx, id: string) {
  await guardMutation(svc.companyId);
  const v = await svc.db.vehicle.findFirst({ where: { id }, include: { _count: { select: { shipments: true, maintenance: true } } } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  if (v._count.shipments > 0) throw new AppError("INVALID_STATE", "This vehicle has shipment history — deactivate it instead of deleting");
  await svc.db.vehicle.delete({ where: { id } });
  await auditFrom(svc, "vehicle.deleted", "Vehicle", id, { registrationNumber: v.registrationNumber });
}

export async function assignVehicleDriver(svc: ServiceCtx, vehicleId: string, driverId: string | null) {
  await guardMutation(svc.companyId);
  await assertOwned(svc.db, { vehicle: vehicleId, driver: driverId });
  const current = await svc.db.driver.findFirst({ where: { vehicleId } });
  if (current && current.id !== driverId) await svc.db.driver.update({ where: { id: current.id }, data: { vehicleId: null } });
  if (driverId) await svc.db.driver.update({ where: { id: driverId }, data: { vehicleId } });
  await svc.db.vehicle.update({ where: { id: vehicleId }, data: { status: driverId ? "ASSIGNED" : "AVAILABLE" } });
  await auditFrom(svc, "vehicle.driver_assigned", "Vehicle", vehicleId, { driverId: current?.id ?? null }, { driverId });
}

export async function addMaintenance(svc: ServiceCtx, vehicleId: string, m: { type: string; description?: string; cost: number; mileageKm?: number; performedAt: Date; nextDueAt?: Date; nextDueKm?: number; vendor?: string; recordExpense?: boolean }) {
  await guardMutation(svc.companyId);
  const v = await svc.db.vehicle.findFirst({ where: { id: vehicleId } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  const { recordExpense, ...rec } = m;
  const r = await svc.db.maintenanceRecord.create({ data: { vehicleId, ...rec } as any });
  const data: Prisma.VehicleUncheckedUpdateInput = {};
  if (m.mileageKm && m.mileageKm > v.mileageKm) data.mileageKm = m.mileageKm;
  if (m.nextDueAt) data.nextServiceAt = m.nextDueAt;
  if (m.nextDueKm) data.nextServiceKm = m.nextDueKm;
  if (Object.keys(data).length) await svc.db.vehicle.update({ where: { id: vehicleId }, data });
  if (recordExpense && m.cost > 0) await svc.db.expense.create({ data: { category: "VEHICLE_MAINTENANCE", amount: m.cost, incurredAt: m.performedAt, vehicleId, description: `${m.type.replace(/_/g, " ").toLowerCase()} — ${v.registrationNumber}`, recordedById: svc.actor?.id } as any });
  await auditFrom(svc, "vehicle.maintenance_added", "Vehicle", vehicleId, undefined, { type: m.type, cost: m.cost });
  return r;
}

const DAY = 86400_000;
export type ExpiryItem = { kind: "vehicle" | "driver" | "document"; id: string; label: string; what: string; at: Date; days: number };

/** Everything expiring within `withinDays` (or already expired). */
export async function collectExpiries(svc: ServiceCtx, withinDays = 30): Promise<ExpiryItem[]> {
  const limit = new Date(Date.now() + withinDays * DAY);
  const [vehicles, drivers, docs] = await Promise.all([
    svc.db.vehicle.findMany({ where: { isActive: true, OR: [{ insuranceExpiry: { lte: limit } }, { inspectionExpiry: { lte: limit } }, { roadworthinessExpiry: { lte: limit } }, { nextServiceAt: { lte: limit } }] } }),
    svc.db.driver.findMany({ where: { isActive: true, licenseExpiry: { lte: limit } } }),
    svc.db.document.findMany({ where: { expiryDate: { lte: limit } } }),
  ]);
  const out: ExpiryItem[] = [];
  const push = (kind: ExpiryItem["kind"], id: string, label: string, what: string, at: Date | null) => { if (at && at <= limit) out.push({ kind, id, label, what, at, days: Math.ceil((at.getTime() - Date.now()) / DAY) }); };
  for (const v of vehicles) {
    push("vehicle", v.id, v.registrationNumber, "Insurance", v.insuranceExpiry); push("vehicle", v.id, v.registrationNumber, "Inspection", v.inspectionExpiry);
    push("vehicle", v.id, v.registrationNumber, "Roadworthiness", v.roadworthinessExpiry); push("vehicle", v.id, v.registrationNumber, "Service due", v.nextServiceAt);
  }
  for (const d of drivers) push("driver", d.id, d.name, "Driving licence", d.licenseExpiry);
  for (const x of docs) push("document", x.id, x.title, x.type, x.expiryDate);
  return out.sort((a, b) => a.days - b.days);
}

/** Emit alerts at the company's configured thresholds (default 30/14/7/1 days, and when expired). Idempotent via dedupe keys. */
export async function scanExpiries(svc: ServiceCtx) {
  const settings = await svc.db.companySettings.findFirst({ select: { expiryAlertDays: true } });
  const thresholds = [...(settings?.expiryAlertDays ?? [30, 14, 7, 1])].sort((a, b) => a - b);
  const items = await collectExpiries(svc, Math.max(...thresholds));
  let emitted = 0;
  for (const it of items) {
    const bucket = it.days <= 0 ? "expired" : String(thresholds.find((t) => it.days <= t));
    const expired = it.days <= 0;
    const type = it.kind === "vehicle" ? (it.what === "Service due" ? "vehicle.service_due" : expired ? "vehicle.document_expired" : "vehicle.document_expiring") : "document.expiring";
    await emitSafe(svc, {
      type, entity: { type: it.kind === "vehicle" ? "Vehicle" : it.kind === "driver" ? "Driver" : "Document", id: it.id },
      title: expired ? `${it.what} expired: ${it.label}` : `${it.what} for ${it.label} expires in ${it.days} day${it.days === 1 ? "" : "s"}`,
      body: `${it.what} ${expired ? "expired" : "is due"} on ${it.at.toISOString().slice(0, 10)}.`,
      actionUrl: it.kind === "vehicle" ? `/fleet/${it.id}` : it.kind === "driver" ? `/drivers/${it.id}` : "/documents",
      dedupeKey: `expiry:${it.kind}:${it.id}:${it.what}:${bucket}`, priority: expired || it.days <= 7 ? "HIGH" : "MEDIUM", dedupeMinutes: 60 * 24 * 45,
    });
    emitted++;
  }
  return { checked: items.length, emitted };
}
