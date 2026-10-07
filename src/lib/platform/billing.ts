import { randomBytes } from "node:crypto";
import type { BillingInterval, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { audit } from "./audit";
import { currentUsage, LIMIT_KEYS, type Limits } from "./entitlements";
import { getPaymentProvider } from "./payments/provider";
import { createTenantClient } from "./db";
import { emitSafe } from "./notifications/engine";

const MIN_CHARGE_KOBO = 10_000; // ₦100
export function priceKobo(plan: { monthlyPriceKobo: number | null; annualPriceKobo: number | null }, interval: BillingInterval): number | null {
  return interval === "ANNUAL" ? plan.annualPriceKobo : plan.monthlyPriceKobo;
}
export function addPeriod(from: Date, interval: BillingInterval): Date {
  const d = new Date(from);
  if (interval === "ANNUAL") d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * Mid-period plan changes are prorated: the unused part of the current paid period is credited against the new
 * plan, and the new period starts today. Renewals of the same plan (and trial → paid) are never prorated.
 */
export function prorationCreditKobo(sub: { status: string; planId: string; interval: BillingInterval; currentPeriodStart: Date | null; currentPeriodEnd: Date | null }, current: { monthlyPriceKobo: number | null; annualPriceKobo: number | null } | null, newPlanId: string, now = new Date()): number {
  if (sub.status !== "ACTIVE" || sub.planId === newPlanId || !current || !sub.currentPeriodEnd || sub.currentPeriodEnd <= now) return 0;
  const paid = priceKobo(current, sub.interval);
  if (!paid) return 0;
  const start = sub.currentPeriodStart ?? new Date(sub.currentPeriodEnd.getTime() - (addPeriod(now, sub.interval).getTime() - now.getTime()));
  const total = sub.currentPeriodEnd.getTime() - start.getTime();
  if (total <= 0) return 0;
  const remaining = Math.min(1, (sub.currentPeriodEnd.getTime() - now.getTime()) / total);
  return Math.floor(paid * remaining);
}

export async function quoteChange(companyId: string, planKey: string, interval: BillingInterval, now = new Date()) {
  const [plan, sub] = await Promise.all([prisma.subscriptionPlan.findUnique({ where: { key: planKey } }), prisma.subscription.findUnique({ where: { companyId }, include: { plan: true } })]);
  if (!plan || !plan.isActive) throw new AppError("NOT_FOUND", "Plan not found");
  if (!sub) throw new AppError("INVALID_STATE", "No subscription found");
  const price = priceKobo(plan, interval);
  if (!price) throw new AppError("VALIDATION", "This plan is priced by quote — contact sales.");
  const credit = Math.max(0, Math.min(price - MIN_CHARGE_KOBO, prorationCreditKobo(sub, sub.plan, plan.id, now)));
  return { plan, sub, priceKobo: price, creditKobo: credit, dueKobo: price - credit };
}

export async function startCheckout(companyId: string, actor: { id: string; name: string; role: string; email: string }, planKey: string, interval: BillingInterval, appUrl: string, opts: { autoRenew?: boolean } = {}) {
  const provider = getPaymentProvider();
  if (!provider.isConfigured()) throw new AppError("NOT_CONFIGURED", "Online payments aren't configured on this server yet (set PAYSTACK_SECRET_KEY).");
  const [plan, sub] = await Promise.all([prisma.subscriptionPlan.findUnique({ where: { key: planKey } }), prisma.subscription.findUnique({ where: { companyId } })]);
  if (!plan || !plan.isActive) throw new AppError("NOT_FOUND", "Plan not found");
  if (!sub) throw new AppError("INVALID_STATE", "No subscription found");
  const fullPrice = priceKobo(plan, interval);
  if (!fullPrice) throw new AppError("VALIDATION", "This plan is priced by quote — contact sales.");
  // Card processors reject tiny charges, so the credit is capped to always leave a collectable amount.
  const credit = Math.max(0, Math.min(fullPrice - MIN_CHARGE_KOBO, prorationCreditKobo(sub, await prisma.subscriptionPlan.findUnique({ where: { id: sub.planId } }), plan.id)));
  const amount = fullPrice - credit;
  // Block downgrades into a plan whose limits the company already exceeds.
  const usage = await currentUsage(companyId);
  for (const k of LIMIT_KEYS) {
    const lim = (plan.limits as Limits)[k];
    if (k !== "shipmentsPerMonth" && lim !== null && lim !== undefined && lim >= 0 && usage[k] > lim) throw new AppError("LIMIT_EXCEEDED", `You currently use ${usage[k]} ${k}; ${plan.name} allows ${lim}. Reduce usage before switching.`);
  }
  const reference = `sub_${companyId.slice(-6)}_${randomBytes(8).toString("hex")}`;
  await prisma.billingPayment.create({ data: { subscriptionId: sub.id, companyId, reference, amountKobo: amount, currency: plan.currency, planId: plan.id, interval, status: "PENDING" } });
  const init = await provider.initialize({ email: actor.email, amountKobo: amount, currency: plan.currency, reference, callbackUrl: `${appUrl}/billing/callback`, metadata: { companyId, planKey, interval, autoRenew: opts.autoRenew !== false, prorationCreditKobo: credit } });
  await audit({ companyId, actor, action: "billing.checkout_started", resourceType: "Subscription", resourceId: sub.id, after: { planKey, interval, amountKobo: amount, prorationCreditKobo: credit, reference } });
  return { url: init.authorizationUrl, reference, prorationCreditKobo: credit };
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
  // Save a reusable card token for auto-renewal (only if the customer opted in at checkout, or already had it on).
  const auth = v.authorization;
  const card = auth?.reusable ? { paystackAuthCode: auth.code, cardLast4: auth.last4, cardBrand: auth.brand, billingEmail: auth.email ?? sub.billingEmail, autoRenew: v.metadata?.autoRenew === false ? sub.autoRenew : true } : {};
  const stillActive = sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now && sub.planId === pay.planId;
  const start = stillActive ? sub.currentPeriodEnd! : now; // renewing early extends, a plan change restarts the period
  await prisma.subscription.update({ where: { id: sub.id }, data: { planId: pay.planId, interval: pay.interval, status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: addPeriod(start, pay.interval), graceEndsAt: null, cancelAtPeriodEnd: false, cancelledAt: null, trialEndsAt: null, pendingPlanId: null, pendingInterval: null, ...card } });
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

export async function setAutoRenew(companyId: string, actor: { id: string; name: string; role: string }, on: boolean) {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub) throw new AppError("NOT_FOUND", "No subscription");
  if (on && !sub.paystackAuthCode) throw new AppError("INVALID_STATE", "No saved card yet. Complete one payment with a card first, then enable auto-renewal.");
  await prisma.subscription.update({ where: { id: sub.id }, data: { autoRenew: on } });
  await audit({ companyId, actor, action: on ? "billing.autorenew_enabled" : "billing.autorenew_disabled", resourceType: "Subscription", resourceId: sub.id });
}

export async function removeSavedCard(companyId: string, actor: { id: string; name: string; role: string }) {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub) throw new AppError("NOT_FOUND", "No subscription");
  await prisma.subscription.update({ where: { id: sub.id }, data: { autoRenew: false, paystackAuthCode: null, cardLast4: null, cardBrand: null } });
  await audit({ companyId, actor, action: "billing.card_removed", resourceType: "Subscription", resourceId: sub.id });
}

/**
 * Charges saved cards for subscriptions that end within `leadHours`. Runs from the maintenance job and is safe to
 * run repeatedly: a PENDING renewal payment blocks a second charge, and money is only credited via confirmPayment
 * (server-side verify), never from the charge response itself.
 */
export async function renewDueSubscriptions(now = new Date(), leadHours = 24): Promise<{ attempted: number; renewed: number; failed: number; pending: number }> {
  const out = { attempted: 0, renewed: 0, failed: 0, pending: 0 };
  const provider = getPaymentProvider();
  if (!provider.isConfigured() || !provider.chargeAuthorization) return out;
  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", autoRenew: true, cancelAtPeriodEnd: false, paystackAuthCode: { not: null }, currentPeriodEnd: { lte: new Date(now.getTime() + leadHours * 3600_000) } },
    include: { plan: true },
  });
  for (const sub of due) {
    try {
      // Settle any earlier unfinished renewal first — never stack a second charge on an unknown outcome.
      const open = await prisma.billingPayment.findFirst({ where: { subscriptionId: sub.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - 48 * 3600_000) } } });
      if (open) {
        const r = await confirmPayment(open.reference).catch(() => ({ status: "PENDING" as const }));
        if (r.status === "PENDING") { out.pending++; continue; }
        if (r.status === "SUCCESSFUL") { out.renewed++; continue; }
      }
      const planId = sub.pendingPlanId ?? sub.planId;
      const interval = sub.pendingInterval ?? sub.interval;
      const plan = planId === sub.planId ? sub.plan : await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      const amount = plan ? priceKobo(plan, interval) : null;
      if (!plan || !plan.isActive || !amount) continue; // quote-priced / retired plan: needs a human
      const email = sub.billingEmail ?? (await prisma.user.findFirst({ where: { companyId: sub.companyId, role: "COMPANY_OWNER", isActive: true }, select: { email: true } }))?.email;
      if (!email) continue;
      const reference = `ren_${sub.companyId.slice(-6)}_${randomBytes(8).toString("hex")}`;
      await prisma.billingPayment.create({ data: { subscriptionId: sub.id, companyId: sub.companyId, reference, amountKobo: amount, currency: plan.currency, planId: plan.id, interval, status: "PENDING" } });
      out.attempted++;
      let charge: { status: "success" | "failed" | "pending" } = { status: "pending" };
      try {
        charge = await provider.chargeAuthorization({ email, amountKobo: amount, currency: plan.currency, reference, authorizationCode: sub.paystackAuthCode!, metadata: { companyId: sub.companyId, planKey: plan.key, interval, autoRenew: true, renewal: true } });
      } catch (e) {
        console.error("[billing] charge errored", sub.companyId, e instanceof Error ? e.message : e);
      }
      await audit({ companyId: sub.companyId, action: "billing.autorenew_attempted", resourceType: "Subscription", resourceId: sub.id, after: { reference, amountKobo: amount, chargeStatus: charge.status } });
      const r = await confirmPayment(reference).catch(() => ({ status: "PENDING" as const }));
      if (r.status === "SUCCESSFUL") out.renewed++; else if (r.status === "FAILED") out.failed++; else out.pending++;
    } catch (e) {
      console.error("[billing] renewal failed", sub.companyId, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
