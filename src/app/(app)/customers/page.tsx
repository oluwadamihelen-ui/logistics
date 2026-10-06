import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FieldGrid, ModalForm, SelectField, TextareaField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { listCustomers } from "@/lib/logistics/customers";
import { createCustomerAction } from "./actions";
import { dateOnly, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Customers" };
const TYPES = ["INDIVIDUAL", "BUSINESS", "CORPORATE", "MARKETPLACE_SELLER"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("customers.view");
  const data = await listCustomers(ctx, { q: sp.q, type: sp.type, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Customers" subtitle="Senders, businesses, marketplace sellers and corporate accounts" actions={ctx.can("customers.manage") && (
        <ModalForm trigger="Add customer" title="New customer" action={createCustomerAction}>
          <SelectField name="type" label="Customer type" defaultValue="INDIVIDUAL" options={TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
          <Field name="name" label="Contact name" required /><FieldGrid><Field name="phone" label="Phone" type="tel" required /><Field name="email" label="Email" type="email" /></FieldGrid>
          <Field name="businessName" label="Business name" /><TextareaField name="notes" label="Notes" />
        </ModalForm>
      )} />
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="min-w-[14rem] flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" placeholder="Name, phone, email or business" /></div>
          <div><label className="label" htmlFor="type">Type</label><select id="type" name="type" defaultValue={sp.type ?? ""} className="input"><option value="">All</option>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></div>
          <button className="btn-secondary">Filter</button>
        </form>
        {data.rows.length === 0 ? <div className="p-6"><EmptyState title="No customers yet" description="Add your first customer to start tracking their shipments and balances." /></div> : (
          <Table><THead><TH>Customer</TH><TH>Type</TH><TH>Phone</TH><TH className="text-right">Shipments</TH><TH>Since</TH></THead>
            <TBody>{data.rows.map((c) => (
              <TR key={c.id}><TD><Link href={`/customers/${c.id}`} className="font-medium text-brand hover:underline">{c.name}</Link>{c.businessName && <div className="text-xs text-slate-500">{c.businessName}</div>}</TD>
                <TD><Badge tone={c.type === "CORPORATE" ? "progress" : "neutral"}>{titleCase(c.type)}</Badge></TD><TD>{c.phone}</TD><TD className="text-right tabular-nums">{c._count.shipments}</TD><TD className="text-xs text-slate-500">{dateOnly(c.createdAt)}</TD></TR>
            ))}</TBody></Table>
        )}
        <Pagination page={data.page} pages={data.pages} total={data.total} basePath="/customers" params={{ q: sp.q, type: sp.type }} />
      </Card>
    </>
  );
}
