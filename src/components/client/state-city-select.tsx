"use client";
import * as React from "react";
import { Modal } from "./form";
import { addCityAction } from "@/app/(app)/hubs/actions";
import { NG_STATES, citiesFor } from "@/lib/locations/ng";
import { useToast } from "./toast";

/**
 * State drop-down + dependent city drop-down. Field names are `${prefix}State` / `${prefix}City` so it plugs into the
 * existing forms. Admins (canAdd) get an "Add a missing city" shortcut that saves it for the whole company.
 */
export function StateCitySelect({ prefix, custom, canAdd, defaultState = "", defaultCity = "", required = true, stateLabel = "State", cityLabel = "City / area", freeText = false, stateName, cityName, onChange }: {
  prefix: string; custom: Record<string, string[]>; canAdd: boolean; defaultState?: string; defaultCity?: string; required?: boolean; stateLabel?: string; cityLabel?: string; freeText?: boolean; stateName?: string; cityName?: string; onChange?: () => void;
}) {
  const toast = useToast();
  const [state, setState] = React.useState(defaultState);
  const [city, setCity] = React.useState(defaultCity);
  const [added, setAdded] = React.useState<Record<string, string[]>>({});
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const options = React.useMemo(() => citiesFor(state, [...(custom[state] ?? []), ...(added[state] ?? [])]), [state, custom, added]);
  const sid = stateName ?? `${prefix}State`, cid = cityName ?? `${prefix}City`;

  async function add() {
    setBusy(true);
    const r = await addCityAction({ state, name });
    setBusy(false);
    if (!r.ok) { toast.push("error", r.error); return; }
    setAdded((a) => ({ ...a, [state]: [...(a[state] ?? []), r.data.name] }));
    setCity(r.data.name); setOpen(false); setName("");
    toast.push("success", `${r.data.name} added to ${state}`);
    setTimeout(() => onChange?.(), 0);
  }

  if (freeText) {
    // Drop-down lists only exist for Nigeria; other countries type the values.
    return (
      <>
        <div><label htmlFor={cid} className="label">{cityLabel}{required && <span className="text-red-500"> *</span>}</label><input id={cid} name={cid} required={required} className="input" defaultValue={defaultCity} /></div>
        <div><label htmlFor={sid} className="label">{stateLabel}{required && <span className="text-red-500"> *</span>}</label><input id={sid} name={sid} required={required} className="input" defaultValue={defaultState} /></div>
      </>
    );
  }

  return (
    <>
      <div>
        <label htmlFor={sid} className="label">{stateLabel}{required && <span className="text-red-500"> *</span>}</label>
        <select id={sid} name={sid} required={required} className="input" value={state} onChange={(e) => { setState(e.target.value); setCity(""); onChange?.(); }}>
          <option value="">Select state…</option>
          {NG_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor={cid} className="label">{cityLabel}{required && <span className="text-red-500"> *</span>}</label>
          {canAdd && state && <button type="button" className="mb-1 text-xs font-medium text-brand hover:underline" onClick={() => setOpen(true)}>City missing? Add it</button>}
        </div>
        <select id={cid} name={cid} required={required} className="input" value={city} disabled={!state} onChange={(e) => { setCity(e.target.value); onChange?.(); }}>
          <option value="">{state ? "Select city…" : "Choose a state first"}</option>
          {options.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {!canAdd && state && <p className="mt-1 text-xs text-slate-500">City not listed? Ask an admin to add it.</p>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Add a city in ${state}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">It will be available in every shipment form for your company.</p>
          <div>
            <label className="label" htmlFor={`${prefix}-newcity`}>City / area name</label>
            <input id={`${prefix}-newcity`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim().length >= 2) void add(); } }} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy || name.trim().length < 2} onClick={add}>{busy ? "Adding…" : "Add city"}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
