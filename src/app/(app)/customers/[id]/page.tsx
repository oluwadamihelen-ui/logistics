import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DescriptionList, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { Field, FieldGrid, ModalForm, CheckboxField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { getEntitlements } from "@/lib/platform/entitlements";
import { customerStats } from "@/lib/logistics/customers";
import { addAddressAction, createPortalLoginAction, setCorporateAction } from "../actions";
import { dateTime, money, titleCase, pct } from "@/lib/utils/format";

export const metadata = { title: "Customer" };

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("customers.view");
  const c = await ctx.db.customer.findFirst({ where: { id }, include: { addresses: true, corporate: true } });
  if (!c) notFound();
  const [stats, recent, invoices, company, ent] = await Promise.all([
    customerStats(ctx, id),
    ctx.db.shipment.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, trackingNumber: true, status: true, recipientName: true, deliveryCity: true, deliveryFee: true, createdAt: true } }),
    ctx.db.invoice.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }),
    getEntitlements(ctx.companyId),
  ]);
  const cur = company.currency;
  const rate = stats.total ? (stats.delivered / stats.total) * 100 : null;
  return (
    <>
      <PageHeader back={{ href: "/customers", label: "Customers" }} title={c.name} subtitle={<span className="flex items-center gap-2">{c.businessName} <Badge>{titleCase(c.type)}</Badge></span>}
        actions={<>{ctx.can("customers.manage") && ent.features.has("customer_portal") && <ModalForm trigger="Create portal login" triggerClassName="btn-secondary" title="Customer portal login" action={createPortalLoginAction} extra={{ customerId: c.id }}><Field name="name" label="Name" required defaultValue={c.name} /><Field name="email" label="Email" type="email" required defaultValue={c.email ?? ""} /><Field name="password" label="Temporary password" type="password" minLength={10} required /><CheckboxField name="canManageTeam" label="Can manage team members (corporate admin)" /></ModalForm>}{ctx.can("shipments.create") && <Link className="btn-primary" href={`/shipments/new?customer=${c.id}`}>New shipment</Link>}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total shipments" value={stats.total} /><StatCard label="Delivered" value={stats.delivered} tone="success" /><StatCard label="Failed" value={stats.failed} tone={stats.failed ? "danger" : "neutral"} />
        <StatCard label="Returned" value={stats.returned} tone="warning" /><StatCard label="Revenue" value={money(stats.revenue, cur)} tone="info" /><StatCard label="Avg shipment" value={money(stats.avgValue, cur)} />
        <StatCard label="Outstanding" value={money(stats.outstanding, cur)} tone={stats.outstanding ? "warning" : "neutral"} hint="unpaid invoices" /><StatCard label="COD owed to them" value={money(stats.codHeld, cur)} hint={rate === null ? undefined : `${pct(rate)} delivered`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Recent shipments" action={<Link className="text-xs text-brand" href={`/shipments?q=${encodeURIComponent(c.phone)}`}>View all</Link>} />
            <Table><THead><TH>Tracking</TH><TH>Recipient</TH><TH>Status</TH><TH className="text-right">Fee</TH><TH>Created</TH></THead><TBody>
              {recent.map((s) => <TR key={s.id}><TD><Link className="font-mono text-brand hover:underline" href={`/shipments/${s.id}`}>{s.trackingNumber}</Link></TD><TD>{s.recipientName}, {s.deliveryCity}</TD><TD><StatusBadge status={s.status} /></TD><TD className="text-right tabular-nums">{money(Number(s.deliveryFee), cur)}</TD><TD className="text-xs text-slate-500">{dateTime(s.createdAt)}</TD></TR>)}
              {!recent.length && <TR><TD colSpan={5} className="text-center text-slate-500">No shipments yet</TD></TR>}
            </TBody></Table></Card>
          <Card><CardHeader title="Invoices" /><ul className="divide-y divide-line">{invoices.map((i) => <li key={i.id} className="flex justify-between px-5 py-3 text-sm"><span>{i.number} <Badge tone={i.status === "PAID" ? "success" : "warning"}>{titleCase(i.status)}</Badge></span><span className="tabular-nums">{money(Number(i.total), cur)}</span></li>)}{!invoices.length && <li className="px-5 py-6 text-center text-sm text-slate-500">No invoices</li>}</ul></Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Contact" /><div className="p-5"><DescriptionList items={[{ label: "Phone", value: c.phone }, { label: "Email", value: c.email }, { label: "Notes", value: c.notes }]} /></div></Card>
          <Card><CardHeader title="Saved addresses" action={ctx.can("customers.manage") && (
            <ModalForm trigger="Add" triggerClassName="btn-secondary btn-sm" title="Add address" action={addAddressAction} extra={{ customerId: c.id }}>
              <Field name="label" label="Label" placeholder="Warehouse, Home…" /><Field name="line1" label="Address" required /><FieldGrid><Field name="city" label="City" required /><Field name="state" label="State" required defaultValue="Lagos" /></FieldGrid>
              <FieldGrid><Field name="contactName" label="Contact" /><Field name="contactPhone" label="Phone" /></FieldGrid><CheckboxField name="isDefault" label="Default address" />
            </ModalForm>)} />
            <ul className="divide-y divide-line">{c.addresses.map((a) => <li key={a.id} className="px-5 py-3 text-sm"><p className="font-medium">{a.label ?? "Address"} {a.isDefault && <Badge tone="info">Default</Badge>}</p><p className="text-slate-600">{a.line1}, {a.city}, {a.state}</p></li>)}{!c.addresses.length && <li className="px-5 py-6 text-center text-sm text-slate-500">None saved</li>}</ul></Card>
          <Card><CardHeader title="Corporate account" action={ctx.can("customers.manage") && ent.features.has("corporate_accounts") && (
            <ModalForm trigger={c.corporate ? "Edit" : "Enable"} triggerClassName="btn-secondary btn-sm" title="Corporate account terms" action={setCorporateAction} extra={{ customerId: c.id }}>
              <FieldGrid><Field name="creditLimit" label={`Credit limit (${cur})`} type="number" min="0" defaultValue={Number(c.corporate?.creditLimit ?? 0)} /><Field name="paymentTermsDays" label="Payment terms (days)" type="number" min="0" defaultValue={c.corporate?.paymentTermsDays ?? 30} /></FieldGrid>
              <Field name="discountPercent" label="Contract discount (%)" type="number" step="0.1" min="0" max="100" defaultValue={Number(c.corporate?.discountPercent ?? 0)} /><CheckboxField name="apiEnabled" label="Allow API access" defaultChecked={c.corporate?.apiEnabled} />
            </ModalForm>)} />
            <div className="p-5 text-sm">{c.corporate ? <DescriptionList items={[{ label: "Credit limit", value: money(Number(c.corporate.creditLimit), cur) }, { label: "Terms", value: `${c.corporate.paymentTermsDays} days` }, { label: "Discount", value: `${Number(c.corporate.discountPercent)}%` }, { label: "API", value: c.corporate.apiEnabled ? "Enabled" : "Off" }]} /> : <p className="text-slate-500">{ent.features.has("corporate_accounts") ? "Not a corporate account." : "Corporate accounts are available on the Premium plan."}</p>}</div></Card>
        </div>
      </div>
    </>
  );
}
