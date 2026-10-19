import Link from "next/link";
import { DocsShell } from "@/components/marketing/docs-shell";
import { DOCS } from "@/lib/docs";
import { brand } from "@/config/brand";

export const metadata = { title: "Documentation", description: `Guides, manuals and developer resources for ${brand.APP_NAME}.` };

export default function DocsIndex() {
  return (
    <DocsShell>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{brand.APP_NAME} documentation</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">Everything you need to install, use, update and extend {brand.APP_NAME}, a product of {brand.COMPANY_NAME}.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {DOCS.map((d) => (
          <Link key={d.slug} href={`/docs/${d.slug}`} className="rounded-2xl border border-line p-5 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{d.category}</p>
            <h2 className="mt-1 text-lg font-semibold">{d.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{d.description}</p>
          </Link>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-500">Can&apos;t find what you need? Email <a className="text-brand underline" href={`mailto:${brand.SUPPORT_EMAIL}`}>{brand.SUPPORT_EMAIL}</a>.</p>
    </DocsShell>
  );
}
