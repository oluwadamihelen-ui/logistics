import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DescriptionList, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, Field, FieldGrid, ModalForm, SelectField, CheckboxField, TextareaField } from "@/components/client/form";
import { VehicleForm } from "@/components/client/vehicle-form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { addMaintenanceAction, assignVehicleDriverAction, deleteVehicleAction, updateVehicleAction } from "../actions";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Vehicle" };
const MT = ["SERVICE", "OIL_CHANGE", "TYRES", "REPAIR", "PARTS", "INSPECTION", "OTHER"];

export default async function VehicleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("fleet.view");
  const v = await ctx.db.vehicle.findFirst({ where: { id }, include: { driver: true, maintenance: { orderBy: { performedAt: "desc" }, take: 20 } } });
  if (!v) notFound();
  const [trips, drivers, spend, company] = await Promise.all([
    ctx.db.shipment.count({ where: { vehicleId: id, status: "DELIVERED" } }),
    ctx.db.driver.findMany({ where: { isActive: true }, select: { id: true, name: true, vehicleId: true } }),
    ctx.db.expense.aggregate({ where: { vehicleId: id }, _sum: { amount: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }),
  ]);
  const cur = company.currency;
  const days = (d: Date | null) => (d ? Math.ceil((d.getTime() - Date.now()) / 86400_000) : null);
  const docs: [string, Date | null][] = [["Insurance", v.insuranceExpiry], ["Inspection", v.inspectionExpiry], ["Roadworthiness", v.roadworthinessExpiry], ["Next service", v.nextServiceAt]];
  const manage = ctx.can("fleet.manage");
  return (
    <>
      <PageHeader back={{ href: "/fleet", label: "Fleet" }} title={v.registrationNumber} subtitle={<span className="flex items-center gap-2">{[v.make, v.model, v.year].filter(Boolean).join(" ")} <Badge>{titleCase(v.type)}</Badge><Badge tone={v.status === "AVAILABLE" ? "success" : v.status === "MAINTENANCE" ? "warning" : "info"}>{titleCase(v.status)}</Badge></span>}
        actions={manage && <>
          <VehicleForm action={updateVehicleAction} extra={{ id }} trigger="Edit" triggerClassName="btn-secondary" title="Edit vehicle" initial={v} />
          <ModalForm trigger="Set status" triggerClassName="btn-secondary" title="Vehicle status" action={updateVehicleAction} extra={{ id }}><SelectField name="status" label="Status" defaultValue={v.status} options={["AVAILABLE", "ASSIGNED", "ON_TRIP", "MAINTENANCE", "INACTIVE"].map((s) => ({ value: s, label: titleCase(s) }))} /></ModalForm>
          <ActionButton variant="danger" label="Delete" confirm="Delete this vehicle? Vehicles with shipment history can only be deactivated." action={deleteVehicleAction} args={{ id }} successMessage="Vehicle deleted" />
        </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Mileage" value={`${v.mileageKm.toLocaleString()} km`} /><StatCard label="Deliveries" value={trips} tone="success" /><StatCard label="Maintenance & fuel spend" value={money(Number(spend._sum.amount ?? 0), cur)} /><StatCard label="Capacity" value={v.capacityKg ? `${Number(v.capacityKg)} kg` : "—"} /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Documents & service" /><ul className="divide-y divide-line">{docs.map(([l, d]) => { const n = days(d); return <li key={l} className="flex items-center justify-between px-5 py-3 text-sm"><span>{l}</span><span className="flex items-center gap-2">{dateOnly(d)}{n !== null && <Badge tone={n < 0 ? "danger" : n <= 30 ? "warning" : "success"}>{n < 0 ? `Expired ${-n}d ago` : `${n}d left`}</Badge>}</span></li>; })}</ul></Card>
          <Card><CardHeader title="Maintenance history" action={ctx.can("fleet.maintenance") && (
            <ModalForm trigger="Log maintenance" triggerClassName="btn-primary btn-sm" title="Log maintenance" action={addMaintenanceAction} extra={{ vehicleId: id }}>
              <FieldGrid><SelectField name="type" label="Type" options={MT.map((t) => ({ value: t, label: titleCase(t) }))} defaultValue="SERVICE" /><Field name="performedAt" label="Date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><Field name="cost" label={`Cost (${cur})`} type="number" min="0" /><Field name="mileageKm" label="Mileage (km)" type="number" /><Field name="nextDueAt" label="Next due date" type="date" /><Field name="nextDueKm" label="Next due (km)" type="number" /></FieldGrid>
              <Field name="vendor" label="Workshop / vendor" /><TextareaField name="description" label="Notes" /><CheckboxField name="recordExpense" label="Also record as an expense" defaultChecked />
            </ModalForm>)} />
            <Table><THead><TH>Date</TH><TH>Type</TH><TH>Vendor</TH><TH className="text-right">Cost</TH></THead><TBody>{v.maintenance.map((m) => <TR key={m.id}><TD>{dateOnly(m.performedAt)}</TD><TD>{titleCase(m.type)}{m.description && <div className="text-xs text-slate-500">{m.description}</div>}</TD><TD>{m.vendor ?? "—"}</TD><TD className="text-right tabular-nums">{money(Number(m.cost), cur)}</TD></TR>)}{!v.maintenance.length && <TR><TD colSpan={4} className="text-center text-slate-500">No maintenance recorded</TD></TR>}</TBody></Table></Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Assigned driver" action={manage && <ModalForm trigger="Change" triggerClassName="btn-secondary btn-sm" title="Assign driver" action={assignVehicleDriverAction} extra={{ vehicleId: id }}><SelectField name="driverId" label="Driver" placeholder="Unassigned" defaultValue={v.driver?.id ?? ""} options={drivers.map((d) => ({ value: d.id, label: d.name + (d.vehicleId && d.vehicleId !== id ? " (has another vehicle)" : "") }))} /></ModalForm>} />
            <div className="p-5"><DescriptionList items={[{ label: "Driver", value: v.driver?.name }, { label: "Fuel type", value: v.fuelType }]} /></div></Card>
        </div>
      </div>
    </>
  );
}
