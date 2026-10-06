import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/platform/db";
import { startCheckout, confirmPayment, cancelSubscription, addPeriod } from "@/lib/platform/billing";
import { setPaymentProvider, paystack, type PaymentProvider, type VerifyResult } from "@/lib/platform/payments/provider";
import { getEntitlements } from "@/lib/platform/entitlements";
import { makeTenant, type TestTenant } from "./helpers";

let T: TestTenant;
let verifyResult: VerifyResult;
const calls = { verify: 0 };
const fake: PaymentProvider = {
  name: "fake", isConfigured: () => true, publicKey: () => "pk",
  initialize: async (i) => { verifyResult = { status: "success", amountKobo: i.amountKobo, currency: i.currency, reference: i.reference, paidAt: new Date(), raw: {} }; return { authorizationUrl: `https://pay.test/${i.reference}`, reference: i.reference }; },
  verify: async () => { calls.verify++; return verifyResult; },
  verifyWebhookSignature: paystack.verifyWebhookSignature,
};
const actor = () => ({ id: T.owner.id, name: "Owner", role: "COMPANY_OWNER", email: "o@test.dev" });

beforeAll(async () => { T = await makeTenant("Bill", "starter"); setPaymentProvider(fake); process.env.PAYSTACK_WEBHOOK_SECRET = "whsec_test"; });
afterAll(() => setPaymentProvider(null));

describe("subscription billing", () => {
  it("is blocked cleanly when the provider is not configured", async () => {
    setPaymentProvider({ ...fake, isConfigured: () => false });
    await expect(startCheckout(T.companyId, actor(), "professional", "MONTHLY", "http://x")).rejects.toThrow(/aren't configured/);
    setPaymentProvider(fake);
  });

  it("rejects quote-priced plans and unknown plans", async () => {
    await expect(startCheckout(T.companyId, actor(), "enterprise", "MONTHLY", "http://x")).rejects.toThrow(/quote|sales/i);
    await expect(startCheckout(T.companyId, actor(), "nope", "MONTHLY", "http://x")).rejects.toThrow();
  });

  it("checkout → verified payment activates the plan exactly once (idempotent)", async () => {
    const { reference } = await startCheckout(T.companyId, actor(), "professional", "MONTHLY", "http://x");
    expect((await prisma.billingPayment.findUnique({ where: { reference } }))?.status).toBe("PENDING");
    const a = await confirmPayment(reference);
    expect(a).toEqual({ status: "SUCCESSFUL", alreadyProcessed: false });
    const end1 = (await prisma.subscription.findUnique({ where: { companyId: T.companyId } }))!.currentPeriodEnd!;
    // replays (browser callback + webhook + webhook retry)
    await Promise.all([confirmPayment(reference), confirmPayment(reference), confirmPayment(reference)]);
    const sub = (await prisma.subscription.findUnique({ where: { companyId: T.companyId }, include: { plan: true } }))!;
    expect(sub.status).toBe("ACTIVE");
    expect(sub.plan.key).toBe("professional");
    expect(sub.currentPeriodEnd!.getTime()).toBe(end1.getTime()); // not extended again
    expect(Math.abs(end1.getTime() - addPeriod(new Date(), "MONTHLY").getTime())).toBeLessThan(5000);
    expect((await getEntitlements(T.companyId)).features.has("live_map")).toBe(true);
  });

  it("annual payments extend by a year; renewing an active plan extends from the current period end", async () => {
    const before = (await prisma.subscription.findUnique({ where: { companyId: T.companyId } }))!.currentPeriodEnd!;
    const { reference } = await startCheckout(T.companyId, actor(), "professional", "ANNUAL", "http://x");
    await confirmPayment(reference);
    const after = (await prisma.subscription.findUnique({ where: { companyId: T.companyId } }))!;
    expect(after.interval).toBe("ANNUAL");
    expect(after.currentPeriodEnd!.getTime()).toBe(addPeriod(before, "ANNUAL").getTime());
  });

  it("rejects a payment whose provider amount doesn't match the order", async () => {
    const { reference } = await startCheckout(T.companyId, actor(), "premium", "MONTHLY", "http://x");
    verifyResult = { ...verifyResult, amountKobo: 100 };
    await expect(confirmPayment(reference)).rejects.toThrow(/does not match/);
    expect((await prisma.billingPayment.findUnique({ where: { reference } }))?.status).toBe("PENDING");
  });

  it("never trusts the caller: failed provider status marks the payment failed and moves the plan to past-due", async () => {
    const { reference } = await startCheckout(T.companyId, actor(), "premium", "MONTHLY", "http://x");
    verifyResult = { ...verifyResult, status: "failed" };
    expect((await confirmPayment(reference)).status).toBe("FAILED");
    const sub = await prisma.subscription.findUnique({ where: { companyId: T.companyId } });
    expect(sub?.status).toBe("PAST_DUE");
    expect(sub?.graceEndsAt).not.toBeNull();
    expect((await getEntitlements(T.companyId)).access.level).toBe("GRACE");
  });

  it("blocks switching into a plan whose limits current usage exceeds", async () => {
    const X = await makeTenant("Down", "premium");
    const { prisma: p } = await import("./helpers");
    await p.subscriptionPlan.update({ where: { key: "starter" }, data: { limits: { shipmentsPerMonth: 500, drivers: 0, vehicles: 10, users: 5, branches: 1 } } });
    await expect(startCheckout(X.companyId, { id: X.owner.id, name: "o", role: "COMPANY_OWNER", email: "o@x.dev" }, "starter", "MONTHLY", "http://x")).rejects.toThrow(/Reduce usage/);
    await p.subscriptionPlan.update({ where: { key: "starter" }, data: { limits: { shipmentsPerMonth: 500, drivers: 10, vehicles: 10, users: 5, branches: 1 } } });
  });

  it("cancel keeps access until period end, resume restores", async () => {
    await prisma.subscription.update({ where: { companyId: T.companyId }, data: { status: "ACTIVE", graceEndsAt: null } });
    await cancelSubscription(T.companyId, { id: T.owner.id, name: "o", role: "COMPANY_OWNER" });
    expect((await prisma.subscription.findUnique({ where: { companyId: T.companyId } }))?.cancelAtPeriodEnd).toBe(true);
    expect((await getEntitlements(T.companyId)).access.level).toBe("FULL");
    await cancelSubscription(T.companyId, { id: T.owner.id, name: "o", role: "COMPANY_OWNER" }, true);
    expect((await prisma.subscription.findUnique({ where: { companyId: T.companyId } }))?.cancelAtPeriodEnd).toBe(false);
  });
});

describe("paystack webhook", () => {
  const EID = Date.now();
  const sign = (body: string) => createHmac("sha512", "whsec_test").update(body).digest("hex");
  it("signature verification: valid passes; tampered/missing fail", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    expect(paystack.verifyWebhookSignature(body, sign(body))).toBe(true);
    expect(paystack.verifyWebhookSignature(body + " ", sign(body))).toBe(false);
    expect(paystack.verifyWebhookSignature(body, null)).toBe(false);
    expect(paystack.verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });

  it("route: rejects bad signatures, processes valid events once, ignores redeliveries", async () => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    const { reference } = await startCheckout(T.companyId, actor(), "premium", "MONTHLY", "http://x");
    verifyResult = { status: "success", amountKobo: verifyResult.amountKobo, currency: "NGN", reference, paidAt: new Date(), raw: {} };
    const body = JSON.stringify({ event: "charge.success", data: { id: EID, reference } });
    const mk = (sig: string) => new Request("http://x/api/webhooks/paystack", { method: "POST", body, headers: { "x-paystack-signature": sig } });

    expect((await POST(mk("bad"))).status).toBe(401);
    expect(await prisma.webhookEvent.count({ where: { eventId: `charge.success:${EID}` } })).toBe(0); // nothing recorded for bad signatures
    expect((await POST(mk(sign(body)))).status).toBe(200);
    const verifies = calls.verify;
    const dup = await POST(mk(sign(body)));
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ duplicate: true });
    expect(calls.verify).toBe(verifies); // redelivery didn't hit the provider or re-credit
    expect(await prisma.webhookEvent.count({ where: { eventId: `charge.success:${EID}` } })).toBe(1);
    expect((await prisma.billingPayment.findUnique({ where: { reference } }))?.status).toBe("SUCCESSFUL");
    const sub = await prisma.subscription.findUnique({ where: { companyId: T.companyId }, include: { plan: true } });
    expect(sub?.plan.key).toBe("premium");
  });

  it("route: unknown references are acknowledged without side effects", async () => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, reference: "not-ours" } });
    const res = await POST(new Request("http://x", { method: "POST", body, headers: { "x-paystack-signature": sign(body) } }));
    expect(res.status).toBe(200);
  });
});
