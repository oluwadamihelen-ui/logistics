/** Platform-level queries. These intentionally use the unscoped client and must only be reachable via requirePlatformAdmin(). */
import { prisma } from "./db";
import { providerStatus } from "./notifications/providers";
import { aiStatus } from "./ai/provider";
import { getPaymentProvider } from "./payments/provider";

export async function platformOverview() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const [companies, subs, plans, shipments30, users30, revenue30, newCompanies, dbOk, churned] = await Promise.all([
    prisma.company.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscription.findMany({ select: { status: true, interval: true, planId: true, trialEndsAt: true, companyId: true, currentPeriodEnd: true } }),
    prisma.subscriptionPlan.findMany(),
    prisma.shipment.count({ where: { createdAt: { gte: d30 } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: d30 }, companyId: { not: null } } }),
    prisma.billingPayment.aggregate({ where: { status: "SUCCESSFUL", paidAt: { gte: d30 } }, _sum: { amountKobo: true } }),
    prisma.company.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, createdAt: true, status: true } }),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    prisma.auditLog.count({ where: { action: { in: ["billing.cancelled"] }, createdAt: { gte: d30 } } }),
  ]);
  const planBy = new Map(plans.map((p) => [p.id, p]));
  let mrrKobo = 0, paying = 0, trials = 0, trialsEnding = 0, pastDue = 0;
  for (const s of subs) {
    const p = planBy.get(s.planId);
    if (s.status === "TRIALING") { trials++; if (s.trialEndsAt && s.trialEndsAt.getTime() - now.getTime() < 3 * 86400_000) trialsEnding++; }
    if (s.status === "PAST_DUE") pastDue++;
    if ((s.status === "ACTIVE" || s.status === "PAST_DUE") && p) { paying++; mrrKobo += s.interval === "ANNUAL" ? Math.round((p.annualPriceKobo ?? 0) / 12) : p.monthlyPriceKobo ?? 0; }
  }
  const expired30 = await prisma.subscription.count({ where: { status: { in: ["EXPIRED", "CANCELLED"] }, updatedAt: { gte: d30 } } });
  const status = Object.fromEntries(companies.map((c) => [c.status, c._count._all])) as Record<string, number>;
  return {
    companies: companies.reduce((a, c) => a + c._count._all, 0), byStatus: status, paying, trials, trialsEnding, pastDue,
    mrr: mrrKobo / 100, arr: (mrrKobo * 12) / 100, churnedLast30: expired30, cancellationsLast30: churned,
    churnRatePct: paying + expired30 > 0 ? Math.round((expired30 / (paying + expired30)) * 1000) / 10 : null,
    shipments30, activeUsers30: users30, revenue30: (revenue30._sum.amountKobo ?? 0) / 100, newCompanies,
    health: { database: dbOk, payments: { provider: getPaymentProvider().name, configured: getPaymentProvider().isConfigured() }, ai: aiStatus(), channels: providerStatus(), mapsProvider: process.env.MAPS_PROVIDER ?? "osm", cronSecretSet: !!process.env.CRON_SECRET },
  };
}
