import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FieldGrid, ModalForm, SelectField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { financeSummary } from "@/lib/logistics/finance";
import { startOfDayInTz } from "@/lib/logistics/dashboard";
import { createInvoiceAction, recordPaymentAction } from "../finance/actions";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Invoices & payments" };
const METHODS = ["CASH", "BANK_TRANSFER", "CARD", "POS", "WALLET", "OTHER"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("finance.view");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true, timezone: true } });
  const cur = company.currency;
  const monthStart = startOfDayInTz(company.timezone, Number(new Intl.DateTimeFormat("en-CA", { timeZone: company.timezone, day: "2-digit" }).format(new Date())) - 1);
  const [invoices, payments, customers, sum] = await Promise.all([
    ctx.db.invoice.findMany({ where: sp.status ? { status: sp.status as any } : {}, orderBy: { createdAt: "desc" }, take: 50, include: { customer: { select: { name: true } } } }),
    ctx.db.payment.findMany({ orderBy: { paidAt: "desc" }, take: 15, include: { customer: { select: { name: true } }, invoice: { select: { number: true } } } }),
    ctx.db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    financeSummary(ctx, monthStart, new Date()),
  ]);
  const canInvoice = ctx.can("invoices.manage"), canPay = ctx.can("payments.manage");
  const now = Date.now();
  return (
    <>
      <PageHeader title="Invoices & payments" subtitle="Receivables, payments received and credit notes" actions={<>
        {canPay && <ModalForm trigger="Record payment" triggerClassName="btn-secondary" title="Record payment" action={recordPaymentAction}>
          <SelectField name="customerId" label="Customer" required placeholder="Select…" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          <FieldGrid><Field name="amount" label={`Amount (${cur})`} type="number" step="0.01" min="0.01" required /><SelectField name="method" label="Method" defaultValue="BANK_TRANSFER" options={METHODS.map((m) => ({ value: m, label: titleCase(m) }))} /></FieldGrid>
          <Field name="reference" label="Reference" /><p className="text-xs text-slate-500">To apply a payment to an invoice, open the invoice and use “Record payment” there.</p>
        </ModalForm>}
        {canInvoice && <ModalForm trigger="Create invoice" title="Create invoice from delivered shipments" action={createInvoiceAction} redirectTo="/invoices/{id}">
          <SelectField name="customerId" label="Customer" required placeholder="Select…" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          <FieldGrid><Field name="periodStart" label="Delivered from" type="date" required /><Field name="periodEnd" label="Delivered to" type="date" required /></FieldGrid>
          <Field name="dueDate" label="Due date (optional)" type="date" hint="Defaults to the customer's payment terms" /><p className="text-xs text-slate-500">Includes every delivered shipment in the period not already on an invoice. Tax is applied from company settings.</p>
        </ModalForm>}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Revenue this month" value={money(sum.revenue, cur)} tone="success" /><StatCard label="Expenses this month" value={money(sum.expenses, cur)} tone="warning" /><StatCard label="Operating profit" value={money(sum.profit, cur)} tone={sum.profit >= 0 ? "success" : "danger"} hint={sum.margin === null ? undefined : `${sum.margin.toFixed(1)}% margin`} /><StatCard label="Receivables" value={money(sum.receivables, cur)} tone={sum.receivables ? "warning" : "neutral"} hint={`${sum.openInvoices} open invoices`} />
      </div>
      <div className="my-3 flex flex-wrap gap-1.5">{["", "DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID"].map((s) => <Link key={s} href={s ? `/invoices?status=${s}` : "/invoices"} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${(sp.status ?? "") === s ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line"}`}>{s ? titleCase(s) : "All"}</Link>)}</div>
      <Card>
        {!invoices.length ? <div className="p-6"><EmptyState title="No invoices" description="Create an invoice from a customer's delivered shipments." /></div> : (
          <Table><THead><TH>Number</TH><TH>Customer</TH><TH>Status</TH><TH>Due</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH></THead><TBody>
            {invoices.map((i) => { const overdue = i.dueDate && i.dueDate.getTime() < now && ["ISSUED", "PARTIALLY_PAID"].includes(i.status); return <TR key={i.id}>
              <TD><Link href={`/invoices/${i.id}`} className="font-medium text-brand hover:underline">{i.number}</Link></TD><TD>{i.customer.name}</TD>
              <TD><Badge tone={i.status === "PAID" ? "success" : i.status === "VOID" ? "neutral" : overdue ? "danger" : "info"}>{overdue ? "Overdue" : titleCase(i.status)}</Badge></TD><TD className="text-xs">{dateOnly(i.dueDate)}</TD>
              <TD className="text-right tabular-nums">{money(Number(i.total), cur)}</TD><TD className="text-right tabular-nums">{i.status === "VOID" ? "—" : money(Number(i.total) - Number(i.amountPaid), cur)}</TD></TR>; })}
          </TBody></Table>)}
      </Card>
      <Card className="mt-4"><CardHeader title="Recent payments" /><Table><THead><TH>Date</TH><TH>Customer</TH><TH>Invoice</TH><TH>Method</TH><TH>Reference</TH><TH className="text-right">Amount</TH></THead><TBody>
        {payments.map((p) => <TR key={p.id}><TD className="text-xs">{dateOnly(p.paidAt)}</TD><TD>{p.customer?.name ?? "—"}</TD><TD>{p.invoice?.number ?? "—"}</TD><TD>{titleCase(p.method)}{p.status === "REFUNDED" && <Badge className="ml-1" tone="warning">Refunded</Badge>}</TD><TD className="text-xs">{p.reference ?? "—"}</TD><TD className={`text-right tabular-nums ${Number(p.amount) < 0 ? "text-red-600" : ""}`}>{money(Number(p.amount), cur)}</TD></TR>)}
        {!payments.length && <TR><TD colSpan={6} className="text-center text-slate-500">No payments recorded</TD></TR>}</TBody></Table></Card>
    </>
  );
}
