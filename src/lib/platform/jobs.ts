/**
 * Scheduled maintenance. Triggered by POST /api/cron/maintenance (protected by CRON_SECRET) — wire it to
 * any scheduler (Vercel Cron, GitHub Actions, Windows Task Scheduler + curl, cron-job.org…).
 */
import { prisma, createTenantClient } from "./db";
import { purgeRateLimits } from "./rate-limit";
import { renewDueSubscriptions } from "./billing";
import { resolveAccess } from "./entitlements";
import { emitSafe } from "./notifications/engine";
import { scanExpiries } from "../logistics/fleet";
import { PICKUP_HOLD_DAYS, UNDELIVERED_STATUSES } from "../logistics/shipment-status";
import type { ServiceCtx } from "./service";

export async function runMaintenance(now = new Date()) {
  const summary = { companies: 0, expiryAlerts: 0, overdueAlerts: 0, offlineAlerts: 0, subscriptionsUpdated: 0, trialNotices: 0, renewalsAttempted: 0, renewalsSucceeded: 0, renewalsFailed: 0 };
  // Auto-renewals run first so a successful charge prevents the lapse transition below.
  try { const r = await renewDueSubscriptions(now); summary.renewalsAttempted = r.attempted; summary.renewalsSucceeded = r.renewed; summary.renewalsFailed = r.failed; } catch (e) { console.error("[maintenance] renewals failed", e instanceof Error ? e.message : e); }
  await purgeRateLimits().catch(() => undefined);
  const companies = await prisma.company.findMany({ where: { status: { in: ["ACTIVE", "ONBOARDING"] } }, select: { id: true } });
  for (const { id } of companies) {
    summary.companies++;
    const svc: ServiceCtx = { db: createTenantClient(id), companyId: id, actor: null };
    try {
      // 1. Persist time-based subscription transitions so dashboards/billing reflect reality.
      const sub = await prisma.subscription.findUnique({ where: { companyId: id } });
      if (sub) {
        const a = resolveAccess(sub, now);
        if (a.status !== sub.status && sub.status !== "CANCELLED" && sub.status !== "SUSPENDED") {
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: a.status, ...(a.status === "PAST_DUE" && !sub.graceEndsAt && sub.currentPeriodEnd ? { graceEndsAt: new Date(sub.currentPeriodEnd.getTime() + 7 * 86400_000) } : {}) } });
          summary.subscriptionsUpdated++;
        }
        if (sub.status === "TRIALING" && sub.trialEndsAt) {
          const days = Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86400_000);
          if (days > 0 && days <= 3) { await emitSafe(svc, { type: "billing.trial_ending", title: `Your trial ends in ${days} day${days > 1 ? "s" : ""}`, body: "Choose a plan to keep creating shipments.", actionUrl: "/billing", dedupeKey: `trial:${days}` }); summary.trialNotices++; }
        }
      }
      // 2. Document / vehicle expiry alerts
      summary.expiryAlerts += (await scanExpiries(svc)).emitted;
      // 3. Overdue deliveries
      const overdue = await svc.db.shipment.count({ where: { status: { in: UNDELIVERED_STATUSES }, expectedDeliveryAt: { lt: now } } });
      if (overdue > 0) { await emitSafe(svc, { type: "shipment.overdue", title: `${overdue} deliver${overdue === 1 ? "y is" : "ies are"} overdue`, body: "Review undelivered shipments past their expected date.", actionUrl: "/shipments?status=OUT_FOR_DELIVERY,ASSIGNED_FOR_DELIVERY,READY_FOR_DISPATCH", dedupeKey: `overdue:${now.toISOString().slice(0, 10)}` }); summary.overdueAlerts++; }
      // 3b. Hub-pickup shipments nobody has collected within the hold period
      const uncollected = await svc.db.shipment.count({ where: { status: "READY_FOR_PICKUP", readyForPickupAt: { lt: new Date(now.getTime() - PICKUP_HOLD_DAYS * 86400_000) } } });
      if (uncollected > 0) await emitSafe(svc, { type: "shipment.uncollected", title: `${uncollected} shipment${uncollected === 1 ? "" : "s"} uncollected for ${PICKUP_HOLD_DAYS}+ days`, body: "Contact the recipients or start a return to sender.", actionUrl: "/shipments?status=READY_FOR_PICKUP", dedupeKey: `uncollected:${now.toISOString().slice(0, 10)}` });
      // 4. Drivers on active work with no GPS for 30+ minutes
      const stale = await svc.db.driver.findMany({ where: { isActive: true, status: { in: ["ON_DELIVERY", "ON_PICKUP"] }, lastLocationAt: { lt: new Date(now.getTime() - 30 * 60_000) } } });
      for (const d of stale) { await emitSafe(svc, { type: "driver.offline_active", title: `${d.name} has been offline during an active delivery`, body: `No GPS update for ${Math.round((now.getTime() - (d.lastLocationAt?.getTime() ?? now.getTime())) / 60000)} minutes.`, entity: { type: "Driver", id: d.id }, actionUrl: `/drivers/${d.id}`, branchId: d.branchId }); summary.offlineAlerts++; }
    } catch (e) {
      console.error("[maintenance] company failed", id, e instanceof Error ? e.message : e);
    }
  }
  return summary;
}
