import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, ModalForm, TextareaField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma, num } from "@/lib/platform/db";
import { remitCashAction, resolveDisputeAction, settleCodAction } from "../finance/actions";
import { money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Cash on delivery" };

export default async function CodPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("cod.view");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  const cur = company.currency;
  const id = ctx.companyId;
  const [byDriver, byCustomer, records, totals, disputed] = await Promise.all([
    prisma.$queryRaw<{ id: string; name: string; collected: unknown; remitted: unknown; n: bigint }[]>`SELECT d."id", d."name", SUM(c."amountCollected") AS collected, SUM(c."amountRemitted") AS remitted, COUNT(*) AS n FROM "CodTransaction" c JOIN "Driver" d ON d."id" = c."driverId" WHERE c."companyId" = ${id} AND c."amountCollected" > c."amountRemitted" GROUP BY d."id", d."name" ORDER BY SUM(c."amountCollected" - c."amountRemitted") DESC`,
    prisma.$queryRaw<{ id: string; name: string; available: unknown; owed: unknown }[]>`SELECT cu."id", cu."name", SUM(c."amountRemitted" - c."amountSettled") AS available, SUM(c."amountCollected" - c."amountSettled") AS owed FROM "CodTransaction" c JOIN "Customer" cu ON cu."id" = c."customerId" WHERE c."companyId" = ${id} AND c."amountCollected" > c."amountSettled" AND c."status" <> 'DISPUTED' GROUP BY cu."id", cu."name" ORDER BY 4 DESC`,
    ctx.db.codTransaction.findMany({ where: sp.status ? { status: sp.status as any } : {}, orderBy: { createdAt: "desc" }, take: 40, include: { shipment: { select: { id: true, trackingNumber: true, recipientName: true } }, driver: { select: { name: true } } } }),
    ctx.db.codTransaction.aggregate({ _sum: { amountDue: true, amountCollected: true, amountRemitted: true, amountSettled: true } }),
    ctx.db.codTransaction.count({ where: { status: "DISPUTED" } }),
  ]);
  const manage = ctx.can("cod.manage");
  const t = totals._sum;
  return (
    <>
      <PageHeader title="Cash on delivery" subtitle="Collections, driver remittance and payouts to senders — reconciled from the shipment ledger" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Due (all COD)" value={money(num(t.amountDue), cur)} /><StatCard label="Collected" value={money(num(t.amountCollected), cur)} tone="info" /><StatCard label="Held by drivers" value={money(num(t.amountCollected) - num(t.amountRemitted), cur)} tone="warning" hint="collected, not yet remitted" />
        <StatCard label="Owed to senders" value={money(num(t.amountCollected) - num(t.amountSettled), cur)} tone="warning" /><StatCard label="Disputed" value={disputed} tone={disputed ? "danger" : "neutral"} hint="amount mismatches" href="/cod?status=DISPUTED" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Cash held by drivers" subtitle="Record cash handed over (applied oldest-first)" />
          {!byDriver.length ? <div className="p-6 text-center text-sm text-slate-500">No outstanding cash with drivers.</div> : <Table><THead><TH>Driver</TH><TH className="text-right">Held</TH><TH>{""}</TH></THead><TBody>
            {byDriver.map((d) => { const held = num(d.collected as any) - num(d.remitted as any); return <TR key={d.id}><TD><Link href={`/drivers/${d.id}`} className="font-medium text-brand">{d.name}</Link><div className="text-xs text-slate-500">{Number(d.n)} shipments</div></TD><TD className="text-right font-semibold tabular-nums">{money(held, cur)}</TD>
              <TD className="text-right">{manage && <ModalForm trigger="Receive cash" triggerClassName="btn-secondary btn-sm" title={`Cash from ${d.name}`} action={remitCashAction} extra={{ driverId: d.id }}><Field name="amount" label={`Amount received (${cur})`} type="number" step="0.01" min="0.01" max={held} defaultValue={held.toFixed(2)} required /></ModalForm>}</TD></TR>; })}</TBody></Table>}</Card>
        <Card><CardHeader title="Payable to senders" subtitle="Only cash already remitted can be paid out" />
          {!byCustomer.length ? <div className="p-6 text-center text-sm text-slate-500">Nothing owed.</div> : <Table><THead><TH>Sender</TH><TH className="text-right">Available</TH><TH className="text-right">Total owed</TH><TH>{""}</TH></THead><TBody>
            {byCustomer.map((c) => { const avail = num(c.available as any); return <TR key={c.id}><TD><Link href={`/customers/${c.id}`} className="font-medium text-brand">{c.name}</Link></TD><TD className="text-right tabular-nums">{money(avail, cur)}</TD><TD className="text-right tabular-nums text-slate-500">{money(num(c.owed as any), cur)}</TD>
              <TD className="text-right">{manage && avail > 0 && <ModalForm trigger="Settle" triggerClassName="btn-secondary btn-sm" title={`Pay ${c.name}`} action={settleCodAction} extra={{ customerId: c.id }}><Field name="amount" label={`Amount (${cur})`} type="number" step="0.01" min="0.01" max={avail} defaultValue={avail.toFixed(2)} required /><Field name="reference" label="Payment reference" required /></ModalForm>}</TD></TR>; })}</TBody></Table>}</Card>
      </div>
      <div className="my-3 flex flex-wrap gap-1.5">{["", "PENDING", "COLLECTED", "PARTIALLY_SETTLED", "SETTLED", "DISPUTED"].map((s) => <Link key={s} href={s ? `/cod?status=${s}` : "/cod"} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${(sp.status ?? "") === s ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line"}`}>{s ? titleCase(s) : "All"}</Link>)}</div>
      <Card>{!records.length ? <div className="p-6"><EmptyState title="No COD records" /></div> : <Table><THead><TH>Shipment</TH><TH>Driver</TH><TH>Status</TH><TH className="text-right">Due</TH><TH className="text-right">Collected</TH><TH className="text-right">Remitted</TH><TH className="text-right">Settled</TH><TH>{""}</TH></THead><TBody>
        {records.map((r) => <TR key={r.id}><TD><Link href={`/shipments/${r.shipment.id}`} className="font-mono text-brand">{r.shipment.trackingNumber}</Link></TD><TD>{r.driver?.name ?? "—"}</TD><TD><Badge tone={r.status === "SETTLED" ? "success" : r.status === "DISPUTED" ? "danger" : r.status === "PENDING" ? "neutral" : "info"}>{titleCase(r.status)}</Badge>{r.disputeNote && <div className="max-w-[16rem] truncate text-xs text-red-600" title={r.disputeNote}>{r.disputeNote}</div>}</TD>
          <TD className="text-right tabular-nums">{money(Number(r.amountDue), cur)}</TD><TD className="text-right tabular-nums">{money(Number(r.amountCollected), cur)}</TD><TD className="text-right tabular-nums">{money(Number(r.amountRemitted), cur)}</TD><TD className="text-right tabular-nums">{money(Number(r.amountSettled), cur)}</TD>
          <TD>{manage && r.status === "DISPUTED" && <ModalForm trigger="Resolve" triggerClassName="btn-secondary btn-sm" title="Resolve dispute" action={resolveDisputeAction} extra={{ id: r.id }}><TextareaField name="note" label="Resolution note" required /></ModalForm>}</TD></TR>)}</TBody></Table>}</Card>
    </>
  );
}
