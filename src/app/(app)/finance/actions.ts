"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { assertOwned } from "@/lib/platform/db";
import { AppError } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";
import { createCreditNote, createExpense, createInvoice, recordPayment, refundPayment, setInvoiceStatus } from "@/lib/logistics/finance";
import { recordCodSettlement, remitDriverCash, resolveCodDispute, settleCustomerCod } from "@/lib/logistics/cod";
import { generateSettlement, updateSettlementStatus } from "@/lib/logistics/settlements";
import { computeQuote } from "@/lib/logistics/pricing";
import { loadPricingRules } from "@/lib/logistics/shipments";

const money = z.coerce.number().positive().max(1_000_000_000);
const methods = ["CASH", "BANK_TRANSFER", "CARD", "POS", "WALLET", "OTHER"] as const;

export const createInvoiceAction = defineAction({
  permissions: ["invoices.manage"],
  schema: z.object({ customerId: z.string(), periodStart: z.coerce.date().optional(), periodEnd: z.coerce.date().optional(), dueDate: z.coerce.date().optional(), notes: z.string().max(500).optional() }),
  handler: async (ctx, i) => { const inv = await createInvoice(ctx, i); return { id: inv.id }; },
});
export const invoiceStatusAction = defineAction({ permissions: ["invoices.manage"], schema: z.object({ id: z.string(), to: z.enum(["ISSUED", "VOID"]) }), handler: async (ctx, i) => { await setInvoiceStatus(ctx, i.id, i.to); return true; } });
export const recordPaymentAction = defineAction({
  permissions: ["payments.manage"],
  schema: z.object({ customerId: z.string().optional(), invoiceId: z.string().optional(), amount: money, method: z.enum(methods), reference: z.string().max(80).optional(), note: z.string().max(300).optional(), paidAt: z.coerce.date().optional() }),
  handler: async (ctx, i) => { if (!i.invoiceId && !i.customerId) throw new AppError("VALIDATION", "Choose a customer or an invoice"); const p = await recordPayment(ctx, i); return { id: p.id }; },
});
export const refundPaymentAction = defineAction({ permissions: ["payments.manage", "finance.manage"], schema: z.object({ id: z.string(), reason: z.string().trim().min(3).max(300) }), handler: async (ctx, i) => { await refundPayment(ctx, i.id, i.reason); return true; } });
export const creditNoteAction = defineAction({ permissions: ["invoices.manage", "finance.manage"], schema: z.object({ invoiceId: z.string(), amount: money, reason: z.string().trim().min(3).max(300) }), handler: async (ctx, i) => { await createCreditNote(ctx, i); return true; } });

export const createExpenseAction = defineAction({
  permissions: ["expenses.manage"],
  schema: z.object({ category: z.enum(["FUEL", "VEHICLE_MAINTENANCE", "DRIVER_EXPENSE", "STAFF_EXPENSE", "OFFICE", "HUB", "TOLLS", "PACKAGING", "OTHER"]), amount: money, description: z.string().max(300).optional(), incurredAt: z.coerce.date().optional(), vehicleId: z.string().optional(), driverId: z.string().optional(), branchId: z.string().optional() }),
  handler: async (ctx, i) => { await createExpense(ctx, i); return true; },
});

export const remitCashAction = defineAction({ permissions: ["cod.manage"], schema: z.object({ driverId: z.string(), amount: money }), handler: async (ctx, i) => { await assertOwned(ctx.db, { driver: i.driverId }); await guardMutation(ctx.companyId); await remitDriverCash(ctx, i.driverId, i.amount); await auditFrom(ctx, "cod.remittance_recorded", "Driver", i.driverId, undefined, { amount: i.amount }); return true; } });
export const settleCodAction = defineAction({ permissions: ["cod.manage"], schema: z.object({ customerId: z.string(), amount: money, reference: z.string().trim().min(2).max(80) }), handler: async (ctx, i) => { await assertOwned(ctx.db, { customer: i.customerId }); await guardMutation(ctx.companyId); await settleCustomerCod(ctx, i.customerId, i.amount, i.reference); await auditFrom(ctx, "cod.settled", "Customer", i.customerId, undefined, { amount: i.amount, reference: i.reference }); return true; } });
export const resolveDisputeAction = defineAction({ permissions: ["cod.manage"], schema: z.object({ id: z.string(), note: z.string().trim().min(3).max(300) }), handler: async (ctx, i) => { await resolveCodDispute(ctx, i.id, i.note); await auditFrom(ctx, "cod.dispute_resolved", "CodTransaction", i.id, undefined, { note: i.note }); return true; } });

export const generateSettlementAction = defineAction({
  permissions: ["settlements.manage"],
  schema: z.object({ driverId: z.string(), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), bonuses: z.coerce.number().min(0).optional(), deductions: z.coerce.number().min(0).optional(), notes: z.string().max(300).optional() }),
  handler: async (ctx, i) => { await assertOwned(ctx.db, { driver: i.driverId }); const s = await generateSettlement(ctx, i); return { id: s.id }; },
});
export const settlementStatusAction = defineAction({ permissions: ["settlements.manage"], schema: z.object({ id: z.string(), to: z.enum(["APPROVED", "PAID", "VOID"]), reference: z.string().max(80).optional() }), handler: async (ctx, i) => { await updateSettlementStatus(ctx, i.id, i.to, { reference: i.reference }); return true; } });

const rule = z.object({
  name: z.string().trim().min(2).max(80), priority: z.coerce.number().int().min(0).max(10000).default(100),
  originZoneId: z.string().optional(), destinationZoneId: z.string().optional(),
  minWeightKg: z.coerce.number().min(0).optional(), maxWeightKg: z.coerce.number().min(0).optional(),
  shipmentPriority: z.enum(["STANDARD", "EXPRESS", "URGENT", "SAME_DAY"]).optional(), packageType: z.enum(["DOCUMENT", "PARCEL", "FRAGILE", "FOOD", "PHARMACY", "GROCERY", "ELECTRONICS", "FREIGHT", "OTHER"]).optional(),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS", "CORPORATE", "MARKETPLACE_SELLER"]).optional(), interstate: z.enum(["yes", "no"]).optional(),
  baseFee: z.coerce.number().min(0).default(0), perKgFee: z.coerce.number().min(0).default(0), includedKg: z.coerce.number().min(0).default(0), perKmFee: z.coerce.number().min(0).default(0),
  insurancePercent: z.coerce.number().min(0).max(100).default(0), codFeePercent: z.coerce.number().min(0).max(100).default(0), priorityMultiplier: z.coerce.number().min(0.1).max(10).default(1), minimumFee: z.coerce.number().min(0).default(0),
});
const toData = (r: z.infer<typeof rule>) => { const { interstate, ...rest } = r; return { ...rest, interstate: interstate === undefined ? null : interstate === "yes" } as any; };

export const createPricingRuleAction = defineAction({ permissions: ["pricing.manage"], schema: rule, handler: async (ctx, i) => { await assertOwned(ctx.db, { zone: i.originZoneId }); await assertOwned(ctx.db, { zone: i.destinationZoneId }); const r = await ctx.db.pricingRule.create({ data: toData(i) }); await auditFrom(ctx, "pricing.rule_created", "PricingRule", r.id, undefined, i); return { id: r.id }; } });
export const updatePricingRuleAction = defineAction({ permissions: ["pricing.manage"], schema: rule.partial().extend({ id: z.string(), isActive: z.boolean().optional() }), handler: async (ctx, { id, ...i }) => {
  const before = await ctx.db.pricingRule.findFirst({ where: { id } }); if (!before) throw new AppError("NOT_FOUND", "Rule not found");
  await assertOwned(ctx.db, { zone: i.originZoneId }); await assertOwned(ctx.db, { zone: i.destinationZoneId });
  const { interstate, ...rest } = i; const data: any = { ...rest }; if ("interstate" in i) data.interstate = interstate === undefined ? null : interstate === "yes";
  await ctx.db.pricingRule.update({ where: { id }, data }); await auditFrom(ctx, "pricing.rule_updated", "PricingRule", id, before, i); return true; } });
export const deletePricingRuleAction = defineAction({ permissions: ["pricing.manage"], schema: z.object({ id: z.string() }), handler: async (ctx, i) => { const r = await ctx.db.pricingRule.findFirst({ where: { id: i.id } }); if (!r) throw new AppError("NOT_FOUND", "Rule not found"); await ctx.db.pricingRule.delete({ where: { id: i.id } }); await auditFrom(ctx, "pricing.rule_deleted", "PricingRule", i.id, r); return true; } });
export const simulateQuoteAction = defineAction({
  permissions: ["pricing.manage"],
  schema: z.object({ originZoneId: z.string().optional(), destinationZoneId: z.string().optional(), weightKg: z.coerce.number().min(0).default(1), priority: z.enum(["STANDARD", "EXPRESS", "URGENT", "SAME_DAY"]).default("STANDARD"), packageType: z.enum(["DOCUMENT", "PARCEL", "FRAGILE", "FOOD", "PHARMACY", "GROCERY", "ELECTRONICS", "FREIGHT", "OTHER"]).default("PARCEL"), declaredValue: z.coerce.number().min(0).default(0), codAmount: z.coerce.number().min(0).default(0), interstate: z.enum(["yes", "no"]).optional() }),
  handler: async (ctx, i) => computeQuote(await loadPricingRules(ctx), { ...i, interstate: i.interstate === "yes" }),
});
