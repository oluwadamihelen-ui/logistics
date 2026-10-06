import Link from "next/link";
import { signOutLink } from "./signout";
import { requirePlatformPage } from "@/lib/platform/context";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform admin" };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePlatformPage();
  const nav = [["/platform", "Overview"], ["/platform/companies", "Companies"], ["/platform/plans", "Plans"], ["/platform/payments", "Payments"], ["/platform/settings", "Settings"]];
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-6 bg-ink px-6 py-3 text-white">
        <span className="font-semibold">{brand.APP_NAME} <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase">Platform</span></span>
        <nav className="flex gap-4 text-sm">{nav.map(([h, l]) => <Link key={h} href={h} className="text-slate-300 hover:text-white">{l}</Link>)}</nav>
        <span className="ml-auto text-xs text-slate-300">{u.name} · {signOutLink}</span>
      </header>
      <main className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
