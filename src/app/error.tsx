"use client";
import * as React from "react";
import Link from "next/link";

/** Catches unexpected errors in any route segment. Details are logged server-side; users only see a reference. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => { console.error("[ui-error]", error.digest ?? "", error.message); }, [error]);
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">We hit an unexpected problem loading this page. Your data is safe. Try again, and if it keeps happening contact support{error.digest ? ` quoting reference ${error.digest}` : ""}.</p>
      <div className="mt-6 flex gap-3"><button onClick={reset} className="btn-primary">Try again</button><Link href="/home" className="btn-secondary">Go to my home</Link></div>
    </main>
  );
}
