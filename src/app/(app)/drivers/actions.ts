"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { phone } from "@/lib/logistics/schemas";
import { clearSos, createDriver, setDriverStatus, updateDriver } from "@/lib/logistics/drivers";

const payRates = z.object({ perDelivery: z.coerce.number().min(0).optional(), perTrip: z.coerce.number().min(0).optional(), percentage: z.coerce.number().min(0).max(100).optional(), salary: z.coerce.number().min(0).optional() });
const base = z.object({
  name: z.string().trim().min(2).max(100), phone, email: z.string().email().optional(), kind: z.enum(["DRIVER", "RIDER"]).default("DRIVER"), branchId: z.string().optional(),
  licenseNumber: z.string().max(40).optional(), licenseExpiry: z.coerce.date().optional(),
  payModel: z.enum(["PER_DELIVERY", "PER_TRIP", "PERCENTAGE", "SALARY", "HYBRID"]).default("PER_DELIVERY"), vehicleId: z.string().optional(),
  payPerDelivery: z.coerce.number().min(0).optional(), payPercentage: z.coerce.number().min(0).max(100).optional(), paySalary: z.coerce.number().min(0).optional(), payPerTrip: z.coerce.number().min(0).optional(),
});
const rates = (i: z.infer<typeof base>) => payRates.parse({ perDelivery: i.payPerDelivery, percentage: i.payPercentage, salary: i.paySalary, perTrip: i.payPerTrip });

export const createDriverAction = defineAction({
  permissions: ["drivers.create"], schema: base.extend({ loginEmail: z.string().email().optional(), loginPassword: z.string().min(10).max(200).optional() }),
  handler: async (ctx, i) => { const d = await createDriver(ctx, { ...i, payRates: rates(i) }); return { id: d.id }; },
});
export const updateDriverAction = defineAction({
  permissions: ["drivers.edit"], schema: base.partial().extend({ id: z.string(), isActive: z.boolean().optional() }),
  handler: async (ctx, { id, ...i }) => { await updateDriver(ctx, id, { ...i, ...(i.payPerDelivery !== undefined || i.payPercentage !== undefined || i.paySalary !== undefined || i.payPerTrip !== undefined ? { payRates: rates(i as any) } : {}) } as any); return true; },
});
export const setDriverActiveAction = defineAction({ permissions: ["drivers.edit"], schema: z.object({ id: z.string(), isActive: z.boolean() }), handler: async (ctx, i) => { await updateDriver(ctx, i.id, { isActive: i.isActive }); return true; } });
export const setDriverStatusAction = defineAction({ permissions: ["dispatch.manage"], schema: z.object({ id: z.string(), status: z.enum(["AVAILABLE", "IDLE", "OFFLINE"]) }), handler: async (ctx, i) => { await setDriverStatus(ctx, i.id, i.status); return true; } });
export const clearSosAction = defineAction({ permissions: ["dispatch.manage"], schema: z.object({ id: z.string() }), handler: async (ctx, i) => { await clearSos(ctx, i.id); return true; } });
