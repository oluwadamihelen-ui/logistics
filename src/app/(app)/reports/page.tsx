import { Card, PageHeader } from "@/components/ui";
import { requirePageContext } from "@/lib/platform/context";
import { REPORTS, type ReportKey } from "@/lib/logistics/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requirePageContext("reports.view");
  const today = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const available = (Object.keys(REPORTS) as ReportKey[]).filter((k) => ctx.can(REPORTS[k].permission));
  return (
    <>
      <PageHeader title="Reports" subtitle="Download operational and financial reports as CSV, Excel or PDF" />
      <Card className="mb-4"><form className="flex flex-wrap items-end gap-3 p-4" action="#" id="range"><div><label className="label" htmlFor="from">From</label><input id="from" type="date" className="input" defaultValue={from} /></div><div><label className="label" htmlFor="to">To</label><input id="to" type="date" className="input" defaultValue={today} /></div><p className="pb-2 text-xs text-slate-500">Choose the range, then pick a report format. Max 400 days.</p></form></Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {available.map((k) => (
          <Card key={k}><div className="flex items-center justify-between p-4"><span className="font-medium">{REPORTS[k].label}</span>
            <span className="flex gap-1.5">{["csv", "xlsx", "pdf"].map((f) => <a key={f} data-report={k} data-format={f} href={`/api/reports/${k}?format=${f}`} className="btn-secondary btn-sm uppercase">{f}</a>)}</span></div></Card>))}
      </div>
      <script dangerouslySetInnerHTML={{ __html: `document.querySelectorAll('a[data-report]').forEach(function(a){a.addEventListener('click',function(e){var f=document.getElementById('from').value,t=document.getElementById('to').value;a.href='/api/reports/'+a.dataset.report+'?format='+a.dataset.format+'&from='+f+'&to='+t;});});` }} />
    </>
  );
}
