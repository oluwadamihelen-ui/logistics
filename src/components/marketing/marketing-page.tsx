import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { brand } from "@/config/brand";

/** Shell for public content pages (About, Terms, Privacy). */
export function MarketingPage({ title, intro, updated, children }: { title: string; intro?: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <SiteHeader name={brand.APP_NAME} logo={brand.APP_WORDMARK} dashHref={null} />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {intro && <p className="mt-3 text-lg text-slate-600">{intro}</p>}
        {updated && <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>}
        <div className="prose-legal mt-8 space-y-6 text-[15px] leading-7 text-slate-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand [&_a]:underline">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
