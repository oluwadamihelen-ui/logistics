"use client";
import * as React from "react";
import Link from "next/link";

export interface PricingPlan {
  key: string; name: string; description: string | null; monthly: number | null; annual: number | null; currency: string;
  limits: Record<string, number | null>; features: string[]; popular: boolean;
}

const LIMITS: [string, string][] = [["shipmentsPerMonth", "Shipments / month"], ["drivers", "Drivers & riders"], ["vehicles", "Vehicles"], ["users", "Staff users"], ["branches", "Branches"]];
const FEATURE_LABEL: Record<string, string> = {
  shipments: "Shipment booking & tracking", dispatch: "Dispatch board", drivers: "Driver management & app", fleet: "Fleet & vehicle records", customers: "Customer records",
  cod: "Cash on delivery tracking", invoices: "Invoices & payments", public_tracking: "Public tracking page", basic_reports: "Standard reports", support_desk: "Support desk",
  live_map: "Live driver map", routes: "Multi-stop routes", pricing_engine: "Pricing rules engine", customer_portal: "Customer portal", public_booking: "Public booking page",
  ai_assistant: "AI assistant", settlements: "Driver settlements", inventory: "Inventory", sms_notifications: "SMS notifications", corporate_accounts: "Corporate accounts",
  api_access: "Public API & webhooks", advanced_analytics: "Advanced analytics", ai_insights: "AI insights", whatsapp_notifications: "WhatsApp notifications", audit_log: "Audit log",
};
const ORDER = Object.keys(FEATURE_LABEL);

const fmt = (kobo: number, cur: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(kobo / 100);
const lim = (v: number | null | undefined) => (v === null || v === undefined || v < 0 ? "Unlimited" : v.toLocaleString());

function Check({ on }: { on: boolean }) {
  return on
    ? <svg className="mx-auto h-5 w-5 text-brand" viewBox="0 0 20 20" fill="currentColor" aria-label="Included"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
    : <span className="text-slate-300" aria-label="Not included">—</span>;
}

export function PricingSection({ plans, contactEmail }: { plans: PricingPlan[]; contactEmail: string }) {
  const [annual, setAnnual] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-medium" role="group" aria-label="Billing interval">
          <button onClick={() => setAnnual(false)} className={`rounded-full px-5 py-2 ${!annual ? "bg-white shadow-sm" : "text-slate-500"}`}>Monthly</button>
          <button onClick={() => setAnnual(true)} className={`rounded-full px-5 py-2 ${annual ? "bg-white shadow-sm" : "text-slate-500"}`}>Annual <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">2 months free</span></button>
        </div>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p, i) => {
          const custom = p.monthly === null;
          const perMonth = custom ? null : annual && p.annual ? Math.round(p.annual / 12) : p.monthly;
          const prev = i > 0 ? plans[i - 1] : null;
          const unique = prev ? p.features.filter((f) => !prev.features.includes(f)) : p.features;
          const shown = unique.slice(0, 7).map((f) => FEATURE_LABEL[f] ?? f.replace(/_/g, " "));
          return (
            <div key={p.key} className={`relative flex flex-col rounded-2xl border bg-white p-6 ${p.popular ? "border-brand shadow-xl ring-1 ring-brand xl:-mt-3 xl:pb-9" : "border-line shadow-sm"}`}>
              {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 min-h-[3rem] text-sm text-slate-500">{p.description}</p>
              <div className="mt-5">
                {custom ? <p className="text-3xl font-bold">Custom</p> : (
                  <>
                    <p className="flex items-baseline gap-1"><span className="text-4xl font-bold tracking-tight">{fmt(perMonth!, p.currency)}</span><span className="text-sm text-slate-500">/ month</span></p>
                    <p className="mt-1 h-5 text-xs text-slate-500">{annual && p.annual ? `Billed ${fmt(p.annual, p.currency)} yearly` : "Billed monthly"}</p>
                  </>
                )}
              </div>
              <Link href={custom ? `mailto:${contactEmail}?subject=Enterprise%20plan` : "/register"} className={`mt-5 w-full ${p.popular ? "btn-primary" : "btn-secondary"}`} data-plan={p.key}>{custom ? "Contact sales" : "Start 14-day free trial"}</Link>
              <ul className="mt-6 space-y-2.5 border-t border-slate-100 pt-5 text-sm text-slate-600">
                <li className="font-medium text-ink">{custom ? "Tailored limits" : `Up to ${lim(p.limits.shipmentsPerMonth)} shipments / month`}</li>
                {!custom && <li>{lim(p.limits.drivers)} drivers · {lim(p.limits.users)} staff users · {lim(p.limits.branches)} branch{p.limits.branches === 1 ? "" : "es"}</li>}
                {prev && <li className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Everything in {prev.name}, plus</li>}
                {shown.map((f) => <li key={f} className="flex gap-2"><svg className="mt-0.5 h-4 w-4 flex-none text-brand" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>{f}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">Prices in Nigerian Naira. No card needed to start your trial. Cancel any time.</p>

      <div className="mt-12 text-center">
        <button onClick={() => setShowAll((s) => !s)} className="btn-secondary" aria-expanded={showAll}>{showAll ? "Hide full comparison" : "Compare all features"}</button>
      </div>
      {showAll && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-line bg-slate-50 text-left"><th className="px-5 py-3 font-semibold">Feature</th>{plans.map((p) => <th key={p.key} className="px-4 py-3 text-center font-semibold">{p.name}</th>)}</tr></thead>
            <tbody>
              <tr><td colSpan={plans.length + 1} className="bg-slate-50/60 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Usage limits</td></tr>
              {LIMITS.map(([k, label]) => <tr key={k} className="border-t border-slate-100"><td className="px-5 py-3 text-slate-700">{label}</td>{plans.map((p) => <td key={p.key} className="px-4 py-3 text-center tabular-nums">{lim(p.limits[k])}</td>)}</tr>)}
              <tr><td colSpan={plans.length + 1} className="bg-slate-50/60 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Features</td></tr>
              {ORDER.map((f) => <tr key={f} className="border-t border-slate-100"><td className="px-5 py-3 text-slate-700">{FEATURE_LABEL[f]}</td>{plans.map((p) => <td key={p.key} className="px-4 py-3 text-center"><Check on={p.features.includes(f)} /></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
