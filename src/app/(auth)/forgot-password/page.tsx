"use client";
import { useState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "./actions";

export default function ForgotPassword() {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const r = await forgotPasswordAction({ email: String(new FormData(e.currentTarget).get("email")) });
    setBusy(false);
    if (r.ok) setState("sent"); else { setState("error"); setMsg(r.error); }
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {state === "sent" ? <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">If an account exists for that email, we&apos;ve sent a reset link. It expires in 1 hour.</p> : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-slate-500">Enter your email and we&apos;ll send you a link to choose a new password.</p>
          {state === "error" && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div>}
          <div><label htmlFor="email" className="label">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>)}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="font-medium text-brand">Back to sign in</Link></p>
    </>
  );
}
