import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/platform/db";
import { assignShipments, completeDelivery, createShipment, failDelivery, resolveFailure, transitionShipment, getPublicTracking, regenerateOtp, unassignShipment } from "@/lib/logistics/shipments";
import { recordCodRemittance, recordCodSettlement } from "@/lib/logistics/cod";
import { makeTenant, shipmentInput, type TestTenant } from "./helpers";

let T: TestTenant;
beforeAll(async () => { T = await makeTenant("Life"); });

async function toOutForDelivery(over: Record<string, unknown> = {}) {
  const s = await createShipment(T.svc, shipmentInput(over));
  await transitionShipment(T.svc, s.id, "CONFIRMED");
  await assignShipments(T.svc, [s.id], T.driverId); // pickup assigned
  await transitionShipment(T.svc, s.id, "PICKED_UP");
  await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: T.hubId });
  await transitionShipment(T.svc, s.id, "READY_FOR_DISPATCH");
  await assignShipments(T.svc, [s.id], T.driverId);
  await transitionShipment(T.svc, s.id, "OUT_FOR_DELIVERY");
  return s;
}
const gps = { lat: 6.45, lng: 3.47 };

describe("shipment creation", () => {
  it("creates with tracking/order numbers, price from rules, zone match, and a CREATED event", async () => {
    const s = await createShipment(T.svc, shipmentInput({ weightKg: 8 }));
    expect(s.trackingNumber).toMatch(/^LX/);
    expect(s.orderNumber).toMatch(/^SHP-\d{6}$/);
    expect(Number(s.deliveryFee)).toBe(1800); // 1500 + 3kg*100
    expect(s.pickupZoneId).toBe(T.zoneId);
    expect(s.deliveryZoneId).not.toBeNull();
    const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: s.id } });
    expect(events.map((e) => e.type)).toContain("created");
  });
  it("is idempotent per idempotencyKey", async () => {
    const a = await createShipment(T.svc, shipmentInput({ idempotencyKey: "k-1" }));
    const b = await createShipment(T.svc, shipmentInput({ idempotencyKey: "k-1" }));
    expect(b.id).toBe(a.id);
  });
  it("creates a PENDING COD ledger row for COD shipments", async () => {
    const s = await createShipment(T.svc, shipmentInput({ codAmount: 12000 }));
    const cod = await prisma.codTransaction.findUnique({ where: { shipmentId: s.id } });
    expect(cod).toMatchObject({ status: "PENDING" });
    expect(Number(cod!.amountDue)).toBe(12000);
  });
  it("order numbers are sequential and unique under concurrency", async () => {
    const made = await Promise.all(Array.from({ length: 12 }, () => createShipment(T.svc, shipmentInput())));
    expect(new Set(made.map((m) => m.orderNumber)).size).toBe(12);
    expect(new Set(made.map((m) => m.trackingNumber)).size).toBe(12);
  });
});

describe("lifecycle", () => {
  it("rejects illegal transitions and blocks DELIVERED without proof", async () => {
    const s = await createShipment(T.svc, shipmentInput());
    await expect(transitionShipment(T.svc, s.id, "DELIVERED")).rejects.toThrow();
    await expect(transitionShipment(T.svc, s.id, "OUT_FOR_DELIVERY")).rejects.toThrow(/Cannot move/);
  });
  it("runs the full happy path and records a timeline", async () => {
    const s = await toOutForDelivery();
    const done = await completeDelivery(T.svc, s.id, { recipientName: "Ada", photoUrl: "data:image/png;base64,AAA", ...gps }, { driverId: T.driverId });
    expect(done.status).toBe("DELIVERED");
    expect(done.deliveredAt).not.toBeNull();
    const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: s.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.status).filter(Boolean)).toEqual(expect.arrayContaining(["CREATED", "CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "AT_HUB", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"]));
    expect(await prisma.proofOfDelivery.count({ where: { shipmentId: s.id } })).toBe(1);
  });
  it("updates driver status with workload", async () => {
    const s = await toOutForDelivery();
    expect((await prisma.driver.findUnique({ where: { id: T.driverId } }))?.status).toBe("ON_DELIVERY");
    await completeDelivery(T.svc, s.id, { recipientName: "x", photoUrl: "p", ...gps }, { driverId: T.driverId });
  });
  it("unassign returns shipment to the pool", async () => {
    const s = await createShipment(T.svc, shipmentInput());
    await transitionShipment(T.svc, s.id, "CONFIRMED");
    await assignShipments(T.svc, [s.id], T.driverId);
    await unassignShipment(T.svc, s.id);
    const after = await prisma.shipment.findUnique({ where: { id: s.id } });
    expect(after).toMatchObject({ status: "CONFIRMED", driverId: null });
  });
  it("cancel is allowed early but not once out for delivery", async () => {
    const a = await createShipment(T.svc, shipmentInput({ codAmount: 500 }));
    await transitionShipment(T.svc, a.id, "CANCELLED", { note: "customer request" });
    expect(await prisma.codTransaction.count({ where: { shipmentId: a.id } })).toBe(0);
    const b = await toOutForDelivery();
    await expect(transitionShipment(T.svc, b.id, "CANCELLED")).rejects.toThrow();
  });
  it("assignment refuses unavailable drivers/vehicles and shipments in wrong state", async () => {
    const s = await createShipment(T.svc, shipmentInput());
    await expect(assignShipments(T.svc, [s.id], T.driverId)).resolves.toEqual([{ id: s.id, ok: false, error: expect.stringMatching(/Cannot assign/) }]);
    await prisma.vehicle.update({ where: { id: T.vehicleId }, data: { status: "MAINTENANCE" } });
    await transitionShipment(T.svc, s.id, "CONFIRMED");
    await expect(assignShipments(T.svc, [s.id], T.driverId)).rejects.toThrow(/not available/);
    await prisma.vehicle.update({ where: { id: T.vehicleId }, data: { status: "AVAILABLE" } });
  });
});

describe("proof of delivery", () => {
  it("enforces every required proof method; high-value shipments need more", async () => {
    await prisma.companySettings.update({ where: { companyId: T.companyId }, data: { highValueThreshold: 50000 } });
    const s = await toOutForDelivery({ declaredValue: 80000 });
    await expect(completeDelivery(T.svc, s.id, { recipientName: "A", ...gps }, { driverId: T.driverId })).rejects.toThrow(/signature.*photo|photo.*otp|OTP/i);
    await expect(completeDelivery(T.svc, s.id, { recipientName: "A", signatureData: "sig", photoUrl: "ph", ...gps }, { driverId: T.driverId })).rejects.toThrow(/OTP/);
    const { otp } = await regenerateOtp(T.svc, s.id);
    await expect(completeDelivery(T.svc, s.id, { recipientName: "A", signatureData: "sig", photoUrl: "ph", otp: otp === "000000" ? "111111" : "000000", ...gps }, { driverId: T.driverId })).rejects.toThrow(/Incorrect OTP/);
    const ok = await completeDelivery(T.svc, s.id, { recipientName: "A", signatureData: "sig", photoUrl: "ph", otp, ...gps }, { driverId: T.driverId });
    expect(ok.status).toBe("DELIVERED");
    expect((await prisma.proofOfDelivery.findUnique({ where: { shipmentId: s.id } }))?.otpVerified).toBe(true);
  });
  it("only the assigned driver can complete a delivery", async () => {
    const s = await toOutForDelivery();
    await expect(completeDelivery(T.svc, s.id, { recipientName: "A", photoUrl: "p", ...gps }, { driverId: "someone-else" })).rejects.toThrow(/not assigned/);
  });
  it("is idempotent on replay (offline sync double-submit)", async () => {
    const s = await toOutForDelivery();
    const p = { recipientName: "A", photoUrl: "p", clientEventId: "evt-1", ...gps };
    await completeDelivery(T.svc, s.id, p, { driverId: T.driverId });
    const again = await completeDelivery(T.svc, s.id, p, { driverId: T.driverId });
    expect(again.status).toBe("DELIVERED");
    expect(await prisma.proofOfDelivery.count({ where: { shipmentId: s.id } })).toBe(1);
    expect(await prisma.deliveryAttempt.count({ where: { shipmentId: s.id, outcome: "DELIVERED" } })).toBe(1);
  });
});

describe("failed deliveries", () => {
  it("records attempt, then supports reschedule and retry", async () => {
    const s = await toOutForDelivery();
    const failed = await failDelivery(T.svc, s.id, { reason: "CUSTOMER_UNAVAILABLE", notes: "no answer", clientEventId: "f-1" }, { driverId: T.driverId });
    expect(failed.status).toBe("DELIVERY_FAILED");
    await failDelivery(T.svc, s.id, { reason: "CUSTOMER_UNAVAILABLE", clientEventId: "f-1" }, { driverId: T.driverId }); // replay no-op
    expect(await prisma.deliveryAttempt.count({ where: { shipmentId: s.id, outcome: "FAILED" } })).toBe(1);
    await expect(resolveFailure(T.svc, s.id, { resolution: "RESCHEDULED", rescheduleFor: new Date(Date.now() - 86400_000) })).rejects.toThrow(/future/);
    const r = await resolveFailure(T.svc, s.id, { resolution: "RESCHEDULED", rescheduleFor: new Date(Date.now() + 86400_000) });
    expect(r.status).toBe("RESCHEDULED");
    await assignShipments(T.svc, [s.id], T.driverId);
    await transitionShipment(T.svc, s.id, "OUT_FOR_DELIVERY");
    const done = await completeDelivery(T.svc, s.id, { recipientName: "A", photoUrl: "p", ...gps }, { driverId: T.driverId });
    expect(done.attemptCount).toBe(2);
  });
  it("supports return-to-sender", async () => {
    const s = await toOutForDelivery();
    await failDelivery(T.svc, s.id, { reason: "WRONG_ADDRESS" }, { driverId: T.driverId });
    await resolveFailure(T.svc, s.id, { resolution: "RETURN_TO_SENDER" });
    await transitionShipment(T.svc, s.id, "RETURNED_TO_HUB", { hubId: T.hubId });
    await transitionShipment(T.svc, s.id, "RETURNED_TO_SENDER");
    expect((await prisma.shipment.findUnique({ where: { id: s.id } }))?.status).toBe("RETURNED_TO_SENDER");
  });
  it("only out-for-delivery shipments can fail", async () => {
    const s = await createShipment(T.svc, shipmentInput());
    await expect(failDelivery(T.svc, s.id, { reason: "OTHER" })).rejects.toThrow();
  });
});

describe("COD", () => {
  it("requires the cash amount, flags mismatches, and tracks remittance/settlement", async () => {
    const s = await toOutForDelivery({ codAmount: 10000 });
    await expect(completeDelivery(T.svc, s.id, { recipientName: "A", photoUrl: "p", ...gps }, { driverId: T.driverId })).rejects.toThrow(/cash amount/);
    await completeDelivery(T.svc, s.id, { recipientName: "A", photoUrl: "p", codCollected: 9000, ...gps }, { driverId: T.driverId });
    let cod = await prisma.codTransaction.findUnique({ where: { shipmentId: s.id } });
    expect(cod?.status).toBe("DISPUTED");
    expect(Number(cod?.amountCollected)).toBe(9000);

    const s2 = await toOutForDelivery({ codAmount: 10000 });
    await completeDelivery(T.svc, s2.id, { recipientName: "A", photoUrl: "p", codCollected: 10000, ...gps }, { driverId: T.driverId });
    cod = await prisma.codTransaction.findUnique({ where: { shipmentId: s2.id } });
    expect(cod?.status).toBe("COLLECTED");
    await expect(recordCodRemittance(T.svc, cod!.id, 20000)).rejects.toThrow(/exceeds/);
    await recordCodRemittance(T.svc, cod!.id, 10000);
    await recordCodSettlement(T.svc, cod!.id, 4000, "SET-1");
    expect((await prisma.codTransaction.findUnique({ where: { id: cod!.id } }))?.status).toBe("PARTIALLY_SETTLED");
    await recordCodSettlement(T.svc, cod!.id, 6000, "SET-2");
    expect((await prisma.codTransaction.findUnique({ where: { id: cod!.id } }))?.status).toBe("SETTLED");
    await expect(recordCodSettlement(T.svc, cod!.id, 1, "SET-3")).rejects.toThrow(/exceeds/);
  });
});

describe("public tracking", () => {
  it("exposes only customer-safe fields", async () => {
    const s = await createShipment(T.svc, shipmentInput({ codAmount: 999, declaredValue: 5000 }));
    const t = await getPublicTracking(s.trackingNumber);
    expect(t).not.toBeNull();
    const json = JSON.stringify(t);
    for (const secret of ["recipientPhone", "senderPhone", "08044444444", "08033333333", "codAmount", "deliveryFee", "declaredValue", "companyId", T.companyId, "12 Allen Ave", "5 Admiralty Way"]) {
      expect(json).not.toContain(secret);
    }
    expect(t!.timeline.length).toBeGreaterThan(0);
    expect(await getPublicTracking("NOPE")).toBeNull();
  });
  it("hides internal-only events", async () => {
    const s = await createShipment(T.svc, shipmentInput());
    await transitionShipment(T.svc, s.id, "CONFIRMED");
    await assignShipments(T.svc, [s.id], T.driverId);
    await unassignShipment(T.svc, s.id);
    const t = await getPublicTracking(s.trackingNumber);
    expect(t!.timeline.some((e) => /unassigned/i.test(e.description))).toBe(false);
  });
});

describe("subscription enforcement", () => {
  it("blocks writes once the trial has expired and enforces plan limits", async () => {
    const X = await makeTenant("Exp", "starter");
    await prisma.subscriptionPlan.update({ where: { key: "starter" }, data: { limits: { shipmentsPerMonth: 2, drivers: 10, vehicles: 10, users: 5, branches: 1 } } });
    await createShipment(X.svc, shipmentInput());
    await createShipment(X.svc, shipmentInput());
    await expect(createShipment(X.svc, shipmentInput())).rejects.toThrow(/Upgrade/);
    await prisma.subscriptionPlan.update({ where: { key: "starter" }, data: { limits: { shipmentsPerMonth: 500, drivers: 10, vehicles: 10, users: 5, branches: 1 } } });
    await prisma.subscription.update({ where: { companyId: X.companyId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await expect(createShipment(X.svc, shipmentInput())).rejects.toThrow(/Trial ended/);
  });
});
