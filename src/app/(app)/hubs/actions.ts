"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { assertOwned } from "@/lib/platform/db";
import { AppError } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";

const geo = { lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() };
const code = z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only").transform((s) => s.toUpperCase());

export const createBranchAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ name: z.string().trim().min(2).max(80), code, phone: z.string().max(20).optional(), addressLine: z.string().max(200).optional(), city: z.string().max(80).optional(), state: z.string().max(80).optional(), ...geo }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId, { limit: { key: "branches" } });
    if (await ctx.db.branch.findFirst({ where: { code: i.code } })) throw new AppError("CONFLICT", "Branch code already in use");
    const b = await ctx.db.branch.create({ data: i as any }); await auditFrom(ctx, "branch.created", "Branch", b.id, undefined, i); return { id: b.id };
  },
});
export const updateBranchAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ id: z.string(), name: z.string().trim().min(2).max(80).optional(), phone: z.string().max(20).optional(), city: z.string().max(80).optional(), state: z.string().max(80).optional(), isActive: z.boolean().optional(), ...geo }),
  handler: async (ctx, { id, ...i }) => { await guardMutation(ctx.companyId); const b = await ctx.db.branch.findFirst({ where: { id } }); if (!b) throw new AppError("NOT_FOUND", "Branch not found"); await ctx.db.branch.update({ where: { id }, data: i }); await auditFrom(ctx, "branch.updated", "Branch", id, b, i); return true; },
});

export const createHubAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ name: z.string().trim().min(2).max(80), code, type: z.enum(["HUB", "WAREHOUSE", "SORTING_CENTER", "PICKUP_POINT"]).default("HUB"), allowsCollection: z.boolean().default(false), openingHours: z.string().max(120).optional(), branchId: z.string().optional(), city: z.string().max(80).optional(), state: z.string().max(80).optional(), addressLine: z.string().max(200).optional(), ...geo }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId); await assertOwned(ctx.db, { branch: i.branchId });
    if (await ctx.db.hub.findFirst({ where: { code: i.code } })) throw new AppError("CONFLICT", "Hub code already in use");
    const h = await ctx.db.hub.create({ data: i as any }); await auditFrom(ctx, "hub.created", "Hub", h.id, undefined, i); return { id: h.id };
  },
});
export const updateHubAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ id: z.string(), name: z.string().trim().min(2).max(80).optional(), type: z.enum(["HUB", "WAREHOUSE", "SORTING_CENTER", "PICKUP_POINT"]).optional(), allowsCollection: z.boolean().optional(), openingHours: z.string().max(120).optional(), branchId: z.string().optional(), isActive: z.boolean().optional(), ...geo }),
  handler: async (ctx, { id, ...i }) => { await guardMutation(ctx.companyId); await assertOwned(ctx.db, { branch: i.branchId }); const h = await ctx.db.hub.findFirst({ where: { id } }); if (!h) throw new AppError("NOT_FOUND", "Hub not found"); await ctx.db.hub.update({ where: { id }, data: i }); await auditFrom(ctx, "hub.updated", "Hub", id, h, i); return true; },
});

export const createZoneAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ name: z.string().trim().min(2).max(80), code, description: z.string().max(200).optional(), areas: z.string().max(1000) }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    if (await ctx.db.zone.findFirst({ where: { code: i.code } })) throw new AppError("CONFLICT", "Zone code already in use");
    const areas = i.areas.split(",").map((s) => s.trim()).filter(Boolean);
    if (!areas.length) throw new AppError("VALIDATION", "List at least one city, area or state");
    const z = await ctx.db.zone.create({ data: { name: i.name, code: i.code, description: i.description, areas } as any }); await auditFrom(ctx, "zone.created", "Zone", z.id, undefined, i); return { id: z.id };
  },
});
export const updateZoneAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ id: z.string(), name: z.string().trim().min(2).max(80).optional(), areas: z.string().max(1000).optional(), isActive: z.boolean().optional() }),
  handler: async (ctx, { id, areas, ...i }) => { await guardMutation(ctx.companyId); const z0 = await ctx.db.zone.findFirst({ where: { id } }); if (!z0) throw new AppError("NOT_FOUND", "Zone not found"); await ctx.db.zone.update({ where: { id }, data: { ...i, ...(areas !== undefined ? { areas: areas.split(",").map((s) => s.trim()).filter(Boolean) } : {}) } }); await auditFrom(ctx, "zone.updated", "Zone", id, z0, { ...i, areas }); return true; },
});

// ───────── Cities (extend the built-in state → city lists) ─────────
import { NG_STATES } from "@/lib/locations/ng";

const cityName = z.string().trim().min(2).max(60).regex(/^[\p{L}0-9 .'’()\/-]+$/u, "Use letters, numbers and basic punctuation only");

export const addCityAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ state: z.enum(NG_STATES as [string, ...string[]]), name: cityName }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    const existing = await ctx.db.cityOption.findFirst({ where: { state: i.state, name: { equals: i.name, mode: "insensitive" } } });
    if (existing) return { id: existing.id, name: existing.name, state: existing.state };
    const c = await ctx.db.cityOption.create({ data: { state: i.state, name: i.name } as any });
    await auditFrom(ctx, "city.added", "CityOption", c.id, undefined, i);
    return { id: c.id, name: c.name, state: c.state };
  },
});

export const deleteCityAction = defineAction({
  permissions: ["hubs.manage"],
  schema: z.object({ id: z.string() }),
  handler: async (ctx, { id }) => {
    const c = await ctx.db.cityOption.findFirst({ where: { id } });
    if (!c) throw new AppError("NOT_FOUND", "City not found");
    await ctx.db.cityOption.delete({ where: { id } });
    await auditFrom(ctx, "city.removed", "CityOption", id, c, undefined);
    return true;
  },
});
