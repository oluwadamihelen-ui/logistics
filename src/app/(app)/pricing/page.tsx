import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, CheckboxField, Field, FieldGrid, ModalForm, SelectField } from "@/components/client/form";
import { PricingSimulator } from "@/components/client/pricing-sim";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { createPricingRuleAction, deletePricingRuleAction, updatePricingRuleAction } from "../finance/actions";
import { money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Pricing rules" };

export default async function PricingPage() {
  const ctx = await requirePageContext("pricing.manage");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  const [rules, zones] = await Promise.all([ctx.db.pricingRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }), ctx.db.zone.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const zn = (id: string | null) => (id ? zones.find((z) => z.id === id)?.name ?? "?" : "Any");
  const cur = company.currency;
  const ZoneOpts = zones.map((z) => ({ value: z.id, label: z.name }));
  return (
    <>
      <PageHeader title="Pricing rules" subtitle="The first active rule that matches (lowest priority number first) sets the price. More specific rules win ties." actions={
        <ModalForm trigger="Add rule" title="New pricing rule" action={createPricingRuleAction} wide>
          <FieldGrid><Field name="name" label="Rule name" required placeholder="Mainland → Island ≤5kg" /><Field name="priority" label="Priority (lower = first)" type="number" defaultValue="100" /></FieldGrid>
          <p className="text-xs font-semibold uppercase text-slate-500">Match when…</p>
          <FieldGrid><SelectField name="originZoneId" label="Pickup zone" placeholder="Any" options={ZoneOpts} /><SelectField name="destinationZoneId" label="Delivery zone" placeholder="Any" options={ZoneOpts} />
            <Field name="minWeightKg" label="Min weight (kg)" type="number" step="0.1" /><Field name="maxWeightKg" label="Max weight (kg)" type="number" step="0.1" />
            <SelectField name="shipmentPriority" label="Service priority" placeholder="Any" options={["STANDARD", "EXPRESS", "URGENT", "SAME_DAY"].map((p) => ({ value: p, label: titleCase(p) }))} />
            <SelectField name="customerType" label="Customer type" placeholder="Any" options={["INDIVIDUAL", "BUSINESS", "CORPORATE", "MARKETPLACE_SELLER"].map((p) => ({ value: p, label: titleCase(p) }))} />
            <SelectField name="packageType" label="Package type" placeholder="Any" options={["DOCUMENT", "PARCEL", "FRAGILE", "FOOD", "PHARMACY", "GROCERY", "ELECTRONICS", "FREIGHT", "OTHER"].map((p) => ({ value: p, label: titleCase(p) }))} />
            <SelectField name="interstate" label="Interstate" placeholder="Any" options={[{ value: "yes", label: "Interstate only" }, { value: "no", label: "Same state only" }]} /></FieldGrid>
          <p className="text-xs font-semibold uppercase text-slate-500">Price</p>
          <FieldGrid cols={3}><Field name="baseFee" label={`Base fee (${cur})`} type="number" step="0.01" defaultValue="0" /><Field name="includedKg" label="Included kg" type="number" step="0.1" defaultValue="0" /><Field name="perKgFee" label="Per extra kg" type="number" step="0.01" defaultValue="0" />
            <Field name="perKmFee" label="Per km" type="number" step="0.01" defaultValue="0" hint="needs coordinates" /><Field name="insurancePercent" label="Insurance % of value" type="number" step="0.01" defaultValue="0" /><Field name="codFeePercent" label="COD fee %" type="number" step="0.01" defaultValue="0" />
            <Field name="priorityMultiplier" label="Multiplier" type="number" step="0.05" defaultValue="1" /><Field name="minimumFee" label="Minimum fee" type="number" step="0.01" defaultValue="0" /></FieldGrid>
        </ModalForm>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">{!rules.length ? <div className="p-6"><EmptyState title="No pricing rules" description="Without rules, online booking is disabled and staff must enter fees manually." /></div> : <Table><THead><TH>#</TH><TH>Rule</TH><TH>Matches</TH><TH className="text-right">Base</TH><TH className="text-right">Per kg</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>
          {rules.map((r) => <TR key={r.id}><TD className="tabular-nums">{r.priority}</TD><TD className="font-medium">{r.name}</TD>
            <TD className="text-xs text-slate-600">{zn(r.originZoneId)} → {zn(r.destinationZoneId)}{r.maxWeightKg !== null && ` · ≤${Number(r.maxWeightKg)}kg`}{r.minWeightKg !== null && ` · ≥${Number(r.minWeightKg)}kg`}{r.shipmentPriority && ` · ${titleCase(r.shipmentPriority)}`}{r.customerType && ` · ${titleCase(r.customerType)}`}{r.interstate !== null && (r.interstate ? " · interstate" : " · in-state")}</TD>
            <TD className="text-right tabular-nums">{money(Number(r.baseFee), cur)}</TD><TD className="text-right tabular-nums">{money(Number(r.perKgFee), cur)}</TD>
            <TD><Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Off"}</Badge></TD>
            <TD className="whitespace-nowrap text-right"><ActionButton small variant="ghost" label={r.isActive ? "Disable" : "Enable"} action={updatePricingRuleAction} args={{ id: r.id, isActive: !r.isActive }} /><ActionButton small variant="ghost" label="Delete" confirm={`Delete rule “${r.name}”?`} action={deletePricingRuleAction} args={{ id: r.id }} /></TD></TR>)}</TBody></Table>}</Card>
        <Card><CardHeader title="Price simulator" subtitle="Test what your rules would charge" /><div className="p-5"><PricingSimulator zones={zones} currency={cur} /></div></Card>
      </div>
    </>
  );
}
