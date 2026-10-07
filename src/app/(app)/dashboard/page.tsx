import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { HBarChart, RevenueChart, StackedPerfChart, VolumeChart } from "@/components/client/charts";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { deriveDataInsights, getDashboard } from "@/lib/logistics/dashboard";
import { Icon } from "@/components/client/icon";
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

  const greeting = (() => { const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: company.timezone }).format(new Date())) % 24; return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: company.timezone }).format(new Date());
  const avg = k.avgDeliveryHours === null ? "—" : k.avgDeliveryHours < 48 ? `${k.avgDeliveryHours.toFixed(1)}h` : `${(k.avgDeliveryHours / 24).toFixed(1)}d`;
  const pipeline: { label: string; value: number; href?: string; tone: string }[] = [
    { label: "Pending pickup", value: k.pendingPickup, href: "/shipments?status=CREATED,CONFIRMED,PICKUP_ASSIGNED", tone: "bg-amber-500" },
    { label: "Picked up", value: k.pickedUp, href: "/shipments?status=PICKED_UP", tone: "bg-indigo-500" },
    { label: "At hub", value: k.atHub, href: "/shipments?status=AT_HUB,SORTING", tone: "bg-violet-500" },
    { label: "Ready / assigned", value: k.readyForDispatch, href: "/dispatch", tone: "bg-sky-500" },
    { label: "Ready for pickup", value: k.readyForPickup, href: "/shipments?status=READY_FOR_PICKUP", tone: "bg-amber-400" },
    { label: "Out for delivery", value: k.outForDelivery, href: "/shipments?status=OUT_FOR_DELIVERY", tone: "bg-blue-600" },
    { label: "Delivered today", value: k.deliveredToday, tone: "bg-emerald-500" },
    { label: "Failed today", value: k.failedToday, href: "/shipments?status=DELIVERY_FAILED", tone: "bg-red-500" },
  ];

  const activeTotal = pipeline.slice(0, 6).reduce((a, x) => a + x.value, 0);

  return (
    <>
      <PageHeader title={`${greeting}, ${ctx.user.name.split(" ")[0]}`} subtitle={`${today} · ${company.name}`} actions={<div className="flex gap-2">{ctx.can("dispatch.view") && <Link href="/dispatch" className="btn-secondary">Open dispatch</Link>}{ctx.can("shipments.create") && <Link href="/shipments/new" className="btn-primary">New shipment</Link>}</div>} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
        <Hero label="Today's shipments" value={k.todaysShipments} hint={`${k.outForDelivery} out for delivery now`} href="/shipments" icon="package" tone="blue" />
        <Hero label="Delivery success (30d)" value={k.successRate === null ? "—" : pct(k.successRate, 1)} hint={k.successRate === null ? "No attempts yet" : `Avg delivery time ${avg}`} icon="bar-chart" tone="green" />
        {showFinance
          ? <Hero label="Revenue this month" value={m(k.revenueMonth)} hint={`${m(k.revenueToday)} today`} href="/invoices" icon="banknote" tone="violet" />
          : <Hero label="Returns (30d)" value={k.returned} icon="package" tone="violet" />}
        {showFinance
          ? <Hero label="COD held by drivers" value={m(k.codHeldByDrivers)} hint="awaiting remittance" href="/cod" icon="wallet" tone={k.codHeldByDrivers ? "amber" : "slate"} />
          : <Hero label="Open support issues" value={k.openIssues} href="/support" icon="life-buoy" tone={k.openIssues ? "amber" : "slate"} />}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader title="Shipment pipeline" subtitle="Where every active shipment is right now" />
          <div className="grid flex-1 grid-cols-2 gap-px bg-line sm:grid-cols-4">
            {pipeline.map((x) => {
              const inner = (<div className="h-full bg-white px-4 py-5 transition hover:bg-slate-50"><span className={`mb-3 block h-1 w-8 rounded-full ${x.tone}`} /><p className="text-2xl font-semibold tabular-nums">{x.value}</p><p className="mt-0.5 text-xs text-slate-500">{x.label}</p></div>);
              return x.href ? <Link key={x.label} href={x.href} className="block">{inner}</Link> : <div key={x.label}>{inner}</div>;
            })}
          </div>
          {activeTotal > 0 && (
            <div className="border-t border-line px-5 py-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Share of active shipments by stage">
                {pipeline.slice(0, 6).filter((x) => x.value > 0).map((x) => <span key={x.label} className={x.tone} style={{ width: `${(x.value / activeTotal) * 100}%` }} title={`${x.label}: ${x.value}`} />)}
              </div>
              <p className="mt-2 text-xs text-slate-500">{activeTotal} active shipment{activeTotal === 1 ? "" : "s"} in progress</p>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Needs attention" subtitle="Computed from your live data" />
          {insights.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing needs attention right now.</p> : (
            <ul className="divide-y divide-line">
              {insights.slice(0, 5).map((i) => (
                <li key={i.id} className="flex gap-3 px-5 py-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${i.severity === "danger" ? "bg-red-500" : i.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <p className="flex-1 text-slate-700">{i.text}</p>
                  {i.href && <Link href={i.href} className="flex-none text-xs font-semibold text-brand hover:underline">View</Link>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className={`mt-4 grid gap-4 ${showFinance ? "lg:grid-cols-2" : ""}`}>
        <Card>
          <CardHeader title="Fleet & people" subtitle="Drivers and vehicles" />
          <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
            <Mini label="Active drivers" value={k.activeDrivers} href="/drivers" />
            <Mini label="Available now" value={k.availableDrivers} tone="text-emerald-600" />
            <Mini label="On pickup / delivery" value={k.driversOnDelivery} tone="text-blue-600" />
            <Mini label="Vehicles active" value={k.vehiclesActive} href="/fleet" />
            <Mini label="In maintenance" value={k.vehiclesMaintenance} tone={k.vehiclesMaintenance ? "text-amber-600" : undefined} />
            <Mini label="Open support issues" value={k.openIssues} href="/support" tone={k.openIssues ? "text-amber-600" : undefined} />
          </dl>
        </Card>
        {showFinance && (
          <Card>
            <CardHeader title="Cash & settlements" subtitle="Collections and what is still owed" />
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
              <Mini label="Revenue today" value={m(k.revenueToday)} />
              <Mini label="COD collected today" value={m(k.codCollectedToday)} href="/cod" />
              <Mini label="COD unsettled to senders" value={m(k.codUnsettled)} href="/cod" tone={k.codUnsettled ? "text-amber-600" : undefined} />
              <Mini label="COD not yet collected" value={m(k.codAwaitingCollection)} />
              <Mini label="Pending settlements" value={k.pendingSettlements} href="/settlements" hint={k.pendingSettlements ? m(k.pendingSettlementsAmount) : undefined} />
              <Mini label="Returns (30d)" value={k.returned} />
            </dl>
          </Card>
        )}
      </section>

      {!hasData ? (
        <div className="mt-8"><EmptyState title="No shipment activity yet" description="Charts appear as soon as shipments are created and delivered." action={ctx.can("shipments.create") ? <Link href="/shipments/new" className="btn-primary">Create your first shipment</Link> : undefined} /></div>
      ) : (
        <>
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Shipment volume" subtitle="Last 14 days" /><div className="p-4"><VolumeChart data={d.series} /></div></Card>
            {showFinance ? (
              <Card><CardHeader title="Revenue" subtitle="Delivery fees on delivered shipments, last 14 days" /><div className="p-4"><RevenueChart data={d.series} currency={company.currency} /></div></Card>
            ) : (
              <Card><CardHeader title="Failed delivery reasons" subtitle="Last 30 days" /><div className="p-4">{d.failureReasons.length ? <HBarChart label="Failure reasons" data={d.failureReasons.map((r) => ({ name: titleCase(r.reason), count: r.count }))} /> : <p className="py-10 text-center text-sm text-slate-500">No failed deliveries — nice.</p>}</div></Card>
            )}
          </section>
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
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

const HERO_TONE: Record<string, string> = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-500" };

function Hero({ label, value, hint, href, icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; icon: string; tone: string }) {
  const body = (
    <div className="card flex h-full items-start justify-between gap-3 p-4 transition sm:p-5 hover:shadow-md">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-2 truncate text-2xl font-semibold sm:text-3xl tracking-tight tabular-nums text-ink">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      <span className={`hidden h-11 w-11 flex-none sm:flex items-center justify-center rounded-xl ${HERO_TONE[tone]}`}><Icon name={icon} className="h-5 w-5" /></span>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

function Mini({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: string }) {
  const body = (
    <div className="h-full bg-white px-4 py-4 transition hover:bg-slate-50">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? "text-ink"}`}>{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
