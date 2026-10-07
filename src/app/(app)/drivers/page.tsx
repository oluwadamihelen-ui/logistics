import Link from "next/link";
import { Avatar, Badge, Card, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DriverForm } from "@/components/client/driver-form";
import { requirePageContext } from "@/lib/platform/context";
import { createDriverAction } from "./actions";
import { relativeTime, titleCase, dateOnly } from "@/lib/utils/format";

export const metadata = { title: "Drivers & riders" };
import { driverTone } from "@/lib/logistics/driver-tone";

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("drivers.view");
  const [drivers, branches, vehicles, activeCounts, statusCounts, expiring] = await Promise.all([
    ctx.db.driver.findMany({ where: { ...(sp.status ? { status: sp.status as any } : {}), ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}) }, orderBy: [{ isActive: "desc" }, { name: "asc" }], take: 200, include: { vehicle: { select: { registrationNumber: true, type: true } }, branch: { select: { name: true } } } }),
    ctx.db.branch.findMany({ select: { id: true, name: true } }),
    ctx.db.vehicle.findMany({ where: { isActive: true, driver: null }, select: { id: true, registrationNumber: true } }),
    ctx.db.shipment.groupBy({ by: ["driverId"], where: { driverId: { not: null }, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }, _count: { _all: true } }),
    ctx.db.driver.groupBy({ by: ["status"], where: { isActive: true }, _count: { _all: true } }),
    ctx.db.driver.count({ where: { isActive: true, licenseExpiry: { lte: new Date(Date.now() + 30 * 86400_000) } } }),
  ]);
  const byStatus = Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all])) as Record<string, number>;
  const totalActive = statusCounts.reduce((a, c) => a + c._count._all, 0);
  const active = new Map(activeCounts.map((a) => [a.driverId, a._count._all]));
  const now = Date.now();
  return (
    <>
      <PageHeader title="Drivers & riders" subtitle="Field team, availability and workload" actions={ctx.can("drivers.create") && <DriverForm action={createDriverAction} branches={branches} vehicles={vehicles} trigger="Add driver / rider" title="New driver / rider" />} />
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Team summary">
        <StatCard label="Active team" value={totalActive} hint="drivers & riders" />
        <StatCard label="Available" value={byStatus.AVAILABLE ?? 0} tone="success" href="/drivers?status=AVAILABLE" />
        <StatCard label="On a task" value={(byStatus.ON_PICKUP ?? 0) + (byStatus.ON_DELIVERY ?? 0)} tone="progress" />
        <StatCard label="Offline / idle" value={(byStatus.OFFLINE ?? 0) + (byStatus.IDLE ?? 0)} tone="warning" href="/drivers?status=OFFLINE" />
        <StatCard label="Licences expiring" value={expiring} hint="within 30 days" tone={expiring ? "danger" : "neutral"} />
      </section>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-1.5">{["", "AVAILABLE", "ON_PICKUP", "ON_DELIVERY", "IDLE", "OFFLINE", "EMERGENCY"].map((st) => <Link key={st} href={st ? `/drivers?status=${st}` : "/drivers"} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${(sp.status ?? "") === st ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line hover:bg-slate-50"}`}>{st ? titleCase(st) : "All"}</Link>)}</div>
          <form className="flex gap-2" action="/drivers">
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            <input name="q" defaultValue={sp.q} placeholder="Search by name" className="input !w-52 !py-2" aria-label="Search drivers" />
            <button className="btn-secondary">Search</button>
          </form>
        </div>
        {drivers.length === 0 ? <div className="p-6"><EmptyState title="No drivers found" description="Add drivers and riders, give them a login, and assign them to shipments." /></div> : (
          <Table><THead><TH>Name</TH><TH>Status</TH><TH>Vehicle</TH><TH>Branch</TH><TH className="text-right">Active tasks</TH><TH>Last GPS</TH><TH>Licence</TH></THead><TBody>
            {drivers.map((d) => {
              const exp = d.licenseExpiry ? Math.ceil((d.licenseExpiry.getTime() - now) / 86400_000) : null;
              return <TR key={d.id}><TD><div className="flex items-center gap-3"><Avatar name={d.name} className="h-9 w-9" /><div><Link href={`/drivers/${d.id}`} className="font-medium text-ink hover:text-brand">{d.name}</Link><div className="text-xs text-slate-500">{d.kind === "RIDER" ? "Rider" : "Driver"} · {d.phone}{!d.isActive && " · inactive"}</div></div></div></TD>
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
