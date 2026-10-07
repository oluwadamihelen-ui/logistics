"use client";
import * as React from "react";
import { Field, FieldGrid, SelectField, TextareaField, Form } from "./form";
import { money } from "@/lib/utils/format";
import { useToast } from "./toast";
import { StateCitySelect } from "./state-city-select";

interface Quote { matched: boolean; total: number; ruleName: string | null; lines: { label: string; amount: number }[] }
type ActionFn = (i: any) => Promise<any>;

/** Shared by the customer portal and the public booking page. Server actions decide who may call them. */
export function BookingForm({ quoteAction, bookAction, currency, honeypot, mode, extra, customCities = {}, freeTextLocations = false }: { quoteAction: ActionFn; bookAction: ActionFn; currency: string; honeypot?: boolean; mode: "portal" | "public"; extra?: Record<string, unknown>; customCities?: Record<string, string[]>; freeTextLocations?: boolean }) {
  const toast = useToast();
  const ref = React.useRef<HTMLDivElement>(null);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const val = (n: string) => ref.current?.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value ?? "";
  async function getQuote() {
    const r = await quoteAction({ ...extra, pickupCity: val("pickupCity"), pickupState: val("pickupState"), deliveryCity: val("deliveryCity"), deliveryState: val("deliveryState"), weightKg: val("weightKg") || 1, priority: val("priority") || "STANDARD", packageType: val("packageType") || "PARCEL", declaredValue: val("declaredValue") || 0, codAmount: 0 });
    if (r.ok) setQuote(r.data); else toast.push("error", r.error);
  }
  if (result && mode === "public") return (
    <div className="card p-8 text-center"><h2 className="text-lg font-semibold">Pickup booked</h2><p className="mt-1 text-sm text-slate-500">Your tracking number</p><p className="my-2 font-mono text-2xl font-bold tracking-wider">{result.trackingNumber}</p><p className="text-sm text-slate-600">Keep this number to follow your delivery. Payment is arranged with the courier at pickup.</p><a className="btn-primary mt-4" href={`/track/${result.trackingNumber}`}>Track this shipment</a></div>
  );
  return (
    <div ref={ref}>
      <Form action={bookAction} extra={extra} submitLabel="Book pickup" onSuccess={setResult} redirectTo={mode === "portal" ? "/portal/shipments/{id}" : undefined} successMessage={mode === "portal" ? "Pickup booked" : ""}>
        {honeypot && <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card space-y-4 p-5"><h3 className="text-sm font-semibold">Sender & pickup</h3><Field name="senderName" label="Name" required /><FieldGrid><Field name="senderPhone" label="Phone" type="tel" required /><Field name="senderEmail" label="Email" type="email" /></FieldGrid><Field name="pickupAddress" label="Pickup address" required /><FieldGrid><StateCitySelect prefix="pickup" custom={customCities} canAdd={false} defaultState={freeTextLocations ? "" : "Lagos"} freeText={freeTextLocations} /></FieldGrid></section>
          <section className="card space-y-4 p-5"><h3 className="text-sm font-semibold">Recipient</h3><Field name="recipientName" label="Name" required /><FieldGrid><Field name="recipientPhone" label="Phone" type="tel" required /><Field name="recipientEmail" label="Email" type="email" /></FieldGrid><Field name="deliveryAddress" label="Delivery address" required /><FieldGrid><StateCitySelect prefix="delivery" custom={customCities} canAdd={false} defaultState={freeTextLocations ? "" : "Lagos"} freeText={freeTextLocations} /></FieldGrid></section>
        </div>
        <section className="card space-y-4 p-5"><h3 className="text-sm font-semibold">Package & service</h3><Field name="packageDescription" label="What are you sending?" required />
          <FieldGrid cols={3}><SelectField name="packageType" label="Type" defaultValue="PARCEL" options={["DOCUMENT", "PARCEL", "FRAGILE", "FOOD", "PHARMACY", "GROCERY", "ELECTRONICS", "OTHER"].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }))} /><Field name="weightKg" label="Weight (kg)" type="number" step="0.1" min="0.1" defaultValue="1" /><SelectField name="priority" label="Service" defaultValue="STANDARD" options={[{ value: "STANDARD", label: "Standard" }, { value: "EXPRESS", label: "Express" }, { value: "SAME_DAY", label: "Same day" }]} /></FieldGrid>
          <FieldGrid><Field name="declaredValue" label={`Declared value (${currency})`} type="number" min="0" defaultValue="0" /><TextareaField name="specialInstructions" label="Instructions for the rider" rows={2} /></FieldGrid></section>
        <section className="card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Estimated delivery fee</h3><p className="text-xs text-slate-500">Final fee is calculated when you book, from the company&apos;s price list.</p></div><button type="button" className="btn-secondary" onClick={getQuote}>Get price</button></div>
          {quote && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{quote.matched ? <>{quote.lines.map((l) => <div key={l.label} className="flex justify-between"><span>{l.label}</span><span>{money(l.amount, currency)}</span></div>)}<div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{money(quote.total, currency)}</span></div></> : <p className="text-amber-800">We can&apos;t price this route automatically. Please contact the company to arrange this delivery.</p>}</div>}</section>
      </Form>
    </div>
  );
}
