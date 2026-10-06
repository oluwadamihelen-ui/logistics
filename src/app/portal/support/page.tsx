import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { Field, Form, SelectField, TextareaField } from "@/components/client/form";
import { requirePortalPage } from "@/lib/platform/portal";
import { portalCreateTicketAction } from "../actions";
import { relativeTime, titleCase } from "@/lib/utils/format";

export default async function PortalSupport() {
  const ctx = await requirePortalPage();
  const tickets = await ctx.db.supportTicket.findMany({ where: { customerId: ctx.customerId }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <PageHeader title="Support" subtitle="Ask a question about a shipment, payment or COD" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="New request" /><div className="p-5"><Form action={portalCreateTicketAction} resetOnSuccess submitLabel="Send request" successMessage="Request sent — we'll get back to you">
          <Field name="subject" label="Subject" required /><SelectField name="category" label="About" defaultValue="OTHER" options={["SHIPMENT", "PAYMENT", "COD", "DELIVERY", "OTHER"].map((c) => ({ value: c, label: titleCase(c) }))} /><Field name="tracking" label="Tracking number (optional)" /><TextareaField name="description" label="Details" required rows={4} /></Form></div></Card>
        <Card><CardHeader title="My requests" /><ul className="divide-y divide-line">{tickets.map((t) => <li key={t.id} className="px-5 py-3 text-sm"><p className="font-medium">{t.number} · {t.subject}</p><p className="text-xs text-slate-500"><Badge>{titleCase(t.status)}</Badge> {relativeTime(t.createdAt)}</p></li>)}{!tickets.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No requests</li>}</ul></Card>
      </div>
    </>
  );
}
