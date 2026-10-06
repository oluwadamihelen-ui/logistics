"use server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { defineAction } from "@/lib/platform/action";
import { requireTenant } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";
import { createStaffUser, resetUserPassword, updateStaffUser } from "@/lib/platform/users";
import { ASSIGNABLE_ROLES } from "@/lib/platform/permissions";
import { phone } from "@/lib/logistics/schemas";

const opt = <T extends z.ZodTypeAny>(s: T) => s.optional();

export const updateCompanyAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({
    name: z.string().trim().min(2).max(100), businessType: opt(z.string().max(60)), registrationNumber: opt(z.string().max(40)), taxId: opt(z.string().max(40)), email: opt(z.string().email()), phone: opt(phone),
    website: opt(z.string().url().max(200)), addressLine: opt(z.string().max(200)), city: opt(z.string().max(80)), state: opt(z.string().max(80)), country: z.string().length(2).default("NG"),
    currency: z.string().length(3).default("NGN"), timezone: z.string().max(60).default("Africa/Lagos"), operatingRegions: opt(z.string().max(300)),
    logoUrl: z.string().max(300_000).regex(/^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/, "Logo must be an https URL or an uploaded image").optional(),
  }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    try { new Intl.DateTimeFormat("en", { timeZone: i.timezone }); } catch { throw Object.assign(new Error("Unknown timezone"), {}); }
    const { operatingRegions, ...rest } = i;
    const before = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    const c = await prisma.company.update({ where: { id: ctx.companyId }, data: { ...rest, operatingRegions: operatingRegions ? operatingRegions.split(",").map((s) => s.trim()).filter(Boolean) : [] } });
    await auditFrom(ctx, "company.updated", "Company", c.id, before, c);
    return true;
  },
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
export const updateOperationsAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({
    shipmentPrefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/), trackingPrefix: z.string().trim().min(2).max(4).regex(/^[A-Za-z0-9]+$/), invoicePrefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/),
    defaultServiceHours: z.coerce.number().int().min(1).max(720), maxDeliveryAttempts: z.coerce.number().int().min(1).max(10),
    workStart: hhmm, workEnd: hhmm, workDays: z.array(z.string()).default([]), codEnabled: z.boolean().default(false), codFeePercent: z.coerce.number().min(0).max(100).default(0), returnPolicy: opt(z.string().max(1000)),
    autoAssign: z.boolean().default(false), maxStopsPerRun: z.coerce.number().int().min(1).max(100).default(15),
    proofSignature: z.boolean().default(false), proofPhoto: z.boolean().default(false), proofOtp: z.boolean().default(false), proofGps: z.boolean().default(false), proofRecipientName: z.boolean().default(false),
    hvThreshold: z.coerce.number().min(0).default(0), hvSignature: z.boolean().default(false), hvPhoto: z.boolean().default(false), hvOtp: z.boolean().default(false), hvGps: z.boolean().default(false), hvRecipientName: z.boolean().default(false),
    licenseRequired: z.boolean().default(false), vehicleRequired: z.boolean().default(false),
    expiryAlertDays: opt(z.string().max(40)),
  }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    const before = await ctx.db.companySettings.findFirst();
    const days = (i.expiryAlertDays ?? "30,14,7,1").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0 && n <= 365);
    const data = {
      shipmentPrefix: i.shipmentPrefix.toUpperCase(), trackingPrefix: i.trackingPrefix.toUpperCase(), invoicePrefix: i.invoicePrefix.toUpperCase(), defaultServiceHours: i.defaultServiceHours, maxDeliveryAttempts: i.maxDeliveryAttempts,
      workingHours: { start: i.workStart, end: i.workEnd, days: i.workDays.map(Number) }, codEnabled: i.codEnabled, codFeePercent: i.codFeePercent, returnPolicy: i.returnPolicy ?? null,
      dispatchRules: { autoAssign: i.autoAssign, maxStopsPerRun: i.maxStopsPerRun },
      proofRequirements: { signature: i.proofSignature, photo: i.proofPhoto, otp: i.proofOtp, gps: i.proofGps, recipientName: i.proofRecipientName },
      highValueThreshold: i.hvThreshold, highValueProof: { signature: i.hvSignature, photo: i.hvPhoto, otp: i.hvOtp, gps: i.hvGps, recipientName: i.hvRecipientName },
      driverRequirements: { licenseRequired: i.licenseRequired, vehicleRequired: i.vehicleRequired }, expiryAlertDays: days.length ? days : [30, 14, 7, 1],
    };
    await ctx.db.companySettings.updateMany({ data: data as Prisma.CompanySettingsUpdateManyMutationInput });
    await auditFrom(ctx, "settings.operations_updated", "CompanySettings", before?.id ?? null, before, data);
    return true;
  },
});

export const updateInvoicingAction = defineAction({
  permissions: ["settings.manage"],
  schema: z.object({ taxRatePercent: z.coerce.number().min(0).max(100), taxInclusive: z.boolean().default(false), invoiceFooter: opt(z.string().max(300)), bank: opt(z.string().max(80)), accountName: opt(z.string().max(100)), accountNumber: opt(z.string().max(30)) }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    await ctx.db.companySettings.updateMany({ data: { taxRatePercent: i.taxRatePercent, taxInclusive: i.taxInclusive, invoiceFooter: i.invoiceFooter ?? null, bankDetails: i.accountNumber ? { bank: i.bank, accountName: i.accountName, accountNumber: i.accountNumber } : (undefined as any) } });
    await auditFrom(ctx, "settings.invoicing_updated", "CompanySettings", null, undefined, i);
    return true;
  },
});

export const updateChannelsAction = defineAction({
  permissions: ["settings.manage", "notifications.manage"],
  schema: z.object({ channels: z.array(z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH"])).default([]) }),
  handler: async (ctx, i) => { await guardMutation(ctx.companyId); await ctx.db.companySettings.updateMany({ data: { enabledChannels: ["IN_APP", ...i.channels] } }); await auditFrom(ctx, "settings.channels_updated", "CompanySettings", null, undefined, i); return true; },
});

export const upsertTemplateAction = defineAction({
  permissions: ["notifications.manage"],
  schema: z.object({ event: z.enum(["shipment.created", "shipment.out_for_delivery", "shipment.delivered", "shipment.delivery_failed", "shipment.otp"]), channel: z.enum(["SMS", "WHATSAPP", "EMAIL"]), subject: opt(z.string().max(120)), body: z.string().trim().min(5).max(600) }),
  handler: async (ctx, i) => { await ctx.db.messageTemplate.upsert({ where: { companyId_event_channel: { companyId: ctx.companyId, event: i.event, channel: i.channel } }, create: { ...i } as any, update: { subject: i.subject, body: i.body } }); await auditFrom(ctx, "template.updated", "MessageTemplate", null, undefined, i); return true; },
});

const roleEnum = z.enum([...ASSIGNABLE_ROLES, "COMPANY_OWNER"] as unknown as [string, ...string[]]);
export const createUserAction = defineAction({
  permissions: ["users.manage"],
  schema: z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), phone: opt(phone), role: roleEnum, branchId: opt(z.string()), password: z.string().min(10).max(200) }),
  handler: async (ctx, i) => { const u = await createStaffUser(ctx, ctx.user.role, i as any); return { id: u.id }; },
});
export const updateUserAction = defineAction({
  permissions: ["users.manage"],
  schema: z.object({ id: z.string(), role: opt(roleEnum), branchId: z.string().nullable().optional(), isActive: z.boolean().optional(), extraPermissions: z.array(z.string()).optional(), deniedPermissions: z.array(z.string()).optional(), name: opt(z.string().min(2).max(100)), phone: opt(phone) }),
  handler: async (ctx, { id, ...i }) => { await updateStaffUser(ctx, ctx.user.id, ctx.user.role, id, i as any); return true; },
});
export const resetPasswordAction = defineAction({ permissions: ["users.manage"], schema: z.object({ id: z.string(), password: z.string().min(10).max(200) }), handler: async (ctx, i) => { await resetUserPassword(ctx, ctx.user.role, i.id, i.password); return true; } });

/** Change own password. Revokes other sessions. */
export async function changeOwnPasswordAction(raw: { current: string; next: string }): Promise<ActionResult<boolean>> {
  try {
    const ctx = await requireTenant();
    const i = z.object({ current: z.string().min(1), next: z.string().min(10).max(200) }).parse(raw);
    const bcrypt = (await import("bcryptjs")).default;
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!(await bcrypt.compare(i.current, u.passwordHash))) return { ok: false, error: "Current password is incorrect.", code: "VALIDATION" };
    const { validatePassword, BCRYPT_ROUNDS } = await import("@/lib/platform/provisioning");
    validatePassword(i.next);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(i.next, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } } });
    await auditFrom(ctx, "user.password_changed", "User", u.id);
    return { ok: true, data: true };
  } catch (e) { return toFailure(e); }
}

