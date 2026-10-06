import { Badge, Card, CardHeader, EmptyState, NotConfigured, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FieldGrid, ModalForm, SelectField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { getEntitlements } from "@/lib/platform/entitlements";
import { createItemAction, moveStockAction } from "./actions";
import { dateTime, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Packaging stock" };

export default async function InventoryPage() {
  const ctx = await requirePageContext("inventory.view");
  if (!(await getEntitlements(ctx.companyId)).features.has("inventory")) return <><PageHeader title="Packaging stock" /><NotConfigured title="Not included in your plan" description="Packaging inventory is available on Professional and above." /></>;
  const monthAgo = new Date(Date.now() - 30 * 86400_000);
  const [items, hubs, moves, month] = await Promise.all([
    ctx.db.inventoryItem.findMany({ orderBy: { name: "asc" } }), ctx.db.hub.findMany({ select: { id: true, name: true } }),
    ctx.db.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { item: { select: { name: true } } } }),
    ctx.db.inventoryMovement.groupBy({ by: ["itemId", "type"], where: { createdAt: { gte: monthAgo } }, _sum: { quantity: true } }),
  ]);
  const hubName = new Map(hubs.map((h) => [h.id, h.name]));
  const sum = (id: string, t: string) => month.find((m) => m.itemId === id && m.type === t)?._sum.quantity ?? 0;
  const manage = ctx.can("inventory.manage");
  return (
    <>
      <PageHeader title="Packaging & supplies" subtitle="Boxes, envelopes, tape, labels — stock by location" actions={manage && <ModalForm trigger="Add item" title="New stock item" action={createItemAction}><FieldGrid><Field name="name" label="Item" required /><Field name="sku" label="SKU" /></FieldGrid><FieldGrid cols={3}><Field name="unit" label="Unit" defaultValue="pcs" /><Field name="openingStock" label="Opening stock" type="number" min="0" defaultValue="0" /><Field name="reorderLevel" label="Reorder level" type="number" min="0" defaultValue="0" /></FieldGrid><SelectField name="hubId" label="Location" placeholder="—" options={hubs.map((h) => ({ value: h.id, label: h.name }))} /></ModalForm>} />
      <Card>{!items.length ? <div className="p-6"><EmptyState title="No stock items" /></div> : <Table><THead><TH>Item</TH><TH>Location</TH><TH className="text-right">Received (30d)</TH><TH className="text-right">Used</TH><TH className="text-right">Damaged</TH><TH className="text-right">On hand</TH><TH>{""}</TH></THead><TBody>
        {items.map((it) => <TR key={it.id}><TD className="font-medium">{it.name}{it.sku && <span className="ml-1 text-xs text-slate-500">{it.sku}</span>}</TD><TD>{it.hubId ? hubName.get(it.hubId) ?? "—" : "—"}</TD><TD className="text-right">{sum(it.id, "RECEIVED")}</TD><TD className="text-right">{Math.abs(sum(it.id, "USED"))}</TD><TD className="text-right">{Math.abs(sum(it.id, "DAMAGED"))}</TD>
          <TD className="text-right font-semibold tabular-nums">{it.quantity.toLocaleString()} {it.unit} {it.quantity <= it.reorderLevel && <Badge tone="warning" className="ml-1">Low</Badge>}</TD>
          <TD className="text-right">{manage && <ModalForm trigger="Move stock" triggerClassName="btn-secondary btn-sm" title={`Stock movement — ${it.name}`} action={moveStockAction} extra={{ itemId: it.id }}><FieldGrid><SelectField name="type" label="Type" required options={["RECEIVED", "USED", "TRANSFERRED", "DAMAGED", "ADJUSTMENT"].map((t) => ({ value: t, label: titleCase(t) }))} /><Field name="quantity" label="Quantity" type="number" min="1" required /></FieldGrid><SelectField name="direction" label="Adjustment direction" placeholder="(adjustments only)" options={[{ value: "add", label: "Add to stock" }, { value: "remove", label: "Remove from stock" }]} /><Field name="note" label="Note" /></ModalForm>}</TD></TR>)}</TBody></Table>}</Card>
      <Card className="mt-4"><CardHeader title="Recent movements" /><Table><THead><TH>When</TH><TH>Item</TH><TH>Type</TH><TH className="text-right">Change</TH><TH>Note</TH></THead><TBody>{moves.map((m) => <TR key={m.id}><TD className="text-xs">{dateTime(m.createdAt)}</TD><TD>{m.item.name}</TD><TD>{titleCase(m.type)}</TD><TD className={`text-right tabular-nums ${m.quantity < 0 ? "text-red-600" : "text-emerald-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</TD><TD className="text-xs text-slate-500">{m.note}</TD></TR>)}</TBody></Table></Card>
    </>
  );
}
