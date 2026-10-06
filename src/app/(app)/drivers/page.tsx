import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DriverForm } from "@/components/client/driver-form";
import { requirePageContext } from "@/lib/platform/context";
import { createDriverAction } from "./actions";
import { relativeTime, titleCase, dateOnly } from "@/lib/utils/format";
import type { Tone } from "@/lib/logistics/shipment-status";

export const metadata = { title: "Drivers & riders" };
export const driverTone: Record<string, Tone> = { AVAILABLE: "success", ON_PICKUP: "progress", ON_DELIVERY: "progress", IDLE: "warning", OFFLINE: "neutral", EMERGENCY: "danger" };

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("drivers.view");
  const [drivers, branches, vehicles, activeCounts] = await Promise.all([
    ctx.db.driver.findMany({ where: { ...(sp.status ? { status: sp.status as any } : {}), ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}) }, orderBy: [{ isActive: "desc" }, { name: "asc" }], take: 200, include: { vehicle: { select: { registrationNumber: true, type: true } }, branch: { select: { name: true } } } }),
    ctx.db.branch.findMany({ select: { id: true, name: true } }),
    ctx.db.vehicle.findMany({ where: { isActive: true, driver: null }, select: { id: true, registrationNumber: true } }),
    ctx.db.shipment.groupBy({ by: ["driverId"], where: { driverId: { not: null }, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }, _count: { _all: true } }),
  ]);
  const active = new Map(activeCounts.map((a) => [a.driverId, a._count._all]));
  const now = Date.now();
  return (
    <>
      <PageHeader title="Drivers & riders" subtitle="Field team, availability and workload" actions={ctx.can("drivers.create") && <DriverForm action={createDriverAction} branches={branches} vehicles={vehicles} trigger="Add driver / rider" title="New driver / rider" />} />
      <div className="mb-3 flex flex-wrap gap-1.5">{["", "AVAILABLE", "ON_PICKUP", "ON_DELIVERY", "IDLE", "OFFLINE", "EMERGENCY"].map((s) => <Link key={s} href={s ? `/drivers?status=${s}` : "/drivers"} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${(sp.status ?? "") === s ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line hover:bg-slate-50"}`}>{s ? titleCase(s) : "All"}</Link>)}</div>
      <Card>
        {drivers.length === 0 ? <div className="p-6"><EmptyState title="No drivers found" description="Add drivers and riders, give them a login, and assign them to shipments." /></div> : (
          <Table><THead><TH>Name</TH><TH>Status</TH><TH>Vehicle</TH><TH>Branch</TH><TH className="text-right">Active tasks</TH><TH>Last GPS</TH><TH>Licence</TH></THead><TBody>
            {drivers.map((d) => {
              const exp = d.licenseExpiry ? Math.ceil((d.licenseExpiry.getTime() - now) / 86400_000) : null;
              return <TR key={d.id}><TD><Link href={`/drivers/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link><div className="text-xs text-slate-500">{d.kind === "RIDER" ? "Rider" : "Driver"} · {d.phone}{!d.isActive && " · inactive"}</div></TD>
                <TD><Badge tone={driverTone[d.status]} dot>{titleCase(d.status)}</Badge></TD><TD>{d.vehicle ? `${d.vehicle.registrationNumber}` : "—"}</TD><TD>{d.branch?.name ?? "—"}</TD>
                <TD className="text-right tabular-nums">{active.get(d.id) ?? 0}</TD><TD className="text-xs text-slate-500">{d.lastLocationAt ? relativeTime(d.lastLocationAt) : "No GPS yet"}</TD>
                <TD className="text-xs">{d.licenseExpiry ? <span className={exp !== null && exp < 30 ? "font-medium text-red-600" : "text-slate-500"}>{dateOnly(d.licenseExpiry)}{exp !== null && exp < 0 ? " (expired)" : ""}</span> : "—"}</TD></TR>;
            })}
          </TBody></Table>
        )}
      </Card>
    </>
  );
}
