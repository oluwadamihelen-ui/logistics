import Link from "next/link";
import { Badge, Card, EmptyState, NotConfigured, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { getEntitlements } from "@/lib/platform/entitlements";
import { getRouteOptimizer } from "@/lib/logistics/routes";
import { setRouteStatusAction } from "../dispatch/actions";
import { dateOnly, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Routes" };

export default async function RoutesPage() {
  const ctx = await requirePageContext("routes.view");
  const ent = await getEntitlements(ctx.companyId);
  if (!ent.features.has("routes")) return <><PageHeader title="Routes" /><NotConfigured title="Routes are not on your plan" description="Multi-stop delivery runs are available on Professional and above." /></>;
  const routes = await ctx.db.route.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { driver: { select: { id: true, name: true } }, stops: { include: { shipment: { select: { id: true, trackingNumber: true, deliveryCity: true } } }, orderBy: { sequence: "asc" } } } });
  const optimizer = getRouteOptimizer();
  return (
    <>
      <PageHeader title="Delivery runs" subtitle="Multi-stop routes. Create runs from the Dispatch board." actions={<Link className="btn-primary" href="/dispatch">Open dispatch board</Link>} />
      {!optimizer && <div className="mb-4"><NotConfigured title="Route optimisation engine not configured" description="Stops keep the order you set. The nearest-first option is a simple heuristic using straight-line distance, not a road-network optimiser. Distances shown are straight-line estimates." /></div>}
      {!routes.length ? <EmptyState title="No runs yet" description="Select shipments on the dispatch board and create a run for a driver." /> : (
        <div className="space-y-3">{routes.map((r) => (
          <Card key={r.id}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div><p className="font-semibold">{r.name}</p><p className="text-xs text-slate-500">{r.driver ? <Link href={`/drivers/${r.driver.id}`} className="text-brand">{r.driver.name}</Link> : "No driver"} · {dateOnly(r.plannedDate)} · {r.stops.length} stops{r.estDistanceKm ? ` · ~${r.estDistanceKm} km straight-line` : ""}{r.optimizedBy ? " · nearest-first heuristic" : ""}</p></div>
            <div className="flex items-center gap-2"><Badge tone={r.status === "COMPLETED" ? "success" : r.status === "IN_PROGRESS" ? "progress" : r.status === "CANCELLED" ? "neutral" : "info"}>{titleCase(r.status)}</Badge>
              {ctx.can("routes.manage") && r.status === "PLANNED" && <ActionButton small label="Start" action={setRouteStatusAction} args={{ id: r.id, status: "IN_PROGRESS" }} />}
              {ctx.can("routes.manage") && r.status === "IN_PROGRESS" && <ActionButton small label="Complete" action={setRouteStatusAction} args={{ id: r.id, status: "COMPLETED" }} />}
              {ctx.can("routes.manage") && ["PLANNED", "IN_PROGRESS"].includes(r.status) && <ActionButton small variant="ghost" label="Cancel" confirm="Cancel this run? Shipments stay assigned." action={setRouteStatusAction} args={{ id: r.id, status: "CANCELLED" }} />}</div></div>
            <ol className="flex flex-wrap gap-2 px-5 py-3 text-xs">{r.stops.map((s) => <li key={s.id} className="rounded-full bg-slate-100 px-2.5 py-1"><span className="font-semibold">{s.sequence}.</span> <Link className="font-mono hover:text-brand" href={`/shipments/${s.shipment.id}`}>{s.shipment.trackingNumber}</Link> · {s.shipment.deliveryCity}</li>)}</ol>
          </Card>))}</div>)}
    </>
  );
}
