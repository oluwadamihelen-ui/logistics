import Link from "next/link";
import type { ShipmentStatus } from "@prisma/client";
import { Badge, Card, EmptyState, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { requirePageContext } from "@/lib/platform/context";
import { listShipments } from "@/lib/logistics/shipments";
import { ALL_STATUSES, STATUS_LABEL } from "@/lib/logistics/shipment-status";
import { dateTime, money, titleCase } from "@/lib/utils/format";
import { prisma } from "@/lib/platform/db";

export const metadata = { title: "Shipments" };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("shipments.view");
  const statuses = (sp.status?.split(",").filter((s) => (ALL_STATUSES as string[]).includes(s)) ?? []) as ShipmentStatus[];
  const [data, drivers, branches, company] = await Promise.all([
    listShipments(ctx, { q: sp.q, status: statuses, driverId: sp.driver, branchId: sp.branch, codOnly: sp.cod === "1", unassigned: sp.unassigned === "1", page: Number(sp.page) || 1 }),
    ctx.db.driver.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    ctx.db.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }),
  ]);
  const params = { q: sp.q, status: sp.status, driver: sp.driver, branch: sp.branch, cod: sp.cod, unassigned: sp.unassigned };
  const quick: { label: string; status?: string }[] = [
    { label: "All" }, { label: "Pending pickup", status: "CREATED,CONFIRMED,PICKUP_ASSIGNED" }, { label: "At hub", status: "AT_HUB,SORTING,READY_FOR_DISPATCH" }, { label: "Ready for pickup", status: "READY_FOR_PICKUP" },
    { label: "Out for delivery", status: "OUT_FOR_DELIVERY" }, { label: "Delivered", status: "DELIVERED" }, { label: "Failed", status: "DELIVERY_FAILED,RESCHEDULED" }, { label: "Returns", status: "RETURNING,RETURNED_TO_HUB,RETURNED_TO_SENDER" },
  ];

  return (
    <>
      <PageHeader title="Shipments" subtitle="Search, filter and manage every shipment" actions={ctx.can("shipments.create") ? <Link href="/shipments/new" className="btn-primary">New shipment</Link> : undefined} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {quick.map((q) => {
          const active = (q.status ?? "") === (sp.status ?? "");
          const sq = new URLSearchParams(); if (q.status) sq.set("status", q.status); if (sp.q) sq.set("q", sp.q);
          return <Link key={q.label} href={`/shipments?${sq}`} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${active ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-line hover:bg-slate-50"}`}>{q.label}</Link>;
        })}
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-4" method="get">
          <div className="min-w-[14rem] flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" placeholder="Tracking no., order no., name or phone" /></div>
          <div><label className="label" htmlFor="driver">Driver</label><select id="driver" name="driver" defaultValue={sp.driver ?? ""} className="input"><option value="">Any</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={sp.branch ?? ""} className="input"><option value="">Any</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="cod" value="1" defaultChecked={sp.cod === "1"} /> COD only</label>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="unassigned" value="1" defaultChecked={sp.unassigned === "1"} /> Unassigned</label>
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <button className="btn-secondary">Apply</button>
        </form>
        {data.rows.length === 0 ? (
          <div className="p-6"><EmptyState title="No shipments match" description="Try clearing filters or create a new shipment." action={ctx.can("shipments.create") ? <Link href="/shipments/new" className="btn-primary">New shipment</Link> : undefined} /></div>
        ) : (
          <Table>
            <THead><TH>Tracking</TH><TH>Recipient</TH><TH>Destination</TH><TH>Status</TH><TH>Driver</TH><TH className="text-right">Fee</TH><TH className="text-right">COD</TH><TH>Created</TH></THead>
            <TBody>
              {data.rows.map((s) => (
                <TR key={s.id}>
                  <TD><Link href={`/shipments/${s.id}`} className="font-mono text-sm font-semibold text-brand hover:underline">{s.trackingNumber}</Link><div className="text-xs text-slate-500">{s.orderNumber}</div></TD>
                  <TD><div className="font-medium">{s.recipientName}</div><div className="text-xs text-slate-500">{s.recipientPhone}</div></TD>
                  <TD>{s.deliveryCity}, {s.deliveryState}{s.priority !== "STANDARD" && <Badge tone="warning" className="ml-2">{titleCase(s.priority)}</Badge>}</TD>
                  <TD><StatusBadge status={s.status} /></TD>
                  <TD>{s.driver?.name ?? <span className="text-slate-400">Unassigned</span>}</TD>
                  <TD className="text-right tabular-nums">{money(Number(s.deliveryFee), company.currency)}</TD>
                  <TD className="text-right tabular-nums">{Number(s.codAmount) > 0 ? money(Number(s.codAmount), company.currency) : "—"}</TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">{dateTime(s.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={data.page} pages={data.pages} total={data.total} basePath="/shipments" params={params} />
      </Card>
      <p className="mt-2 text-xs text-slate-400">Statuses: {ALL_STATUSES.map((s) => STATUS_LABEL[s]).join(" · ")}</p>
    </>
  );
}
