import { randomBytes } from "node:crypto";
import type { BillingInterval, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { audit } from "./audit";
import { currentUsage, LIMIT_KEYS, type Limits } from "./entitlements";
import { getPaymentProvider } from "./payments/provider";
import { createTenantClient } from "./db";
import { emitSafe } from "./notifications/engine";

export function priceKobo(plan: { monthlyPriceKobo: number | null; annualPriceKobo: number | null }, interval: BillingInterval): number | null {
  return interval === "ANNUAL" ? plan.annualPriceKobo : plan.monthlyPriceKobo;
}
export function addPeriod(from: Date, interval: BillingInterval): Date {
  const d = new Date(from);
  if (interval === "ANNUAL") d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export async function startCheckout(companyId: string, actor: { id: string; name: string; role: string; email: string }, planKey: string, interval: BillingInterval, appUrl: string) {
  const provider = getPaymentProvider();
  if (!provider.isConfigured()) throw new AppError("NOT_CONFIGURED", "Online payments aren't configured on this server yet (set PAYSTACK_SECRET_KEY).");
  const [plan, sub] = await Promise.all([prisma.subscriptionPlan.findUnique({ where: { key: planKey } }), prisma.subscription.findUnique({ where: { companyId } })]);
  if (!plan || !plan.isActive) throw new AppError("NOT_FOUND", "Plan not found");
  if (!sub) throw new AppError("INVALID_STATE", "No subscription found");
  const amount = priceKobo(plan, interval);
  if (!amount) throw new AppError("VALIDATION", "This plan is priced by quote — contact sales.");
  // Block downgrades into a plan whose limits the company already exceeds.
  const usage = await currentUsage(companyId);
  for (const k of LIMIT_KEYS) {
    const lim = (plan.limits as Limits)[k];
    if (k !== "shipmentsPerMonth" && lim !== null && lim !== undefined && lim >= 0 && usage[k] > lim) throw new AppError("LIMIT_EXCEEDED", `You currently use ${usage[k]} ${k}; ${plan.name} allows ${lim}. Reduce usage before switching.`);
  }
  const reference = `sub_${companyId.slice(-6)}_${randomBytes(8).toString("hex")}`;
  await prisma.billingPayment.create({ data: { subscriptionId: sub.id, companyId, reference, amountKobo: amount, currency: plan.currency, planId: plan.id, interval, status: "PENDING" } });
  const init = await provider.initialize({ email: actor.email, amountKobo: amount, currency: plan.currency, reference, callbackUrl: `${appUrl}/billing/callback`, metadata: { companyId, planKey, interval } });
  await audit({ companyId, actor, action: "billing.checkout_started", resourceType: "Subscription", resourceId: sub.id, after: { planKey, interval, amountKobo: amount, reference } });
  return { url: init.authorizationUrl, reference };
}

/**
 * Idempotent: safe to call from the browser callback AND from webhooks, any number of times.
 * Never trusts the caller — status/amount come from the provider's verify API.
 */
export async function confirmPayment(reference: string): Promise<{ status: "SUCCESSFUL" | "FAILED" | "PENDING"; alreadyProcessed: boolean }> {
  const pay = await prisma.billingPayment.findUnique({ where: { reference }, include: { subscription: true } });
  if (!pay) throw new AppError("NOT_FOUND", "Unknown payment reference");
  if (pay.status === "SUCCESSFUL") return { status: "SUCCESSFUL", alreadyProcessed: true };
  if (pay.status === "FAILED") return { status: "FAILED", alreadyProcessed: true };

  const v = await getPaymentProvider().verify(reference);
  if (v.status === "pending") return { status: "PENDING", alreadyProcessed: false };
  if (v.status !== "success") {
    const claimed = await prisma.billingPayment.updateMany({ where: { id: pay.id, status: "PENDING" }, data: { status: "FAILED", rawResponse: v.raw as Prisma.InputJsonValue } });
    if (claimed.count) await markPaymentFailed(pay.companyId, pay.subscriptionId);
    return { status: "FAILED", alreadyProcessed: !claimed.count };
  }
  if (v.amountKobo !== pay.amountKobo || v.currency !== pay.currency) {
    await audit({ companyId: pay.companyId, action: "billing.amount_mismatch", resourceType: "BillingPayment", resourceId: pay.id, after: { expected: pay.amountKobo, got: v.amountKobo } });
    throw new AppError("CONFLICT", "Payment amount does not match the order");
  }

  // Claim: only one concurrent caller can flip PENDING → SUCCESSFUL, so the subscription is extended exactly once.
  const claimed = await prisma.billingPayment.updateMany({ where: { id: pay.id, status: "PENDING" }, data: { status: "SUCCESSFUL", paidAt: v.paidAt ?? new Date(), rawResponse: v.raw as Prisma.InputJsonValue } });
  if (!claimed.count) return { status: "SUCCESSFUL", alreadyProcessed: true };

  const sub = pay.subscription;
  const now = new Date();
  const stillActive = sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now && sub.planId === pay.planId;
  const start = stillActive ? sub.currentPeriodEnd! : now; // renewing early extends, a plan change restarts the period
  await prisma.subscription.update({ where: { id: sub.id }, data: { planId: pay.planId, interval: pay.interval, status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: addPeriod(start, pay.interval), graceEndsAt: null, cancelAtPeriodEnd: false, cancelledAt: null, trialEndsAt: null, pendingPlanId: null, pendingInterval: null } });
  await audit({ companyId: pay.companyId, action: "billing.payment_succeeded", resourceType: "BillingPayment", resourceId: pay.id, after: { reference, planId: pay.planId, interval: pay.interval, amountKobo: pay.amountKobo } });
  return { status: "SUCCESSFUL", alreadyProcessed: false };
}

async function markPaymentFailed(companyId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (sub && sub.status === "ACTIVE") await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE", graceEndsAt: new Date(Date.now() + 7 * 86400_000) } });
  await emitSafe({ db: createTenantClient(companyId), companyId }, { type: "billing.payment_failed", title: "Subscription payment failed", body: "Your last payment didn't go through. Update your billing to avoid interruption.", actionUrl: "/billing" });
  await audit({ companyId, action: "billing.payment_failed", resourceType: "Subscription", resourceId: subscriptionId });
}

export async function cancelSubscription(companyId: string, actor: { id: string; name: string; role: string }, resume = false) {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub) throw new AppError("NOT_FOUND", "No subscription");
  if (!resume && !["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) throw new AppError("INVALID_STATE", "Nothing to cancel");
  await prisma.subscription.update({ where: { id: sub.id }, data: resume ? { cancelAtPeriodEnd: false, cancelledAt: null, ...(sub.status === "CANCELLED" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? { status: "ACTIVE" } : {}) } : { cancelAtPeriodEnd: true, cancelledAt: new Date(), ...(sub.status === "TRIALING" ? { status: "CANCELLED" } : {}) } });
  await audit({ companyId, actor, action: resume ? "billing.resumed" : "billing.cancelled", resourceType: "Subscription", resourceId: sub.id });
}
