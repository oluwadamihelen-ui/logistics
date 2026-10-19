import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { DOCS } from "@/lib/docs";
import { brand } from "@/config/brand";
import { isDemo } from "@/lib/platform/demo";

export function DocsShell({ active, children, toc }: { active?: string; children: React.ReactNode; toc?: { id: string; text: string; depth: number }[] }) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <SiteHeader name={brand.APP_NAME} logo={brand.APP_WORDMARK} dashHref={null} demo={isDemo()} />
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-5 py-10 lg:grid-cols-[220px_minmax(0,1fr)_200px]">
        <nav aria-label="Documentation" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Link href="/docs" className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-brand">Documentation</Link>
          <ul className="mt-3 flex gap-1 overflow-x-auto pb-2 text-sm lg:flex-col lg:overflow-visible lg:pb-0">
            {DOCS.map((d) => (
              <li key={d.slug} className="flex-none">
                <Link href={`/docs/${d.slug}`} className={`block rounded-lg px-3 py-1.5 ${active === d.slug ? "bg-brand-soft font-medium text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-ink"}`}>{d.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0">{children}</main>
        <aside className="hidden lg:block">
          {toc && toc.length > 0 && (
            <div className="sticky top-24 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
              <ul className="mt-3 space-y-1.5 border-l border-line">
                {toc.filter((h) => h.depth === 2).map((h) => <li key={h.id}><a href={`#${h.id}`} className="-ml-px block border-l border-transparent pl-3 text-slate-500 hover:border-brand hover:text-brand">{h.text}</a></li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
      <SiteFooter />
    </div>
  );
}
