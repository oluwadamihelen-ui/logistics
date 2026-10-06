import { Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { CheckboxField, Field, FieldGrid, ModalForm, TextareaField } from "@/components/client/form";
import { prisma } from "@/lib/platform/db";
import { FEATURES } from "@/lib/platform/entitlements";
import { money, titleCase } from "@/lib/utils/format";
import { updatePlanAction } from "../actions";

export default async function PlansPage() {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
  return (
    <>
      <PageHeader title="Plans & entitlements" subtitle="Plans live in the database. Changes apply immediately to every company on that plan. Leave a limit blank for unlimited; leave a price blank for “contact sales”." />
      <Card><Table><THead><TH>Plan</TH><TH className="text-right">Monthly</TH><TH className="text-right">Annual</TH><TH>Limits</TH><TH className="text-right">Companies</TH><TH>Visible</TH><TH>{""}</TH></THead><TBody>
        {plans.map((p) => { const l = p.limits as Record<string, number | null>; return (
          <TR key={p.id}><TD className="font-medium">{p.name}<div className="text-xs text-slate-500">{p.key} · {p.features.length} features</div></TD><TD className="text-right tabular-nums">{p.monthlyPriceKobo === null ? "Custom" : money(p.monthlyPriceKobo / 100)}</TD><TD className="text-right tabular-nums">{p.annualPriceKobo === null ? "Custom" : money(p.annualPriceKobo / 100)}</TD>
            <TD className="text-xs text-slate-600">{Object.entries(l).map(([k, v]) => `${v ?? "∞"} ${titleCase(k.replace(/([A-Z])/g, " $1")).toLowerCase()}`).join(" · ")}</TD><TD className="text-right">{p._count.subscriptions}</TD><TD><Badge tone={p.isActive && p.isPublic ? "success" : "neutral"}>{p.isActive ? (p.isPublic ? "Public" : "Hidden") : "Retired"}</Badge></TD>
            <TD className="text-right"><ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Edit ${p.name}`} action={updatePlanAction} extra={{ key: p.key }} wide>
              <FieldGrid><Field name="name" label="Name" required defaultValue={p.name} /><Field name="trialDays" label="Trial days" type="number" defaultValue={p.trialDays} /></FieldGrid><TextareaField name="description" label="Description" defaultValue={p.description ?? ""} rows={2} />
              <FieldGrid><Field name="monthlyNaira" label="Monthly price (₦)" type="number" min="0" defaultValue={p.monthlyPriceKobo === null ? "" : p.monthlyPriceKobo / 100} /><Field name="annualNaira" label="Annual price (₦)" type="number" min="0" defaultValue={p.annualPriceKobo === null ? "" : p.annualPriceKobo / 100} /></FieldGrid>
              <FieldGrid cols={3}>{(["shipmentsPerMonth", "drivers", "vehicles", "users", "branches"] as const).map((k) => <Field key={k} name={k} label={titleCase(k.replace(/([A-Z])/g, " $1"))} type="number" defaultValue={l[k] ?? ""} />)}</FieldGrid>
              <p className="text-sm font-medium">Features</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{FEATURES.map((f) => <CheckboxField key={f} name="features[]" value={f} label={f.replace(/_/g, " ")} defaultChecked={p.features.includes(f)} />)}</div>
              <div className="flex gap-6"><CheckboxField name="isActive" label="Active" defaultChecked={p.isActive} /><CheckboxField name="isPublic" label="Show on billing page" defaultChecked={p.isPublic} /></div></ModalForm></TD></TR>); })}</TBody></Table></Card>
    </>
  );
}
