import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { requirePortalPage } from "@/lib/platform/portal";
import { prisma } from "@/lib/platform/db";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export default async function PortalInvoices() {
  const ctx = await requirePortalPage();
  const [invoices, payments, cod, company] = await Promise.all([
    ctx.db.invoice.findMany({ where: { customerId: ctx.customerId, status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, take: 30 }),
    ctx.db.payment.findMany({ where: { customerId: ctx.customerId }, orderBy: { paidAt: "desc" }, take: 20 }),
    ctx.db.codTransaction.findMany({ where: { customerId: ctx.customerId, amountCollected: { gt: 0 } }, orderBy: { collectedAt: "desc" }, take: 20, include: { shipment: { select: { trackingNumber: true } } } }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }),
  ]);
  const cur = company.currency;
  return (
    <>
      <PageHeader title="Invoices, payments & COD" />
      <div className="space-y-4">
        <Card><CardHeader title="Invoices" /><Table><THead><TH>Number</TH><TH>Issued</TH><TH>Due</TH><TH>Status</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH></THead><TBody>{invoices.map((i) => <TR key={i.id}><TD className="font-medium">{i.number}</TD><TD className="text-xs">{dateOnly(i.issueDate)}</TD><TD className="text-xs">{dateOnly(i.dueDate)}</TD><TD><Badge tone={i.status === "PAID" ? "success" : "info"}>{titleCase(i.status)}</Badge></TD><TD className="text-right tabular-nums">{money(Number(i.total), cur)}</TD><TD className="text-right tabular-nums">{money(Number(i.total) - Number(i.amountPaid), cur)}</TD></TR>)}{!invoices.length && <TR><TD colSpan={6} className="text-center text-slate-500">No invoices</TD></TR>}</TBody></Table></Card>
        <Card><CardHeader title="Payments" /><Table><THead><TH>Date</TH><TH>Method</TH><TH>Reference</TH><TH className="text-right">Amount</TH></THead><TBody>{payments.map((p) => <TR key={p.id}><TD className="text-xs">{dateOnly(p.paidAt)}</TD><TD>{titleCase(p.method)}</TD><TD className="text-xs">{p.reference ?? "—"}</TD><TD className="text-right tabular-nums">{money(Number(p.amount), cur)}</TD></TR>)}{!payments.length && <TR><TD colSpan={4} className="text-center text-slate-500">No payments</TD></TR>}</TBody></Table></Card>
        <Card><CardHeader title="Cash on delivery collected for you" /><Table><THead><TH>Shipment</TH><TH>Status</TH><TH className="text-right">Collected</TH><TH className="text-right">Paid out</TH></THead><TBody>{cod.map((c) => <TR key={c.id}><TD className="font-mono">{c.shipment.trackingNumber}</TD><TD><Badge tone={c.status === "SETTLED" ? "success" : c.status === "DISPUTED" ? "danger" : "info"}>{titleCase(c.status)}</Badge></TD><TD className="text-right tabular-nums">{money(Number(c.amountCollected), cur)}</TD><TD className="text-right tabular-nums">{money(Number(c.amountSettled), cur)}</TD></TR>)}{!cod.length && <TR><TD colSpan={4} className="text-center text-slate-500">No COD activity</TD></TR>}</TBody></Table></Card>
      </div>
    </>
  );
}
