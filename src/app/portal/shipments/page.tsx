import Link from "next/link";
import { Card, EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { requirePortalPage } from "@/lib/platform/portal";
import { listShipments } from "@/lib/logistics/shipments";
import { dateTime } from "@/lib/utils/format";

export default async function PortalShipments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requirePortalPage();
  const data = await listShipments(ctx, { q: sp.q, customerId: ctx.customerId, page: Number(sp.page) || 1 }); // customerId is forced — never taken from the URL
  return (
    <>
      <PageHeader title="My shipments" actions={ctx.can("portal.shipments.create") && <Link className="btn-primary" href="/portal/shipments/new">Book a shipment</Link>} />
      <Card><form className="border-b border-line p-4"><input name="q" defaultValue={sp.q} className="input max-w-sm" placeholder="Search tracking number or recipient" /></form>
        {!data.rows.length ? <div className="p-6"><EmptyState title="No shipments found" /></div> : <Table><THead><TH>Tracking</TH><TH>Recipient</TH><TH>Destination</TH><TH>Status</TH><TH>Created</TH></THead><TBody>{data.rows.map((s) => <TR key={s.id}><TD><Link className="font-mono font-semibold text-brand" href={`/portal/shipments/${s.id}`}>{s.trackingNumber}</Link></TD><TD>{s.recipientName}</TD><TD>{s.deliveryCity}</TD><TD><StatusBadge status={s.status} /></TD><TD className="text-xs text-slate-500">{dateTime(s.createdAt)}</TD></TR>)}</TBody></Table>}
        <Pagination page={data.page} pages={data.pages} total={data.total} basePath="/portal/shipments" params={{ q: sp.q }} /></Card>
    </>
  );
}
