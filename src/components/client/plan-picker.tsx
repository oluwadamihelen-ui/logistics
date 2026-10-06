"use client";
import * as React from "react";
import { checkoutAction } from "@/app/(app)/billing/actions";
import { useToast } from "./toast";
import { money } from "@/lib/utils/format";

export interface PlanView { key: string; name: string; description: string | null; monthly: number | null; annual: number | null; features: string[]; limits: Record<string, number | null>; current: boolean }

const LIMIT_LABEL: Record<string, string> = { shipmentsPerMonth: "shipments / month", drivers: "drivers", vehicles: "vehicles", users: "staff users", branches: "branches" };

export function PlanPicker({ plans, paymentsReady, contactEmail }: { plans: PlanView[]; paymentsReady: boolean; contactEmail: string }) {
  const toast = useToast();
  const [interval, setInterval] = React.useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [busy, setBusy] = React.useState<string | null>(null);
  async function go(key: string) {
    setBusy(key);
    const r = await checkoutAction({ planKey: key, interval });
    setBusy(null);
    if (r.ok) window.location.href = r.data.url; else toast.push("error", r.error);
  }
  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm" role="group" aria-label="Billing interval">
        {(["MONTHLY", "ANNUAL"] as const).map((i) => <button key={i} onClick={() => setInterval(i)} className={`rounded-md px-4 py-1.5 font-medium ${interval === i ? "bg-white shadow-sm" : "text-slate-500"}`}>{i === "MONTHLY" ? "Monthly" : "Annual (2 months free)"}</button>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const price = interval === "ANNUAL" ? p.annual : p.monthly;
          return (
            <div key={p.key} className={`card flex flex-col p-5 ${p.current ? "ring-2 ring-brand" : ""}`}>
              <div className="flex items-center justify-between"><h3 className="text-base font-semibold">{p.name}</h3>{p.current && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">Current</span>}</div>
              <p className="mt-1 min-h-[2.5rem] text-xs text-slate-500">{p.description}</p>
              <p className="mt-3 text-2xl font-bold">{price === null ? "Custom" : money(price / 100)}<span className="text-sm font-normal text-slate-500">{price === null ? "" : interval === "ANNUAL" ? " / year" : " / month"}</span></p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-600">{Object.entries(p.limits).map(([k, v]) => <li key={k}>• {v === null || v < 0 ? "Unlimited" : v.toLocaleString()} {LIMIT_LABEL[k] ?? k}</li>)}</ul>
              <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">{p.features.length} features</summary><p className="mt-1">{p.features.map((f) => f.replace(/_/g, " ")).join(", ")}</p></details>
              {price === null ? <a className="btn-secondary mt-4" href={`mailto:${contactEmail}?subject=Enterprise plan`}>Contact sales</a>
                : <button className={p.current ? "btn-secondary mt-4" : "btn-primary mt-4"} disabled={busy !== null || !paymentsReady} onClick={() => go(p.key)}>{busy === p.key ? "Redirecting…" : p.current ? "Renew / extend" : "Choose plan"}</button>}
            </div>
          );
        })}
      </div>
      {!paymentsReady && <p className="mt-3 text-sm text-amber-800">Online payment isn&apos;t configured on this server (PAYSTACK_SECRET_KEY missing), so checkout is disabled.</p>}
    </div>
  );
}
