import Link from "next/link";
import { requirePortalPage } from "@/lib/platform/portal";
import { prisma } from "@/lib/platform/db";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer portal" };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalPage();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true } });
  const nav: [string, string][] = [["/portal", "Overview"], ["/portal/shipments", "Shipments"], ["/portal/invoices", "Invoices & COD"], ["/portal/support", "Support"], ...(ctx.can("portal.team.manage") ? [["/portal/team", "Team"] as [string, string]] : [])];
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-6 bg-ink px-6 py-3 text-white"><span className="font-semibold">{company.name}</span><nav className="flex gap-4 text-sm">{nav.map(([h, l]) => <Link key={h} href={h} className="text-slate-300 hover:text-white">{l}</Link>)}</nav><span className="ml-auto text-xs text-slate-300">{ctx.user.name} · <Link href="/api/auth/signout" className="underline">Sign out</Link> · <span className="opacity-60">powered by {brand.APP_NAME}</span></span></header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
