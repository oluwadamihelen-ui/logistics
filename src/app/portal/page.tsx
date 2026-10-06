import Link from "next/link";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { requirePortalPage } from "@/lib/platform/portal";
import { prisma } from "@/lib/platform/db";
import { customerStats } from "@/lib/logistics/customers";
import { dateTime, money } from "@/lib/utils/format";

export default async function PortalHome() {
  const ctx = await requirePortalPage();
  const [stats, recent, company, cust] = await Promise.all([customerStats(ctx, ctx.customerId), ctx.db.shipment.findMany({ where: { customerId: ctx.customerId }, orderBy: { createdAt: "desc" }, take: 8 }), prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }), ctx.db.customer.findFirstOrThrow({ where: { id: ctx.customerId } })]);
  const cur = company.currency;
  return (
    <>
      <PageHeader title={`Welcome, ${cust.name}`} actions={ctx.can("portal.shipments.create") && <Link className="btn-primary" href="/portal/shipments/new">Book a shipment</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Shipments" value={stats.total} /><StatCard label="Delivered" value={stats.delivered} tone="success" /><StatCard label="Outstanding invoices" value={money(stats.outstanding, cur)} tone={stats.outstanding ? "warning" : "neutral"} /><StatCard label="COD owed to you" value={money(stats.codHeld, cur)} tone="info" /></div>
      <Card className="mt-4"><CardHeader title="Recent shipments" action={<Link href="/portal/shipments" className="text-xs text-brand">View all</Link>} /><ul className="divide-y divide-line">{recent.map((s) => <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm"><span><Link className="font-mono font-semibold text-brand" href={`/portal/shipments/${s.id}`}>{s.trackingNumber}</Link> · {s.recipientName}, {s.deliveryCity}<span className="ml-2 text-xs text-slate-400">{dateTime(s.createdAt)}</span></span><StatusBadge status={s.status} /></li>)}{!recent.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No shipments yet.</li>}</ul></Card>
    </>
  );
}
