import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { HBarChart, RevenueChart, StackedPerfChart, VolumeChart } from "@/components/client/charts";
import { InsightGenerator } from "@/components/client/insight-generator";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { getEntitlements } from "@/lib/platform/entitlements";
import { aiStatus } from "@/lib/platform/ai/provider";
import { branchPerformance, customerAnalytics, deliveryStats, detectAnomalies, driverDistanceKm, driverPerformance, driverRatings, failedDeliveries, forecastVolume, lastDays, vehicleStats, zonePerformance } from "@/lib/logistics/analytics";
import { getDashboard } from "@/lib/logistics/dashboard";
import { money, pct, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Analytics" };
const TABS = [{ key: "overview", label: "Company" }, { key: "drivers", label: "Drivers" }, { key: "fleet", label: "Fleet" }, { key: "customers", label: "Customers" }, { key: "insights", label: "Insights" }];
const RANGES: Record<string, number> = { "7": 7, "30": 30, "90": 90 };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const n = RANGES[sp.days ?? "30"] ?? 30;
  const ctx = await requirePageContext("analytics.view");
  const [company, ent] = await Promise.all([prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true, timezone: true } }), getEntitlements(ctx.companyId)]);
  const cur = company.currency;
  const r = lastDays(n), prev = { from: new Date(Date.now() - 2 * n * 86400_000), to: r.from };
  const delta = (a: number | null, b: number | null, invert = false) => a === null || b === null || b === 0 ? null : { v: ((a - b) / b) * 100, good: invert ? a < b : a > b };
  const Rng = () => <div className="mb-4 flex gap-1.5">{Object.keys(RANGES).map((d) => <a key={d} href={`/analytics?tab=${tab}&days=${d}`} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${String(n) === d ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line"}`}>Last {d} days</a>)}</div>;
  return (
    <>
      <PageHeader title="Analytics" subtitle="Computed from your shipment, fleet and finance records" />
      <Tabs tabs={TABS} active={tab} basePath="/analytics" />
      {tab !== "insights" && <Rng />}

      {tab === "overview" && await (async () => {
        const [cur_, prv, dash, zones, branches, fails] = await Promise.all([deliveryStats(ctx, r), deliveryStats(ctx, prev), getDashboard(ctx, company.timezone), zonePerformance(ctx, r), branchPerformance(ctx, r), failedDeliveries(ctx, r)]);
        const D = ({ d }: { d: ReturnType<typeof delta> }) => d ? <span className={d.good ? "text-emerald-600" : "text-red-600"}>{d.v >= 0 ? "▲" : "▼"} {Math.abs(d.v).toFixed(0)}% vs previous</span> : <span>no prior data</span>;
        return <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Shipments" value={cur_.shipmentsCreated.toLocaleString()} hint={<D d={delta(cur_.shipmentsCreated, prv.shipmentsCreated)} />} /><StatCard label="Delivered" value={cur_.delivered.toLocaleString()} tone="success" hint={<D d={delta(cur_.delivered, prv.delivered)} />} />
            <StatCard label="Success rate" value={cur_.deliverySuccessRatePct === null ? "—" : pct(cur_.deliverySuccessRatePct, 1)} tone="success" hint={<D d={delta(cur_.deliverySuccessRatePct, prv.deliverySuccessRatePct)} />} /><StatCard label="Return rate" value={cur_.returnRatePct === null ? "—" : pct(cur_.returnRatePct, 1)} tone="warning" hint={<D d={delta(cur_.returnRatePct, prv.returnRatePct, true)} />} />
            <StatCard label="Avg delivery time" value={cur_.avgDeliveryHours === null ? "—" : `${cur_.avgDeliveryHours}h`} hint={cur_.p90DeliveryHours ? `p90 ${cur_.p90DeliveryHours}h` : undefined} /><StatCard label="Revenue" value={money(cur_.revenue, cur)} tone="info" hint={<D d={delta(cur_.revenue, prv.revenue)} />} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Shipment volume" subtitle="Last 14 days" /><div className="p-4"><VolumeChart data={dash.series} /></div></Card>
            <Card><CardHeader title="Revenue" subtitle="Delivery fees, last 14 days" /><div className="p-4"><RevenueChart data={dash.series} currency={cur} /></div></Card>
            <Card><CardHeader title="Zone performance" /><div className="p-4">{zones.length ? <StackedPerfChart label="Zone performance" data={zones.map((z) => ({ name: z.zone, delivered: z.delivered, failed: z.problem }))} /> : <p className="py-8 text-center text-sm text-slate-500">No data</p>}</div></Card>
            <Card><CardHeader title="Failure reasons" /><div className="p-4">{fails.reasons.length ? <HBarChart label="Failure reasons" data={fails.reasons.map((x) => ({ name: titleCase(x.reason), count: x.count }))} /> : <p className="py-8 text-center text-sm text-slate-500">No failed deliveries in this period.</p>}</div></Card>
          </div>
          <Card className="mt-4"><CardHeader title="Branch performance" /><Table><THead><TH>Branch</TH><TH className="text-right">Shipments</TH><TH className="text-right">Delivered</TH><TH className="text-right">Delivered %</TH><TH className="text-right">Problems</TH><TH className="text-right">Revenue</TH></THead><TBody>{branches.map((b) => <TR key={b.branch}><TD>{b.branch}</TD><TD className="text-right">{b.shipments}</TD><TD className="text-right">{b.delivered}</TD><TD className="text-right">{b.deliveredPct ?? "—"}%</TD><TD className="text-right">{b.problem}</TD><TD className="text-right tabular-nums">{money(b.revenue, cur)}</TD></TR>)}</TBody></Table></Card>
        </>;
      })()}

      {tab === "drivers" && await (async () => {
        const [perf, dist, rate] = await Promise.all([driverPerformance(ctx, r), driverDistanceKm(ctx, r), driverRatings(ctx, r)]);
        return <Card><Table><THead><TH>Driver</TH><TH className="text-right">Delivered</TH><TH className="text-right">Failed</TH><TH className="text-right">Success</TH><TH className="text-right">Avg pickup→delivery</TH><TH className="text-right">GPS distance</TH><TH className="text-right">Revenue</TH><TH className="text-right">COD collected</TH><TH className="text-right">Rating</TH></THead><TBody>
          {perf.map((p) => { const rt = rate.get(p.driverId); return <TR key={p.driverId}><TD className="font-medium">{p.driver}</TD><TD className="text-right">{p.delivered}</TD><TD className="text-right">{p.failedAttempts}</TD><TD className="text-right">{p.successRatePct === null ? "—" : `${p.successRatePct}%`}</TD><TD className="text-right">{p.avgPickupToDeliveryHours === null ? "—" : `${p.avgPickupToDeliveryHours}h`}</TD><TD className="text-right">{dist.has(p.driverId) ? `${dist.get(p.driverId)} km` : "no GPS"}</TD><TD className="text-right tabular-nums">{money(p.revenue, cur)}</TD><TD className="text-right tabular-nums">{money(p.codCollected, cur)}</TD><TD className="text-right">{rt ? `★ ${rt.avg} (${rt.count})` : "—"}</TD></TR>; })}{!perf.length && <TR><TD colSpan={9} className="text-center text-slate-500">No drivers</TD></TR>}</TBody></Table></Card>;
      })()}

      {tab === "fleet" && await (async () => {
        const v = await vehicleStats(ctx, r);
        return <Card><Table><THead><TH>Vehicle</TH><TH>Status</TH><TH className="text-right">Trips (deliveries)</TH><TH className="text-right">Odometer</TH><TH className="text-right">Fuel</TH><TH className="text-right">Maintenance</TH><TH className="text-right">Cost / delivery</TH></THead><TBody>{v.map((x) => <TR key={x.id}><TD className="font-medium">{x.registration}</TD><TD><Badge>{titleCase(x.status)}</Badge></TD><TD className="text-right">{x.trips}</TD><TD className="text-right">{x.mileageKm.toLocaleString()} km</TD><TD className="text-right tabular-nums">{money(x.fuelSpend, cur)}</TD><TD className="text-right tabular-nums">{money(x.maintenanceCost, cur)} <span className="text-xs text-slate-400">({x.maintenanceEvents})</span></TD><TD className="text-right tabular-nums">{x.costPerDelivery === null ? "—" : money(x.costPerDelivery, cur)}</TD></TR>)}</TBody></Table><p className="px-5 py-3 text-xs text-slate-500">Downtime is not measured automatically; use maintenance event counts and vehicle status history in the audit log.</p></Card>;
      })()}

      {tab === "customers" && await (async () => {
        const c = await customerAnalytics(ctx);
        return <div className="grid gap-4 lg:grid-cols-3">
          <StatCard label="Customer retention (30d)" value={c.retentionPct === null ? "—" : pct(c.retentionPct, 1)} hint={c.retentionPct === null ? "Needs ≥5 active customers in the prior 30 days" : `of ${c.retentionBase} customers active in the prior 30 days`} tone="success" />
          <Card className="lg:col-span-2"><CardHeader title="New customers by month" /><div className="p-4">{c.acquisition.length ? <HBarChart label="New customers" dataKey="count" color="#2a78d6" data={c.acquisition.map((a) => ({ name: a.month, count: a.newCustomers }))} /> : <p className="py-6 text-center text-sm text-slate-500">No data</p>}</div></Card>
          <Card className="lg:col-span-3"><CardHeader title="Top customers by revenue (30d)" /><Table><THead><TH>Customer</TH><TH className="text-right">Shipments</TH><TH className="text-right">Revenue</TH></THead><TBody>{c.top.map((t) => <TR key={t.id}><TD><a className="text-brand" href={`/customers/${t.id}`}>{t.name}</a></TD><TD className="text-right">{t.shipments}</TD><TD className="text-right tabular-nums">{money(t.revenue, cur)}</TD></TR>)}</TBody></Table></Card></div>;
      })()}

      {tab === "insights" && await (async () => {
        const [facts, fc] = await Promise.all([detectAnomalies(ctx), forecastVolume(ctx)]);
        const st = aiStatus();
        const aiOk = ent.features.has("ai_insights") && !!st.active;
        return <div className="space-y-4">
          <Card><CardHeader title="Real data findings" subtitle="Deterministic statistical checks over your records. Nothing here is generated by a model." />
            <div className="space-y-2 p-5">{facts.anomalies.map((a, i) => <Alert key={i} tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"} title={`${a.subject} — ${titleCase(a.kind)}`}>{a.detail}</Alert>)}
              {!facts.anomalies.length && <p className="text-sm text-slate-600">No anomalies detected.</p>}
              {facts.insufficientData.length > 0 && <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><p className="mb-1 font-semibold">Not enough data yet for:</p><ul className="list-disc pl-5">{facts.insufficientData.map((m) => <li key={m}>{m}</li>)}</ul></div>}</div></Card>
          <Card><CardHeader title="AI analysis & recommendations" subtitle="Interprets the findings above. Clearly separate from the data." /><div className="p-5"><InsightGenerator enabled={aiOk} reason={!ent.features.has("ai_insights") ? "AI insights are available on the Premium plan." : !st.active ? "No AI provider is configured on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY)." : undefined} /></div></Card>
          <Card><CardHeader title="Volume forecast" subtitle={fc.available ? fc.method : "Statistical baseline — not machine learning"} />{fc.available ? <Table><THead><TH>Day</TH><TH className="text-right">Expected</TH><TH className="text-right">Range</TH></THead><TBody>{fc.forecast.map((f) => <TR key={f.day}><TD>{f.day}</TD><TD className="text-right font-medium">{f.expected}</TD><TD className="text-right text-slate-500">{f.low}–{f.high}</TD></TR>)}</TBody></Table> : <div className="p-5"><EmptyState title="Forecast unavailable" description={fc.reason} /></div>}</Card></div>;
      })()}
    </>
  );
}
