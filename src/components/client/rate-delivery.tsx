"use client";
import * as React from "react";
import { rateDeliveryAction } from "@/app/track/[trackingNumber]/actions";

export function RateDelivery({ trackingNumber, already }: { trackingNumber: string; already: boolean }) {
  const [score, setScore] = React.useState(0);
  const [done, setDone] = React.useState(already);
  const [err, setErr] = React.useState<string | null>(null);
  if (done) return <p className="mt-5 text-sm text-slate-600">Thanks for rating your delivery.</p>;
  return (
    <form className="mt-5 rounded-lg border border-line p-4" onSubmit={async (e) => { e.preventDefault(); if (!score) return setErr("Choose a star rating."); const comment = String(new FormData(e.currentTarget).get("comment") ?? ""); const r = await rateDeliveryAction({ trackingNumber, score, comment: comment || undefined }); if (r.ok) setDone(true); else setErr(r.error); }}>
      <p className="text-sm font-medium">How was your delivery?</p>
      <div className="my-2 flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={score === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setScore(n)} className={`text-2xl ${n <= score ? "text-amber-500" : "text-slate-300"}`}>★</button>)}</div>
      <input name="comment" className="input" placeholder="Comments (optional)" maxLength={300} />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <button className="btn-primary mt-3">Submit rating</button>
    </form>
  );
}
