import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-bold text-slate-300">403</p>
      <h1 className="mt-3 text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-1 max-w-md text-sm text-slate-500">Your role doesn&apos;t include this permission. If you think this is a mistake, ask your company administrator.</p>
      <Link href="/" className="btn-primary mt-6">Go to my home</Link>
    </main>
  );
}
