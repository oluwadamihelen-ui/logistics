"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";

const CATS = ["SHIPMENT", "DELIVERY", "PICKUP", "DISPATCH", "DRIVER", "FLEET", "PAYMENT", "COD", "INVOICE", "CUSTOMER", "FINANCE", "MAINTENANCE", "SYSTEM", "SECURITY", "AI_INSIGHT"] as const;

// Every query is additionally constrained to the signed-in user: nobody can touch another user's notifications.
export const markReadAction = defineAction({ schema: z.object({ ids: z.array(z.string()).max(200).optional(), all: z.boolean().optional(), unread: z.boolean().optional() }), handler: async (ctx, i) => {
  const where = { userId: ctx.user.id, ...(i.all ? {} : { id: { in: i.ids ?? [] } }) };
  await ctx.db.notification.updateMany({ where, data: { readAt: i.unread ? null : new Date() } });
  return true;
} });
export const dismissAction = defineAction({ schema: z.object({ ids: z.array(z.string()).max(200) }), handler: async (ctx, i) => { await ctx.db.notification.updateMany({ where: { userId: ctx.user.id, id: { in: i.ids } }, data: { dismissedAt: new Date(), readAt: new Date() } }); return true; } });
export const savePreferenceAction = defineAction({
  schema: z.object({ category: z.enum(CATS), muted: z.boolean().default(false), channels: z.array(z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH"])).default([]) }),
  handler: async (ctx, i) => {
    const channels = ["IN_APP" as const, ...i.channels];
    await ctx.db.notificationPreference.upsert({ where: { userId_category: { userId: ctx.user.id, category: i.category } }, create: { userId: ctx.user.id, category: i.category, muted: i.muted, channels } as any, update: { muted: i.muted, channels } });
    return true;
  },
});
