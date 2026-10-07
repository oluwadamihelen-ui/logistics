"use client";
import * as React from "react";
import { simulateQuoteAction } from "@/app/(app)/finance/actions";
import { money } from "@/lib/utils/format";
import { Field, FieldGrid, SelectField } from "./form";

export function PricingSimulator({ zones, currency }: { zones: { id: string; name: string }[]; currency: string }) {
  const [res, setRes] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);
  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(null);
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    const r = await simulateQuoteAction(Object.fromEntries(Object.entries(fd).filter(([, v]) => v !== "")) as any);
    if (r.ok) setRes(r.data); else setErr(r.error);
  }
  return (
    <form onSubmit={run} className="space-y-3">
      <FieldGrid><SelectField name="originZoneId" label="Pickup zone" placeholder="Any" options={zones.map((z) => ({ value: z.id, label: z.name }))} /><SelectField name="destinationZoneId" label="Delivery zone" placeholder="Any" options={zones.map((z) => ({ value: z.id, label: z.name }))} /></FieldGrid>
      <FieldGrid><Field name="weightKg" label="Weight kg" type="number" step="0.1" defaultValue="2" /><SelectField name="priority" label="Priority" defaultValue="STANDARD" options={["STANDARD", "EXPRESS", "URGENT", "SAME_DAY"].map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase().replace("_", " ") }))} /><SelectField name="interstate" label="Interstate" placeholder="No" options={[{ value: "yes", label: "Yes" }]} /></FieldGrid>
      <FieldGrid><Field name="declaredValue" label="Declared value" type="number" /><Field name="codAmount" label="COD amount" type="number" /></FieldGrid>
      <button className="btn-secondary">Calculate</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res && (res.matched ? <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="mb-1 text-xs text-slate-500">Matched: {res.ruleName}</p>{res.lines.map((l: any) => <div key={l.label} className="flex justify-between"><span>{l.label}</span><span>{money(l.amount, currency)}</span></div>)}<div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{money(res.total, currency)}</span></div></div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No active rule matches — customers would not get an automatic price.</p>)}
    </form>
  );
}
