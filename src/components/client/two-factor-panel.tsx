"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { beginTwoFactorAction, confirmTwoFactorAction, disableTwoFactorAction } from "@/app/(app)/settings/security-actions";
import { useToast } from "./toast";

export function TwoFactorPanel({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const router = useRouter(); const toast = useToast();
  const [setup, setSetup] = React.useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function begin() { setBusy(true); const r = await beginTwoFactorAction(); setBusy(false); if (r.ok) { setSetup(r.data); setErr(null); } else toast.push("error", r.error); }
  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await confirmTwoFactorAction({ code: String(new FormData(e.currentTarget).get("code")) });
    setBusy(false);
    if (r.ok) { setCodes(r.data.recoveryCodes); setSetup(null); router.refresh(); } else setErr(r.error);
  }
  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const fd = new FormData(e.currentTarget);
    const r = await disableTwoFactorAction({ password: String(fd.get("password")), code: String(fd.get("code")) });
    setBusy(false);
    if (r.ok) { toast.push("success", "Two-factor authentication turned off"); router.refresh(); } else setErr(r.error);
  }

  if (codes) return (
    <div className="space-y-3"><p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Two-factor authentication is on. Save these recovery codes now — each works once if you lose your phone, and they won&apos;t be shown again.</p>
      <pre className="rounded-lg bg-slate-900 p-4 text-sm text-emerald-300">{codes.join("\n")}</pre>
      <button className="btn-primary" onClick={() => setCodes(null)}>I&apos;ve saved them</button></div>
  );
  if (enabled) return (
    <form onSubmit={disable} className="space-y-3">
      <p className="text-sm text-emerald-700">✓ Two-factor authentication is on ({recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left).</p>
      {err && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
      <p className="text-xs text-slate-500">To turn it off, confirm your password and a current code.</p>
      <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="pw2">Password</label><input id="pw2" name="password" type="password" required className="input" autoComplete="current-password" /></div><div><label className="label" htmlFor="cd2">Code</label><input id="cd2" name="code" required className="input font-mono" inputMode="numeric" autoComplete="one-time-code" /></div></div>
      <button className="btn-danger" disabled={busy}>Turn off two-factor</button>
    </form>
  );
  if (setup) return (
    <form onSubmit={confirm} className="space-y-3">
      <p className="text-sm text-slate-600">Scan this QR code with Google Authenticator, Microsoft Authenticator, Authy or 1Password, then enter the 6-digit code.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="Two-factor QR code" className="h-44 w-44 rounded border border-line" />
      <p className="text-xs text-slate-500">Can&apos;t scan? Enter this key manually: <span className="font-mono">{setup.secret}</span></p>
      {err && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
      <div className="max-w-xs"><label className="label" htmlFor="cd">6-digit code</label><input id="cd" name="code" required className="input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={8} /></div>
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>Verify and turn on</button><button type="button" className="btn-secondary" onClick={() => setSetup(null)}>Cancel</button></div>
    </form>
  );
  return (<div className="space-y-3"><p className="text-sm text-slate-600">Add a second step at sign-in using an authenticator app. Recommended for owners, admins and finance staff.</p><button className="btn-primary" onClick={begin} disabled={busy}>Set up two-factor</button></div>);
}
