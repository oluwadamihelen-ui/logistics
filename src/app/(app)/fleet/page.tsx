import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/client/form";
import { VehicleForm } from "@/components/client/vehicle-form";
import { requirePageContext } from "@/lib/platform/context";
import { collectExpiries } from "@/lib/logistics/fleet";
import { createVehicleAction, scanExpiriesAction } from "./actions";
import { dateOnly, titleCase } from "@/lib/utils/format";
import type { Tone } from "@/lib/logistics/shipment-status";

export const metadata = { title: "Fleet" };
const tone: Record<string, Tone> = { AVAILABLE: "success", ASSIGNED: "info", ON_TRIP: "progress", MAINTENANCE: "warning", INACTIVE: "neutral" };

export default async function FleetPage() {
  const ctx = await requirePageContext("fleet.view");
  const [vehicles, expiries] = await Promise.all([
    ctx.db.vehicle.findMany({ where: { isActive: true }, orderBy: { registrationNumber: "asc" }, include: { driver: { select: { id: true, name: true } } } }),
    collectExpiries(ctx, 30),
  ]);
  const count = (s: string) => vehicles.filter((v) => v.status === s).length;
  const expFor = (id: string) => expiries.filter((e) => e.kind === "vehicle" && e.id === id);
  return (
    <>
      <PageHeader title="Fleet" subtitle="Vehicles, documents and maintenance" actions={<>
        {ctx.can("fleet.manage") && <ActionButton label="Send expiry alerts now" action={scanExpiriesAction} args={{}} successMessage="Expiry scan complete" />}
        {ctx.can("fleet.manage") && <VehicleForm action={createVehicleAction} trigger="Add vehicle" title="New vehicle" />}
      </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Vehicles" value={vehicles.length} /><StatCard label="Available" value={count("AVAILABLE")} tone="success" /><StatCard label="Assigned / on trip" value={count("ASSIGNED") + count("ON_TRIP")} tone="progress" />
        <StatCard label="Maintenance" value={count("MAINTENANCE")} tone="warning" /><StatCard label="Expiring ≤30d" value={expiries.filter((e) => e.kind === "vehicle").length} tone={expiries.length ? "danger" : "neutral"} />
      </div>
      <Card className="mt-4">
        <CardHeader title="Vehicles" />
        {!vehicles.length ? <div className="p-6"><EmptyState title="No vehicles yet" description="Add vehicles to assign them to drivers and track documents and maintenance." /></div> : (
          <Table><THead><TH>Registration</TH><TH>Type</TH><TH>Status</TH><TH>Driver</TH><TH className="text-right">Mileage</TH><TH>Insurance</TH><TH>Alerts</TH></THead><TBody>
            {vehicles.map((v) => <TR key={v.id}>
              <TD><Link className="font-medium text-brand hover:underline" href={`/fleet/${v.id}`}>{v.registrationNumber}</Link><div className="text-xs text-slate-500">{[v.make, v.model, v.year].filter(Boolean).join(" ")}</div></TD>
              <TD>{titleCase(v.type)}</TD><TD><Badge tone={tone[v.status]} dot>{titleCase(v.status)}</Badge></TD><TD>{v.driver?.name ?? "—"}</TD><TD className="text-right tabular-nums">{v.mileageKm.toLocaleString()} km</TD>
              <TD className="text-xs">{dateOnly(v.insuranceExpiry)}</TD>
              <TD>{expFor(v.id).slice(0, 2).map((e) => <Badge key={e.what} tone={e.days <= 0 ? "danger" : "warning"} className="mr-1">{e.what}: {e.days <= 0 ? "expired" : `${e.days}d`}</Badge>)}</TD></TR>)}
          </TBody></Table>)}
      </Card>
    </>
  );
}
