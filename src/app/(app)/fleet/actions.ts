"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { addMaintenance, assignVehicleDriver, createVehicle, deleteVehicle, scanExpiries, updateVehicle } from "@/lib/logistics/fleet";

const types = ["MOTORCYCLE", "CAR", "VAN", "TRUCK", "BUS", "OTHER"] as const;
const vehicle = z.object({
  registrationNumber: z.string().trim().min(3).max(20), type: z.enum(types), make: z.string().max(40).optional(), model: z.string().max(40).optional(),
  year: z.coerce.number().int().min(1980).max(2100).optional(), capacityKg: z.coerce.number().min(0).optional(), mileageKm: z.coerce.number().int().min(0).optional(), fuelType: z.string().max(20).optional(),
  insuranceExpiry: z.coerce.date().optional(), inspectionExpiry: z.coerce.date().optional(), roadworthinessExpiry: z.coerce.date().optional(), nextServiceAt: z.coerce.date().optional(), nextServiceKm: z.coerce.number().int().min(0).optional(),
});

export const createVehicleAction = defineAction({ permissions: ["fleet.manage"], schema: vehicle, handler: async (ctx, i) => { const v = await createVehicle(ctx, i); return { id: v.id }; } });
export const updateVehicleAction = defineAction({ permissions: ["fleet.manage"], schema: vehicle.partial().extend({ id: z.string(), status: z.enum(["AVAILABLE", "ASSIGNED", "ON_TRIP", "MAINTENANCE", "INACTIVE"]).optional() }), handler: async (ctx, { id, ...r }) => { await updateVehicle(ctx, id, r); return true; } });
export const deleteVehicleAction = defineAction({ permissions: ["fleet.manage"], schema: z.object({ id: z.string() }), handler: async (ctx, i) => { await deleteVehicle(ctx, i.id); return true; } });
export const assignVehicleDriverAction = defineAction({ permissions: ["fleet.manage", "drivers.assign"], schema: z.object({ vehicleId: z.string(), driverId: z.string().nullable().optional() }), handler: async (ctx, i) => { await assignVehicleDriver(ctx, i.vehicleId, i.driverId ?? null); return true; } });
export const addMaintenanceAction = defineAction({
  permissions: ["fleet.maintenance"],
  schema: z.object({ vehicleId: z.string(), type: z.enum(["SERVICE", "OIL_CHANGE", "TYRES", "REPAIR", "PARTS", "INSPECTION", "OTHER"]), description: z.string().max(300).optional(), cost: z.coerce.number().min(0).default(0), mileageKm: z.coerce.number().int().min(0).optional(), performedAt: z.coerce.date(), nextDueAt: z.coerce.date().optional(), nextDueKm: z.coerce.number().int().optional(), vendor: z.string().max(100).optional(), recordExpense: z.boolean().default(true) }),
  handler: async (ctx, { vehicleId, ...m }) => { await addMaintenance(ctx, vehicleId, m); return true; },
});
export const scanExpiriesAction = defineAction({ permissions: ["fleet.manage"], schema: z.object({}), handler: async (ctx) => scanExpiries(ctx) });
