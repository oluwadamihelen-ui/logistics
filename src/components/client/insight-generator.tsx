"use client";
import * as React from "react";
import { generateInsightsAction } from "@/app/(app)/analytics/actions";
import { useToast } from "./toast";

export function InsightGenerator({ enabled, reason }: { enabled: boolean; reason?: string }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<{ ai: { analysis: string; recommendation: string }[] | null; aiStatus: string } | null>(null);
  async function run() { setBusy(true); const r = await generateInsightsAction({}); setBusy(false); if (r.ok) setRes(r.data); else toast.push("error", r.error); }
  return (
    <div>
      <button className="btn-primary" disabled={!enabled || busy} onClick={run}>{busy ? "Analysing…" : "Generate AI analysis"}</button>
      {!enabled && <p className="mt-2 text-sm text-amber-800">{reason}</p>}
      {res?.aiStatus === "insufficient_data" && <p className="mt-3 text-sm text-slate-600">There are no statistically meaningful findings yet, so no AI analysis was generated.</p>}
      {res?.aiStatus === "failed" && <p className="mt-3 text-sm text-red-700">The AI provider didn&apos;t return a usable analysis. Try again.</p>}
      {res?.ai?.map((x, i) => (
        <div key={i} className="mt-3 rounded-lg border border-line p-4 text-sm">
          <p><span className="mr-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold uppercase text-indigo-700">AI analysis</span>{x.analysis}</p>
          <p className="mt-2"><span className="mr-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold uppercase text-emerald-700">Recommendation</span>{x.recommendation}</p>
        </div>))}
    </div>
  );
}
