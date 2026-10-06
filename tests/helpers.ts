import { prisma, createTenantClient } from "@/lib/platform/db";
import { provisionCompany } from "@/lib/platform/provisioning";
import type { ServiceCtx } from "@/lib/platform/service";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";

let counter = 0;
export const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface TestTenant {
  companyId: string;
  owner: { id: string; name: string };
  svc: ServiceCtx;
  branchId: string;
  hubId: string;
  driverId: string;
  driverUserId: string;
  vehicleId: string;
  customerId: string;
  zoneId: string;
}

export async function makeTenant(label = "Co", planKey = "professional"): Promise<TestTenant> {
  const id = uniq();
  const { company, owner } = await provisionCompany({ companyName: `${label} ${id}`, ownerName: `Owner ${id}`, email: `owner-${id}@test.dev`, password: "Passw0rd!long", planKey });
  const db = createTenantClient(company.id);
  const svc: ServiceCtx = { db, companyId: company.id, actor: { id: owner.id, name: owner.name, role: "COMPANY_OWNER" } };
  const branch = await db.branch.create({ data: { name: "Main", code: "MAIN", city: "Lagos", state: "Lagos" } as any });
  const hub = await db.hub.create({ data: { name: "Ikeja Hub", code: "IKJ", branchId: branch.id } as any });
  const zone = await db.zone.create({ data: { name: "Lagos Mainland", code: "LM", areas: ["Ikeja", "Yaba"] } as any });
  await db.zone.create({ data: { name: "Lagos Island", code: "LI", areas: ["Lekki", "Victoria Island"] } as any });
  const vehicle = await db.vehicle.create({ data: { registrationNumber: `REG-${id}`, type: "MOTORCYCLE" } as any });
  const driverUser = await prisma.user.create({ data: { email: `driver-${id}@test.dev`, passwordHash: await bcrypt.hash("x", 4), name: "Test Driver", role: "DRIVER", companyId: company.id } });
  const driver = await db.driver.create({ data: { name: "Test Driver", phone: "08011111111", userId: driverUser.id, branchId: branch.id, vehicleId: vehicle.id, status: "AVAILABLE" } as any });
  const customer = await db.customer.create({ data: { name: "Acme Stores", phone: "08022222222", type: "BUSINESS" } as any });
  await db.pricingRule.create({ data: { name: "Default", priority: 100, baseFee: 1500, perKgFee: 100, includedKg: 5, minimumFee: 1500 } as any });
  return { companyId: company.id, owner, svc, branchId: branch.id, hubId: hub.id, driverId: driver.id, driverUserId: driverUser.id, vehicleId: vehicle.id, customerId: customer.id, zoneId: zone.id };
}

export const shipmentInput = (over: Record<string, unknown> = {}) => ({
  senderName: "Sender One", senderPhone: "08033333333", pickupAddress: "12 Allen Ave", pickupCity: "Ikeja", pickupState: "Lagos",
  recipientName: "Recipient One", recipientPhone: "08044444444", deliveryAddress: "5 Admiralty Way", deliveryCity: "Lekki", deliveryState: "Lagos",
  packageDescription: "Box of books", packageType: "PARCEL" as const, weightKg: 2, quantity: 1, declaredValue: 0, codAmount: 0,
  priority: "STANDARD" as const, feePayer: "SENDER" as const, ...over,
}) as any;

export function svcFor(t: TestTenant, role: Role = "COMPANY_OWNER", id = t.owner.id): ServiceCtx {
  return { ...t.svc, actor: { id, name: "Tester", role } };
}

export { prisma };

import { permissionsFor, type Permission } from "@/lib/platform/permissions";
import type { TenantContext } from "@/lib/platform/context";

/** Build a TenantContext for a (fake) signed-in user with the given role, without HTTP/cookies. */
export async function ctxFor(t: TestTenant, role: Role, opts: { extra?: string[]; denied?: string[] } = {}): Promise<TenantContext> {
  const id = uniq();
  const u = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${id}@test.dev`, passwordHash: "x", name: `${role} ${id}`, role, companyId: t.companyId } });
  const permissions = permissionsFor({ role, extraPermissions: opts.extra, deniedPermissions: opts.denied });
  const { AppError } = await import("@/lib/platform/errors");
  return {
    user: { id: u.id, name: u.name, email: u.email, role, companyId: t.companyId, branchId: null, customerId: null, driverId: null },
    companyId: t.companyId, db: t.svc.db, permissions,
    can: (p: Permission) => permissions.has(p),
    require: (...ps: Permission[]) => { for (const p of ps) if (!permissions.has(p)) throw new AppError("FORBIDDEN", "You don't have permission to do that."); },
    requireAny: (...ps: Permission[]) => { if (!ps.some((p) => permissions.has(p))) throw new AppError("FORBIDDEN", "You don't have permission to do that."); },
    actor: { id: u.id, name: u.name, role }, ip: null, userAgent: null,
  };
}
