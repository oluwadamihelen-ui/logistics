import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requirePageContext } from "@/lib/platform/context";
import { globalSearch } from "@/lib/logistics/search";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext();
  const res = sp.q ? await globalSearch(ctx, sp.q) : null;
  return (
    <>
      <PageHeader title={sp.q ? `Results for “${sp.q}”` : "Search"} subtitle="Tracking and order numbers, customers, phones, drivers, vehicles, invoices and payment references" />
      {!res ? <EmptyState title="Type at least 2 characters in the search box" /> : Object.keys(res).length === 0 ? <EmptyState title="No results" description="Try a tracking number, phone number or name." /> : (
        <div className="grid gap-4 md:grid-cols-2">{Object.entries(res).map(([k, items]) => <Card key={k}><CardHeader title={k} /><ul className="divide-y divide-line">{items.map((i) => <li key={i.id}><Link href={i.href} className="block px-5 py-3 hover:bg-slate-50"><p className="text-sm font-medium text-brand">{i.title}</p><p className="text-xs text-slate-500">{i.sub}</p></Link></li>)}</ul></Card>)}</div>)}
    </>
  );
}
