import { Prisma } from "@prisma/client";
import { assertOwned, nextSequence, num, prisma } from "../platform/db";
import { AppError } from "../platform/errors";
import { auditFrom } from "../platform/audit";
import { guardMutation } from "../platform/entitlements";
import { emitSafe } from "../platform/notifications/engine";
import type { ServiceCtx } from "../platform/service";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w = 5) => String(n).padStart(w, "0");

/** balance = total − payments − credit notes */
export function invoiceBalance(inv: { total: unknown; amountPaid: unknown }, credits = 0): number {
  return r2(num(inv.total as any) - num(inv.amountPaid as any) - credits);
}
export function invoiceStatusFor(total: number, paid: number, credits: number, current: string): "ISSUED" | "PARTIALLY_PAID" | "PAID" {
  const bal = r2(total - paid - credits);
  if (bal <= 0.009) return "PAID";
  if (paid + credits > 0.009) return "PARTIALLY_PAID";
  return current === "DRAFT" ? "ISSUED" : "ISSUED";
}

export async function createInvoice(svc: ServiceCtx, input: { customerId: string; shipmentIds?: string[]; periodStart?: Date; periodEnd?: Date; dueDate?: Date; notes?: string; issue?: boolean }) {
  await guardMutation(svc.companyId, { feature: "invoices" });
  await assertOwned(svc.db, { customer: input.customerId });
  const customer = await svc.db.customer.findFirstOrThrow({ where: { id: input.customerId }, include: { corporate: true } });
  const settings = await svc.db.companySettings.findFirstOrThrow();

  const where: Prisma.ShipmentWhereInput = { customerId: input.customerId, status: "DELIVERED", invoiceLines: { none: { invoice: { status: { not: "VOID" } } } } };
  if (input.shipmentIds?.length) where.id = { in: input.shipmentIds };
  else if (input.periodStart && input.periodEnd) where.deliveredAt = { gte: input.periodStart, lte: input.periodEnd };
  else throw new AppError("VALIDATION", "Choose shipments or a billing period");
  const ships = await svc.db.shipment.findMany({ where, select: { id: true, trackingNumber: true, deliveryFee: true, deliveryCity: true, feePayer: true }, orderBy: { deliveredAt: "asc" }, take: 2000 });
  if (!ships.length) throw new AppError("VALIDATION", "No delivered, un-invoiced shipments found for this selection");

  const subtotal = r2(ships.reduce((a, s) => a + num(s.deliveryFee), 0));
  const rate = num(settings.taxRatePercent);
  const tax = settings.taxInclusive ? r2(subtotal - subtotal / (1 + rate / 100)) : r2((subtotal * rate) / 100);
  const total = settings.taxInclusive ? subtotal : r2(subtotal + tax);
  const terms = customer.corporate?.paymentTermsDays ?? 14;
  const seq = await nextSequence(svc.companyId, "invoice");
  const inv = await svc.db.invoice.create({
    data: {
      number: `${settings.invoicePrefix}-${pad(seq)}`, customerId: customer.id, status: input.issue === false ? "DRAFT" : "ISSUED", issueDate: new Date(), dueDate: input.dueDate ?? new Date(Date.now() + terms * 86400_000),
      periodStart: input.periodStart, periodEnd: input.periodEnd, subtotal, taxAmount: tax, total, notes: input.notes, createdById: svc.actor?.id,
      lines: { create: ships.map((s) => ({ companyId: svc.companyId, shipmentId: s.id, description: `Delivery ${s.trackingNumber} → ${s.deliveryCity}`, quantity: 1, unitPrice: s.deliveryFee, amount: s.deliveryFee })) },
    } as any,
  });
  await auditFrom(svc, "invoice.created", "Invoice", inv.id, undefined, { number: inv.number, total, lines: ships.length });
  return inv;
}

export async function setInvoiceStatus(svc: ServiceCtx, id: string, to: "ISSUED" | "VOID") {
  const inv = await svc.db.invoice.findFirst({ where: { id } });
  if (!inv) throw new AppError("NOT_FOUND", "Invoice not found");
  if (to === "ISSUED" && inv.status !== "DRAFT") throw new AppError("INVALID_STATE", "Only draft invoices can be issued");
  if (to === "VOID" && (inv.status === "VOID" || num(inv.amountPaid) > 0)) throw new AppError("INVALID_STATE", "Invoices with payments cannot be voided — issue a credit note instead");
  await svc.db.invoice.update({ where: { id }, data: { status: to } });
  await auditFrom(svc, `invoice.${to.toLowerCase()}`, "Invoice", id, { status: inv.status }, { status: to });
}

async function creditsFor(svc: ServiceCtx, invoiceId: string) {
  const a = await svc.db.creditNote.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  return num(a._sum.amount);
}

export async function recordPayment(svc: ServiceCtx, input: { customerId?: string; invoiceId?: string; shipmentId?: string; amount: number; method: any; reference?: string; note?: string; paidAt?: Date }) {
  await guardMutation(svc.companyId);
  if (input.amount <= 0) throw new AppError("VALIDATION", "Amount must be greater than zero");
  await assertOwned(svc.db, { customer: input.customerId, invoice: input.invoiceId, shipment: input.shipmentId });
  let customerId = input.customerId;
  if (input.invoiceId) {
    const inv = await svc.db.invoice.findFirstOrThrow({ where: { id: input.invoiceId } });
    if (inv.status === "VOID" || inv.status === "DRAFT") throw new AppError("INVALID_STATE", "Payments can only be recorded against issued invoices");
    const credits = await creditsFor(svc, inv.id);
    if (input.amount > invoiceBalance(inv, credits) + 0.009) throw new AppError("VALIDATION", `Amount exceeds the invoice balance (${invoiceBalance(inv, credits)})`);
    customerId = inv.customerId;
  }
  if (input.reference) {
    const dup = await svc.db.payment.findFirst({ where: { reference: input.reference, amount: input.amount, customerId: customerId ?? undefined } });
    if (dup) throw new AppError("CONFLICT", "A payment with this reference and amount was already recorded");
  }
  const p = await svc.db.payment.create({ data: { customerId, invoiceId: input.invoiceId, shipmentId: input.shipmentId, amount: input.amount, method: input.method, reference: input.reference, note: input.note, paidAt: input.paidAt ?? new Date(), recordedById: svc.actor?.id, status: "SUCCESSFUL" } as any });
  if (input.invoiceId) {
    const inv = await svc.db.invoice.findFirstOrThrow({ where: { id: input.invoiceId } });
    const paid = r2(num(inv.amountPaid) + input.amount);
    await svc.db.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: invoiceStatusFor(num(inv.total), paid, await creditsFor(svc, inv.id), inv.status) } });
  }
  if (input.shipmentId) {
    const s = await svc.db.shipment.findFirstOrThrow({ where: { id: input.shipmentId } });
    const prev = await svc.db.payment.aggregate({ where: { shipmentId: s.id, status: "SUCCESSFUL" }, _sum: { amount: true } });
    const paid = num(prev._sum.amount);
    await svc.db.shipment.update({ where: { id: s.id }, data: { paymentStatus: paid + 0.009 >= num(s.deliveryFee) ? "PAID" : "PARTIALLY_PAID" } });
  }
  await auditFrom(svc, "payment.recorded", "Payment", p.id, undefined, { amount: input.amount, method: input.method, invoiceId: input.invoiceId, shipmentId: input.shipmentId });
  await emitSafe(svc, { type: "payment.received", title: `Payment received: ${input.amount}`, body: input.reference ? `Ref ${input.reference}` : "", entity: { type: "Payment", id: p.id }, actionUrl: input.invoiceId ? `/invoices/${input.invoiceId}` : "/invoices" });
  return p;
}

export async function refundPayment(svc: ServiceCtx, paymentId: string, reason: string) {
  await guardMutation(svc.companyId);
  const p = await svc.db.payment.findFirst({ where: { id: paymentId } });
  if (!p) throw new AppError("NOT_FOUND", "Payment not found");
  if (p.status !== "SUCCESSFUL" || num(p.amount) <= 0) throw new AppError("INVALID_STATE", "This payment cannot be refunded");
  if (await svc.db.payment.findFirst({ where: { note: { startsWith: `Refund of ${p.id}` } } })) throw new AppError("CONFLICT", "Already refunded");
  await svc.db.payment.update({ where: { id: p.id }, data: { status: "REFUNDED" } });
  const refund = await svc.db.payment.create({ data: { customerId: p.customerId, invoiceId: p.invoiceId, shipmentId: p.shipmentId, amount: -num(p.amount), method: p.method, status: "SUCCESSFUL", note: `Refund of ${p.id}: ${reason}`, recordedById: svc.actor?.id } as any });
  if (p.invoiceId) {
    const inv = await svc.db.invoice.findFirstOrThrow({ where: { id: p.invoiceId } });
    const paid = Math.max(0, r2(num(inv.amountPaid) - num(p.amount)));
    await svc.db.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: inv.status === "VOID" ? "VOID" : invoiceStatusFor(num(inv.total), paid, await creditsFor(svc, inv.id), "ISSUED") } });
  }
  if (p.shipmentId) await svc.db.shipment.update({ where: { id: p.shipmentId }, data: { paymentStatus: "REFUNDED" } });
  await auditFrom(svc, "payment.refunded", "Payment", p.id, { status: "SUCCESSFUL" }, { status: "REFUNDED", reason });
  return refund;
}

export async function createCreditNote(svc: ServiceCtx, input: { invoiceId: string; amount: number; reason: string }) {
  await guardMutation(svc.companyId, { feature: "invoices" });
  const inv = await svc.db.invoice.findFirst({ where: { id: input.invoiceId } });
  if (!inv) throw new AppError("NOT_FOUND", "Invoice not found");
  if (inv.status === "VOID" || inv.status === "DRAFT") throw new AppError("INVALID_STATE", "Credit notes apply to issued invoices");
  const credits = await creditsFor(svc, inv.id);
  if (input.amount <= 0 || input.amount > num(inv.total) - credits + 0.009) throw new AppError("VALIDATION", "Credit amount exceeds the invoice total");
  const seq = await nextSequence(svc.companyId, "creditnote");
  const cn = await svc.db.creditNote.create({ data: { number: `CN-${pad(seq)}`, invoiceId: inv.id, customerId: inv.customerId, amount: input.amount, reason: input.reason, createdById: svc.actor?.id } as any });
  await svc.db.invoice.update({ where: { id: inv.id }, data: { status: invoiceStatusFor(num(inv.total), num(inv.amountPaid), credits + input.amount, inv.status) } });
  await auditFrom(svc, "creditnote.created", "CreditNote", cn.id, undefined, { number: cn.number, amount: input.amount, invoice: inv.number });
  return cn;
}

export async function createExpense(svc: ServiceCtx, input: { category: any; amount: number; description?: string; incurredAt?: Date; vehicleId?: string; driverId?: string; branchId?: string }) {
  await guardMutation(svc.companyId);
  await assertOwned(svc.db, { vehicle: input.vehicleId, driver: input.driverId, branch: input.branchId });
  const e = await svc.db.expense.create({ data: { ...input, recordedById: svc.actor?.id } as any });
  await auditFrom(svc, "expense.created", "Expense", e.id, undefined, { category: input.category, amount: input.amount });
  return e;
}

export async function financeSummary(svc: ServiceCtx, from: Date, to: Date) {
  const id = svc.companyId;
  const [rev, exp, byCat, recv, branchRev, cod] = await Promise.all([
    svc.db.shipment.aggregate({ where: { status: "DELIVERED", deliveredAt: { gte: from, lte: to } }, _sum: { deliveryFee: true }, _count: { _all: true } }),
    svc.db.expense.aggregate({ where: { incurredAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    svc.db.expense.groupBy({ by: ["category"], where: { incurredAt: { gte: from, lte: to } }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } } }),
    prisma.$queryRaw<{ v: unknown; n: bigint }[]>`SELECT COALESCE(SUM("total" - "amountPaid"),0) AS v, COUNT(*) AS n FROM "Invoice" WHERE "companyId" = ${id} AND "status" IN ('ISSUED','PARTIALLY_PAID')`,
    prisma.$queryRaw<{ name: string; revenue: unknown }[]>`SELECT COALESCE(b."name",'Unassigned') AS name, COALESCE(SUM(s."deliveryFee"),0) AS revenue FROM "Shipment" s LEFT JOIN "Branch" b ON b."id" = s."branchId" WHERE s."companyId" = ${id} AND s."status" = 'DELIVERED' AND s."deliveredAt" >= ${from} AND s."deliveredAt" <= ${to} GROUP BY 1 ORDER BY 2 DESC`,
    svc.db.codTransaction.aggregate({ where: { collectedAt: { gte: from, lte: to } }, _sum: { amountCollected: true } }),
  ]);
  const revenue = num(rev._sum.deliveryFee), expenses = num(exp._sum.amount);
  return {
    revenue, deliveries: rev._count._all, expenses, profit: r2(revenue - expenses), margin: revenue ? ((revenue - expenses) / revenue) * 100 : null,
    expensesByCategory: byCat.map((c) => ({ category: c.category, amount: num(c._sum.amount) })), receivables: num(recv[0]?.v as any), openInvoices: Number(recv[0]?.n ?? 0),
    branchRevenue: branchRev.map((b) => ({ name: b.name, revenue: num(b.revenue as any) })), codCollected: num(cod._sum.amountCollected),
  };
}
