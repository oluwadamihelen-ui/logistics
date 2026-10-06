"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { AppError } from "@/lib/platform/errors";
import { API_SCOPES, generateApiKey } from "@/lib/platform/api-auth";
import { auditFrom } from "@/lib/platform/audit";
import { assertFeature, getEntitlements } from "@/lib/platform/entitlements";
import { assertOwned } from "@/lib/platform/db";
import { isSafeWebhookUrl, newWebhookSecret } from "@/lib/logistics/webhooks";

export const createApiKeyAction = defineAction({
  permissions: ["api.manage"],
  schema: z.object({ name: z.string().trim().min(2).max(60), scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope"), customerId: z.string().optional() }),
  handler: async (ctx, i) => {
    assertFeature(await getEntitlements(ctx.companyId), "api_access");
    await assertOwned(ctx.db, { customer: i.customerId });
    const { key, prefix, hash } = generateApiKey();
    const k = await ctx.db.apiKey.create({ data: { name: i.name, prefix, keyHash: hash, scopes: i.scopes, customerId: i.customerId, createdById: ctx.user.id } as any });
    await auditFrom(ctx, "apikey.created", "ApiKey", k.id, undefined, { name: i.name, scopes: i.scopes, customerId: i.customerId });
    return { key }; // returned ONCE
  },
});
export const revokeApiKeyAction = defineAction({ permissions: ["api.manage"], schema: z.object({ id: z.string() }), handler: async (ctx, i) => { const k = await ctx.db.apiKey.findFirst({ where: { id: i.id } }); if (!k) throw new AppError("NOT_FOUND", "Key not found"); await ctx.db.apiKey.update({ where: { id: i.id }, data: { revokedAt: new Date() } }); await auditFrom(ctx, "apikey.revoked", "ApiKey", i.id, { name: k.name }); return true; } });

export const createWebhookAction = defineAction({
  permissions: ["api.manage"], schema: z.object({ url: z.string().url().max(300), events: z.array(z.enum(["shipment.status_changed"])).min(1) }),
  handler: async (ctx, i) => {
    assertFeature(await getEntitlements(ctx.companyId), "api_access");
    if (!isSafeWebhookUrl(i.url)) throw new AppError("VALIDATION", "Webhook URL must be a public https address");
    const secret = newWebhookSecret();
    const w = await ctx.db.webhookEndpoint.create({ data: { url: i.url, events: i.events, secret } as any });
    await auditFrom(ctx, "webhook.created", "WebhookEndpoint", w.id, undefined, { url: i.url });
    return { secret };
  },
});
export const deleteWebhookAction = defineAction({ permissions: ["api.manage"], schema: z.object({ id: z.string() }), handler: async (ctx, i) => { const w = await ctx.db.webhookEndpoint.findFirst({ where: { id: i.id } }); if (!w) throw new AppError("NOT_FOUND", "Webhook not found"); await ctx.db.webhookEndpoint.delete({ where: { id: i.id } }); await auditFrom(ctx, "webhook.deleted", "WebhookEndpoint", i.id, { url: w.url }); return true; } });
