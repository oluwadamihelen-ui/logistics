import { Card, EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { requirePageContext } from "@/lib/platform/context";
import { dateTime } from "@/lib/utils/format";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("audit.view");
  const page = Math.max(1, Number(sp.page) || 1), pageSize = 40;
  const where: any = {};
  if (sp.q) where.OR = [{ action: { contains: sp.q, mode: "insensitive" } }, { resourceType: { contains: sp.q, mode: "insensitive" } }, { actorName: { contains: sp.q, mode: "insensitive" } }, { resourceId: sp.q }];
  if (sp.from) where.createdAt = { ...(where.createdAt ?? {}), gte: new Date(sp.from) };
  if (sp.to) where.createdAt = { ...(where.createdAt ?? {}), lte: new Date(`${sp.to}T23:59:59Z`) };
  const [rows, total] = await Promise.all([ctx.db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), ctx.db.auditLog.count({ where })]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when. Entries are append-only and cannot be edited or deleted by anyone in your company." />
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-4"><div className="min-w-[14rem] flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" placeholder="Action, resource, person or resource id" /></div><div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input" /></div><div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input" /></div><button className="btn-secondary">Filter</button></form>
        {!rows.length ? <div className="p-6"><EmptyState title="No audit entries" /></div> : <Table><THead><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Resource</TH><TH>Change</TH><TH>IP</TH></THead><TBody>
          {rows.map((l) => <TR key={l.id}><TD className="whitespace-nowrap text-xs">{dateTime(l.createdAt)}</TD><TD>{l.actorName ?? "system"}<div className="text-xs text-slate-500">{l.actorRole}</div></TD><TD className="font-mono text-xs">{l.action}</TD><TD className="text-xs">{l.resourceType}<div className="font-mono text-[10px] text-slate-400">{l.resourceId}</div></TD>
            <TD className="max-w-xs text-xs">{(l.before || l.after) && <details><summary className="cursor-pointer text-brand">View</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[10px]">{l.before ? `before: ${JSON.stringify(l.before, null, 1)}\n` : ""}{l.after ? `after: ${JSON.stringify(l.after, null, 1)}` : ""}</pre></details>}</TD><TD className="text-xs text-slate-500">{l.ip}</TD></TR>)}</TBody></Table>}
        <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} basePath="/audit" params={{ q: sp.q, from: sp.from, to: sp.to }} />
      </Card>
    </>
  );
}
