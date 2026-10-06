import { redirect } from "next/navigation";
import Image from "next/image";
import { brand } from "@/config/brand";
import { normalizeTracking } from "@/lib/logistics/tracking";

export const metadata = { title: "Track a shipment" };

async function go(formData: FormData) {
  "use server";
  const n = normalizeTracking(String(formData.get("tn") ?? ""));
  if (n.length >= 6 && n.length <= 20) redirect(`/track/${n}`);
  redirect("/track?error=1");
}

export default async function TrackHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-white">
      <Image src={brand.APP_LOGO} alt="" width={44} height={44} unoptimized />
      <h1 className="mt-4 text-3xl font-semibold">Track your shipment</h1>
      <p className="mt-2 text-sm text-slate-300">Enter the tracking number from your confirmation message.</p>
      <form action={go} className="mt-8 flex w-full max-w-md gap-2">
        <input name="tn" required autoFocus placeholder="e.g. SDK7M2P9XQ4" className="input !border-transparent text-ink" aria-label="Tracking number" />
        <button className="btn-primary !bg-accent hover:!bg-accent/90">Track</button>
      </form>
      {sp.error && <p className="mt-3 text-sm text-red-300">That doesn&apos;t look like a valid tracking number.</p>}
    </main>
  );
}
