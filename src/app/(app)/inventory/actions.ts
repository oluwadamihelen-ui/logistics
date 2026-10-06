"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { AppError } from "@/lib/platform/errors";
import { assertOwned } from "@/lib/platform/db";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";

export const createItemAction = defineAction({
  permissions: ["inventory.manage"], schema: z.object({ name: z.string().trim().min(2).max(80), sku: z.string().max(40).optional(), unit: z.string().max(12).default("pcs"), hubId: z.string().optional(), openingStock: z.coerce.number().int().min(0).max(1_000_000).default(0), reorderLevel: z.coerce.number().int().min(0).default(0) }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId, { feature: "inventory" }); await assertOwned(ctx.db, { hub: i.hubId });
    const { openingStock, ...rest } = i;
    const it = await ctx.db.inventoryItem.create({ data: { ...rest, quantity: openingStock } as any });
    if (openingStock) await ctx.db.inventoryMovement.create({ data: { itemId: it.id, type: "RECEIVED", quantity: openingStock, note: "Opening stock", actorId: ctx.user.id } as any });
    await auditFrom(ctx, "inventory.item_created", "InventoryItem", it.id, undefined, i); return { id: it.id };
  },
});

export const moveStockAction = defineAction({
  permissions: ["inventory.manage"], schema: z.object({ itemId: z.string(), type: z.enum(["RECEIVED", "USED", "TRANSFERRED", "DAMAGED", "ADJUSTMENT"]), quantity: z.coerce.number().int().min(1).max(1_000_000), note: z.string().max(200).optional(), direction: z.enum(["add", "remove"]).optional() }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId, { feature: "inventory" });
    const sign = i.type === "RECEIVED" ? 1 : i.type === "ADJUSTMENT" ? (i.direction === "remove" ? -1 : 1) : -1;
    const delta = sign * i.quantity;
    // Atomic: the WHERE guard prevents stock going negative even under concurrent updates.
    const r = await ctx.db.inventoryItem.updateMany({ where: { id: i.itemId, ...(delta < 0 ? { quantity: { gte: -delta } } : {}) }, data: { quantity: { increment: delta } } });
    if (!r.count) { const exists = await ctx.db.inventoryItem.findFirst({ where: { id: i.itemId }, select: { id: true } }); throw new AppError(exists ? "VALIDATION" : "NOT_FOUND", exists ? "Not enough stock for that movement" : "Item not found"); }
    await ctx.db.inventoryMovement.create({ data: { itemId: i.itemId, type: i.type, quantity: delta, note: i.note, actorId: ctx.user.id } as any });
    await auditFrom(ctx, "inventory.moved", "InventoryItem", i.itemId, undefined, { type: i.type, delta }); return true;
  },
});
