import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, Field, FieldGrid, ModalForm, SelectField, TextareaField } from "@/components/client/form";
import { PrintButton } from "@/components/client/print-button";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { creditNoteAction, invoiceStatusAction, recordPaymentAction, refundPaymentAction } from "../../finance/actions";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("finance.view");
  const inv = await ctx.db.invoice.findFirst({ where: { id }, include: { customer: true, lines: true, payments: { orderBy: { paidAt: "asc" } }, creditNotes: true } });
  if (!inv) notFound();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true, currency: true, addressLine: true, city: true, email: true, phone: true } });
  const settings = await ctx.db.companySettings.findFirst({ select: { invoiceFooter: true, bankDetails: true, taxRatePercent: true } });
  const cur = company.currency;
  const credits = inv.creditNotes.reduce((a, c) => a + Number(c.amount), 0);
  const balance = Number(inv.total) - Number(inv.amountPaid) - credits;
  const canPay = ctx.can("payments.manage"), canInv = ctx.can("invoices.manage");
  const bank = (settings?.bankDetails ?? null) as { bank?: string; accountName?: string; accountNumber?: string } | null;
  return (
    <>
      <div className="print:hidden"><PageHeader back={{ href: "/invoices", label: "Invoices" }} title={inv.number} subtitle={<Badge tone={inv.status === "PAID" ? "success" : inv.status === "VOID" ? "neutral" : "info"}>{titleCase(inv.status)}</Badge>} actions={<>
        <PrintButton />
        {canInv && inv.status === "DRAFT" && <ActionButton variant="primary" label="Issue invoice" action={invoiceStatusAction} args={{ id, to: "ISSUED" }} />}
        {canPay && ["ISSUED", "PARTIALLY_PAID"].includes(inv.status) && <ModalForm trigger="Record payment" title="Record payment" action={recordPaymentAction} extra={{ invoiceId: id }}>
          <FieldGrid><Field name="amount" label={`Amount (${cur})`} type="number" step="0.01" min="0.01" required defaultValue={balance > 0 ? balance.toFixed(2) : undefined} /><SelectField name="method" label="Method" defaultValue="BANK_TRANSFER" options={["CASH", "BANK_TRANSFER", "CARD", "POS", "WALLET", "OTHER"].map((m) => ({ value: m, label: titleCase(m) }))} /></FieldGrid><Field name="reference" label="Reference" /></ModalForm>}
        {canInv && ["ISSUED", "PARTIALLY_PAID", "PAID"].includes(inv.status) && <ModalForm trigger="Credit note" triggerClassName="btn-secondary" title="Issue credit note" action={creditNoteAction} extra={{ invoiceId: id }}><Field name="amount" label={`Amount (${cur})`} type="number" step="0.01" min="0.01" required /><TextareaField name="reason" label="Reason" required /></ModalForm>}
        {canInv && inv.status !== "VOID" && Number(inv.amountPaid) === 0 && <ActionButton variant="danger" label="Void" confirm="Void this invoice? Its shipments become invoiceable again." action={invoiceStatusAction} args={{ id, to: "VOID" }} />}
      </>} /></div>
      <Card className="mx-auto max-w-3xl">
        <div className="p-8">
          <div className="flex justify-between"><div><p className="text-xl font-bold">{company.name}</p><p className="text-xs text-slate-500">{[company.addressLine, company.city].filter(Boolean).join(", ")}<br />{company.email} {company.phone}</p></div><div className="text-right"><p className="text-2xl font-bold tracking-tight">INVOICE</p><p className="font-mono text-sm">{inv.number}</p>{inv.status === "VOID" && <p className="font-bold text-red-600">VOID</p>}</div></div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs uppercase text-slate-500">Bill to</p><Link href={`/customers/${inv.customer.id}`} className="font-semibold hover:text-brand print:no-underline">{inv.customer.name}</Link><p>{inv.customer.businessName}</p><p>{inv.customer.phone}</p></div><div className="text-right"><p>Issued: {dateOnly(inv.issueDate)}</p><p>Due: {dateOnly(inv.dueDate)}</p></div></div>
          <Table className="mt-6"><THead><TH>Description</TH><TH className="text-right">Amount</TH></THead><TBody>{inv.lines.map((l) => <TR key={l.id}><TD>{l.description}</TD><TD className="text-right tabular-nums">{money(Number(l.amount), cur)}</TD></TR>)}</TBody></Table>
          <dl className="ml-auto mt-4 w-64 space-y-1 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(Number(inv.subtotal), cur)}</dd></div><div className="flex justify-between"><dt>Tax ({Number(settings?.taxRatePercent ?? 0)}%)</dt><dd>{money(Number(inv.taxAmount), cur)}</dd></div><div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd>{money(Number(inv.total), cur)}</dd></div>
            {credits > 0 && <div className="flex justify-between text-slate-600"><dt>Credit notes</dt><dd>−{money(credits, cur)}</dd></div>}<div className="flex justify-between text-slate-600"><dt>Paid</dt><dd>−{money(Number(inv.amountPaid), cur)}</dd></div><div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Balance due</dt><dd>{money(Math.max(0, balance), cur)}</dd></div></dl>
          {bank?.accountNumber && <p className="mt-6 text-xs text-slate-600">Pay to: {bank.bank} · {bank.accountName} · {bank.accountNumber}</p>}
          {settings?.invoiceFooter && <p className="mt-4 text-xs text-slate-500">{settings.invoiceFooter}</p>}
        </div>
      </Card>
      <div className="mx-auto mt-4 max-w-3xl space-y-4 print:hidden">
        {inv.payments.length > 0 && <Card><CardHeader title="Payments" /><ul className="divide-y divide-line">{inv.payments.map((p) => <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm"><span>{dateOnly(p.paidAt)} · {titleCase(p.method)} {p.reference && `· ${p.reference}`} {p.status === "REFUNDED" && <Badge tone="warning">Refunded</Badge>}</span><span className="flex items-center gap-3"><span className="tabular-nums">{money(Number(p.amount), cur)}</span>{canPay && ctx.can("finance.manage") && p.status === "SUCCESSFUL" && Number(p.amount) > 0 && <ModalForm trigger="Refund" triggerClassName="btn-ghost btn-sm" title="Refund payment" action={refundPaymentAction} extra={{ id: p.id }}><TextareaField name="reason" label="Reason" required /></ModalForm>}</span></li>)}</ul></Card>}
        {inv.creditNotes.length > 0 && <Card><CardHeader title="Credit notes" /><ul className="divide-y divide-line">{inv.creditNotes.map((c) => <li key={c.id} className="flex justify-between px-5 py-3 text-sm"><span>{c.number} — {c.reason}</span><span className="tabular-nums">{money(Number(c.amount), cur)}</span></li>)}</ul></Card>}
      </div>
    </>
  );
}
