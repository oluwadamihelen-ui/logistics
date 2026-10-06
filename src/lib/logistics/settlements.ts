import type { PayModel } from "@prisma/client";
import { num, nextSequence } from "../platform/db";
import { AppError } from "../platform/errors";
import { auditFrom } from "../platform/audit";
import { guardMutation } from "../platform/entitlements";
import { emitSafe } from "../platform/notifications/engine";
import type { ServiceCtx } from "../platform/service";

export interface PayRates { perDelivery?: number; perTrip?: number; percentage?: number; salary?: number }

/** Pure earnings calculation for the configured pay model. */
export function computeEarnings(model: PayModel, rates: PayRates, a: { deliveries: number; trips: number; deliveredFeeTotal: number; periodDays: number }): number {
  const perDel = rates.perDelivery ?? 0, perTrip = rates.perTrip ?? 0, pctRate = rates.percentage ?? 0, salary = (rates.salary ?? 0) * (a.periodDays / 30);
  const r = (n: number) => Math.round(n * 100) / 100;
  switch (model) {
    case "PER_DELIVERY": return r(a.deliveries * perDel);
    case "PER_TRIP": return r(a.trips * perTrip);
    case "PERCENTAGE": return r((a.deliveredFeeTotal * pctRate) / 100);
    case "SALARY": return r(salary);
    case "HYBRID": return r(salary + a.deliveries * perDel);
  }
}

export function computeNet(p: { earnings: number; bonuses: number; deductions: number; expenses: number; codCollected: number; codRemitted: number }) {
  const codHeld = Math.max(0, p.codCollected - p.codRemitted);
  return Math.round((p.earnings + p.bonuses + p.expenses - p.deductions - codHeld) * 100) / 100;
}

async function periodFacts(svc: ServiceCtx, driverId: string, from: Date, to: Date) {
  const [attempts, trips, cod, expenses] = await Promise.all([
    svc.db.deliveryAttempt.findMany({ where: { driverId, outcome: "DELIVERED", createdAt: { gte: from, lte: to } }, select: { shipmentId: true } }),
    svc.db.route.count({ where: { driverId, status: "COMPLETED", completedAt: { gte: from, lte: to } } }),
    svc.db.codTransaction.aggregate({ where: { driverId, collectedAt: { gte: from, lte: to } }, _sum: { amountCollected: true, amountRemitted: true } }),
    svc.db.expense.aggregate({ where: { driverId, category: "DRIVER_EXPENSE", incurredAt: { gte: from, lte: to } }, _sum: { amount: true } }),
  ]);
  const ids = [...new Set(attempts.map((a) => a.shipmentId))];
  const fees = ids.length ? await svc.db.shipment.aggregate({ where: { id: { in: ids } }, _sum: { deliveryFee: true } }) : { _sum: { deliveryFee: null } };
  return { deliveries: ids.length, trips, deliveredFeeTotal: num(fees._sum.deliveryFee), codCollected: num(cod._sum.amountCollected), codRemitted: num(cod._sum.amountRemitted), expenses: num(expenses._sum.amount) };
}

export async function estimateEarnings(svc: ServiceCtx, driverId: string, from: Date, to: Date) {
  const d = await svc.db.driver.findFirst({ where: { id: driverId } });
  if (!d) throw new AppError("NOT_FOUND", "Driver not found");
  const f = await periodFacts(svc, driverId, from, to);
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400_000));
  const earnings = computeEarnings(d.payModel, (d.payRates ?? {}) as PayRates, { deliveries: f.deliveries, trips: f.trips, deliveredFeeTotal: f.deliveredFeeTotal, periodDays: days });
  return { ...f, earnings, net: Math.round((earnings + f.expenses) * 100) / 100, model: d.payModel };
}

export async function generateSettlement(svc: ServiceCtx, input: { driverId: string; periodStart: Date; periodEnd: Date; bonuses?: number; deductions?: number; notes?: string }) {
  await guardMutation(svc.companyId, { feature: "settlements" });
  if (input.periodEnd <= input.periodStart) throw new AppError("VALIDATION", "Period end must be after the start");
  const d = await svc.db.driver.findFirst({ where: { id: input.driverId } });
  if (!d) throw new AppError("NOT_FOUND", "Driver not found");
  const overlap = await svc.db.settlement.findFirst({ where: { driverId: d.id, status: { not: "VOID" }, periodStart: { lt: input.periodEnd }, periodEnd: { gt: input.periodStart } } });
  if (overlap) throw new AppError("CONFLICT", `Overlaps settlement ${overlap.number} for this driver`);
  const f = await periodFacts(svc, d.id, input.periodStart, input.periodEnd);
  const days = Math.max(1, Math.ceil((input.periodEnd.getTime() - input.periodStart.getTime()) / 86400_000));
  const earnings = computeEarnings(d.payModel, (d.payRates ?? {}) as PayRates, { deliveries: f.deliveries, trips: f.trips, deliveredFeeTotal: f.deliveredFeeTotal, periodDays: days });
  const bonuses = input.bonuses ?? 0, deductions = input.deductions ?? 0;
  const net = computeNet({ earnings, bonuses, deductions, expenses: f.expenses, codCollected: f.codCollected, codRemitted: f.codRemitted });
  const seq = await nextSequence(svc.companyId, "settlement");
  const s = await svc.db.settlement.create({
    data: { number: `STL-${String(seq).padStart(5, "0")}`, driverId: d.id, periodStart: input.periodStart, periodEnd: input.periodEnd, payModel: d.payModel, deliveriesCount: f.deliveries, earnings, bonuses, deductions, codCollected: f.codCollected, codRemitted: f.codRemitted, expensesReimbursed: f.expenses, netPayable: net, notes: input.notes, createdById: svc.actor?.id } as any,
  });
  await auditFrom(svc, "settlement.generated", "Settlement", s.id, undefined, { number: s.number, net });
  await emitSafe(svc, { type: "settlement.ready", title: `Settlement ${s.number} ready for ${d.name}`, body: `Net payable ${net}`, entity: { type: "Settlement", id: s.id }, actionUrl: "/settlements" });
  return s;
}

export async function updateSettlementStatus(svc: ServiceCtx, id: string, to: "APPROVED" | "PAID" | "VOID", opts: { reference?: string } = {}) {
  const s = await svc.db.settlement.findFirst({ where: { id } });
  if (!s) throw new AppError("NOT_FOUND", "Settlement not found");
  const ok: Record<string, string[]> = { DRAFT: ["APPROVED", "VOID"], APPROVED: ["PAID", "VOID"], PAID: [], VOID: [] };
  if (!ok[s.status].includes(to)) throw new AppError("INVALID_STATE", `A ${s.status.toLowerCase()} settlement cannot become ${to.toLowerCase()}`);
  if (to === "PAID" && !opts.reference) throw new AppError("VALIDATION", "Enter the payment reference");
  await svc.db.settlement.update({ where: { id }, data: { status: to, ...(to === "PAID" ? { paidAt: new Date(), reference: opts.reference } : {}) } });
  if (to === "PAID") {
    // Cash held by the driver was netted against their pay, so it is now remitted.
    const rows = await svc.db.codTransaction.findMany({ where: { driverId: s.driverId, collectedAt: { gte: s.periodStart, lte: s.periodEnd } } });
    for (const r of rows) if (num(r.amountCollected) > num(r.amountRemitted)) await svc.db.codTransaction.update({ where: { id: r.id }, data: { amountRemitted: r.amountCollected, remittedAt: new Date() } });
  }
  await auditFrom(svc, `settlement.${to.toLowerCase()}`, "Settlement", id, { status: s.status }, { status: to, reference: opts.reference });
}
