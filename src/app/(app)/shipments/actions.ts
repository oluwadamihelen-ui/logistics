"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { AppError } from "@/lib/platform/errors";
import { assertOwned } from "@/lib/platform/db";
import {
  assignShipments, createShipment, quoteForInput, regenerateOtp, resolveFailure, transitionShipment, unassignShipment,
} from "@/lib/logistics/shipments";
import { shipmentInputSchema } from "@/lib/logistics/schemas";
import { ALL_STATUSES } from "@/lib/logistics/shipment-status";
import { permissionForTransition } from "@/lib/logistics/permissions-map";

export const createShipmentAction = defineAction({
  permissions: ["shipments.create"],
  schema: shipmentInputSchema,
  handler: async (ctx, input) => {
    if (input.deliveryFeeOverride !== undefined) ctx.require("shipments.edit");
    const s = await createShipment(ctx, input, "DASHBOARD");
    return { id: s.id, trackingNumber: s.trackingNumber };
  },
});

export const quoteAction = defineAction({
  permissions: ["shipments.create"],
  schema: shipmentInputSchema.pick({ pickupCity: true, pickupState: true, deliveryCity: true, deliveryState: true, weightKg: true, priority: true, packageType: true, declaredValue: true, codAmount: true, customerId: true }),
  handler: async (ctx, input) => {
    await assertOwned(ctx.db, { customer: input.customerId });
    return (await quoteForInput(ctx, input)).quote;
  },
});

export const transitionAction = defineAction({
  schema: z.object({ id: z.string(), to: z.enum(ALL_STATUSES as [string, ...string[]]), note: z.string().max(300).optional(), hubId: z.string().optional() }),
  handler: async (ctx, i) => {
    ctx.require(permissionForTransition(i.to as any));
    await transitionShipment(ctx, i.id, i.to as any, { note: i.note, hubId: i.hubId });
    return true;
  },
});

export const assignAction = defineAction({
  permissions: ["shipments.assign"],
  schema: z.object({ shipmentIds: z.array(z.string()).min(1).max(200), driverId: z.string(), vehicleId: z.string().nullable().optional() }),
  handler: async (ctx, i) => {
    const results = await assignShipments(ctx, i.shipmentIds, i.driverId, i.vehicleId);
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) throw new AppError("INVALID_STATE", failed[0].error ?? "Could not assign");
    return { assigned: results.length - failed.length, failed: failed.length };
  },
});

export const unassignAction = defineAction({
  permissions: ["shipments.assign"],
  schema: z.object({ id: z.string() }),
  handler: async (ctx, i) => { await unassignShipment(ctx, i.id); return true; },
});

export const resolveFailureAction = defineAction({
  permissions: ["shipments.dispatch"],
  schema: z.object({ id: z.string(), resolution: z.enum(["RESCHEDULED", "RETRY", "RETURN_TO_HUB", "RETURN_TO_SENDER"]), rescheduleFor: z.coerce.date().optional(), note: z.string().max(300).optional() }),
  handler: async (ctx, i) => { await resolveFailure(ctx, i.id, i); return true; },
});

export const regenerateOtpAction = defineAction({
  permissions: ["shipments.edit"],
  schema: z.object({ id: z.string() }),
  handler: async (ctx, i) => regenerateOtp(ctx, i.id),
});
