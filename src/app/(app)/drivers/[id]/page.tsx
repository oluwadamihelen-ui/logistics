import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DescriptionList, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton } from "@/components/client/form";
import { DriverForm } from "@/components/client/driver-form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { driverStats } from "@/lib/logistics/drivers";
import { clearSosAction, setDriverActiveAction, updateDriverAction } from "../actions";
import { dateTime, money, pct, relativeTime, titleCase } from "@/lib/utils/format";
import { driverTone } from "../page";

export const metadata = { title: "Driver" };

export default async function DriverDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("drivers.view");
  const d = await ctx.db.driver.findFirst({ where: { id }, include: { vehicle: true, branch: true } });
  if (!d) notFound();
  const [stats, tasks, history, branches, vehicles, company, settlements] = await Promise.all([
    driverStats(ctx, id),
    ctx.db.shipment.findMany({ where: { driverId: id, status: { in: ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, trackingNumber: true, status: true, recipientName: true, deliveryAddress: true, deliveryCity: true } }),
    ctx.db.deliveryAttempt.findMany({ where: { driverId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { shipment: { select: { id: true, trackingNumber: true } } } }),
    ctx.db.branch.findMany({ select: { id: true, name: true } }),
    ctx.db.vehicle.findMany({ where: { isActive: true, OR: [{ driver: null }, { id: d.vehicleId ?? "" }] }, select: { id: true, registrationNumber: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }),
    ctx.can("settlements.manage") ? ctx.db.settlement.findMany({ where: { driverId: id }, orderBy: { createdAt: "desc" }, take: 5 }) : Promise.resolve([]),
  ]);
  const cur = company.currency;
  const rates = (d.payRates ?? {}) as Record<string, number>;
  return (
    <>
      <PageHeader back={{ href: "/drivers", label: "Drivers" }} title={d.name} subtitle={<span className="flex flex-wrap items-center gap-2">{d.kind === "RIDER" ? "Rider" : "Driver"} · {d.phone} <Badge tone={driverTone[d.status]} dot>{titleCase(d.status)}</Badge>{!d.isActive && <Badge>Inactive</Badge>}</span>}
        actions={<>
          {ctx.can("drivers.edit") && <DriverForm action={updateDriverAction} extra={{ id }} branches={branches} vehicles={vehicles} trigger="Edit" triggerClassName="btn-secondary" title="Edit driver" initial={{ name: d.name, phone: d.phone, kind: d.kind, branchId: d.branchId, licenseNumber: d.licenseNumber, licenseExpiry: d.licenseExpiry?.toISOString(), payModel: d.payModel, vehicleId: d.vehicleId, rates }} />}
          {ctx.can("drivers.edit") && <ActionButton label={d.isActive ? "Deactivate" : "Reactivate"} variant={d.isActive ? "danger" : "secondary"} confirm={d.isActive ? "Deactivate this driver and block their login?" : "Reactivate this driver?"} action={() => setDriverActiveAction({ id, isActive: !d.isActive })} />}
        </>} />
      {d.status === "EMERGENCY" && <div className="mb-4 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"><span className="font-semibold">⚠ Emergency (SOS) active — call {d.phone}</span>{ctx.can("dispatch.manage") && <ActionButton label="Mark resolved" action={() => clearSosAction({ id })} />}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Delivered (30d)" value={stats.delivered} tone="success" /><StatCard label="Failed attempts (30d)" value={stats.failed} tone={stats.failed ? "danger" : "neutral"} />
        <StatCard label="Success rate" value={stats.successRate === null ? "—" : pct(stats.successRate, 1)} /><StatCard label="Avg pickup→delivery" value={stats.avgDeliveryHours === null ? "—" : `${stats.avgDeliveryHours.toFixed(1)}h`} />
        <StatCard label="Active tasks" value={stats.activeTasks} tone="info" /><StatCard label="COD held" value={money(stats.codHeld, cur)} tone={stats.codHeld ? "warning" : "neutral"} hint="not yet remitted" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Current tasks" /><Table><THead><TH>Tracking</TH><TH>Recipient</TH><TH>Status</TH></THead><TBody>
            {tasks.map((t) => <TR key={t.id}><TD><Link className="font-mono text-brand hover:underline" href={`/shipments/${t.id}`}>{t.trackingNumber}</Link></TD><TD>{t.recipientName}<div className="text-xs text-slate-500">{t.deliveryAddress}, {t.deliveryCity}</div></TD><TD><StatusBadge status={t.status} /></TD></TR>)}
            {!tasks.length && <TR><TD colSpan={3} className="text-center text-slate-500">No active tasks</TD></TR>}</TBody></Table></Card>
          <Card><CardHeader title="Recent attempts" /><ul className="divide-y divide-line">{history.map((a) => <li key={a.id} className="flex justify-between px-5 py-3 text-sm"><span><Link className="font-mono text-brand" href={`/shipments/${a.shipment.id}`}>{a.shipment.trackingNumber}</Link> {a.failureReason && <span className="text-slate-500">· {titleCase(a.failureReason)}</span>}</span><span className="flex items-center gap-2"><Badge tone={a.outcome === "DELIVERED" ? "success" : "danger"}>{titleCase(a.outcome)}</Badge><span className="text-xs text-slate-500">{dateTime(a.createdAt)}</span></span></li>)}{!history.length && <li className="px-5 py-6 text-center text-sm text-slate-500">No history</li>}</ul></Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Profile" /><div className="p-5"><DescriptionList items={[{ label: "Branch", value: d.branch?.name }, { label: "Vehicle", value: d.vehicle ? `${d.vehicle.registrationNumber} (${titleCase(d.vehicle.type)})` : null }, { label: "Licence", value: d.licenseNumber }, { label: "Licence expiry", value: d.licenseExpiry ? dateTime(d.licenseExpiry).split(",")[0] : null }, { label: "Pay model", value: titleCase(d.payModel) }, { label: "Last GPS", value: d.lastLocationAt ? `${relativeTime(d.lastLocationAt)} (${d.currentLat?.toFixed(4)}, ${d.currentLng?.toFixed(4)})` : "No location yet" }, { label: "Has app login", value: d.userId ? "Yes" : "No" }]} /></div></Card>
          {settlements.length > 0 && <Card><CardHeader title="Settlements" action={<Link href="/settlements" className="text-xs text-brand">All</Link>} /><ul className="divide-y divide-line">{settlements.map((s) => <li key={s.id} className="flex justify-between px-5 py-3 text-sm"><span>{s.number} <Badge>{titleCase(s.status)}</Badge></span><span className="tabular-nums">{money(Number(s.netPayable), cur)}</span></li>)}</ul></Card>}
        </div>
      </div>
    </>
  );
}
