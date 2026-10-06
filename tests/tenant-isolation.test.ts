import { describe, it, expect, beforeAll } from "vitest";
import { createTenantClient, assertOwned, prisma, TENANT_MODELS } from "@/lib/platform/db";
import { createShipment, assignShipments, getShipmentDetail, transitionShipment, listShipments } from "@/lib/logistics/shipments";
import { audit } from "@/lib/platform/audit";
import { makeTenant, shipmentInput, svcFor, type TestTenant } from "./helpers";

let A: TestTenant, B: TestTenant;
let shipA: { id: string; trackingNumber: string };
let shipB: { id: string; trackingNumber: string };

beforeAll(async () => {
  A = await makeTenant("Alpha");
  B = await makeTenant("Bravo");
  shipA = await createShipment(A.svc, shipmentInput({ customerId: A.customerId }));
  shipB = await createShipment(B.svc, shipmentInput({ customerId: B.customerId, codAmount: 5000 }));
});

describe("tenant isolation — data layer", () => {
  it("covers every model that has a companyId", () => {
    for (const m of ["Shipment", "Customer", "Driver", "Vehicle", "Invoice", "Payment", "Expense", "Notification", "AuditLog", "User", "Document", "Settlement"]) {
      expect(TENANT_MODELS.has(m)).toBe(true);
    }
    expect(TENANT_MODELS.has("Company")).toBe(false);
  });

  it("A cannot list or count B's records", async () => {
    const list = await A.svc.db.shipment.findMany();
    expect(list.every((s) => s.companyId === A.companyId)).toBe(true);
    expect(list.map((s) => s.id)).not.toContain(shipB.id);
    expect(await A.svc.db.customer.count({ where: { id: B.customerId } })).toBe(0);
    expect(await A.svc.db.driver.findMany({ where: { id: B.driverId } })).toHaveLength(0);
  });

  it("A cannot read B's record by primary key (findUnique/findFirst)", async () => {
    expect(await A.svc.db.shipment.findUnique({ where: { id: shipB.id } })).toBeNull();
    expect(await A.svc.db.shipment.findFirst({ where: { id: shipB.id } })).toBeNull();
    expect(await A.svc.db.vehicle.findFirst({ where: { id: B.vehicleId } })).toBeNull();
  });

  it("an explicit companyId in a where clause cannot widen scope", async () => {
    const rows = await A.svc.db.shipment.findMany({ where: { companyId: B.companyId } as any });
    expect(rows.every((r) => r.companyId === A.companyId)).toBe(true); // forced back to A's own scope
    expect(rows.map((r) => r.id)).not.toContain(shipB.id);
  });

  it("A cannot update or delete B's rows", async () => {
    await expect(A.svc.db.shipment.update({ where: { id: shipB.id }, data: { notes: "pwned" } })).rejects.toThrow();
    const r = await A.svc.db.shipment.updateMany({ where: { id: shipB.id }, data: { notes: "pwned" } });
    expect(r.count).toBe(0);
    await expect(A.svc.db.customer.delete({ where: { id: B.customerId } })).rejects.toThrow();
    expect((await A.svc.db.customer.deleteMany({ where: { id: B.customerId } })).count).toBe(0);
    const still = await prisma.shipment.findUnique({ where: { id: shipB.id } });
    expect(still?.notes).not.toBe("pwned");
  });

  it("created rows are forced into the caller's tenant even if companyId is supplied", async () => {
    const c = await A.svc.db.customer.create({ data: { name: "Forged", phone: "0800000000", companyId: B.companyId } as any });
    expect(c.companyId).toBe(A.companyId);
    const many = await A.svc.db.zone.createMany({ data: [{ name: "Z1", code: "Z1", areas: [], companyId: B.companyId }] as any });
    expect(many.count).toBe(1);
    expect(await prisma.zone.count({ where: { companyId: B.companyId, code: "Z1" } })).toBe(0);
  });

  it("companyId cannot be changed by update", async () => {
    await A.svc.db.customer.update({ where: { id: A.customerId }, data: { companyId: B.companyId, notes: "ok" } as any });
    const c = await prisma.customer.findUnique({ where: { id: A.customerId } });
    expect(c?.companyId).toBe(A.companyId);
  });

  it("aggregates and groupBy are tenant scoped", async () => {
    const g = await A.svc.db.shipment.groupBy({ by: ["status"], _count: true });
    const total = g.reduce((s, x) => s + (x._count as number), 0);
    expect(total).toBe(await prisma.shipment.count({ where: { companyId: A.companyId } }));
    const agg = await A.svc.db.shipment.aggregate({ _sum: { codAmount: true } });
    expect(Number(agg._sum.codAmount ?? 0)).toBe(0); // B's 5000 COD not visible
  });

  it("users of another tenant are invisible", async () => {
    expect(await A.svc.db.user.findFirst({ where: { id: B.owner.id } })).toBeNull();
  });
});

describe("tenant isolation — foreign keys & services", () => {
  it("assertOwned rejects foreign ids", async () => {
    await expect(assertOwned(A.svc.db, { customer: B.customerId })).rejects.toThrow(/not found/i);
    await expect(assertOwned(A.svc.db, { driver: B.driverId, vehicle: B.vehicleId })).rejects.toThrow();
    await expect(assertOwned(A.svc.db, { customer: A.customerId, driver: A.driverId })).resolves.toBeUndefined();
  });

  it("cannot create a shipment for another tenant's customer", async () => {
    await expect(createShipment(A.svc, shipmentInput({ customerId: B.customerId }))).rejects.toThrow(/not found/i);
  });

  it("cannot assign another tenant's driver, nor assign another tenant's shipment", async () => {
    await expect(assignShipments(A.svc, [shipA.id], B.driverId)).rejects.toThrow(/not found/i);
    await transitionShipment(B.svc, shipB.id, "CONFIRMED");
    await expect(assignShipments(A.svc, [shipB.id], A.driverId)).rejects.toThrow(/not found/i);
    const b = await prisma.shipment.findUnique({ where: { id: shipB.id } });
    expect(b?.driverId).toBeNull();
  });

  it("cannot read or transition another tenant's shipment through services", async () => {
    await expect(getShipmentDetail(A.svc, shipB.id)).rejects.toThrow(/not found/i);
    await expect(transitionShipment(A.svc, shipB.id, "CANCELLED")).rejects.toThrow(/not found/i);
    const { rows } = await listShipments(A.svc, {});
    expect(rows.map((r) => r.id)).not.toContain(shipB.id);
  });

  it("search results never include other tenants (tracking number lookup by tenant client)", async () => {
    const { rows } = await listShipments(A.svc, { q: shipB.trackingNumber });
    expect(rows).toHaveLength(0);
  });
});

describe("audit log integrity", () => {
  it("tenant client cannot modify or delete audit logs", async () => {
    await audit({ companyId: A.companyId, action: "test.event", resourceType: "Test" });
    const log = await A.svc.db.auditLog.findFirst({ where: { action: "test.event" } });
    expect(log).not.toBeNull();
    await expect(A.svc.db.auditLog.update({ where: { id: log!.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(A.svc.db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
  it("the database itself rejects UPDATE/DELETE on audit logs", async () => {
    const log = await prisma.auditLog.findFirst({ where: { companyId: A.companyId } });
    await expect(prisma.auditLog.update({ where: { id: log!.id }, data: { action: "x" } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: log!.id } })).rejects.toThrow();
  });
  it("tenants only see their own audit entries", async () => {
    const logs = await A.svc.db.auditLog.findMany();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.companyId === A.companyId)).toBe(true);
  });
});

describe("misc", () => {
  it("tenant client requires a company id", () => {
    expect(() => createTenantClient("")).toThrow();
  });
  it("svcFor keeps tenant", () => {
    expect(svcFor(A).companyId).toBe(A.companyId);
  });
});
