import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { platformOverview } from "@/lib/platform/admin";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export default async function PlatformHome() {
  const o = await platformOverview();
  const h = o.health;
  const dot = (ok: boolean) => <Badge tone={ok ? "success" : "warning"}>{ok ? "OK" : "Not configured"}</Badge>;
  return (
    <>
      <PageHeader title="Platform overview" subtitle="All tenants. Figures come from subscriptions and billing records." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Companies" value={o.companies} href="/platform/companies" /><StatCard label="Paying" value={o.paying} tone="success" /><StatCard label="On trial" value={o.trials} tone="info" hint={`${o.trialsEnding} ending ≤3d`} />
        <StatCard label="Past due" value={o.pastDue} tone={o.pastDue ? "warning" : "neutral"} /><StatCard label="MRR" value={money(o.mrr)} tone="success" hint="annual plans ÷ 12" /><StatCard label="ARR" value={money(o.arr)} tone="success" />
        <StatCard label="Revenue (30d)" value={money(o.revenue30)} /><StatCard label="Churned (30d)" value={o.churnedLast30} hint={o.churnRatePct === null ? undefined : `${o.churnRatePct}% churn`} tone={o.churnedLast30 ? "warning" : "neutral"} /><StatCard label="Active users (30d)" value={o.activeUsers30} /><StatCard label="Shipments (30d)" value={o.shipments30.toLocaleString()} />
        <StatCard label="Suspended" value={o.byStatus.SUSPENDED ?? 0} tone={o.byStatus.SUSPENDED ? "danger" : "neutral"} /><StatCard label="Onboarding" value={o.byStatus.ONBOARDING ?? 0} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="System health" /><dl className="divide-y divide-line text-sm">
          <div className="flex justify-between px-5 py-3"><dt>Database</dt><dd>{dot(h.database)}</dd></div>
          <div className="flex justify-between px-5 py-3"><dt>Payments ({h.payments.provider})</dt><dd>{dot(h.payments.configured)}</dd></div>
          <div className="flex justify-between px-5 py-3"><dt>AI provider</dt><dd>{h.ai.active ? <Badge tone="success">{h.ai.active} · {h.ai.model}</Badge> : <Badge tone="warning">Not configured</Badge>}</dd></div>
          {(["EMAIL", "SMS", "WHATSAPP", "PUSH"] as const).map((c) => <div key={c} className="flex justify-between px-5 py-3"><dt>{titleCase(c)} ({h.channels[c].provider})</dt><dd>{dot(h.channels[c].configured)}</dd></div>)}
          <div className="flex justify-between px-5 py-3"><dt>Maps provider</dt><dd><Badge>{h.mapsProvider}</Badge></dd></div>
          <div className="flex justify-between px-5 py-3"><dt>Maintenance cron secret</dt><dd>{dot(h.cronSecretSet)}</dd></div></dl></Card>
        <Card><CardHeader title="Newest companies" /><Table><THead><TH>Company</TH><TH>Status</TH><TH>Joined</TH></THead><TBody>{o.newCompanies.map((c) => <TR key={c.id}><TD><Link className="font-medium text-brand" href={`/platform/companies/${c.id}`}>{c.name}</Link></TD><TD><Badge>{titleCase(c.status)}</Badge></TD><TD className="text-xs">{dateOnly(c.createdAt)}</TD></TR>)}</TBody></Table></Card>
      </div>
    </>
  );
}
