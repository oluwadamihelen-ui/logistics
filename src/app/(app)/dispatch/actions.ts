"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { createRun, setRouteStatus } from "@/lib/logistics/routes";

export const createRunAction = defineAction({
  permissions: ["routes.manage", "shipments.assign"],
  schema: z.object({ name: z.string().max(80).optional(), driverId: z.string(), shipmentIds: z.array(z.string()).min(1).max(100), plannedDate: z.coerce.date().optional(), sort: z.enum(["manual", "nearest"]).default("manual") }),
  handler: async (ctx, i) => { const r = await createRun(ctx, i); return { id: r.route.id, assigned: r.assigned, failed: r.failed.length }; },
});
export const setRouteStatusAction = defineAction({ permissions: ["routes.manage"], schema: z.object({ id: z.string(), status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]) }), handler: async (ctx, i) => { await setRouteStatus(ctx, i.id, i.status); return true; } });
