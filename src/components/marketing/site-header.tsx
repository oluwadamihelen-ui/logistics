"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";

const LINKS: [string, string][] = [["Features", "/#features"], ["How it works", "/#how"], ["Solutions", "/#solutions"], ["Pricing", "/#pricing"], ["FAQ", "/#faq"], ["Track", "/track"]];

export function SiteHeader({ name, logo, dashHref }: { name: string; logo: string; dashHref: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`sticky top-0 z-40 border-b bg-white/90 backdrop-blur transition-shadow ${scrolled ? "border-line shadow-sm" : "border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex items-center justify-self-start" aria-label={name}><Image src={logo} alt={name} width={158} height={40} className="h-10 w-auto" unoptimized priority /></Link>
        <nav className="hidden items-center justify-center gap-8 text-sm font-medium text-slate-600 lg:flex" aria-label="Main">
          {LINKS.map(([l, h]) => <Link key={l} href={h} className="hover:text-ink">{l}</Link>)}
        </nav>
        <div className="ml-auto hidden items-center justify-end gap-3 lg:flex">
          {dashHref ? <Link href={dashHref} className="btn-primary">Open dashboard</Link> : <><Link href="/login" className="text-sm font-medium text-slate-700 hover:text-ink">Sign in</Link><Link href="/register" className="btn-primary">Start free trial</Link></>}
        </div>
        <button type="button" className="ml-auto rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-white px-5 pb-5 lg:hidden">
          <nav className="flex flex-col py-2 text-sm font-medium" aria-label="Mobile">
            {LINKS.map(([l, h]) => <Link key={l} href={h} onClick={() => setOpen(false)} className="border-b border-slate-100 py-3 text-slate-700">{l}</Link>)}
          </nav>
          <div className="mt-3 flex gap-3">
            {dashHref ? <Link href={dashHref} className="btn-primary flex-1">Open dashboard</Link> : <><Link href="/login" className="btn-secondary flex-1">Sign in</Link><Link href="/register" className="btn-primary flex-1">Start free trial</Link></>}
          </div>
        </div>
      )}
    </header>
  );
}
