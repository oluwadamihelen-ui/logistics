/**
 * Centralised subscription entitlements. UI and services ask THIS module what a company may do;
 * plan contents live in the database (SubscriptionPlan), never in React components.
 */
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";

export const FEATURES = [
  "shipments", "dispatch", "drivers", "fleet", "customers", "cod", "invoices", "public_tracking", "basic_reports",
  "live_map", "routes", "pricing_engine", "customer_portal", "public_booking", "ai_assistant", "settlements",
  "inventory", "sms_notifications", "corporate_accounts", "api_access", "advanced_analytics", "ai_insights",
  "whatsapp_notifications", "audit_log", "support_desk",
] as const;
export type Feature = (typeof FEATURES)[number];

export const LIMIT_KEYS = ["shipmentsPerMonth", "drivers", "vehicles", "users", "branches"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type Limits = Partial<Record<LimitKey, number | null>>;

export type AccessLevel = "FULL" | "GRACE" | "READ_ONLY" | "BLOCKED";

export interface SubscriptionLike {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd?: boolean;
}

export interface Access {
  status: SubscriptionStatus; // effective status after time-based transitions
  level: AccessLevel;
  reason?: string;
}

/**
 * Pure time-based resolution of what a subscription currently allows.
 *  TRIALING  → FULL until trialEndsAt, then EXPIRED (read-only)
 *  ACTIVE    → FULL until period end; then PAST_DUE with GRACE until graceEndsAt; then EXPIRED
 *  PAST_DUE  → GRACE until graceEndsAt; then EXPIRED
 *  CANCELLED → FULL until period end (cancel at period end), then EXPIRED
 *  EXPIRED   → READ_ONLY
 *  SUSPENDED → BLOCKED (platform-imposed)
 */
export function resolveAccess(sub: SubscriptionLike | null, now: Date = new Date()): Access {
  if (!sub) return { status: "EXPIRED", level: "READ_ONLY", reason: "No subscription" };
  switch (sub.status) {
    case "SUSPENDED":
      return { status: "SUSPENDED", level: "BLOCKED", reason: "Account suspended" };
    case "TRIALING":
      if (sub.trialEndsAt && sub.trialEndsAt > now) return { status: "TRIALING", level: "FULL" };
      return { status: "EXPIRED", level: "READ_ONLY", reason: "Trial ended" };
    case "ACTIVE":
    case "PAST_DUE": {
      if (sub.status === "ACTIVE" && (!sub.currentPeriodEnd || sub.currentPeriodEnd > now)) return { status: "ACTIVE", level: "FULL" };
      const graceEnd = sub.graceEndsAt ?? (sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd.getTime() + 7 * 86400_000) : null);
      if (graceEnd && graceEnd > now) return { status: "PAST_DUE", level: "GRACE", reason: "Payment overdue" };
      return { status: "EXPIRED", level: "READ_ONLY", reason: "Subscription expired" };
    }
    case "CANCELLED":
      if (sub.currentPeriodEnd && sub.currentPeriodEnd > now) return { status: "CANCELLED", level: "FULL", reason: "Cancels at period end" };
      return { status: "CANCELLED", level: "READ_ONLY", reason: "Subscription cancelled" };
    case "EXPIRED":
    default:
      return { status: "EXPIRED", level: "READ_ONLY", reason: "Subscription expired" };
  }
}

export interface Entitlements {
  planKey: string | null;
  planName: string | null;
  access: Access;
  features: Set<string>;
  limits: Limits;
  subscription: SubscriptionLike | null;
}

export async function getEntitlements(companyId: string): Promise<Entitlements> {
  const sub = await prisma.subscription.findUnique({ where: { companyId }, include: { plan: true } });
  if (!sub) return { planKey: null, planName: null, access: resolveAccess(null), features: new Set(), limits: {}, subscription: null };
  const limits: Limits = { ...((sub.plan.limits as Limits) ?? {}), ...((sub.limitOverrides as Limits | null) ?? {}) };
  return {
    planKey: sub.plan.key,
    planName: sub.plan.name,
    access: resolveAccess(sub),
    features: new Set(sub.plan.features),
    limits,
    subscription: sub,
  };
}

export function hasFeature(e: Entitlements, f: Feature): boolean {
  return e.features.has(f);
}

export function limitFor(e: Entitlements, key: LimitKey): number | null {
  const v = e.limits[key];
  return v === undefined || v === null || v < 0 ? null : v; // null = unlimited
}

/** Mutations are blocked when the subscription is expired/suspended/cancelled-past-period. */
export function assertWritable(e: Entitlements): void {
  if (e.access.level === "READ_ONLY" || e.access.level === "BLOCKED") {
    throw new AppError("SUBSCRIPTION_INACTIVE", `${e.access.reason ?? "Subscription inactive"}. Renew or upgrade your plan to make changes.`);
  }
}

export function assertFeature(e: Entitlements, f: Feature): void {
  if (!hasFeature(e, f)) throw new AppError("FEATURE_UNAVAILABLE", `Your current plan doesn't include this feature. Upgrade to unlock it.`, { feature: f });
}

export function assertWithinLimit(e: Entitlements, key: LimitKey, currentUsage: number, adding = 1): void {
  const lim = limitFor(e, key);
  if (lim !== null && currentUsage + adding > lim) {
    throw new AppError("LIMIT_EXCEEDED", `Your plan allows ${lim} ${key.replace(/([A-Z])/g, " $1").toLowerCase()}. Upgrade to add more.`, { key, limit: lim });
  }
}

export async function currentUsage(companyId: string): Promise<Record<LimitKey, number>> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [shipments, drivers, vehicles, users, branches] = await Promise.all([
    prisma.shipment.count({ where: { companyId, createdAt: { gte: monthStart } } }),
    prisma.driver.count({ where: { companyId, isActive: true } }),
    prisma.vehicle.count({ where: { companyId, isActive: true } }),
    prisma.user.count({ where: { companyId, isActive: true, role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT"] } } }),
    prisma.branch.count({ where: { companyId, isActive: true } }),
  ]);
  return { shipmentsPerMonth: shipments, drivers, vehicles, users, branches };
}

/** Convenience: fetch entitlements, assert writable, and (optionally) feature + limit in one call. */
export async function guardMutation(
  companyId: string,
  opts: { feature?: Feature; limit?: { key: LimitKey; adding?: number } } = {},
): Promise<Entitlements> {
  const e = await getEntitlements(companyId);
  assertWritable(e);
  if (opts.feature) assertFeature(e, opts.feature);
  if (opts.limit) {
    const lim = limitFor(e, opts.limit.key);
    if (lim !== null) {
      const usage = await currentUsage(companyId);
      assertWithinLimit(e, opts.limit.key, usage[opts.limit.key], opts.limit.adding ?? 1);
    }
  }
  return e;
}

/** Default plan catalogue used to seed the database. Prices are DATA, editable in platform admin. */
export const DEFAULT_PLANS = [
  {
    key: "starter", name: "Starter", description: "For small delivery businesses getting organised.",
    monthlyPriceKobo: 30_000_00, annualPriceKobo: 300_000_00, trialDays: 14, sortOrder: 1,
    limits: { shipmentsPerMonth: 500, drivers: 10, vehicles: 10, users: 5, branches: 1 },
    features: ["shipments", "dispatch", "drivers", "fleet", "customers", "cod", "invoices", "public_tracking", "basic_reports", "support_desk"],
  },
  {
    key: "professional", name: "Professional", description: "Growing fleets that need automation and customer self-service.",
    monthlyPriceKobo: 75_000_00, annualPriceKobo: 750_000_00, trialDays: 14, sortOrder: 2,
    limits: { shipmentsPerMonth: 5000, drivers: 50, vehicles: 50, users: 25, branches: 5 },
    features: ["shipments", "dispatch", "drivers", "fleet", "customers", "cod", "invoices", "public_tracking", "basic_reports", "support_desk",
      "live_map", "routes", "pricing_engine", "customer_portal", "public_booking", "ai_assistant", "settlements", "inventory", "sms_notifications", "audit_log"],
  },
  {
    key: "premium", name: "Premium", description: "Multi-branch operators with corporate clients and integrations.",
    monthlyPriceKobo: 150_000_00, annualPriceKobo: 1_500_000_00, trialDays: 14, sortOrder: 3,
    limits: { shipmentsPerMonth: 25000, drivers: 200, vehicles: 200, users: 100, branches: 20 },
    features: [...FEATURES],
  },
  {
    key: "enterprise", name: "Enterprise", description: "Custom limits, SLAs and integrations.",
    monthlyPriceKobo: null, annualPriceKobo: null, trialDays: 14, sortOrder: 4,
    limits: { shipmentsPerMonth: null, drivers: null, vehicles: null, users: null, branches: null },
    features: [...FEATURES],
  },
] as const;
