import { Prisma } from "@prisma/client";
import { assertOwned, num, prisma } from "../platform/db";
import { AppError } from "../platform/errors";
import { auditFrom } from "../platform/audit";
import { assertFeature, getEntitlements, assertWritable } from "../platform/entitlements";
import type { ServiceCtx } from "../platform/service";
import type { CustomerInput } from "./schemas";

export async function createCustomer(svc: ServiceCtx, input: CustomerInput) {
  assertWritable(await getEntitlements(svc.companyId));
  const dup = await svc.db.customer.findFirst({ where: { phone: input.phone, name: input.name }, select: { id: true } });
  if (dup) throw new AppError("CONFLICT", "A customer with this name and phone already exists");
  const c = await svc.db.customer.create({ data: input as any });
  await auditFrom(svc, "customer.created", "Customer", c.id, undefined, { name: c.name, type: c.type });
  return c;
}

export async function updateCustomer(svc: ServiceCtx, id: string, input: Partial<CustomerInput> & { isActive?: boolean }) {
  assertWritable(await getEntitlements(svc.companyId));
  const before = await svc.db.customer.findFirst({ where: { id } });
  if (!before) throw new AppError("NOT_FOUND", "Customer not found");
  const c = await svc.db.customer.update({ where: { id }, data: input as any });
  await auditFrom(svc, "customer.updated", "Customer", id, before, c);
  return c;
}

export async function setCorporateAccount(svc: ServiceCtx, customerId: string, d: { creditLimit: number; paymentTermsDays: number; discountPercent: number; apiEnabled: boolean; accountManagerId?: string }) {
  const ent = await getEntitlements(svc.companyId);
  assertWritable(ent);
  assertFeature(ent, "corporate_accounts");
  await assertOwned(svc.db, { customer: customerId, user: d.accountManagerId });
  const before = await svc.db.corporateAccount.findFirst({ where: { customerId } });
  const acc = before
    ? await svc.db.corporateAccount.update({ where: { id: before.id }, data: d })
    : await svc.db.corporateAccount.create({ data: { customerId, ...d } as any });
  await svc.db.customer.update({ where: { id: customerId }, data: { type: "CORPORATE" } });
  await auditFrom(svc, "customer.corporate_updated", "Customer", customerId, before, acc);
  return acc;
}

export async function addAddress(svc: ServiceCtx, customerId: string, a: { label?: string; line1: string; city: string; state: string; contactName?: string; contactPhone?: string; isDefault?: boolean }) {
  await assertOwned(svc.db, { customer: customerId });
  if (a.isDefault) await svc.db.address.updateMany({ where: { customerId }, data: { isDefault: false } });
  return svc.db.address.create({ data: { customerId, ...a } as any });
}

export interface CustomerStats { total: number; delivered: number; failed: number; returned: number; revenue: number; avgValue: number; outstanding: number; codHeld: number }

export async function customerStats(svc: ServiceCtx, customerId: string): Promise<CustomerStats> {
  const [byStatus, revenue, inv, cod] = await Promise.all([
    svc.db.shipment.groupBy({ by: ["status"], where: { customerId }, _count: { _all: true } }),
    svc.db.shipment.aggregate({ where: { customerId, status: "DELIVERED" }, _sum: { deliveryFee: true }, _avg: { deliveryFee: true } }),
    prisma.$queryRaw<{ o: Prisma.Decimal | null }[]>`SELECT COALESCE(SUM("total" - "amountPaid"),0) AS o FROM "Invoice" WHERE "companyId" = ${svc.companyId} AND "customerId" = ${customerId} AND "status" IN ('ISSUED','PARTIALLY_PAID')`,
    svc.db.codTransaction.aggregate({ where: { customerId, status: { in: ["COLLECTED", "PARTIALLY_SETTLED"] } }, _sum: { amountCollected: true, amountSettled: true } }),
  ]);
  const c = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((a, x) => a + x._count._all, 0);
  return {
    total, delivered: c("DELIVERED"), failed: c("DELIVERY_FAILED") + c("RESCHEDULED"), returned: c("RETURNING") + c("RETURNED_TO_HUB") + c("RETURNED_TO_SENDER"),
    revenue: num(revenue._sum.deliveryFee), avgValue: num(revenue._avg.deliveryFee), outstanding: num(inv[0]?.o),
    codHeld: num(cod._sum.amountCollected) - num(cod._sum.amountSettled),
  };
}

export async function listCustomers(svc: ServiceCtx, f: { q?: string; type?: string; page?: number; pageSize?: number }) {
  const pageSize = f.pageSize ?? 25, page = Math.max(1, f.page ?? 1);
  const where: Prisma.CustomerWhereInput = {};
  if (f.q) where.OR = [{ name: { contains: f.q, mode: "insensitive" } }, { phone: { contains: f.q } }, { email: { contains: f.q, mode: "insensitive" } }, { businessName: { contains: f.q, mode: "insensitive" } }];
  if (f.type) where.type = f.type as any;
  const [rows, total] = await Promise.all([
    svc.db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { shipments: true } } } }),
    svc.db.customer.count({ where }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
