import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui";
import { CheckboxField, Form, SelectField, TextareaField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { commentTicketAction, updateTicketAction } from "../actions";
import { dateTime, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("support.view");
  const t = await ctx.db.supportTicket.findFirst({ where: { id }, include: { customer: true, shipment: { select: { id: true, trackingNumber: true } }, comments: { orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  const staff = await ctx.db.user.findMany({ where: { role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT", "DRIVER", "RIDER"] }, isActive: true }, select: { id: true, name: true } });
  const manage = ctx.can("support.manage");
  return (
    <>
      <PageHeader back={{ href: "/support", label: "Support" }} title={`${t.number} · ${t.subject}`} subtitle={<span className="flex gap-2"><Badge>{titleCase(t.status)}</Badge><Badge tone={t.priority === "CRITICAL" || t.priority === "HIGH" ? "warning" : "neutral"}>{titleCase(t.priority)}</Badge></span>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Description" /><p className="whitespace-pre-wrap p-5 text-sm">{t.description}</p></Card>
          <Card><CardHeader title="Conversation" /><ul className="divide-y divide-line">{t.comments.map((c) => <li key={c.id} className={`px-5 py-3 text-sm ${c.isInternal ? "bg-amber-50" : ""}`}><p className="text-xs text-slate-500">{c.authorName} · {dateTime(c.createdAt)}{c.isInternal && " · internal note"}</p><p className="mt-1 whitespace-pre-wrap">{c.body}</p></li>)}{!t.comments.length && <li className="px-5 py-6 text-center text-sm text-slate-500">No replies yet</li>}</ul>
            {manage && <div className="border-t border-line p-5"><Form action={commentTicketAction} extra={{ ticketId: id }} resetOnSuccess submitLabel="Add comment" successMessage="Comment added"><TextareaField name="body" label="Reply" required /><CheckboxField name="isInternal" label="Internal note (not visible to the customer)" /></Form></div>}</Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Details" /><div className="p-5"><DescriptionList items={[{ label: "Category", value: titleCase(t.category) }, { label: "Customer", value: t.customer ? <Link className="text-brand" href={`/customers/${t.customer.id}`}>{t.customer.name}</Link> : null }, { label: "Shipment", value: t.shipment ? <Link className="font-mono text-brand" href={`/shipments/${t.shipment.id}`}>{t.shipment.trackingNumber}</Link> : null }, { label: "Opened", value: dateTime(t.createdAt) }, { label: "Resolved", value: t.resolvedAt ? dateTime(t.resolvedAt) : null }]} /></div></Card>
          {manage && <Card><CardHeader title="Update" /><div className="p-5"><Form action={updateTicketAction} extra={{ id }} submitLabel="Update">
            <SelectField name="status" label="Status" defaultValue={t.status} options={["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"].map((s) => ({ value: s, label: titleCase(s) }))} />
            <SelectField name="priority" label="Priority" defaultValue={t.priority} options={["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => ({ value: s, label: titleCase(s) }))} />
            <SelectField name="assigneeId" label="Assignee" placeholder="Unassigned" defaultValue={t.assigneeId ?? ""} options={staff.map((s) => ({ value: s.id, label: s.name }))} /></Form></div></Card>}
        </div>
      </div>
    </>
  );
}
