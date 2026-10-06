import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `9.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }) }));
import { prisma } from "@/lib/platform/db";
import { createShipment } from "@/lib/logistics/shipments";
import { listShipments } from "@/lib/logistics/shipments";
import { createStaffUser, updateStaffUser } from "@/lib/platform/users";
import { ctxFor, makeTenant, shipmentInput, type TestTenant } from "./helpers";
import { createInvoice, recordPayment, createCreditNote, refundPayment } from "@/lib/logistics/finance";
import { transitionShipment, assignShipments, completeDelivery } from "@/lib/logistics/shipments";
import { generateSettlement, updateSettlementStatus, computeEarnings, computeNet } from "@/lib/logistics/settlements";
import { remitDriverCash, settleCustomerCod } from "@/lib/logistics/cod";
import { createRun, orderByNearestNeighbour } from "@/lib/logistics/routes";
import { publicBookAction } from "@/app/book/[slug]/actions";

let A: TestTenant;
let custX: string, custY: string;

beforeAll(async () => {
  A = await makeTenant("Portal", "premium");
  custX = A.customerId;
  custY = (await prisma.customer.create({ data: { companyId: A.companyId, name: "Other Customer", phone: "0809", type: "BUSINESS" } })).id;
  await createShipment(A.svc, shipmentInput({ customerId: custX, recipientName: "X recipient" }));
  await createShipment(A.svc, shipmentInput({ customerId: custY, recipientName: "Y recipient" }));
});

describe("customer portal isolation (same tenant, different customers)", () => {
  it("portal list is bound to the customer, whatever filter the caller tries", async () => {
    const x = await listShipments(A.svc, { customerId: custX });
    expect(x.rows.every((r) => r.recipientName === "X recipient")).toBe(true);
    expect(x.rows.length).toBeGreaterThan(0);
  });
  it("portal roles hold only portal permissions — no staff capabilities", async () => {
    const c = await ctxFor(A, "CUSTOMER");
    for (const p of ["shipments.view", "customers.view", "finance.view", "drivers.view", "dispatch.view", "settings.manage"] as const) expect(c.can(p)).toBe(false);
    expect(c.can("portal.access")).toBe(true);
    expect(await ctxFor(A, "RECIPIENT").then((r) => r.can("portal.shipments.create"))).toBe(false);
  });
});

describe("team management safety", () => {
  it("only owners can create/modify owners; the last owner can't be demoted; no self-lockout", async () => {
    const admin = await ctxFor(A, "COMPANY_ADMIN");
    await expect(createStaffUser(admin, "COMPANY_ADMIN", { name: "Evil", email: `evil-${Date.now()}@t.dev`, role: "COMPANY_OWNER", password: "Passw0rd!long" })).rejects.toThrow(/owner/i);
    await expect(updateStaffUser(A.svc, "someone", "COMPANY_ADMIN", A.owner.id, { role: "DISPATCHER" })).rejects.toThrow(/owner/i);
    await expect(updateStaffUser(A.svc, "someone", "COMPANY_OWNER", A.owner.id, { role: "DISPATCHER" })).rejects.toThrow(/at least one/);
    await expect(updateStaffUser(A.svc, A.owner.id, "COMPANY_OWNER", A.owner.id, { isActive: false })).rejects.toThrow();
  });
  it("role/permission changes revoke existing sessions (tokenVersion bump) and cannot grant platform.admin", async () => {
    const u = await createStaffUser(A.svc, "COMPANY_OWNER", { name: "Staffer", email: `s-${Date.now()}@t.dev`, role: "DISPATCHER", password: "Passw0rd!long" });
    const before = u.tokenVersion;
    const after = await updateStaffUser(A.svc, A.owner.id, "COMPANY_OWNER", u.id, { extraPermissions: ["reports.view", "platform.admin", "nonsense.perm"] });
    expect(after.tokenVersion).toBe(before + 1);
    expect(after.extraPermissions).toEqual(["reports.view"]);
    await expect(createStaffUser(A.svc, "COMPANY_OWNER", { name: "x", email: `p-${Date.now()}@t.dev`, role: "PLATFORM_SUPER_ADMIN" as any, password: "Passw0rd!long" })).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { companyId: A.companyId, action: "user.permissions_changed" } })).toBeGreaterThan(0);
  });
  it("enforces the plan's user limit", async () => {
    const S = await makeTenant("Lim", "starter");
    await prisma.subscription.update({ where: { companyId: S.companyId }, data: { limitOverrides: { users: 1 } } });
    await expect(createStaffUser(S.svc, "COMPANY_OWNER", { name: "Two", email: `l-${Date.now()}@t.dev`, role: "DISPATCHER", password: "Passw0rd!long" })).rejects.toThrow(/Upgrade/);
  });
});

describe("public booking", () => {
  const form = (slug: string, over: Record<string, unknown> = {}) => { const { codAmount: _c, ...b } = shipmentInput(over); return { slug, ...b }; };
  it("books an online pickup priced by the company's rules, attributed to online booking", async () => {
    const slug = (await prisma.company.findUniqueOrThrow({ where: { id: A.companyId } })).slug;
    const r = await publicBookAction(form(slug));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = await prisma.shipment.findUniqueOrThrow({ where: { trackingNumber: r.data.trackingNumber } });
      expect(s).toMatchObject({ source: "PUBLIC", companyId: A.companyId });
      expect(Number(s.codAmount)).toBe(0); // public bookings can't set COD
      expect(Number(s.deliveryFee)).toBeGreaterThan(0);
    }
  });
  it("rejects bots (honeypot), unknown companies and companies on plans without public booking", async () => {
    const slug = (await prisma.company.findUniqueOrThrow({ where: { id: A.companyId } })).slug;
    expect((await publicBookAction({ ...form(slug), website: "http://spam.example" })).ok).toBe(false);
    expect((await publicBookAction(form("no-such-company"))).ok).toBe(false);
    const S = await makeTenant("PubStarter", "starter");
    const ss = (await prisma.company.findUniqueOrThrow({ where: { id: S.companyId } })).slug;
    const r = await publicBookAction(form(ss));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FEATURE_UNAVAILABLE");
  });
  it("refuses to book when the company has no pricing rules (no invented prices)", async () => {
    const N = await makeTenant("PubNoRules", "premium");
    await prisma.pricingRule.deleteMany({ where: { companyId: N.companyId } });
    const r = await publicBookAction(form((await prisma.company.findUniqueOrThrow({ where: { id: N.companyId } })).slug));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_CONFIGURED");
  });
  it("validates input", async () => {
    const slug = (await prisma.company.findUniqueOrThrow({ where: { id: A.companyId } })).slug;
    const r = await publicBookAction({ slug, senderName: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("finance & settlements", () => {
  let invId: string;
  it("invoices delivered shipments once, with tax; payments update status; credit notes and refunds reconcile", async () => {
    const mk = async () => { const s = await createShipment(A.svc, shipmentInput({ customerId: custX })); await transitionShipment(A.svc, s.id, "CONFIRMED"); await assignShipments(A.svc, [s.id], A.driverId); await transitionShipment(A.svc, s.id, "PICKED_UP"); await transitionShipment(A.svc, s.id, "AT_HUB", { hubId: A.hubId }); await transitionShipment(A.svc, s.id, "READY_FOR_DISPATCH"); await assignShipments(A.svc, [s.id], A.driverId); await transitionShipment(A.svc, s.id, "OUT_FOR_DELIVERY"); await completeDelivery(A.svc, s.id, { recipientName: "r", photoUrl: "p", lat: 1, lng: 1 }, { driverId: A.driverId }); return s; };
    await mk(); await mk();
    const from = new Date(Date.now() - 86400_000), to = new Date(Date.now() + 86400_000);
    const inv = await createInvoice(A.svc, { customerId: custX, periodStart: from, periodEnd: to });
    invId = inv.id;
    expect(Number(inv.subtotal)).toBe(3000);                // 2 × 1500
    expect(Number(inv.taxAmount)).toBe(225);                // 7.5%
    expect(Number(inv.total)).toBe(3225);
    await expect(createInvoice(A.svc, { customerId: custX, periodStart: from, periodEnd: to })).rejects.toThrow(/No delivered/); // not double-billed
    await expect(recordPayment(A.svc, { invoiceId: inv.id, amount: 5000, method: "CASH" })).rejects.toThrow(/exceeds/);
    await recordPayment(A.svc, { invoiceId: inv.id, amount: 1000, method: "BANK_TRANSFER", reference: "R1" });
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))?.status).toBe("PARTIALLY_PAID");
    await expect(recordPayment(A.svc, { invoiceId: inv.id, amount: 1000, method: "BANK_TRANSFER", reference: "R1" })).rejects.toThrow(/already recorded/);
    await createCreditNote(A.svc, { invoiceId: inv.id, amount: 225, reason: "tax relief" });
    await recordPayment(A.svc, { invoiceId: inv.id, amount: 2000, method: "CASH" });
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))?.status).toBe("PAID");
    const pay = await prisma.payment.findFirstOrThrow({ where: { invoiceId: inv.id, reference: "R1" } });
    await refundPayment(A.svc, pay.id, "customer dispute");
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(after.amountPaid)).toBe(2000);
    expect(after.status).toBe("PARTIALLY_PAID");
    await expect(refundPayment(A.svc, pay.id, "again")).rejects.toThrow();
  });
  it("COD cash moves FIFO: driver remits, then sender is paid only from remitted cash", async () => {
    const s = await createShipment(A.svc, shipmentInput({ customerId: custX, codAmount: 20000 }));
    await transitionShipment(A.svc, s.id, "CONFIRMED"); await assignShipments(A.svc, [s.id], A.driverId); await transitionShipment(A.svc, s.id, "PICKED_UP"); await transitionShipment(A.svc, s.id, "AT_HUB", { hubId: A.hubId }); await transitionShipment(A.svc, s.id, "READY_FOR_DISPATCH"); await assignShipments(A.svc, [s.id], A.driverId); await transitionShipment(A.svc, s.id, "OUT_FOR_DELIVERY");
    await completeDelivery(A.svc, s.id, { recipientName: "r", photoUrl: "p", lat: 1, lng: 1, codCollected: 20000 }, { driverId: A.driverId });
    await expect(settleCustomerCod(A.svc, custX, 5000, "PAY-1")).rejects.toThrow(/remitted/);   // can't pay out cash we haven't received
    await expect(remitDriverCash(A.svc, A.driverId, 10_000_000)).rejects.toThrow(/only holds/);
    await remitDriverCash(A.svc, A.driverId, 20000);
    await settleCustomerCod(A.svc, custX, 20000, "PAY-1");
    expect((await prisma.codTransaction.findUniqueOrThrow({ where: { shipmentId: s.id } })).status).toBe("SETTLED");
  });
  it("pay models compute correctly and net payable deducts held COD", () => {
    const f = { deliveries: 40, trips: 5, deliveredFeeTotal: 100000, periodDays: 15 };
    expect(computeEarnings("PER_DELIVERY", { perDelivery: 600 }, f)).toBe(24000);
    expect(computeEarnings("PER_TRIP", { perTrip: 3000 }, f)).toBe(15000);
    expect(computeEarnings("PERCENTAGE", { percentage: 20 }, f)).toBe(20000);
    expect(computeEarnings("SALARY", { salary: 60000 }, f)).toBe(30000);
    expect(computeEarnings("HYBRID", { salary: 60000, perDelivery: 100 }, f)).toBe(34000);
    expect(computeNet({ earnings: 24000, bonuses: 1000, deductions: 500, expenses: 2000, codCollected: 50000, codRemitted: 30000 })).toBe(6500);
    expect(computeNet({ earnings: 1000, bonuses: 0, deductions: 0, expenses: 0, codCollected: 10, codRemitted: 50 })).toBe(1000);
  });
  it("settlements: generated from real deliveries, no overlap, lifecycle enforced", async () => {
    const from = new Date(Date.now() - 86400_000), to = new Date(Date.now() + 3600_000);
    await prisma.driver.update({ where: { id: A.driverId }, data: { payModel: "PER_DELIVERY", payRates: { perDelivery: 500 } } });
    const s = await generateSettlement(A.svc, { driverId: A.driverId, periodStart: from, periodEnd: to, bonuses: 100 });
    expect(s.deliveriesCount).toBeGreaterThanOrEqual(3);
    expect(Number(s.earnings)).toBe(s.deliveriesCount * 500);
    await expect(generateSettlement(A.svc, { driverId: A.driverId, periodStart: from, periodEnd: to })).rejects.toThrow(/Overlaps/);
    await expect(updateSettlementStatus(A.svc, s.id, "PAID", { reference: "x" })).rejects.toThrow(/cannot become/);
    await updateSettlementStatus(A.svc, s.id, "APPROVED");
    await expect(updateSettlementStatus(A.svc, s.id, "PAID")).rejects.toThrow(/reference/);
    await updateSettlementStatus(A.svc, s.id, "PAID", { reference: "TRF-9" });
    expect((await prisma.settlement.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("PAID");
  });
});

describe("routes", () => {
  it("nearest-neighbour ordering is a heuristic that handles missing coordinates", () => {
    const pts = [{ id: "far", lat: 6.9, lng: 3.9 }, { id: "near", lat: 6.45, lng: 3.4 }, { id: "mid", lat: 6.6, lng: 3.5 }, { id: "nogeo", lat: null, lng: null }];
    expect(orderByNearestNeighbour({ lat: 6.4, lng: 3.4 }, pts)).toEqual(["near", "mid", "far", "nogeo"]);
  });
  it("creates a run: assigns shipments, records ordered stops, honest about ordering", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) { const s = await createShipment(A.svc, shipmentInput({ deliveryLat: 6.4 + i * 0.05, deliveryLng: 3.4 })); await transitionShipment(A.svc, s.id, "CONFIRMED"); ids.push(s.id); }
    const r = await createRun(A.svc, { driverId: A.driverId, shipmentIds: ids, sort: "manual" });
    expect(r.assigned).toBe(3);
    const stops = await prisma.routeStop.findMany({ where: { routeId: r.route.id }, orderBy: { sequence: "asc" } });
    expect(stops.map((s) => s.shipmentId)).toEqual(ids);
    expect(r.route.optimizedBy).toBeNull(); // manual ordering never claims optimisation
  });
});
