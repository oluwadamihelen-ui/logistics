"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { getEntitlements, assertFeature } from "@/lib/platform/entitlements";
import { generateInsights } from "@/lib/logistics/ai-assistant";
import { enforceRateLimit } from "@/lib/platform/rate-limit";

export const generateInsightsAction = defineAction({
  permissions: ["analytics.view"], schema: z.object({}),
  handler: async (ctx) => {
    assertFeature(await getEntitlements(ctx.companyId), "ai_insights");
    enforceRateLimit(`insights:${ctx.companyId}`, 6, 60 * 60_000);
    const r = await generateInsights(ctx, { withAi: true, notify: ctx.can("notifications.manage") });
    return { ai: r.ai, aiStatus: r.aiStatus };
  },
});
