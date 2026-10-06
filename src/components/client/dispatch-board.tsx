"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assignAction } from "@/app/(app)/shipments/actions";
import { createRunAction } from "@/app/(app)/dispatch/actions";
import { useToast } from "./toast";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/format";

export interface BoardShipment { id: string; trackingNumber: string; status: string; priority: string; recipientName: string; deliveryCity: string; deliveryAddress: string; zone: string | null; driverId: string | null; accepted: boolean; cod: number }
export interface BoardDriver { id: string; name: string; status: string; kind: string; active: number; vehicle: string | null; lastGps: string | null }

const COLS = ["UNASSIGNED", "ASSIGNED", "ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED"] as const;
type Col = (typeof COLS)[number];
const TITLE: Record<Col, string> = { UNASSIGNED: "Unassigned", ASSIGNED: "Assigned", ACCEPTED: "Accepted", PICKED_UP: "Picked up", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered today", FAILED: "Failed / rescheduled" };
const ASSIGNABLE = ["CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "RESCHEDULED", "DELIVERY_FAILED"];

function column(s: BoardShipment): Col | null {
  if (s.status === "DELIVERED") return "DELIVERED";
  if (s.status === "DELIVERY_FAILED" || s.status === "RESCHEDULED") return "FAILED";
  if (s.status === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if (s.status === "PICKED_UP" && s.driverId) return "PICKED_UP";
  if (s.driverId && (s.status === "PICKUP_ASSIGNED" || s.status === "ASSIGNED_FOR_DELIVERY")) return s.accepted ? "ACCEPTED" : "ASSIGNED";
  if (!s.driverId && ["CONFIRMED", "READY_FOR_DISPATCH", "PICKED_UP"].includes(s.status)) return "UNASSIGNED";
  return null;
}
const prioRank: Record<string, number> = { SAME_DAY: 0, URGENT: 1, EXPRESS: 2, STANDARD: 3 };

export function DispatchBoard({ shipments, drivers, zones, canAssign, canRun }: { shipments: BoardShipment[]; drivers: BoardDriver[]; zones: string[]; canAssign: boolean; canRun: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [zone, setZone] = React.useState("");
  const [driver, setDriver] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  const grouped = React.useMemo(() => {
    const g: Record<Col, BoardShipment[]> = { UNASSIGNED: [], ASSIGNED: [], ACCEPTED: [], PICKED_UP: [], OUT_FOR_DELIVERY: [], DELIVERED: [], FAILED: [] };
    for (const s of shipments) { if (zone && s.zone !== zone) continue; const c = column(s); if (c) g[c].push(s); }
    g.UNASSIGNED.sort((a, b) => (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9));
    return g;
  }, [shipments, zone]);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function assign(ids: string[], driverId: string) {
    setBusy(true);
    const r = await assignAction({ shipmentIds: ids, driverId });
    setBusy(false);
    if (r.ok) { toast.push(r.data.failed ? "info" : "success", `${r.data.assigned} assigned${r.data.failed ? `, ${r.data.failed} could not be assigned` : ""}`); setSel(new Set()); router.refresh(); }
    else toast.push("error", r.error);
  }
  async function run(sort: "manual" | "nearest") {
    if (!driver || !sel.size) return;
    setBusy(true);
    const r = await createRunAction({ driverId: driver, shipmentIds: [...sel], sort });
    setBusy(false);
    if (r.ok) { toast.push("success", `Run created with ${r.data.assigned} stop${r.data.assigned > 1 ? "s" : ""}`); setSel(new Set()); router.refresh(); } else toast.push("error", r.error);
  }
  function onDrop(e: React.DragEvent, driverId: string) {
    e.preventDefault(); setDragOver(null);
    const id = e.dataTransfer.getData("text/shipment");
    if (!id || !canAssign) return;
    assign(sel.has(id) ? [...sel] : [id], driverId);
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Filter by zone"><option value="">All zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>
          {canAssign && <>
            <select className="input !w-auto" value={driver} onChange={(e) => setDriver(e.target.value)} aria-label="Driver"><option value="">Assign selected to…</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.active} active)</option>)}</select>
            <button className="btn-primary" disabled={busy || !driver || !sel.size} onClick={() => assign([...sel], driver)}>Assign {sel.size || ""}</button>
            {canRun && <>
              <button className="btn-secondary" disabled={busy || !driver || !sel.size} onClick={() => run("manual")} title="Creates a multi-stop run in the order selected">Create run</button>
              <button className="btn-secondary" disabled={busy || !driver || !sel.size} onClick={() => run("nearest")} title="Simple nearest-neighbour ordering — a heuristic, not an optimisation engine">Run + nearest-first order</button>
            </>}
          </>}
          {sel.size > 0 && <button className="btn-ghost btn-sm" onClick={() => setSel(new Set())}>Clear ({sel.size})</button>}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLS.map((c) => (
            <section key={c} className="w-64 shrink-0 rounded-xl bg-slate-100/80 p-2" aria-label={TITLE[c]}>
              <h3 className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{TITLE[c]}<span className="rounded-full bg-white px-2 py-0.5 text-slate-500">{grouped[c].length}</span></h3>
              <div className="max-h-[65vh] space-y-2 overflow-y-auto">
                {grouped[c].map((s) => (
                  <article key={s.id} draggable={canAssign && ASSIGNABLE.includes(s.status)} onDragStart={(e) => { e.dataTransfer.setData("text/shipment", s.id); e.dataTransfer.effectAllowed = "move"; }}
                    className={cn("rounded-lg border bg-white p-2.5 text-xs shadow-sm", sel.has(s.id) ? "border-brand ring-2 ring-brand/30" : "border-line", canAssign && ASSIGNABLE.includes(s.status) && "cursor-grab")}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/shipments/${s.id}`} className="font-mono font-semibold text-brand hover:underline">{s.trackingNumber}</Link>
                      {canAssign && ASSIGNABLE.includes(s.status) && <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.trackingNumber}`} />}
                    </div>
                    <p className="mt-1 font-medium text-ink">{s.recipientName}</p><p className="truncate text-slate-500">{s.deliveryAddress}, {s.deliveryCity}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">{s.priority !== "STANDARD" && <Badge tone="warning">{s.priority.replace("_", " ").toLowerCase()}</Badge>}{s.zone && <Badge>{s.zone}</Badge>}{s.cod > 0 && <Badge tone="info">COD</Badge>}
                      {s.driverId && <span className="text-slate-500">· {drivers.find((d) => d.id === s.driverId)?.name ?? "driver"}</span>}</div>
                  </article>
                ))}
                {!grouped[c].length && <p className="px-2 py-6 text-center text-xs text-slate-400">Nothing here</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
      <aside className="w-full shrink-0 xl:w-72" aria-label="Drivers">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Drivers · drop shipments here</h3>
        <div className="space-y-2">
          {drivers.map((d) => (
            <div key={d.id} onDragOver={(e) => { if (canAssign) { e.preventDefault(); setDragOver(d.id); } }} onDragLeave={() => setDragOver(null)} onDrop={(e) => onDrop(e, d.id)}
              className={cn("rounded-lg border bg-white p-3 text-sm transition", dragOver === d.id ? "border-brand bg-brand-soft" : "border-line")}>
              <div className="flex items-center justify-between"><Link href={`/drivers/${d.id}`} className="font-medium hover:text-brand">{d.name}</Link><Badge tone={d.status === "AVAILABLE" ? "success" : d.status === "EMERGENCY" ? "danger" : d.status === "OFFLINE" ? "neutral" : "progress"} dot>{d.status.replace(/_/g, " ").toLowerCase()}</Badge></div>
              <p className="mt-1 text-xs text-slate-500">{d.active} active · {d.vehicle ?? "no vehicle"} · GPS {d.lastGps ?? "none"}</p>
            </div>
          ))}
          {!drivers.length && <p className="text-sm text-slate-500">No active drivers.</p>}
        </div>
      </aside>
    </div>
  );
}
