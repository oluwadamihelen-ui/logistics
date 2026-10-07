import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/platform/db";
import { assignShipments, collectShipment, createShipment, getPublicTracking, regenerateOtp, transitionShipment } from "@/lib/logistics/shipments";
import { canTransition } from "@/lib/logistics/shipment-status";
import { makeTenant, shipmentInput, type TestTenant } from "./helpers";

let T: TestTenant;
let pickupHubId: string;
beforeAll(async () => {
  T = await makeTenant("Pickup");
  const h = await T.svc.db.hub.create({ data: { name: "Lekki Service Centre", code: "LSC", type: "PICKUP_POINT", city: "Lekki", state: "Lagos", addressLine: "12 Admiralty Way", openingHours: "Mon–Sat 8am–6pm", allowsCollection: true } as any });
  pickupHubId = h.id;
});

const hubInput = (over: Record<string, unknown> = {}) => shipmentInput({ deliveryMethod: "HUB_PICKUP", collectionHubId: pickupHubId, deliveryAddress: undefined, deliveryCity: undefined, deliveryState: undefined, ...over });

async function toHub(over: Record<string, unknown> = {}) {
  const s = await createShipment(T.svc, hubInput(over));
  await transitionShipment(T.svc, s.id, "CONFIRMED");
  await assignShipments(T.svc, [s.id], T.driverId);
  await transitionShipment(T.svc, s.id, "PICKED_UP");
  return s;
}
// The plaintext code is only ever sent to the recipient; tests read it by replacing the stored hash.
async function knownCode(id: string, code = "123456") {
  const { hashOtp } = await import("@/lib/logistics/tracking");
  await prisma.shipment.update({ where: { id }, data: { otpHash: hashOtp(id, code), otpExpiresAt: new Date(Date.now() + 86400_000) } });
  return code;
}

describe("hub pickup shipments", () => {
  it("lifecycle rules allow ready-for-pickup only from the hub and never to home delivery states", () => {
    expect(canTransition("AT_HUB", "READY_FOR_PICKUP")).toBe(true);
    expect(canTransition("SORTING", "READY_FOR_PICKUP")).toBe(true);
    expect(canTransition("PICKED_UP", "READY_FOR_PICKUP")).toBe(false);
    expect(canTransition("READY_FOR_PICKUP", "DELIVERED")).toBe(false); // collection goes through collectShipment
    expect(canTransition("READY_FOR_PICKUP", "RETURNING")).toBe(true);
  });

  it("takes the destination from the collection point and prices it", async () => {
    const s = await createShipment(T.svc, hubInput());
    expect(s.deliveryMethod).toBe("HUB_PICKUP");
    expect(s.collectionHubId).toBe(pickupHubId);
    expect(s.deliveryCity).toBe("Lekki");
    expect(s.deliveryAddress).toContain("Lekki Service Centre");
    expect(Number(s.deliveryFee)).toBeGreaterThan(0);
  });

  it("rejects pickup at a hub that doesn't allow collection, or no hub at all; home delivery still needs an address", async () => {
    await expect(createShipment(T.svc, hubInput({ collectionHubId: T.hubId }))).rejects.toThrow(/not open for customer collection/);
    await expect(createShipment(T.svc, hubInput({ collectionHubId: undefined }))).rejects.toThrow(/Choose the hub/);
    await expect(createShipment(T.svc, shipmentInput({ deliveryAddress: undefined }))).rejects.toThrow(/required for home delivery/);
  });

  it("cannot be assigned to a rider for delivery or sent out for delivery", async () => {
    const s = await toHub();
    const r = await assignShipments(T.svc, [s.id], T.driverId);
    expect(r[0]).toMatchObject({ ok: false });
    expect(r[0].error).toMatch(/collected by the recipient/);
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    await expect(transitionShipment(T.svc, s.id, "READY_FOR_DISPATCH")).rejects.toThrow(/collected by the recipient/);
  });

  it("home-delivery shipments can't be marked ready for pickup", async () => {
    const s = await createShipment(T.svc, shipmentInput());
    await transitionShipment(T.svc, s.id, "CONFIRMED");
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: T.hubId });
    await expect(transitionShipment(T.svc, s.id, "READY_FOR_PICKUP")).rejects.toThrow(/booked for hub pickup/);
  });

  it("must be at the chosen collection point before it is ready", async () => {
    const s = await toHub();
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: T.hubId }); // some other hub
    await expect(transitionShipment(T.svc, s.id, "READY_FOR_PICKUP")).rejects.toThrow(/Lekki Service Centre/);
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    const ready = await transitionShipment(T.svc, s.id, "READY_FOR_PICKUP");
    expect(ready!.status).toBe("READY_FOR_PICKUP");
    expect(ready!.readyForPickupAt).not.toBeNull();
    expect(ready!.otpHash).not.toBeNull();
  });

  it("hand-over needs the code; wrong code is refused; right code completes it once", async () => {
    const s = await toHub();
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    await transitionShipment(T.svc, s.id, "READY_FOR_PICKUP");
    const code = await knownCode(s.id);
    await expect(collectShipment(T.svc, s.id, { collectorName: "Ada", code: "000000" })).rejects.toThrow(/Incorrect collection code/);
    await expect(collectShipment(T.svc, s.id, { collectorName: "Ada" })).rejects.toThrow(/Enter the collection code/);
    const done = await collectShipment(T.svc, s.id, { collectorName: "Ada Obi", code, idNote: "NIN …1234" });
    expect(done.status).toBe("DELIVERED");
    expect(done.collectedByName).toBe("Ada Obi");
    expect(done.otpHash).toBeNull();
    const again = await collectShipment(T.svc, s.id, { collectorName: "Ada Obi", code });
    expect(again.status).toBe("DELIVERED"); // idempotent, no double event
    const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: s.id, type: "collected" } });
    expect(events).toHaveLength(1);
    const t = await getPublicTracking(s.trackingNumber);
    expect(t!.pickupPoint?.name).toBe("Lekki Service Centre");
    expect(JSON.stringify(t)).not.toContain(code);
  });

  it("manager override works only with a reason and permission", async () => {
    const s = await toHub();
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    await transitionShipment(T.svc, s.id, "READY_FOR_PICKUP");
    await expect(collectShipment(T.svc, s.id, { collectorName: "Bola", overrideReason: "Lost phone" }, { canOverride: false })).rejects.toThrow(/Only a manager/);
    const done = await collectShipment(T.svc, s.id, { collectorName: "Bola", overrideReason: "Lost phone, ID verified" }, { canOverride: true });
    expect(done.status).toBe("DELIVERED");
    const a = await prisma.auditLog.findFirst({ where: { resourceId: s.id, action: "shipment.collected_override" } });
    expect(a).not.toBeNull();
  });

  it("COD is taken at the counter and recorded as already remitted (no driver float)", async () => {
    const s = await toHub({ codAmount: 15000 });
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    await transitionShipment(T.svc, s.id, "READY_FOR_PICKUP");
    const code = await knownCode(s.id);
    await expect(collectShipment(T.svc, s.id, { collectorName: "Chi", code })).rejects.toThrow(/cash amount/);
    await collectShipment(T.svc, s.id, { collectorName: "Chi", code, codCollected: 15000 });
    const cod = await prisma.codTransaction.findFirstOrThrow({ where: { shipmentId: s.id } });
    expect(Number(cod.amountCollected)).toBe(15000);
    expect(Number(cod.amountRemitted)).toBe(15000);
    expect(cod.driverId).toBeNull();
  });

  it("regenerating the code works for ready shipments and invalidates the old one", async () => {
    const s = await toHub();
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    await transitionShipment(T.svc, s.id, "READY_FOR_PICKUP");
    const old = await knownCode(s.id, "111111");
    const r = await regenerateOtp(T.svc, s.id);
    expect(r.otp).toMatch(/^\d{6}$/);
    if (r.otp !== old) await expect(collectShipment(T.svc, s.id, { collectorName: "X Y", code: old })).rejects.toThrow(/Incorrect/);
    expect((await collectShipment(T.svc, s.id, { collectorName: "X Y", code: r.otp })).status).toBe("DELIVERED");
  });

  it("uncollected shipments can be returned", async () => {
    const s = await toHub();
    await transitionShipment(T.svc, s.id, "AT_HUB", { hubId: pickupHubId });
    await transitionShipment(T.svc, s.id, "READY_FOR_PICKUP");
    expect((await transitionShipment(T.svc, s.id, "RETURNING"))!.status).toBe("RETURNING");
  });
});
