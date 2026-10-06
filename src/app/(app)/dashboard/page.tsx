import Link from "next/link";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { HBarChart, RevenueChart, StackedPerfChart, VolumeChart } from "@/components/client/charts";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { deriveDataInsights, getDashboard } from "@/lib/logistics/dashboard";
import { compactMoney, pct, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requirePageContext("dashboard.view");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { timezone: true, currency: true, name: true } });
  const d = await getDashboard(ctx, company.timezone);
  const k = d.kpis;
  const insights = deriveDataInsights(d, company.currency);
  const showFinance = ctx.can("finance.view") || ctx.can("cod.view");
  const m = (n: number) => compactMoney(n, company.currency);
  const hasData = d.series.some((p) => p.created || p.delivered) || k.todaysShipments > 0;

  return (
    <>
      <PageHeader title="Operations dashboard" subtitle={`${company.name} · live from your shipment data`} actions={ctx.can("shipments.create") ? <Link href="/shipments/new" className="btn-primary">New shipment</Link> : undefined} />

      {insights.length > 0 && (
        <section className="mb-6 space-y-2" aria-label="Operational insights">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insights from your data</p>
          {insights.map((i) => (
            <Alert key={i.id} tone={i.severity === "danger" ? "danger" : i.severity === "warning" ? "warning" : "info"}>
              {i.text} {i.href && <Link href={i.href} className="font-semibold underline">View</Link>}
            </Alert>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Today's shipments" value={k.todaysShipments} tone="info" href="/shipments" />
        <StatCard label="Pending pickup" value={k.pendingPickup} tone="warning" href="/shipments?status=CREATED,CONFIRMED,PICKUP_ASSIGNED" />
        <StatCard label="Picked up" value={k.pickedUp} tone="progress" href="/shipments?status=PICKED_UP" />
        <StatCard label="At hub" value={k.atHub} tone="progress" href="/shipments?status=AT_HUB,SORTING" />
        <StatCard label="Ready / assigned" value={k.readyForDispatch} tone="info" href="/dispatch" />
        <StatCard label="Out for delivery" value={k.outForDelivery} tone="progress" href="/shipments?status=OUT_FOR_DELIVERY" />
        <StatCard label="Delivered today" value={k.deliveredToday} tone="success" />
        <StatCard label="Failed attempts today" value={k.failedToday} tone={k.failedToday ? "danger" : "neutral"} href="/shipments?status=DELIVERY_FAILED" />
        <StatCard label="Returns (30d)" value={k.returned} tone="warning" />
        <StatCard label="Delivery success (30d)" value={k.successRate === null ? "—" : pct(k.successRate, 1)} hint={k.successRate === null ? "No attempts yet" : "delivered ÷ attempts"} tone="success" />
        <StatCard label="Avg delivery time (30d)" value={k.avgDeliveryHours === null ? "—" : k.avgDeliveryHours < 48 ? `${k.avgDeliveryHours.toFixed(1)}h` : `${(k.avgDeliveryHours / 24).toFixed(1)}d`} hint="created → delivered" />
        <StatCard label="Open support issues" value={k.openIssues} tone={k.openIssues ? "warning" : "neutral"} href="/support" />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Active drivers" value={k.activeDrivers} href="/drivers" />
        <StatCard label="Available drivers" value={k.availableDrivers} tone="success" />
        <StatCard label="On pickup/delivery" value={k.driversOnDelivery} tone="progress" />
        <StatCard label="Vehicles active" value={k.vehiclesActive} href="/fleet" />
        <StatCard label="In maintenance" value={k.vehiclesMaintenance} tone={k.vehiclesMaintenance ? "warning" : "neutral"} />
        {showFinance && <StatCard label="Pending settlements" value={k.pendingSettlements} hint={k.pendingSettlements ? m(k.pendingSettlementsAmount) : undefined} href="/settlements" />}
      </section>

      {showFinance && (
        <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <StatCard label="Revenue today" value={m(k.revenueToday)} tone="success" hint="delivery fees, delivered" />
          <StatCard label="Revenue this month" value={m(k.revenueMonth)} tone="success" />
          <StatCard label="COD collected today" value={m(k.codCollectedToday)} tone="info" href="/cod" />
          <StatCard label="COD held by drivers" value={m(k.codHeldByDrivers)} tone={k.codHeldByDrivers ? "warning" : "neutral"} hint="awaiting remittance" href="/cod" />
          <StatCard label="COD unsettled to senders" value={m(k.codUnsettled)} tone={k.codUnsettled ? "warning" : "neutral"} href="/cod" />
          <StatCard label="COD not yet collected" value={m(k.codAwaitingCollection)} hint="on undelivered shipments" />
        </section>
      )}

      {!hasData ? (
        <div className="mt-8"><EmptyState title="No shipment activity yet" description="Charts appear as soon as shipments are created and delivered." action={ctx.can("shipments.create") ? <Link href="/shipments/new" className="btn-primary">Create your first shipment</Link> : undefined} /></div>
      ) : (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Shipment volume" subtitle="Last 14 days" /><div className="p-4"><VolumeChart data={d.series} /></div></Card>
            {showFinance ? (
              <Card><CardHeader title="Revenue" subtitle="Delivery fees on delivered shipments, last 14 days" /><div className="p-4"><RevenueChart data={d.series} currency={company.currency} /></div></Card>
            ) : (
              <Card><CardHeader title="Failed delivery reasons" subtitle="Last 30 days" /><div className="p-4">{d.failureReasons.length ? <HBarChart label="Failure reasons" data={d.failureReasons.map((r) => ({ name: titleCase(r.reason), count: r.count }))} /> : <p className="py-10 text-center text-sm text-slate-500">No failed deliveries — nice.</p>}</div></Card>
            )}
          </section>
          <section className="mt-4 grid gap-4 lg:grid-cols-3">
            {showFinance && <Card><CardHeader title="Failed delivery reasons" subtitle="Last 30 days" /><div className="p-4">{d.failureReasons.length ? <HBarChart label="Failure reasons" data={d.failureReasons.map((r) => ({ name: titleCase(r.reason), count: r.count }))} /> : <p className="py-10 text-center text-sm text-slate-500">No failed deliveries.</p>}</div></Card>}
            <Card><CardHeader title="Driver performance" subtitle="Delivered vs failed attempts, 30 days" /><div className="p-4">{d.byDriver.length ? <StackedPerfChart label="Driver performance" data={d.byDriver} /> : <p className="py-10 text-center text-sm text-slate-500">No driver activity yet.</p>}</div></Card>
            <Card><CardHeader title="Zone performance" subtitle="Delivered vs problem shipments, 30 days" /><div className="p-4">{d.byZone.length ? <StackedPerfChart label="Zone performance" data={d.byZone.map((z) => ({ name: z.name, delivered: z.delivered, failed: z.failed }))} /> : <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>}</div></Card>
            <Card><CardHeader title="Branch performance" subtitle="Shipments by branch, 30 days" /><div className="p-4">{d.byBranch.length ? <HBarChart label="Branch volume" dataKey="total" color="#2a78d6" data={d.byBranch.map((b) => ({ name: b.name, total: b.total }))} /> : <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>}</div></Card>
          </section>
        </>
      )}
    </>
  );
}
