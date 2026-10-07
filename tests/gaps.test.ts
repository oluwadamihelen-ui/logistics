import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { prisma, makeTenant, uniq, type TestTenant } from "./helpers";
import { emit } from "@/lib/platform/notifications/engine";
import { loadServiceAccount, signServiceJwt } from "@/lib/platform/notifications/push";
import { signRequest, s3Storage } from "@/lib/platform/storage-s3";
import { getStorage } from "@/lib/platform/storage";
import { setPaymentProvider, paystack, type PaymentProvider, type VerifyResult } from "@/lib/platform/payments/provider";
import { confirmPayment, startCheckout, renewDueSubscriptions, prorationCreditKobo, setAutoRenew, quoteChange } from "@/lib/platform/billing";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const sa = { project_id: "proj-1", client_email: "svc@proj-1.iam.gserviceaccount.com", private_key: pem };

afterEach(() => { vi.unstubAllGlobals(); delete process.env.FCM_SERVICE_ACCOUNT_JSON; });

describe("FCM push", () => {
  it("parses the service account as JSON or base64 and rejects junk", () => {
    expect(loadServiceAccount(JSON.stringify(sa))?.project_id).toBe("proj-1");
    expect(loadServiceAccount(Buffer.from(JSON.stringify(sa)).toString("base64"))?.client_email).toBe(sa.client_email);
    expect(loadServiceAccount("nope")).toBeNull();
    expect(loadServiceAccount(undefined)).toBeNull();
  });
  it("signs a verifiable RS256 JWT", () => {
    const jwt = signServiceJwt(sa, 1_700_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString()).scope).toContain("firebase.messaging");
    const pub = (require("node:crypto") as typeof import("node:crypto")).createPublicKey(pem);
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(pub, Buffer.from(s, "base64url"))).toBe(true);
  });

  describe("engine delivery", () => {
    let T: TestTenant;
    beforeAll(async () => {
      T = await makeTenant("Push");
      await prisma.companySettings.updateMany({ where: { companyId: T.companyId }, data: { enabledChannels: ["IN_APP", "PUSH"] } });
    });
    const fire = () => emit({ db: T.svc.db, companyId: T.companyId }, { type: "billing.payment_failed", title: "Hi", body: "Body", userIds: [T.owner.id], dedupeKey: `k${uniq()}` });
    const deliveries = () => prisma.notificationDelivery.findMany({ where: { channel: "PUSH", notification: { companyId: T.companyId } }, orderBy: { id: "asc" } });

    it("is SKIPPED when FCM isn't configured, and when the user has no device", async () => {
      await fire();
      expect((await deliveries()).at(-1)).toMatchObject({ state: "SKIPPED", error: "provider not configured" });
      process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(sa);
      await fire();
      expect((await deliveries()).at(-1)).toMatchObject({ state: "SKIPPED", error: "no registered device" });
    });

    it("sends to every device, prunes dead tokens, and records SENT / FAILED honestly", async () => {
      process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(sa);
      const good = `good-${uniq()}-aaaaaaaaaaaaaaaaaaaa`, dead = `dead-${uniq()}-aaaaaaaaaaaaaaaaaaaa`;
      await prisma.pushDevice.createMany({ data: [good, dead].map((token) => ({ token, platform: "android", userId: T.owner.id, companyId: T.companyId })) });
      const sent: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
        if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
        const tok = JSON.parse(init.body).message.token as string;
        sent.push(tok);
        return tok === dead ? new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 }) : new Response("{}", { status: 200 });
      }));
      await fire();
      expect(sent.sort()).toEqual([dead, good].sort());
      expect((await deliveries()).at(-1)?.state).toBe("SENT");
      expect(await prisma.pushDevice.findUnique({ where: { token: dead } })).toBeNull();
      expect(await prisma.pushDevice.findUnique({ where: { token: good } })).not.toBeNull();

      vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("oauth2") ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 })) : new Response("boom", { status: 500 })));
      await fire();
      expect((await deliveries()).at(-1)).toMatchObject({ state: "FAILED" });
      expect(await prisma.pushDevice.findUnique({ where: { token: good } })).not.toBeNull(); // transient errors don't prune
    });
  });
});

describe("S3 storage", () => {
  const cfg = { bucket: "bkt", region: "auto", accessKeyId: "AKID", secret: "SECRET", endpoint: "https://acct.r2.example.com", prefix: "" };
  it("produces a deterministic SigV4 request (path-style, signed host/date/payload hash)", () => {
    const a = signRequest(cfg, "PUT", "co1/abc", Buffer.from("hello"), new Date("2026-01-02T03:04:05Z"));
    const b = signRequest(cfg, "PUT", "co1/abc", Buffer.from("hello"), new Date("2026-01-02T03:04:05Z"));
    expect(a).toEqual(b);
    expect(a.url).toBe("https://acct.r2.example.com/bkt/co1/abc");
    expect(a.headers["x-amz-date"]).toBe("20260102T030405Z");
    expect(a.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/20260102\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(signRequest(cfg, "PUT", "co1/abc", Buffer.from("other"), new Date("2026-01-02T03:04:05Z")).headers.authorization).not.toBe(a.headers.authorization);
  });
  it("is selected by STORAGE_PROVIDER=s3 only when fully configured; round-trips through the bucket API", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    expect(getStorage()).toBeNull();
    Object.assign(process.env, { S3_BUCKET: "bkt", S3_REGION: "auto", S3_ACCESS_KEY_ID: "AKID", S3_SECRET_ACCESS_KEY: "SECRET", S3_ENDPOINT: "https://acct.r2.example.com", S3_KEY_PREFIX: "uploads" });
    try {
      const store = getStorage()!;
      expect(store.name).toBe("s3");
      const objects = new Map<string, Buffer>();
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
        const k = new URL(url).pathname;
        expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256");
        if (init.method === "PUT") { objects.set(k, Buffer.from(init.body)); return new Response(null, { status: 200 }); }
        if (init.method === "GET") return objects.has(k) ? new Response(new Uint8Array(objects.get(k)!)) : new Response(null, { status: 404 });
        objects.delete(k); return new Response(null, { status: 204 });
      }));
      const key = await store.put("co1", Buffer.from("pdf-bytes"));
      expect([...objects.keys()][0]).toBe(`/bkt/uploads/${key}`);
      expect((await store.get(key)).toString()).toBe("pdf-bytes");
      await store.remove(key);
      await expect(store.get(key)).rejects.toThrow();
      await expect(store.get("../../etc/passwd")).rejects.toThrow("bad key");
    } finally {
      delete process.env.STORAGE_PROVIDER;
      for (const k of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_KEY_PREFIX"]) delete process.env[k];
    }
    expect(s3Storage.isConfigured()).toBe(false);
  });
});

describe("auto-renewal & proration", () => {
  let T: TestTenant;
  let nextVerify: Partial<VerifyResult> = {};
  let chargeStatus: "success" | "failed" | "pending" = "success";
  const charges: any[] = [];
  const fake: PaymentProvider = {
    name: "fake", isConfigured: () => true, publicKey: () => "pk",
    initialize: async (i) => { nextVerify = { status: "success", amountKobo: i.amountKobo, currency: i.currency, reference: i.reference, paidAt: new Date(), raw: {}, metadata: i.metadata, authorization: { code: "AUTH_x", reusable: true, last4: "4081", brand: "visa", email: "o@test.dev" } }; return { authorizationUrl: "https://pay.test", reference: i.reference }; },
    verify: async (ref) => ({ status: "success", amountKobo: 0, currency: "NGN", reference: ref, paidAt: new Date(), raw: {}, ...nextVerify } as any),
    chargeAuthorization: async (i) => { charges.push(i); nextVerify = { status: chargeStatus === "success" ? "success" : chargeStatus === "failed" ? "failed" : "pending", amountKobo: i.amountKobo, currency: i.currency, reference: i.reference, paidAt: new Date(), raw: {} }; return { status: chargeStatus }; },
    verifyWebhookSignature: paystack.verifyWebhookSignature,
  };
  const actor = () => ({ id: T.owner.id, name: "Owner", role: "COMPANY_OWNER", email: "o@test.dev" });
  const sub = () => prisma.subscription.findUniqueOrThrow({ where: { companyId: T.companyId } });
  beforeAll(async () => { T = await makeTenant("Renew", "starter"); setPaymentProvider(fake); });
  afterAll(() => setPaymentProvider(null));

  it("pure proration: credits the unused share of the current plan, never on renewals", () => {
    const now = new Date("2026-01-16T00:00:00Z");
    const s = { status: "ACTIVE", planId: "a", interval: "MONTHLY" as const, currentPeriodStart: new Date("2026-01-01T00:00:00Z"), currentPeriodEnd: new Date("2026-01-31T00:00:00Z") };
    const plan = { monthlyPriceKobo: 3_000_000, annualPriceKobo: null };
    expect(prorationCreditKobo(s, plan, "b", now)).toBe(1_500_000);
    expect(prorationCreditKobo(s, plan, "a", now)).toBe(0);
    expect(prorationCreditKobo({ ...s, status: "TRIALING" }, plan, "b", now)).toBe(0);
    expect(prorationCreditKobo({ ...s, currentPeriodEnd: new Date("2026-01-10T00:00:00Z") }, plan, "b", now)).toBe(0);
  });

  it("first card payment saves a reusable authorization and turns auto-renew on", async () => {
    const { reference } = await startCheckout(T.companyId, actor(), "starter", "MONTHLY", "http://x");
    await confirmPayment(reference);
    expect(await sub()).toMatchObject({ autoRenew: true, paystackAuthCode: "AUTH_x", cardLast4: "4081", cardBrand: "visa", status: "ACTIVE" });
  });

  it("does nothing until the period is within the lead window", async () => {
    expect(await renewDueSubscriptions(new Date())).toMatchObject({ attempted: 0 });
  });

  it("charges the saved card near period end and extends exactly once, even when the job runs twice", async () => {
    const before = (await sub()).currentPeriodEnd!;
    const soon = new Date(before.getTime() - 3600_000);
    charges.length = 0; chargeStatus = "success";
    const r1 = await renewDueSubscriptions(soon);
    expect(r1).toMatchObject({ attempted: 1, renewed: 1, failed: 0 });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ authorizationCode: "AUTH_x", email: "o@test.dev" });
    const after = (await sub()).currentPeriodEnd!;
    expect(after.getTime()).toBeGreaterThan(before.getTime() + 25 * 86400_000);
    expect(await renewDueSubscriptions(soon)).toMatchObject({ attempted: 0 }); // new period isn't due
    expect(charges).toHaveLength(1);
  });

  it("a declined renewal marks the plan past-due with a grace period and notifies; it is not retried blindly", async () => {
    const end = (await sub()).currentPeriodEnd!;
    charges.length = 0; chargeStatus = "failed";
    const r = await renewDueSubscriptions(new Date(end.getTime() - 3600_000));
    expect(r).toMatchObject({ attempted: 1, failed: 1 });
    expect(await sub()).toMatchObject({ status: "PAST_DUE" });
    expect((await sub()).graceEndsAt).not.toBeNull();
    expect(await renewDueSubscriptions(new Date(end.getTime() - 3600_000))).toMatchObject({ attempted: 0 });
  });

  it("an unconfirmed (pending) charge is not duplicated", async () => {
    await prisma.subscription.update({ where: { companyId: T.companyId }, data: { status: "ACTIVE", graceEndsAt: null } });
    const end = (await sub()).currentPeriodEnd!;
    charges.length = 0; chargeStatus = "pending";
    const when = new Date(end.getTime() - 3600_000);
    expect(await renewDueSubscriptions(when)).toMatchObject({ attempted: 1, pending: 1 });
    expect(await renewDueSubscriptions(when)).toMatchObject({ attempted: 0, pending: 1 });
    expect(charges).toHaveLength(1);
    await prisma.billingPayment.updateMany({ where: { companyId: T.companyId, status: "PENDING" }, data: { status: "FAILED" } });
  });

  it("opt-out and card removal stop renewals; enabling needs a saved card", async () => {
    await prisma.subscription.update({ where: { companyId: T.companyId }, data: { status: "ACTIVE", graceEndsAt: null } });
    await setAutoRenew(T.companyId, actor(), false);
    expect(await renewDueSubscriptions(new Date((await sub()).currentPeriodEnd!.getTime() - 3600_000))).toMatchObject({ attempted: 0 });
    await prisma.subscription.update({ where: { companyId: T.companyId }, data: { paystackAuthCode: null } });
    await expect(setAutoRenew(T.companyId, actor(), true)).rejects.toThrow(/No saved card/);
  });

  it("mid-period upgrade is prorated in the checkout amount", async () => {
    await prisma.subscription.update({ where: { companyId: T.companyId }, data: { status: "ACTIVE", graceEndsAt: null, currentPeriodStart: new Date(Date.now() - 10 * 86400_000), currentPeriodEnd: new Date(Date.now() + 20 * 86400_000) } });
    const q = await quoteChange(T.companyId, "professional", "MONTHLY");
    expect(q.creditKobo).toBeGreaterThan(0);
    expect(q.dueKobo).toBe(q.priceKobo - q.creditKobo);
    const { reference } = await startCheckout(T.companyId, actor(), "professional", "MONTHLY", "http://x");
    expect((await prisma.billingPayment.findUniqueOrThrow({ where: { reference } })).amountKobo).toBe(q.dueKobo);
  });
});
