"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resetPasswordAction } from "./actions";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) return setErr("Passwords don't match.");
    setBusy(true); setErr(null);
    const r = await resetPasswordAction({ token, password: String(fd.get("password")) });
    setBusy(false);
    if (r.ok) setDone(true); else setErr(r.error);
  }
  if (done) return <><h1 className="text-2xl font-semibold">Password updated</h1><p className="mt-3 text-sm text-slate-600">You&apos;ve been signed out everywhere. Sign in with your new password.</p><Link href="/login" className="btn-primary mt-6">Sign in</Link></>;
  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
        <div><label className="label" htmlFor="password">New password</label><input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /><p className="mt-1 text-xs text-slate-500">At least 10 characters, with letters and numbers.</p></div>
        <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" /></div>
        <button className="btn-primary w-full" disabled={busy || !token}>{busy ? "Saving…" : "Update password"}</button>
      </form>
    </>
  );
}
export default function ResetPassword() { return <Suspense><Form /></Suspense>; }
