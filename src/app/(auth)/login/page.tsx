"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { brand } from "@/config/brand";

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  LOCKED: "This account is temporarily locked after repeated failed sign-ins. Try again in 15 minutes.",
  COMPANY_SUSPENDED: "This company account is suspended. Please contact support.",
  CredentialsSignin: "Incorrect email or password.",
  TOTP_INVALID: "That code is incorrect. Try again or use a recovery code.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const res = await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), totp: fd.get("totp") ?? "", redirect: false });
    setPending(false);
    if (res?.error === "TOTP_REQUIRED") { setNeedTotp(true); return; }
    if (res?.error) { setError(MESSAGES[res.error] ?? "Incorrect email or password."); return; }
    const cb = params.get("callbackUrl");
    router.push(cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/home");
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to your {brand.APP_NAME} workspace.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div><label htmlFor="email" className="label">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="input" readOnly={needTotp} /></div>
        <div><label htmlFor="password" className="label">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="input" readOnly={needTotp} /></div>
        {needTotp && <div><label htmlFor="totp" className="label">Authentication code</label><input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" autoFocus required className="input text-center font-mono text-lg tracking-widest" placeholder="123456" /><p className="mt-1 text-xs text-slate-500">From your authenticator app, or one of your recovery codes.</p></div>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : needTotp ? "Verify and sign in" : "Sign in"}</button>
      </form>
      <p className="mt-3 text-center text-sm"><Link className="text-slate-500 hover:text-brand" href="/forgot-password">Forgot your password?</Link></p>
      <p className="mt-6 text-center text-sm text-slate-500">New logistics company? <Link className="font-medium text-brand" href="/register">Start your free trial</Link></p>
      <p className="mt-2 text-center text-sm text-slate-500">Tracking a parcel? <Link className="font-medium text-brand" href="/track">Track a shipment</Link></p>
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
