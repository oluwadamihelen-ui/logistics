"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { prisma } from "@/lib/platform/db";
import { AppError } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";
import { phone } from "@/lib/logistics/schemas";

async function setStep(companyId: string, step: number) {
  await prisma.company.updateMany({ where: { id: companyId, onboardingStep: { lt: step } }, data: { onboardingStep: step } });
}

export const onboardCompanyAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({
    name: z.string().trim().min(2).max(100), businessType: z.string().max(60).optional(), registrationNumber: z.string().max(40).optional(), phone: phone.optional(), email: z.string().email().optional(),
    website: z.string().url().optional(), addressLine: z.string().max(200).optional(), city: z.string().max(80).optional(), state: z.string().max(80).optional(), country: z.string().length(2).default("NG"),
    currency: z.string().length(3).default("NGN"), timezone: z.string().max(60).default("Africa/Lagos"), operatingRegions: z.string().max(300).optional(),
    logoUrl: z.string().max(300_000).regex(/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/).optional(),
  }),
  handler: async (ctx, i) => {
    try { new Intl.DateTimeFormat("en", { timeZone: i.timezone }); } catch { throw new AppError("VALIDATION", "Unknown timezone"); }
    const { operatingRegions, ...rest } = i;
    await prisma.company.update({ where: { id: ctx.companyId }, data: { ...rest, currency: i.currency.toUpperCase(), operatingRegions: operatingRegions?.split(",").map((s) => s.trim()).filter(Boolean) ?? [] } });
    await setStep(ctx.companyId, 1);
    return true;
  },
});

export const onboardNetworkAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({ branchName: z.string().trim().min(2).max(80), branchCode: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9-]+$/), hubName: z.string().trim().max(80).optional(), city: z.string().max(80).optional(), state: z.string().max(80).optional() }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    const code = i.branchCode.toUpperCase();
    let branch = await ctx.db.branch.findFirst({ where: { code } });
    if (!branch) branch = await ctx.db.branch.create({ data: { name: i.branchName, code, city: i.city, state: i.state } as any });
    if (i.hubName && !(await ctx.db.hub.findFirst({ where: { code: `${code}-H` } }))) await ctx.db.hub.create({ data: { name: i.hubName, code: `${code}-H`, branchId: branch.id, city: i.city, state: i.state } as any });
    await setStep(ctx.companyId, 2);
    return true;
  },
});

export const onboardPricingAction = defineAction({
  permissions: ["settings.manage", "pricing.manage"],
  schema: z.object({
    zones: z.string().max(2000), sameZoneFee: z.coerce.number().min(0), crossZoneFee: z.coerce.number().min(0), interstateFee: z.coerce.number().min(0), perKgFee: z.coerce.number().min(0).default(0), includedKg: z.coerce.number().min(0).default(5),
  }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    // One zone per line: "Name: area, area, area"
    const parsed = i.zones.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [name, areas] = l.split(":"); return { name: name.trim(), areas: (areas ?? name).split(",").map((a) => a.trim()).filter(Boolean) }; });
    if (parsed.length > 20) throw new AppError("VALIDATION", "Start with at most 20 zones — you can add more later");
    const zones = [];
    for (const [idx, z] of parsed.entries()) {
      const code = (z.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "Z") .toUpperCase() + (idx + 1);
      const existing = await ctx.db.zone.findFirst({ where: { code } });
      zones.push(existing ?? (await ctx.db.zone.create({ data: { name: z.name, code, areas: z.areas } as any })));
    }
    const existingRules = await ctx.db.pricingRule.count();
    if (!existingRules) {
      const rules: any[] = [];
      for (const a of zones) rules.push({ name: `${a.name} → ${a.name}`, priority: 10, originZoneId: a.id, destinationZoneId: a.id, baseFee: i.sameZoneFee, perKgFee: i.perKgFee, includedKg: i.includedKg, minimumFee: i.sameZoneFee });
      for (const a of zones) for (const b of zones) if (a.id !== b.id) rules.push({ name: `${a.name} → ${b.name}`, priority: 20, originZoneId: a.id, destinationZoneId: b.id, baseFee: i.crossZoneFee, perKgFee: i.perKgFee, includedKg: i.includedKg, minimumFee: i.crossZoneFee });
      rules.push({ name: "Interstate", priority: 90, interstate: true, baseFee: i.interstateFee, perKgFee: i.perKgFee, includedKg: i.includedKg, minimumFee: i.interstateFee });
      rules.push({ name: "Standard fallback", priority: 100, baseFee: i.crossZoneFee, perKgFee: i.perKgFee, includedKg: i.includedKg, minimumFee: i.crossZoneFee });
      await ctx.db.pricingRule.createMany({ data: rules });
      await auditFrom(ctx, "pricing.onboarding_rules_created", "PricingRule", null, undefined, { rules: rules.length, zones: zones.length });
    }
    await setStep(ctx.companyId, 3);
    return { zones: zones.length };
  },
});

export const onboardOperationsAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({
    shipmentPrefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/), defaultServiceHours: z.coerce.number().int().min(1).max(720), codEnabled: z.boolean().default(false),
    proofPhoto: z.boolean().default(false), proofSignature: z.boolean().default(false), proofOtp: z.boolean().default(false), proofGps: z.boolean().default(false), proofRecipientName: z.boolean().default(false),
    workStart: z.string().regex(/^\d{2}:\d{2}$/), workEnd: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  handler: async (ctx, i) => {
    await ctx.db.companySettings.updateMany({ data: { shipmentPrefix: i.shipmentPrefix.toUpperCase(), trackingPrefix: i.shipmentPrefix.toUpperCase().slice(0, 4).padEnd(2, "X"), defaultServiceHours: i.defaultServiceHours, codEnabled: i.codEnabled, workingHours: { start: i.workStart, end: i.workEnd, days: [1, 2, 3, 4, 5, 6] }, proofRequirements: { signature: i.proofSignature, photo: i.proofPhoto, otp: i.proofOtp, gps: i.proofGps, recipientName: i.proofRecipientName } } });
    await setStep(ctx.companyId, 4);
    return true;
  },
});

export const onboardBillingAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({ taxRatePercent: z.coerce.number().min(0).max(100), invoicePrefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/), bank: z.string().max(80).optional(), accountName: z.string().max(100).optional(), accountNumber: z.string().max(30).optional() }),
  handler: async (ctx, i) => {
    await ctx.db.companySettings.updateMany({ data: { taxRatePercent: i.taxRatePercent, invoicePrefix: i.invoicePrefix.toUpperCase(), ...(i.accountNumber ? { bankDetails: { bank: i.bank, accountName: i.accountName, accountNumber: i.accountNumber } } : {}) } });
    await setStep(ctx.companyId, 5);
    return true;
  },
});

export const finishOnboardingAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({ channels: z.array(z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH"])).default([]) }),
  handler: async (ctx, i) => {
    await ctx.db.companySettings.updateMany({ data: { enabledChannels: ["IN_APP", ...i.channels] } });
    await prisma.company.update({ where: { id: ctx.companyId }, data: { onboardedAt: new Date(), onboardingStep: 6, status: "ACTIVE" } });
    await auditFrom(ctx, "company.onboarded", "Company", ctx.companyId);
    return true;
  },
});
