"use server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { audit } from "@/lib/platform/audit";
import { AppError, toFailure, type ActionResult } from "@/lib/platform/errors";
import { FEATURES, LIMIT_KEYS } from "@/lib/platform/entitlements";

async function admin<T>(fn: (a: { id: string; name: string; role: string }) => Promise<T>): Promise<ActionResult<T>> {
  try { const u = await requirePlatformAdmin(); return { ok: true, data: await fn({ id: u.id, name: u.name, role: u.role }) }; } catch (e) { return toFailure(e); }
}

export async function setCompanyStatusAction(raw: { id: string; status: "ACTIVE" | "SUSPENDED" | "CLOSED" }) {
  return admin(async (a) => {
    const i = z.object({ id: z.string(), status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]) }).parse(raw);
    const c = await prisma.company.findUnique({ where: { id: i.id } });
    if (!c) throw new AppError("NOT_FOUND", "Company not found");
    await prisma.company.update({ where: { id: c.id }, data: { status: i.status } });
    await prisma.subscription.updateMany({ where: { companyId: c.id }, data: i.status === "SUSPENDED" ? { status: "SUSPENDED" } : i.status === "ACTIVE" ? { status: "ACTIVE" } : {} });
    // revoke sessions of all company users so suspension is immediate
    if (i.status !== "ACTIVE") await prisma.user.updateMany({ where: { companyId: c.id }, data: { tokenVersion: { increment: 1 } } });
    await audit({ companyId: c.id, actor: a, action: `platform.company_${i.status.toLowerCase()}`, resourceType: "Company", resourceId: c.id, before: { status: c.status }, after: { status: i.status } });
    return true;
  });
}

export async function setSubscriptionAction(raw: unknown) {
  return admin(async (a) => {
    const i = z.object({ companyId: z.string(), planKey: z.string().optional(), status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED", "SUSPENDED"]).optional(), extendTrialDays: z.coerce.number().int().min(0).max(365).optional(), extendPeriodDays: z.coerce.number().int().min(0).max(730).optional(), limitOverrides: z.string().max(500).optional() }).parse(raw);
    const sub = await prisma.subscription.findUnique({ where: { companyId: i.companyId } });
    if (!sub) throw new AppError("NOT_FOUND", "Subscription not found");
    const data: Prisma.SubscriptionUncheckedUpdateInput = {};
    if (i.planKey) { const p = await prisma.subscriptionPlan.findUnique({ where: { key: i.planKey } }); if (!p) throw new AppError("NOT_FOUND", "Plan not found"); data.planId = p.id; }
    if (i.status) data.status = i.status;
    if (i.extendTrialDays) data.trialEndsAt = new Date(Math.max(Date.now(), sub.trialEndsAt?.getTime() ?? 0) + i.extendTrialDays * 86400_000);
    if (i.extendPeriodDays) { data.currentPeriodEnd = new Date(Math.max(Date.now(), sub.currentPeriodEnd?.getTime() ?? 0) + i.extendPeriodDays * 86400_000); data.graceEndsAt = null; if (!i.status && sub.status !== "SUSPENDED") data.status = "ACTIVE"; }
    if (i.limitOverrides !== undefined) {
      if (i.limitOverrides.trim() === "") data.limitOverrides = undefined as any;
      else { let j: Record<string, number | null>; try { j = JSON.parse(i.limitOverrides); } catch { throw new AppError("VALIDATION", "Limit overrides must be valid JSON"); } for (const k of Object.keys(j)) if (!(LIMIT_KEYS as readonly string[]).includes(k)) throw new AppError("VALIDATION", `Unknown limit "${k}"`); data.limitOverrides = j as Prisma.InputJsonValue; }
    }
    await prisma.subscription.update({ where: { id: sub.id }, data });
    await audit({ companyId: i.companyId, actor: a, action: "platform.subscription_changed", resourceType: "Subscription", resourceId: sub.id, before: { planId: sub.planId, status: sub.status }, after: i });
    return true;
  });
}

export async function updatePlanAction(raw: unknown) {
  return admin(async (a) => {
    const i = z.object({
      key: z.string(), name: z.string().trim().min(2).max(40), description: z.string().max(200).optional(), monthlyNaira: z.coerce.number().min(0).optional(), annualNaira: z.coerce.number().min(0).optional(), trialDays: z.coerce.number().int().min(0).max(90),
      shipmentsPerMonth: z.coerce.number().int().optional(), drivers: z.coerce.number().int().optional(), vehicles: z.coerce.number().int().optional(), users: z.coerce.number().int().optional(), branches: z.coerce.number().int().optional(),
      features: z.array(z.string()).default([]), isActive: z.boolean().default(false), isPublic: z.boolean().default(false),
    }).parse(raw);
    const before = await prisma.subscriptionPlan.findUnique({ where: { key: i.key } });
    if (!before) throw new AppError("NOT_FOUND", "Plan not found");
    const limits: Record<string, number | null> = {};
    for (const k of LIMIT_KEYS) limits[k] = (i as any)[k] === undefined || (i as any)[k] < 0 ? null : (i as any)[k]; // blank/negative = unlimited
    const features = i.features.filter((f) => (FEATURES as readonly string[]).includes(f));
    await prisma.subscriptionPlan.update({ where: { key: i.key }, data: { name: i.name, description: i.description, monthlyPriceKobo: i.monthlyNaira === undefined ? null : Math.round(i.monthlyNaira * 100), annualPriceKobo: i.annualNaira === undefined ? null : Math.round(i.annualNaira * 100), trialDays: i.trialDays, limits, features, isActive: i.isActive, isPublic: i.isPublic } });
    await audit({ actor: a, action: "platform.plan_updated", resourceType: "SubscriptionPlan", resourceId: before.id, before: { monthly: before.monthlyPriceKobo, annual: before.annualPriceKobo, limits: before.limits, features: before.features }, after: { ...i, limits, features } });
    return true;
  });
}

export async function setSettingAction(raw: { key: "signupsEnabled" | "announcement"; value: unknown }) {
  return admin(async (a) => {
    const i = z.discriminatedUnion("key", [z.object({ key: z.literal("signupsEnabled"), value: z.boolean() }), z.object({ key: z.literal("announcement"), value: z.string().max(300) })]).parse(raw);
    await prisma.platformSetting.upsert({ where: { key: i.key }, create: { key: i.key, value: i.value as Prisma.InputJsonValue }, update: { value: i.value as Prisma.InputJsonValue } });
    await audit({ actor: a, action: "platform.setting_changed", resourceType: "PlatformSetting", resourceId: i.key, after: i });
    return true;
  });
}

export async function setSignupsAction(raw: { signupsEnabled?: boolean }) { return setSettingAction({ key: "signupsEnabled", value: !!raw.signupsEnabled }); }
export async function setAnnouncementAction(raw: { announcement?: string }) { return setSettingAction({ key: "announcement", value: String(raw.announcement ?? "") }); }
