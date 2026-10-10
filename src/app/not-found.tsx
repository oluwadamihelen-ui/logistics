import Link from "next/link";
import Image from "next/image";
import { brand } from "@/config/brand";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <Image src={brand.APP_LOGO} alt="" width={48} height={48} unoptimized />
      <p className="mt-6 text-sm font-semibold text-brand">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">We can&apos;t find that page</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">The link may be wrong or the page may have moved. Tracking a parcel? Use the tracking page.</p>
      <div className="mt-6 flex gap-3"><Link href="/home" className="btn-primary">Go to my home</Link><Link href="/track" className="btn-secondary">Track a shipment</Link></div>
    </main>
  );
}
