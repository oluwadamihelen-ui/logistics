"use client";
import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { demoCredentialsAction, listDemoAccountsAction } from "./demo-actions";

/** One-click demo sign-ins. Renders nothing outside demo mode. */
export function DemoPanel() {
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<{ key: string; label: string; blurb: string }[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { listDemoAccountsAction().then(setAccounts).catch(() => undefined); }, []);
  if (!accounts.length) return null;

  async function go(key: string) {
    setBusy(key); setError(null);
    const c = await demoCredentialsAction({ key });
    if (!c.ok) { setError(c.error); setBusy(null); return; }
    const res = await signIn("credentials", { email: c.data.email, password: c.data.password, totp: "", redirect: false });
    if (res?.error) { setError("The demo is being refreshed. Please try again in a minute."); setBusy(null); return; }
    router.push("/home"); router.refresh();
  }

  return (
    <div className="mb-8 rounded-xl border border-brand/20 bg-brand-soft/60 p-4">
      <p className="text-sm font-semibold">Try the live demo</p>
      <p className="mt-0.5 text-xs text-slate-600">Pick a role. No sign-up needed. It runs on sample data that resets every day.</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => (
          <button key={a.key} type="button" disabled={busy !== null} onClick={() => go(a.key)} className="rounded-lg border border-line bg-white px-3 py-2 text-left transition hover:border-brand disabled:opacity-60">
            <span className="block text-sm font-medium">{busy === a.key ? "Signing in…" : a.label}</span>
            <span className="block text-xs text-slate-500">{a.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
