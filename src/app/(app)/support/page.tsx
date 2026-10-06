import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FieldGrid, ModalForm, SelectField, TextareaField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { createTicketAction } from "./actions";
import { relativeTime, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Support" };
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("support.view");
  const page = Math.max(1, Number(sp.page) || 1), pageSize = 25;
  const where: any = {}; if (sp.status) where.status = sp.status; if (sp.mine) where.assigneeId = ctx.user.id;
  if (sp.q) where.OR = [{ subject: { contains: sp.q, mode: "insensitive" } }, { number: { contains: sp.q, mode: "insensitive" } }];
  const [rows, total, staff, customers, counts] = await Promise.all([
    ctx.db.supportTicket.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { name: true } } } }),
    ctx.db.supportTicket.count({ where }),
    ctx.db.user.findMany({ where: { role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT", "DRIVER", "RIDER"] }, isActive: true }, select: { id: true, name: true } }),
    ctx.db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    ctx.db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const tone: Record<string, "info" | "warning" | "success" | "neutral" | "progress"> = { OPEN: "info", IN_PROGRESS: "progress", WAITING_CUSTOMER: "warning", RESOLVED: "success", CLOSED: "neutral" };
  return (
    <>
      <PageHeader title="Support desk" subtitle="Tickets about shipments, customers, drivers, payments and COD" actions={ctx.can("support.manage") && (
        <ModalForm trigger="New ticket" title="New ticket" action={createTicketAction} redirectTo="/support/{id}">
          <Field name="subject" label="Subject" required /><FieldGrid><SelectField name="category" label="Category" defaultValue="OTHER" options={["SHIPMENT", "CUSTOMER", "DRIVER", "PAYMENT", "COD", "DELIVERY", "TECHNICAL", "OTHER"].map((c) => ({ value: c, label: titleCase(c) }))} /><SelectField name="priority" label="Priority" defaultValue="MEDIUM" options={["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((c) => ({ value: c, label: titleCase(c) }))} /></FieldGrid>
          <FieldGrid><SelectField name="customerId" label="Customer" placeholder="—" options={customers.map((c) => ({ value: c.id, label: c.name }))} /><Field name="tracking" label="Tracking number" /></FieldGrid><SelectField name="assigneeId" label="Assign to" placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.name }))} /><TextareaField name="description" label="Description" required rows={4} />
        </ModalForm>)} />
      <div className="mb-3 flex flex-wrap gap-1.5">{[["", "All"], ...STATUSES.map((s) => [s, titleCase(s)])].map(([s, l]) => <Link key={s} href={s ? `/support?status=${s}` : "/support"} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${(sp.status ?? "") === s ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line"}`}>{l}{s && counts.find((c) => c.status === s) ? ` · ${counts.find((c) => c.status === s)!._count._all}` : ""}</Link>)}<Link href="/support?mine=1" className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-line">Assigned to me</Link></div>
      <Card>{!rows.length ? <div className="p-6"><EmptyState title="No tickets" /></div> : <Table><THead><TH>Ticket</TH><TH>Subject</TH><TH>Category</TH><TH>Priority</TH><TH>Status</TH><TH>Assignee</TH><TH>Opened</TH></THead><TBody>
        {rows.map((t) => <TR key={t.id}><TD className="font-mono text-xs"><Link className="text-brand" href={`/support/${t.id}`}>{t.number}</Link></TD><TD className="font-medium">{t.subject}{t.customer && <div className="text-xs text-slate-500">{t.customer.name}</div>}</TD><TD>{titleCase(t.category)}</TD><TD><Badge tone={t.priority === "CRITICAL" ? "danger" : t.priority === "HIGH" ? "warning" : "neutral"}>{titleCase(t.priority)}</Badge></TD><TD><Badge tone={tone[t.status]}>{titleCase(t.status)}</Badge></TD><TD>{t.assigneeId ? nameOf.get(t.assigneeId) ?? "—" : "—"}</TD><TD className="text-xs text-slate-500">{relativeTime(t.createdAt)}</TD></TR>)}</TBody></Table>}
        <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} basePath="/support" params={{ q: sp.q, status: sp.status, mine: sp.mine }} /></Card>
    </>
  );
}
