import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { NotificationList } from "@/components/client/notification-list";
import { CheckboxField, Form } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { providerStatus } from "@/lib/platform/notifications/providers";
import { getAttention } from "@/lib/logistics/attention";
import { savePreferenceAction } from "./actions";
import { titleCase } from "@/lib/utils/format";

export const metadata = { title: "Notifications" };
const CATS = ["SHIPMENT", "DELIVERY", "PICKUP", "DISPATCH", "DRIVER", "FLEET", "PAYMENT", "COD", "INVOICE", "CUSTOMER", "FINANCE", "MAINTENANCE", "SYSTEM", "SECURITY", "AI_INSIGHT"];
const PRIOS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext();
  const page = Math.max(1, Number(sp.page) || 1), pageSize = 25;
  const where: any = { userId: ctx.user.id, dismissedAt: null };
  if (sp.view === "unread") where.readAt = null;
  if (sp.category && CATS.includes(sp.category)) where.category = sp.category;
  if (sp.priority && PRIOS.includes(sp.priority)) where.priority = sp.priority;
  if (sp.q) where.OR = [{ title: { contains: sp.q, mode: "insensitive" } }, { body: { contains: sp.q, mode: "insensitive" } }];
  const [items, total, attention, prefs, enabled] = await Promise.all([
    ctx.db.notification.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ctx.db.notification.count({ where }),
    getAttention(ctx, (p) => ctx.can(p)),
    ctx.db.notificationPreference.findMany({ where: { userId: ctx.user.id } }),
    ctx.db.companySettings.findFirst({ select: { enabledChannels: true } }),
  ]);
  const status = providerStatus();
  const prefBy = new Map(prefs.map((p) => [p.category, p]));
  const prioTone: Record<string, "danger" | "warning" | "info" | "neutral"> = { CRITICAL: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral" };
  return (
    <>
      <PageHeader title="Notifications" subtitle="What needs your attention, and everything we've told you" />
      {attention.length > 0 && <Card className="mb-4"><CardHeader title="What needs attention now" subtitle="Computed live from your operations data" /><ul className="divide-y divide-line">{attention.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="flex items-center gap-3"><Badge tone={prioTone[a.priority]}>{a.priority.toLowerCase()}</Badge>{a.text}</span><Link className="shrink-0 font-medium text-brand" href={a.href}>View</Link></li>)}</ul></Card>}
      {attention.length === 0 && <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Nothing urgent right now.</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="flex flex-wrap items-end gap-2 border-b border-line p-3" role="search">
            <input name="q" defaultValue={sp.q} className="input !w-48" placeholder="Search…" aria-label="Search notifications" />
            <select name="category" defaultValue={sp.category ?? ""} className="input !w-auto" aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select>
            <select name="priority" defaultValue={sp.priority ?? ""} className="input !w-auto" aria-label="Priority"><option value="">Any priority</option>{PRIOS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select>
            <select name="view" defaultValue={sp.view ?? ""} className="input !w-auto" aria-label="View"><option value="">All</option><option value="unread">Unread</option></select>
            <button className="btn-secondary">Filter</button>
          </form>
          {!items.length ? <div className="p-6"><EmptyState title="No notifications" description="You're all caught up." /></div> : <NotificationList items={items.map((n) => ({ id: n.id, category: n.category, priority: n.priority, title: n.title, body: n.body, actionUrl: n.actionUrl, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(), ai: n.isAiGenerated }))} />}
          <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} basePath="/notifications" params={{ q: sp.q, category: sp.category, priority: sp.priority, view: sp.view }} />
        </Card>
        <Card><CardHeader title="My preferences" subtitle="Per category. Critical alerts always reach you." />
          <div className="max-h-[70vh] divide-y divide-line overflow-y-auto">
            {CATS.map((c) => { const p = prefBy.get(c as any); return (
              <Form key={c} action={savePreferenceAction} extra={{ category: c }} submitLabel="Save" className="space-y-2 px-5 py-3" successMessage={`${titleCase(c)} preferences saved`}>
                <p className="text-sm font-medium">{titleCase(c)}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1"><CheckboxField name="muted" label="Mute" defaultChecked={p?.muted} />
                  {(["EMAIL", "SMS", "WHATSAPP", "PUSH"] as const).map((ch) => <CheckboxField key={ch} name="channels[]" value={ch} label={titleCase(ch)} defaultChecked={p?.channels.includes(ch)} hint={!(enabled?.enabledChannels ?? []).includes(ch) ? "disabled by company" : !status[ch].configured ? "not configured" : undefined} />)}</div>
              </Form>); })}
          </div></Card>
      </div>
    </>
  );
}
