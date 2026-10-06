import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { prisma } from "@/lib/platform/db";
import { dateTime, money, titleCase } from "@/lib/utils/format";

export default async function PaymentsPage() {
  const [pays, events, companies] = await Promise.all([prisma.billingPayment.findMany({ orderBy: { createdAt: "desc" }, take: 40 }), prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25, select: { id: true, provider: true, eventType: true, eventId: true, processedAt: true, error: true, createdAt: true } }), prisma.company.findMany({ select: { id: true, name: true } })]);
  const cn = new Map(companies.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader title="Billing payments & webhooks" />
      <Card><CardHeader title="Subscription payments" /><Table><THead><TH>When</TH><TH>Company</TH><TH>Reference</TH><TH>Status</TH><TH className="text-right">Amount</TH></THead><TBody>{pays.map((p) => <TR key={p.id}><TD className="text-xs">{dateTime(p.paidAt ?? p.createdAt)}</TD><TD>{cn.get(p.companyId) ?? p.companyId}</TD><TD className="font-mono text-xs">{p.reference}</TD><TD><Badge tone={p.status === "SUCCESSFUL" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>{titleCase(p.status)}</Badge></TD><TD className="text-right tabular-nums">{money(p.amountKobo / 100, p.currency)}</TD></TR>)}{!pays.length && <TR><TD colSpan={5} className="text-center text-slate-500">No payments</TD></TR>}</TBody></Table></Card>
      <Card className="mt-4"><CardHeader title="Webhook ledger" subtitle="Each provider event is recorded once; redeliveries are ignored." /><Table><THead><TH>Received</TH><TH>Provider</TH><TH>Event</TH><TH>Processed</TH><TH>Error</TH></THead><TBody>{events.map((e) => <TR key={e.id}><TD className="text-xs">{dateTime(e.createdAt)}</TD><TD>{e.provider}</TD><TD className="font-mono text-xs">{e.eventType}</TD><TD>{e.processedAt ? <Badge tone="success">Yes</Badge> : <Badge tone="warning">No</Badge>}</TD><TD className="text-xs text-red-600">{e.error}</TD></TR>)}{!events.length && <TR><TD colSpan={5} className="text-center text-slate-500">No webhook events yet</TD></TR>}</TBody></Table></Card>
    </>
  );
}
