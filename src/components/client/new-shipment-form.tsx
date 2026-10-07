"use client";
import * as React from "react";
import { Form, Field, FieldGrid, SelectField, TextareaField } from "./form";
import { createShipmentAction, quoteAction } from "@/app/(app)/shipments/actions";
import { useToast } from "./toast";
import { money } from "@/lib/utils/format";

interface Cust { id: string; name: string; phone: string; email: string | null }
interface Quote { matched: boolean; total: number; ruleName: string | null; lines: { label: string; amount: number }[] }

export function NewShipmentForm({ customers, branches, pickupPoints, currency, canOverride, defaultCustomerId }: { customers: Cust[]; branches: { id: string; name: string }[]; pickupPoints: { id: string; name: string; address: string }[]; currency: string; canOverride: boolean; defaultCustomerId?: string }) {
  const toast = useToast();
  const ref = React.useRef<HTMLDivElement>(null);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [method, setMethod] = React.useState<"HOME_DELIVERY" | "HUB_PICKUP">("HOME_DELIVERY");
  const pickup = method === "HUB_PICKUP";

  const el = (n: string) => ref.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`) ?? null;
  function onCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    const set = (n: string, v: string) => { const e = el(n); if (e && !e.value) e.value = v; };
    set("senderName", c.name); set("senderPhone", c.phone); if (c.email) set("senderEmail", c.email);
  }
  async function getQuote() {
    const g = (n: string) => el(n)?.value ?? "";
    setLoading(true);
    const res = await quoteAction({ pickupCity: g("pickupCity"), pickupState: g("pickupState"), deliveryCity: g("deliveryCity") || undefined, deliveryState: g("deliveryState") || undefined, deliveryMethod: method, collectionHubId: g("collectionHubId") || undefined, weightKg: g("weightKg") || 1, priority: g("priority") || "STANDARD", packageType: g("packageType") || "PARCEL", declaredValue: g("declaredValue") || 0, codAmount: g("codAmount") || 0, customerId: g("customerId") || undefined } as any);
    setLoading(false);
    if (res.ok) setQuote(res.data as Quote); else toast.push("error", res.error);
  }

  return (
    <div ref={ref}>
      <Form action={createShipmentAction} submitLabel="Create shipment" redirectTo={(d: any) => `/shipments/${d.id}`} successMessage="Shipment created">
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-semibold">Customer & branch</h3>
          <FieldGrid>
            <div>
              <label className="label" htmlFor="customerId">Customer account (optional)</label>
              <select id="customerId" name="customerId" className="input" defaultValue={defaultCustomerId ?? ""} onChange={(e) => onCustomer(e.target.value)}>
                <option value="">Walk-in / no account</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </select>
            </div>
            <SelectField name="branchId" label="Origin branch" placeholder="Not specified" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </FieldGrid>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card space-y-4 p-5">
            <h3 className="text-sm font-semibold">Sender & pickup</h3>
            <Field name="senderName" label="Sender name" required />
            <FieldGrid><Field name="senderPhone" label="Phone" type="tel" required /><Field name="senderEmail" label="Email" type="email" /></FieldGrid>
            <Field name="pickupAddress" label="Pickup address" required />
            <FieldGrid><Field name="pickupCity" label="City / area" required /><Field name="pickupState" label="State" required defaultValue="Lagos" /></FieldGrid>
            <Field name="pickupScheduledAt" label="Pickup time (optional)" type="datetime-local" />
          </section>
          <section className="card space-y-4 p-5">
            <h3 className="text-sm font-semibold">Recipient & delivery</h3>
            <Field name="recipientName" label="Recipient name" required />
            <FieldGrid><Field name="recipientPhone" label="Phone" type="tel" required /><Field name="recipientEmail" label="Email" type="email" /></FieldGrid>
            <div>
              <label className="label" htmlFor="deliveryMethod">How will the recipient receive it?</label>
              <select id="deliveryMethod" name="deliveryMethod" className="input" value={method} onChange={(e) => setMethod(e.target.value as "HOME_DELIVERY" | "HUB_PICKUP")}>
                <option value="HOME_DELIVERY">Home / address delivery</option>
                <option value="HUB_PICKUP" disabled={pickupPoints.length === 0}>Recipient collects at a hub / pickup point{pickupPoints.length === 0 ? " (none set up)" : ""}</option>
              </select>
              {pickupPoints.length === 0 && <p className="mt-1 text-xs text-slate-500">Enable “customer collection” on a hub under Hubs &amp; branches to offer pickup.</p>}
            </div>
            {pickup ? (
              <SelectField name="collectionHubId" label="Collection point" required placeholder="Choose where they will collect" options={pickupPoints.map((p) => ({ value: p.id, label: `${p.name}${p.address ? ` — ${p.address}` : ""}` }))} hint="The recipient gets a collection code by SMS/email once it is ready, and must show it with ID." />
            ) : (
              <>
                <Field name="deliveryAddress" label="Delivery address" required />
                <FieldGrid><Field name="deliveryCity" label="City / area" required /><Field name="deliveryState" label="State" required defaultValue="Lagos" /></FieldGrid>
              </>
            )}
            <TextareaField name="specialInstructions" label="Special instructions" rows={2} />
          </section>
        </div>
        <section className="card space-y-4 p-5">
          <h3 className="text-sm font-semibold">Package & service</h3>
          <Field name="packageDescription" label="Package description" required />
          <FieldGrid cols={3}>
            <SelectField name="packageType" label="Package type" defaultValue="PARCEL" options={["DOCUMENT", "PARCEL", "FRAGILE", "FOOD", "PHARMACY", "GROCERY", "ELECTRONICS", "FREIGHT", "OTHER"].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }))} />
            <Field name="weightKg" label="Weight (kg)" type="number" step="0.1" min="0" defaultValue="1" />
            <Field name="quantity" label="Quantity" type="number" min="1" defaultValue="1" />
            <SelectField name="priority" label="Priority" defaultValue="STANDARD" options={[{ value: "STANDARD", label: "Standard" }, { value: "EXPRESS", label: "Express" }, { value: "URGENT", label: "Urgent" }, { value: "SAME_DAY", label: "Same day" }]} />
            <Field name="declaredValue" label={`Declared value (${currency})`} type="number" min="0" step="0.01" defaultValue="0" />
            <Field name="codAmount" label={`Cash on delivery (${currency})`} type="number" min="0" step="0.01" defaultValue="0" hint="Amount the rider collects from the recipient" />
          </FieldGrid>
          <FieldGrid cols={3}>
            <Field name="lengthCm" label="Length (cm)" type="number" min="0" /><Field name="widthCm" label="Width (cm)" type="number" min="0" /><Field name="heightCm" label="Height (cm)" type="number" min="0" />
          </FieldGrid>
          <SelectField name="feePayer" label="Delivery fee paid by" defaultValue="SENDER" options={[{ value: "SENDER", label: "Sender" }, { value: "RECIPIENT", label: "Recipient" }]} />
        </section>
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-semibold">Delivery fee</h3><p className="text-xs text-slate-500">Calculated from your pricing rules when the shipment is created.</p></div>
            <button type="button" className="btn-secondary" onClick={getQuote} disabled={loading}>{loading ? "Calculating…" : "Preview price"}</button>
          </div>
          {quote && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
              {quote.matched ? (
                <>
                  <p className="mb-2 text-xs text-slate-500">Rule: {quote.ruleName}</p>
                  {quote.lines.map((l) => <div key={l.label} className="flex justify-between py-0.5"><span>{l.label}</span><span className="tabular-nums">{money(l.amount, currency)}</span></div>)}
                  <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{money(quote.total, currency)}</span></div>
                </>
              ) : <p className="text-amber-800">No pricing rule matches this route/package. Add a rule under Pricing, or enter a manual fee below.</p>}
            </div>
          )}
          {canOverride && <div className="mt-4 max-w-xs"><Field name="deliveryFeeOverride" label="Manual fee override (optional)" type="number" min="0" step="0.01" hint="Replaces the calculated fee. Recorded in the audit log." /></div>}
        </section>
        <TextareaField name="notes" label="Internal notes" rows={2} />
      </Form>
    </div>
  );
}
