import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, Field, FieldGrid, ModalForm, SelectField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { createBranchAction, createHubAction, createZoneAction, updateBranchAction, updateHubAction, updateZoneAction } from "./actions";
import { titleCase } from "@/lib/utils/format";

export const metadata = { title: "Hubs & branches" };

export default async function HubsPage() {
  const ctx = await requirePageContext("hubs.view");
  const [branches, hubs, zones, atHub] = await Promise.all([
    ctx.db.branch.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { shipments: true, drivers: true } } } }),
    ctx.db.hub.findMany({ orderBy: { name: "asc" }, include: { branch: { select: { name: true } } } }),
    ctx.db.zone.findMany({ orderBy: { name: "asc" } }),
    ctx.db.shipment.groupBy({ by: ["currentHubId"], where: { currentHubId: { not: null }, status: { in: ["AT_HUB", "SORTING", "READY_FOR_DISPATCH", "RETURNED_TO_HUB"] } }, _count: { _all: true } }),
  ]);
  const manage = ctx.can("hubs.manage");
  const inHub = new Map(atHub.map((h) => [h.currentHubId, h._count._all]));
  const bOpts = branches.map((b) => ({ value: b.id, label: b.name }));
  return (
    <>
      <PageHeader title="Hubs, branches & zones" subtitle="Your physical network and delivery zones" />
      <div className="space-y-4">
        <Card><CardHeader title="Branches" action={manage && <ModalForm trigger="Add branch" triggerClassName="btn-primary btn-sm" title="New branch" action={createBranchAction}>
          <FieldGrid><Field name="name" label="Name" required /><Field name="code" label="Code" required placeholder="IKJ" /></FieldGrid><FieldGrid><Field name="city" label="City" /><Field name="state" label="State" /></FieldGrid><Field name="addressLine" label="Address" /><FieldGrid><Field name="lat" label="Latitude" type="number" step="any" /><Field name="lng" label="Longitude" type="number" step="any" /></FieldGrid></ModalForm>} />
          {!branches.length ? <div className="p-6"><EmptyState title="No branches" /></div> : <Table><THead><TH>Branch</TH><TH>Location</TH><TH className="text-right">Drivers</TH><TH className="text-right">Shipments</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>{branches.map((b) => <TR key={b.id}><TD className="font-medium">{b.name} <span className="text-xs text-slate-500">({b.code})</span></TD><TD>{[b.city, b.state].filter(Boolean).join(", ") || "—"}</TD><TD className="text-right">{b._count.drivers}</TD><TD className="text-right">{b._count.shipments}</TD><TD><Badge tone={b.isActive ? "success" : "neutral"}>{b.isActive ? "Active" : "Inactive"}</Badge></TD><TD className="text-right">{manage && <ActionButton small variant="ghost" label={b.isActive ? "Deactivate" : "Activate"} action={updateBranchAction} args={{ id: b.id, isActive: !b.isActive }} />}</TD></TR>)}</TBody></Table>}</Card>
        <Card><CardHeader title="Hubs, warehouses & sorting centres" subtitle="Shipment movements are recorded against these" action={manage && <ModalForm trigger="Add hub" triggerClassName="btn-primary btn-sm" title="New hub / warehouse" action={createHubAction}>
          <FieldGrid><Field name="name" label="Name" required /><Field name="code" label="Code" required /></FieldGrid><FieldGrid><SelectField name="type" label="Type" defaultValue="HUB" options={[{ value: "HUB", label: "Hub" }, { value: "WAREHOUSE", label: "Warehouse" }, { value: "SORTING_CENTER", label: "Sorting centre" }]} /><SelectField name="branchId" label="Branch" placeholder="None" options={bOpts} /></FieldGrid><FieldGrid><Field name="city" label="City" /><Field name="state" label="State" /></FieldGrid><FieldGrid><Field name="lat" label="Latitude" type="number" step="any" /><Field name="lng" label="Longitude" type="number" step="any" /></FieldGrid></ModalForm>} />
          {!hubs.length ? <div className="p-6"><EmptyState title="No hubs yet" description="Add a hub to record hub arrival, sorting and transfers." /></div> : <Table><THead><TH>Name</TH><TH>Type</TH><TH>Branch</TH><TH className="text-right">Shipments here</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>{hubs.map((h) => <TR key={h.id}><TD className="font-medium">{h.name} <span className="text-xs text-slate-500">({h.code})</span></TD><TD>{titleCase(h.type)}</TD><TD>{h.branch?.name ?? "—"}</TD><TD className="text-right tabular-nums"><Link className="text-brand" href="/shipments?status=AT_HUB,SORTING,READY_FOR_DISPATCH">{inHub.get(h.id) ?? 0}</Link></TD><TD><Badge tone={h.isActive ? "success" : "neutral"}>{h.isActive ? "Active" : "Inactive"}</Badge></TD><TD className="text-right">{manage && <ActionButton small variant="ghost" label={h.isActive ? "Deactivate" : "Activate"} action={updateHubAction} args={{ id: h.id, isActive: !h.isActive }} />}</TD></TR>)}</TBody></Table>}</Card>
        <Card><CardHeader title="Delivery zones" subtitle="Zones drive pricing and dispatch grouping. Shipments match a zone by delivery city, then state." action={manage && <ModalForm trigger="Add zone" triggerClassName="btn-primary btn-sm" title="New delivery zone" action={createZoneAction}>
          <FieldGrid><Field name="name" label="Name" required placeholder="Lagos Mainland" /><Field name="code" label="Code" required placeholder="LM" /></FieldGrid><Field name="areas" label="Cities / areas / states (comma separated)" required placeholder="Ikeja, Yaba, Surulere" /><Field name="description" label="Description" /></ModalForm>} />
          {!zones.length ? <div className="p-6"><EmptyState title="No zones" description="Create zones, then add pricing rules between them." /></div> : <Table><THead><TH>Zone</TH><TH>Covers</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>{zones.map((z) => <TR key={z.id}><TD className="font-medium">{z.name} <span className="text-xs text-slate-500">({z.code})</span></TD><TD className="text-sm text-slate-600">{z.areas.join(", ")}</TD><TD><Badge tone={z.isActive ? "success" : "neutral"}>{z.isActive ? "Active" : "Off"}</Badge></TD><TD className="whitespace-nowrap text-right">{manage && <><ModalForm trigger="Edit areas" triggerClassName="btn-ghost btn-sm" title={`Edit ${z.name}`} action={updateZoneAction} extra={{ id: z.id }}><Field name="areas" label="Cities / areas / states" defaultValue={z.areas.join(", ")} required /></ModalForm><ActionButton small variant="ghost" label={z.isActive ? "Disable" : "Enable"} action={updateZoneAction} args={{ id: z.id, isActive: !z.isActive }} /></>}</TD></TR>)}</TBody></Table>}</Card>
      </div>
    </>
  );
}
