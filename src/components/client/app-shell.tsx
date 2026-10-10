"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Icon } from "./icon";
import { PushRegistrar, unregisterPush } from "./push-registrar";
import { cn } from "@/lib/utils/format";
import { brand } from "@/config/brand";

export interface ShellNavGroup { label: string; items: { href: string; label: string; icon: string; locked?: boolean }[] }

export function AppShell({ brandName, logo, companyName, userName, roleLabel, nav, unread, banner, children }: {
  brandName: string; logo: string; companyName: string; userName: string; roleLabel: string; nav: ShellNavGroup[]; unread: number;
  banner?: { tone: "info" | "warning" | "danger"; text: string; href?: string } | null; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  React.useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col bg-ink text-slate-300">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Image src={logo} alt="" width={28} height={28} unoptimized />
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{brandName}</p><p className="truncate text-xs text-slate-400">{companyName}</p></div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {nav.map((g) => (
          <div key={g.label}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
            {g.items.map((i) => {
              const active = pathname === i.href || pathname.startsWith(i.href + "/");
              return (
                <Link key={i.href} href={i.href} className={cn("group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition", active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white")}>
                  <Icon name={i.icon} className={cn("h-4 w-4", active ? "text-accent" : "text-slate-400 group-hover:text-slate-200")} />
                  <span className="flex-1">{i.label}</span>
                  {i.locked && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">Upgrade</span>}
                  {i.href === "/notifications" && unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="btn-ghost -ml-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" className="h-5 w-5" /></button>
        <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }} role="search">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search tracking no., phone, customer, driver…" aria-label="Global search" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/notifications" className="btn-ghost relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <Icon name="bell" className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
          </Link>
          <div className="hidden px-2 text-right sm:block"><p className="text-sm font-medium leading-tight">{userName}</p><p className="text-xs text-slate-500">{roleLabel}</p></div>
          <button className="btn-ghost" onClick={async () => { await unregisterPush(); await signOut({ callbackUrl: "/login" }); }} aria-label="Sign out"><Icon name="logout" className="h-4 w-4" /></button>
        </div>
      </header>
      {banner && (
        <div className={cn("px-4 py-2 text-center text-sm sm:px-6", banner.tone === "info" && "bg-blue-50 text-blue-900", banner.tone === "warning" && "bg-amber-50 text-amber-900", banner.tone === "danger" && "bg-red-50 text-red-900")}>
          {banner.text} {banner.href && <Link href={banner.href} className="font-semibold underline">Manage subscription</Link>}
        </div>
      )}
      <PushRegistrar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-4 pb-8 pt-2 text-xs text-slate-400 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4">
          <span>{brand.APP_NAME} is a product of <Link href="/about" className="font-medium text-slate-500 hover:underline">{brand.COMPANY_NAME}</Link></span>
          <span className="ml-auto flex gap-4"><Link href="/terms" className="hover:underline">Terms</Link><Link href="/privacy" className="hover:underline">Privacy</Link><a href={`mailto:${brand.SUPPORT_EMAIL}`} className="hover:underline">Support</a></span>
        </div>
      </footer>
    </div>
  );
}
