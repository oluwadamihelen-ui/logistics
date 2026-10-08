"use client";
import { PasswordInput } from "./form";
import * as React from "react";
import { signOut } from "next-auth/react";
import { useToast } from "./toast";

export function ChangePassword({ action }: { action: (i: { current: string; next: string }) => Promise<{ ok: boolean; error?: string }> }) {
  const toast = useToast();
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    if (fd.get("next") !== fd.get("confirm")) return setErr("New passwords don't match.");
    setBusy(true); setErr(null);
    const r = await action({ current: String(fd.get("current")), next: String(fd.get("next")) });
    setBusy(false);
    if (r.ok) { toast.push("success", "Password changed. Please sign in again."); await signOut({ callbackUrl: "/login" }); } else setErr(r.error ?? "Could not change password");
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
      <div><label className="label" htmlFor="current">Current password</label><PasswordInput id="current" name="current" required autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="next">New password</label><PasswordInput id="next" name="next" required minLength={10} autoComplete="new-password" /></div>
      <div><label className="label" htmlFor="confirm">Confirm new password</label><PasswordInput id="confirm" name="confirm" required autoComplete="new-password" /></div>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
