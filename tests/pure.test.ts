import { describe, it, expect } from "vitest";
import { can, permissionsFor, ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/platform/permissions";
import { canTransition, TRANSITIONS, TERMINAL, ALL_STATUSES, publicStageIndex } from "@/lib/logistics/shipment-status";
import { computeQuote, haversineKm, type PricingRuleLike } from "@/lib/logistics/pricing";
import { resolveAccess, assertWithinLimit, assertFeature, type Entitlements } from "@/lib/platform/entitlements";
import { generateTrackingNumber, hashOtp, normalizeTracking } from "@/lib/logistics/tracking";
import { deriveCodStatus } from "@/lib/logistics/cod";
import { redact } from "@/lib/platform/audit";

describe("RBAC", () => {
  it("platform admin has no tenant permissions; tenants have no platform.admin", () => {
    expect(permissionsFor({ role: "PLATFORM_SUPER_ADMIN" }).has("shipments.view")).toBe(false);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (role !== "PLATFORM_SUPER_ADMIN") expect(perms).not.toContain("platform.admin");
    }
  });
  it("drivers cannot touch finance, dispatch or settings", () => {
    for (const p of ["finance.view", "dispatch.manage", "settings.manage", "customers.view", "shipments.create"] as const) {
      expect(can({ role: "DRIVER" }, p)).toBe(false);
    }
    expect(can({ role: "DRIVER" }, "driver.app")).toBe(true);
  });
  it("accountant can manage finance but not assign drivers", () => {
    expect(can({ role: "ACCOUNTANT" }, "settlements.manage")).toBe(true);
    expect(can({ role: "ACCOUNTANT" }, "shipments.assign")).toBe(false);
  });
  it("per-user grants and denials override the role matrix, but platform.admin can never be granted", () => {
    expect(can({ role: "DISPATCHER", extraPermissions: ["reports.view"] }, "reports.view")).toBe(true);
    expect(can({ role: "COMPANY_OWNER", deniedPermissions: ["finance.manage"] }, "finance.manage")).toBe(false);
    expect(can({ role: "COMPANY_OWNER", extraPermissions: ["platform.admin"] }, "platform.admin")).toBe(false);
  });
  it("customers only get portal permissions", () => {
    const p = permissionsFor({ role: "CUSTOMER" });
    expect([...p].every((x) => x.startsWith("portal."))).toBe(true);
  });
  it("every permission referenced by a role exists", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) for (const p of perms) expect(PERMISSIONS).toContain(p);
  });
});

describe("shipment state machine", () => {
  it("terminal states have no exits", () => {
    for (const s of TERMINAL) expect(TRANSITIONS[s]).toHaveLength(0);
  });
  it("happy path is reachable", () => {
    const path = ["CREATED", "CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "AT_HUB", "SORTING", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("blocks illegal jumps", () => {
    expect(canTransition("CREATED", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "CREATED")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });
  it("failed delivery can retry, reschedule or return", () => {
    for (const t of ["RESCHEDULED", "READY_FOR_DISPATCH", "RETURNING"] as const) expect(canTransition("DELIVERY_FAILED", t)).toBe(true);
  });
  it("every status has a public stage", () => {
    for (const s of ALL_STATUSES) expect(publicStageIndex(s)).toBeGreaterThanOrEqual(0);
  });
});

const rule = (o: Partial<PricingRuleLike>): PricingRuleLike => ({
  id: "r", name: "rule", isActive: true, priority: 100, originZoneId: null, destinationZoneId: null, minWeightKg: null, maxWeightKg: null,
  minDistanceKm: null, maxDistanceKm: null, vehicleType: null, shipmentPriority: null, packageType: null, customerType: null,
  corporateAccountId: null, interstate: null, baseFee: 0, perKgFee: 0, includedKg: 0, perKmFee: 0, insurancePercent: 0, codFeePercent: 0,
  priorityMultiplier: 1, minimumFee: 0, ...o,
});
const req = { weightKg: 3, priority: "STANDARD" as const, packageType: "PARCEL" as const, declaredValue: 0, codAmount: 0 };

describe("pricing engine", () => {
  it("returns unmatched when no rule applies (no invented prices)", () => {
    expect(computeQuote([], req).matched).toBe(false);
    expect(computeQuote([rule({ originZoneId: "z1" })], { ...req, originZoneId: "z2" }).matched).toBe(false);
  });
  it("zone → zone weight bands", () => {
    const rules = [
      rule({ id: "a", name: "LM→Ikeja 0-5", originZoneId: "LM", destinationZoneId: "IKJ", maxWeightKg: 5, baseFee: 2000 }),
      rule({ id: "b", name: "LM→Lekki 0-5", originZoneId: "LM", destinationZoneId: "LEK", maxWeightKg: 5, baseFee: 3500 }),
    ];
    expect(computeQuote(rules, { ...req, originZoneId: "LM", destinationZoneId: "LEK" }).total).toBe(3500);
    expect(computeQuote(rules, { ...req, originZoneId: "LM", destinationZoneId: "IKJ" }).ruleId).toBe("a");
    expect(computeQuote(rules, { ...req, weightKg: 9, originZoneId: "LM", destinationZoneId: "IKJ" }).matched).toBe(false);
  });
  it("per-kg above included, priority multiplier, COD fee, minimum and discount", () => {
    const r = rule({ baseFee: 1000, perKgFee: 200, includedKg: 2, priorityMultiplier: 1.5, codFeePercent: 2, minimumFee: 1000 });
    const q = computeQuote([r], { ...req, weightKg: 4, priority: "EXPRESS", codAmount: 10000 });
    // (1000 + 2kg*200) = 1400 → ×1.5 = 2100 → + COD 200 = 2300
    expect(q.total).toBe(2300);
    expect(computeQuote([r], { ...req, weightKg: 4, discountPercent: 10 }).total).toBe(1890);
    expect(computeQuote([rule({ baseFee: 100, minimumFee: 500 })], req).total).toBe(500);
  });
  it("ignores inactive rules; lower priority number wins; more specific wins ties", () => {
    const rules = [rule({ id: "inactive", isActive: false, baseFee: 1 }), rule({ id: "gen", priority: 50, baseFee: 900 }), rule({ id: "spec", priority: 50, packageType: "PARCEL", baseFee: 700 })];
    expect(computeQuote(rules, req).ruleId).toBe("spec");
  });
  it("haversine sanity", () => {
    expect(Math.round(haversineKm({ lat: 6.5244, lng: 3.3792 }, { lat: 6.4474, lng: 3.4723 }))).toBeGreaterThan(8);
  });
});

describe("entitlements", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  const d = (days: number) => new Date(now.getTime() + days * 86400_000);
  it("trial → expired", () => {
    expect(resolveAccess({ status: "TRIALING", trialEndsAt: d(3), currentPeriodEnd: null, graceEndsAt: null }, now).level).toBe("FULL");
    expect(resolveAccess({ status: "TRIALING", trialEndsAt: d(-1), currentPeriodEnd: null, graceEndsAt: null }, now).level).toBe("READ_ONLY");
  });
  it("active → grace → expired", () => {
    const base = { status: "ACTIVE" as const, trialEndsAt: null, graceEndsAt: null };
    expect(resolveAccess({ ...base, currentPeriodEnd: d(5) }, now).level).toBe("FULL");
    expect(resolveAccess({ ...base, currentPeriodEnd: d(-2) }, now)).toMatchObject({ level: "GRACE", status: "PAST_DUE" });
    expect(resolveAccess({ ...base, currentPeriodEnd: d(-10) }, now).level).toBe("READ_ONLY");
  });
  it("past_due honours explicit grace end; suspended blocks; cancelled keeps access until period end", () => {
    expect(resolveAccess({ status: "PAST_DUE", trialEndsAt: null, currentPeriodEnd: d(-20), graceEndsAt: d(2) }, now).level).toBe("GRACE");
    expect(resolveAccess({ status: "SUSPENDED", trialEndsAt: null, currentPeriodEnd: d(20), graceEndsAt: null }, now).level).toBe("BLOCKED");
    expect(resolveAccess({ status: "CANCELLED", trialEndsAt: null, currentPeriodEnd: d(4), graceEndsAt: null }, now).level).toBe("FULL");
    expect(resolveAccess(null, now).level).toBe("READ_ONLY");
  });
  it("limits and features", () => {
    const e = { limits: { drivers: 3, users: null }, features: new Set(["shipments"]) } as unknown as Entitlements;
    expect(() => assertWithinLimit(e, "drivers", 2)).not.toThrow();
    expect(() => assertWithinLimit(e, "drivers", 3)).toThrow(/Upgrade/);
    expect(() => assertWithinLimit(e, "users", 9999)).not.toThrow(); // unlimited
    expect(() => assertFeature(e, "api_access")).toThrow();
  });
});

describe("tracking + cod + audit helpers", () => {
  it("tracking numbers are well-formed and unique-ish", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateTrackingNumber("LX")));
    expect(set.size).toBe(2000);
    for (const t of set) expect(t).toMatch(/^LX[2-9A-HJKMNP-Z]{9}$/);
    expect(normalizeTracking(" lx-ab cd ")).toBe("LXABCD");
  });
  it("otp hash is bound to the shipment", () => {
    expect(hashOtp("a", "123456")).not.toBe(hashOtp("b", "123456"));
  });
  it("cod status derivation", () => {
    expect(deriveCodStatus({ amountDue: 100, amountCollected: 0, amountSettled: 0 })).toBe("PENDING");
    expect(deriveCodStatus({ amountDue: 100, amountCollected: 100, amountSettled: 0 })).toBe("COLLECTED");
    expect(deriveCodStatus({ amountDue: 100, amountCollected: 100, amountSettled: 40 })).toBe("PARTIALLY_SETTLED");
    expect(deriveCodStatus({ amountDue: 100, amountCollected: 100, amountSettled: 100 })).toBe("SETTLED");
    expect(deriveCodStatus({ amountDue: 100, amountCollected: 90, amountSettled: 0, disputed: true })).toBe("DISPUTED");
  });
  it("audit redaction strips secrets", () => {
    const r = redact({ name: "x", passwordHash: "abc", nested: { apiKey: "k", ok: 1 } }) as any;
    expect(r.passwordHash).toBe("[redacted]");
    expect(r.nested.apiKey).toBe("[redacted]");
    expect(r.nested.ok).toBe(1);
  });
});
