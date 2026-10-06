/** "What needs attention?" — computed live from real operational data (no stored/fake alerts). */
import { prisma, num } from "../platform/db";
import type { ServiceCtx } from "../platform/service";
import { collectExpiries } from "./fleet";
import { UNDELIVERED_STATUSES } from "./shipment-status";

export interface AttentionItem { id: string; priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; text: string; href: string }

export async function getAttention(svc: ServiceCtx, can: (p: any) => boolean): Promise<AttentionItem[]> {
  const out: AttentionItem[] = [];
  const now = new Date();
  const [sos, overdue, unassigned, failedPending, held, tickets, disputes, invoicesOverdue, drivers] = await Promise.all([
    can("dispatch.view") ? svc.db.driver.findMany({ where: { status: "EMERGENCY" }, select: { id: true, name: true } }) : [],
    can("shipments.view") ? svc.db.shipment.count({ where: { status: { in: UNDELIVERED_STATUSES }, expectedDeliveryAt: { lt: now } } }) : 0,
    can("dispatch.view") ? svc.db.shipment.count({ where: { status: { in: ["CONFIRMED", "READY_FOR_DISPATCH"] }, driverId: null, createdAt: { lt: new Date(now.getTime() - 4 * 3600_000) } } }) : 0,
    can("dispatch.view") ? svc.db.shipment.count({ where: { status: "DELIVERY_FAILED" } }) : 0,
    can("cod.view") ? prisma.$queryRaw<{ n: bigint; v: unknown }[]>`SELECT COUNT(DISTINCT "driverId") AS n, COALESCE(SUM("amountCollected" - "amountRemitted"),0) AS v FROM "CodTransaction" WHERE "companyId" = ${svc.companyId} AND "amountCollected" > "amountRemitted"` : [{ n: 0n, v: 0 }],
    can("support.view") ? svc.db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["CRITICAL", "HIGH"] } } }) : 0,
    can("cod.view") ? svc.db.codTransaction.count({ where: { status: "DISPUTED" } }) : 0,
    can("finance.view") ? svc.db.invoice.count({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } } }) : 0,
    can("dispatch.view") ? svc.db.driver.findMany({ where: { isActive: true, status: { in: ["ON_DELIVERY", "ON_PICKUP"] }, lastLocationAt: { lt: new Date(now.getTime() - 30 * 60_000) } }, select: { id: true, name: true, lastLocationAt: true } }) : [],
  ]);
  for (const d of sos) out.push({ id: `sos-${d.id}`, priority: "CRITICAL", text: `${d.name} has an active emergency (SOS).`, href: `/drivers/${d.id}` });
  for (const d of drivers) out.push({ id: `gps-${d.id}`, priority: "HIGH", text: `${d.name} is on a task but hasn't reported GPS for ${Math.round((now.getTime() - d.lastLocationAt!.getTime()) / 60000)} minutes.`, href: `/drivers/${d.id}` });
  if (overdue) out.push({ id: "overdue", priority: "HIGH", text: `${overdue} ${overdue === 1 ? "delivery is" : "deliveries are"} overdue.`, href: "/shipments?status=OUT_FOR_DELIVERY,ASSIGNED_FOR_DELIVERY,READY_FOR_DISPATCH,AT_HUB" });
  if (failedPending) out.push({ id: "failed", priority: "HIGH", text: `${failedPending} failed ${failedPending === 1 ? "delivery needs" : "deliveries need"} a decision (reschedule, retry or return).`, href: "/shipments?status=DELIVERY_FAILED" });
  if (unassigned) out.push({ id: "unassigned", priority: "MEDIUM", text: `${unassigned} shipment${unassigned > 1 ? "s have" : " has"} waited over 4 hours without a driver.`, href: "/dispatch" });
  if (disputes) out.push({ id: "cod-disputes", priority: "HIGH", text: `${disputes} COD collection${disputes > 1 ? "s" : ""} don't match the amount due.`, href: "/cod?status=DISPUTED" });
  if (Number(held[0]?.n ?? 0) > 0) out.push({ id: "cod-held", priority: "MEDIUM", text: `COD reconciliation pending for ${Number(held[0].n)} driver${Number(held[0].n) > 1 ? "s" : ""} (${num(held[0].v as any).toLocaleString()} held).`, href: "/cod" });
  if (invoicesOverdue) out.push({ id: "inv-overdue", priority: "MEDIUM", text: `${invoicesOverdue} invoice${invoicesOverdue > 1 ? "s are" : " is"} overdue.`, href: "/invoices?status=ISSUED" });
  if (tickets) out.push({ id: "tickets", priority: "MEDIUM", text: `${tickets} high-priority support ticket${tickets > 1 ? "s" : ""} open.`, href: "/support" });
  if (can("fleet.view") || can("documents.view")) {
    const exp = await collectExpiries(svc, 14);
    const expired = exp.filter((e) => e.days <= 0).length, soon = exp.length - expired;
    if (expired) out.push({ id: "exp-expired", priority: "HIGH", text: `${expired} vehicle/driver/document item${expired > 1 ? "s have" : " has"} expired.`, href: "/fleet" });
    if (soon) out.push({ id: "exp-soon", priority: "MEDIUM", text: `${soon} item${soon > 1 ? "s expire" : " expires"} within 14 days.`, href: "/fleet" });
  }
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
