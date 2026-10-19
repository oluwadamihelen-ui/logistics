import { notFound } from "next/navigation";
import Link from "next/link";
import { DocsShell } from "@/components/marketing/docs-shell";
import { DOCS, getDoc, renderDoc } from "@/lib/docs";
import { brand } from "@/config/brand";

export const dynamicParams = false;
export function generateStaticParams() { return DOCS.map((d) => ({ slug: d.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = getDoc((await params).slug);
  return d ? { title: d.title, description: d.description } : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = getDoc(slug);
  if (!d) notFound();
  const { html, headings } = renderDoc(slug);
  const i = DOCS.findIndex((x) => x.slug === slug);
  const prev = DOCS[i - 1], next = DOCS[i + 1];
  return (
    <DocsShell active={slug} toc={headings}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{d.category}</p>
      <article className="prose-docs mt-1" dangerouslySetInnerHTML={{ __html: html }} />
      <p className="mt-10 border-t border-line pt-4 text-xs text-slate-500">Last updated {d.updated} · {brand.APP_NAME} is a product of {brand.COMPANY_NAME}</p>
      <div className="mt-6 flex justify-between gap-4 text-sm">
        {prev ? <Link href={`/docs/${prev.slug}`} className="text-brand hover:underline">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/docs/${next.slug}`} className="text-brand hover:underline">{next.title} →</Link> : <span />}
      </div>
    </DocsShell>
  );
}
