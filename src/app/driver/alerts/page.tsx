import { requirePageContext } from "@/lib/platform/context";
import { relativeTime } from "@/lib/utils/format";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DriverAlerts() {
  const ctx = await requirePageContext("driver.app");
  const items = await ctx.db.notification.findMany({ where: { userId: ctx.user.id, dismissedAt: null }, orderBy: { createdAt: "desc" }, take: 30 });
  await ctx.db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } });
  return (
    <div className="space-y-2"><h1 className="text-lg font-semibold">Alerts</h1>
      {items.map((n) => <div key={n.id} className="card p-3"><div className="flex justify-between"><p className="text-sm font-medium">{n.title}</p><Badge tone={n.priority === "CRITICAL" ? "danger" : n.priority === "HIGH" ? "warning" : "neutral"}>{n.priority.toLowerCase()}</Badge></div><p className="text-sm text-slate-600">{n.body}</p><p className="mt-1 text-xs text-slate-400">{relativeTime(n.createdAt)}</p></div>)}
      {!items.length && <p className="card p-8 text-center text-sm text-slate-500">No alerts.</p>}</div>
  );
}
