import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { DEFAULT_PLANS } from "./entitlements";
import { audit } from "./audit";

export const BCRYPT_ROUNDS = 12;

/** Upsert the default plan catalogue (idempotent). Prices can later be edited in platform admin. */
export async function ensurePlans() {
  for (const p of DEFAULT_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, description: p.description, monthlyPriceKobo: p.monthlyPriceKobo, annualPriceKobo: p.annualPriceKobo, trialDays: p.trialDays, sortOrder: p.sortOrder, limits: p.limits as Prisma.InputJsonValue, features: [...p.features] },
      update: {}, // never overwrite admin-edited plans
    });
  }
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";
}

export function validatePassword(pw: string) {
  if (pw.length < 10) throw new AppError("VALIDATION", "Password must be at least 10 characters.");
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) throw new AppError("VALIDATION", "Password must include letters and numbers.");
}

export interface ProvisionInput {
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  planKey?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  businessType?: string;
}

/** Creates a tenant: company + settings + trial subscription + owner user. */
export async function provisionCompany(input: ProvisionInput) {
  validatePassword(input.password);
  const email = input.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("CONFLICT", "An account with this email already exists.");
  await ensurePlans();
  const plan = await prisma.subscriptionPlan.findUnique({ where: { key: input.planKey ?? "professional" } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan not found");

  let slug = slugify(input.companyName);
  if (await prisma.company.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const trialEnds = new Date(Date.now() + plan.trialDays * 86400_000);

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.companyName.trim(), slug, email, phone: input.phone, country: input.country ?? "NG",
        currency: input.currency ?? "NGN", timezone: input.timezone ?? "Africa/Lagos", businessType: input.businessType,
        settings: { create: {} },
        subscription: { create: { planId: plan.id, status: "TRIALING", interval: "MONTHLY", trialEndsAt: trialEnds } },
      },
    });
    const owner = await tx.user.create({ data: { email, passwordHash, name: input.ownerName.trim(), phone: input.phone, role: "COMPANY_OWNER", companyId: company.id } });
    return { company, owner };
  });
  await audit({ companyId: result.company.id, actor: { id: result.owner.id, name: result.owner.name, role: "COMPANY_OWNER" }, action: "company.created", resourceType: "Company", resourceId: result.company.id, after: { name: result.company.name, plan: plan.key } });
  return result;
}
