"use server";
import { z } from "zod";
import { requireTenant } from "@/lib/platform/context";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { cancelSubscription, quoteChange, removeSavedCard, setAutoRenew, startCheckout } from "@/lib/platform/billing";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function checkoutAction(raw: { planKey: string; interval: "MONTHLY" | "ANNUAL"; autoRenew?: boolean }): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await requireTenant("billing.manage");
    const i = z.object({ planKey: z.string().max(40), interval: z.enum(["MONTHLY", "ANNUAL"]), autoRenew: z.boolean().optional() }).parse(raw);
    const r = await startCheckout(ctx.companyId, { ...ctx.actor, email: ctx.user.email }, i.planKey, i.interval, appUrl(), { autoRenew: i.autoRenew });
    return { ok: true, data: { url: r.url } };
  } catch (e) { return toFailure(e); }
}
export async function cancelAction(raw: { resume?: boolean }): Promise<ActionResult<boolean>> {
  try { const ctx = await requireTenant("billing.manage"); await cancelSubscription(ctx.companyId, ctx.actor, !!raw?.resume); return { ok: true, data: true }; } catch (e) { return toFailure(e); }
}
export async function quoteAction(raw: { planKey: string; interval: "MONTHLY" | "ANNUAL" }): Promise<ActionResult<{ priceKobo: number; creditKobo: number; dueKobo: number }>> {
  try {
    const ctx = await requireTenant("billing.manage");
    const i = z.object({ planKey: z.string().max(40), interval: z.enum(["MONTHLY", "ANNUAL"]) }).parse(raw);
    const q = await quoteChange(ctx.companyId, i.planKey, i.interval);
    return { ok: true, data: { priceKobo: q.priceKobo, creditKobo: q.creditKobo, dueKobo: q.dueKobo } };
  } catch (e) { return toFailure(e); }
}
export async function autoRenewAction(raw: { on: boolean }): Promise<ActionResult<boolean>> {
  try { const ctx = await requireTenant("billing.manage"); await setAutoRenew(ctx.companyId, ctx.actor, !!raw?.on); return { ok: true, data: true }; } catch (e) { return toFailure(e); }
}
export async function removeCardAction(): Promise<ActionResult<boolean>> {
  try { const ctx = await requireTenant("billing.manage"); await removeSavedCard(ctx.companyId, ctx.actor); return { ok: true, data: true }; } catch (e) { return toFailure(e); }
}
