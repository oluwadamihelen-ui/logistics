import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/platform/db";
import { generateApiKey } from "@/lib/platform/api-auth";
import { isSafeWebhookUrl, sign } from "@/lib/logistics/webhooks";
import { POST as createRoute, GET as listRoute } from "@/app/api/v1/shipments/route";
import { GET as getRoute } from "@/app/api/v1/shipments/[ref]/route";
import { POST as cancelRoute } from "@/app/api/v1/shipments/[ref]/cancel/route";
import { makeTenant, shipmentInput, type TestTenant } from "./helpers";

let A: TestTenant, B: TestTenant, S: TestTenant;
let keyA: string, keyReadOnly: string, keyB: string, keyCorp: string, keyRevoked: string;
let corpId: string;

async function mkKey(t: TestTenant, scopes: string[], customerId?: string, revoked = false) {
  const { key, prefix, hash } = generateApiKey();
  await prisma.apiKey.create({ data: { companyId: t.companyId, name: "test", prefix, keyHash: hash, scopes, customerId, revokedAt: revoked ? new Date() : null } });
  return key;
}
const req = (url: string, key: string | null, init: RequestInit = {}) => new Request(`http://x${url}`, { ...init, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", ...(init.headers ?? {}) } });
const body = (o: Record<string, unknown> = {}) => JSON.stringify(shipmentInput(o));
const ctxRef = (ref: string) => ({ params: Promise.resolve({ ref }) });

beforeAll(async () => {
  A = await makeTenant("ApiA", "premium"); B = await makeTenant("ApiB", "premium"); S = await makeTenant("ApiS", "starter");
  keyA = await mkKey(A, ["shipments:create", "shipments:read", "shipments:cancel", "tracking:read"]);
  keyReadOnly = await mkKey(A, ["shipments:read"]);
  keyB = await mkKey(B, ["shipments:create", "shipments:read", "shipments:cancel"]);
  keyRevoked = await mkKey(A, ["shipments:read"], undefined, true);
  const corp = await prisma.customer.create({ data: { companyId: A.companyId, name: "Corp One", phone: "0801", type: "CORPORATE" } });
  corpId = corp.id;
  await prisma.corporateAccount.create({ data: { companyId: A.companyId, customerId: corp.id, apiEnabled: true } });
  keyCorp = await mkKey(A, ["shipments:create", "shipments:read"], corp.id);
});

describe("API v1 authentication", () => {
  it("rejects missing, malformed, unknown and revoked keys", async () => {
    for (const k of [null, "garbage", "lgx_live_" + "0".repeat(48), keyRevoked]) expect((await listRoute(req("/api/v1/shipments", k))).status).toBe(401);
  });
  it("enforces scopes", async () => {
    expect((await createRoute(req("/api/v1/shipments", keyReadOnly, { method: "POST", body: body() }))).status).toBe(403);
    expect((await cancelRoute(req("/x", keyReadOnly, { method: "POST" }), ctxRef("whatever"))).status).toBe(403);
  });
  it("requires the api_access plan feature", async () => {
    const k = await mkKey(S, ["shipments:read"]);
    const r = await listRoute(req("/api/v1/shipments", k));
    expect(r.status).toBe(402);
  });
  it("stores only a hash of the key", async () => {
    const rows = await prisma.apiKey.findMany({ where: { companyId: A.companyId } });
    for (const r of rows) { expect(r.keyHash).toMatch(/^[a-f0-9]{64}$/); expect(r.keyHash).not.toContain("lgx_live"); }
  });
  it("blocks keys of suspended companies", async () => {
    const T = await makeTenant("ApiSusp", "premium"); const k = await mkKey(T, ["shipments:read"]);
    await prisma.company.update({ where: { id: T.companyId }, data: { status: "SUSPENDED" } });
    expect((await listRoute(req("/api/v1/shipments", k))).status).toBe(403);
  });
});

describe("API v1 shipments", () => {
  let tn: string;
  it("creates a shipment, priced from the company's rules", async () => {
    const r = await createRoute(req("/api/v1/shipments", keyA, { method: "POST", body: body({ weightKg: 2 }) }));
    expect(r.status).toBe(201);
    const j = await r.json(); tn = j.trackingNumber;
    expect(j.deliveryFee).toBe(1500);
    expect((await prisma.shipment.findUnique({ where: { trackingNumber: tn } }))?.source).toBe("API");
  });
  it("is idempotent with Idempotency-Key", async () => {
    const mk = () => createRoute(req("/api/v1/shipments", keyA, { method: "POST", body: body(), headers: { "Idempotency-Key": "abc-1" } }));
    const a = await (await mk()).json(), b = await (await mk()).json();
    expect(b.trackingNumber).toBe(a.trackingNumber);
  });
  it("validates input", async () => {
    expect((await createRoute(req("/api/v1/shipments", keyA, { method: "POST", body: JSON.stringify({ senderName: "x" }) }))).status).toBe(422);
    expect((await createRoute(req("/api/v1/shipments", keyA, { method: "POST", body: "not json" }))).status).toBe(422);
  });
  it("cannot read or cancel another company's shipment (404, not 403 — existence isn't leaked)", async () => {
    const other = await (await createRoute(req("/api/v1/shipments", keyB, { method: "POST", body: body() }))).json();
    expect((await getRoute(req("/x", keyA), ctxRef(other.trackingNumber))).status).toBe(404);
    expect((await cancelRoute(req("/x", keyA, { method: "POST" }), ctxRef(other.trackingNumber))).status).toBe(404);
    expect((await prisma.shipment.findUnique({ where: { trackingNumber: other.trackingNumber } }))?.status).toBe("CREATED");
  });
  it("lists only the caller's company with cursor pagination", async () => {
    const r = await (await listRoute(req("/api/v1/shipments?limit=1", keyA))).json();
    expect(r.data.length).toBeLessThanOrEqual(1);
    expect(r.nextCursor).not.toBeNull();
    const all = await (await listRoute(req("/api/v1/shipments?limit=100", keyA))).json();
    const ids = new Set(all.data.map((s: any) => s.trackingNumber));
    const bShips = await prisma.shipment.findMany({ where: { companyId: B.companyId } });
    for (const s of bShips) expect(ids.has(s.trackingNumber)).toBe(false);
  });
  it("gets with timeline and cancels", async () => {
    const g = await (await getRoute(req("/x", keyA), ctxRef(tn))).json();
    expect(g.events.length).toBeGreaterThan(0);
    const c = await cancelRoute(req("/x", keyA, { method: "POST" }), ctxRef(tn));
    expect(c.status).toBe(200);
    expect((await c.json()).status).toBe("CANCELLED");
    expect((await cancelRoute(req("/x", keyA, { method: "POST" }), ctxRef(tn))).status).toBe(200); // idempotent
  });
  it("customer-bound keys only see and create their own customer's shipments", async () => {
    const mine = await (await createRoute(req("/api/v1/shipments", keyCorp, { method: "POST", body: body() }))).json();
    expect((await prisma.shipment.findUnique({ where: { trackingNumber: mine.trackingNumber } }))?.customerId).toBe(corpId);
    const list = await (await listRoute(req("/api/v1/shipments?limit=100", keyCorp))).json();
    expect(list.data.map((s: any) => s.trackingNumber)).toEqual([mine.trackingNumber]);
    const companyWide = await createRoute(req("/api/v1/shipments", keyA, { method: "POST", body: body() })).then((r) => r.json());
    expect((await getRoute(req("/x", keyCorp), ctxRef(companyWide.trackingNumber))).status).toBe(404);
  });
  it("corporate keys stop working when API access is disabled for the account", async () => {
    await prisma.corporateAccount.update({ where: { customerId: corpId }, data: { apiEnabled: false } });
    expect((await listRoute(req("/api/v1/shipments", keyCorp))).status).toBe(403);
  });
});

describe("outbound webhooks", () => {
  it("only allows public https endpoints", () => {
    for (const u of ["http://example.com/h", "https://localhost/h", "https://127.0.0.1/h", "https://10.0.0.5/h", "https://192.168.1.1/x", "https://169.254.169.254/latest", "https://svc.internal/h", "ftp://x.com", "nonsense"]) expect(isSafeWebhookUrl(u)).toBe(false);
    expect(isSafeWebhookUrl("https://hooks.example.com/shipments")).toBe(true);
  });
  it("signature is deterministic and bound to timestamp and body", () => {
    expect(sign("s", 1, "{}")).toBe(sign("s", 1, "{}"));
    expect(sign("s", 1, "{}")).not.toBe(sign("s", 2, "{}"));
    expect(sign("s", 1, "{}")).not.toBe(sign("t", 1, "{}"));
  });
});
