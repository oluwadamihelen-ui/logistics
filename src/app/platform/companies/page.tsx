import Link from "next/link";
import { Badge, Card, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { prisma } from "@/lib/platform/db";
import { dateOnly, titleCase } from "@/lib/utils/format";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1), pageSize = 25;
  const where: any = {};
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }];
  if (sp.status) where.status = sp.status;
  const [rows, total] = await Promise.all([
    prisma.company.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { subscription: { include: { plan: { select: { name: true } } } }, _count: { select: { users: true } } } }),
    prisma.company.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const ships = await prisma.shipment.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, createdAt: { gte: month } }, _count: { _all: true } });
  const sm = new Map(ships.map((s) => [s.companyId, s._count._all]));
  return (
    <>
      <PageHeader title="Companies" />
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-line p-4"><input name="q" defaultValue={sp.q} className="input !w-64" placeholder="Search name or email" /><select name="status" defaultValue={sp.status ?? ""} className="input !w-auto"><option value="">All statuses</option>{["ONBOARDING", "ACTIVE", "SUSPENDED", "CLOSED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select><button className="btn-secondary">Filter</button></form>
        <Table><THead><TH>Company</TH><TH>Status</TH><TH>Plan</TH><TH>Subscription</TH><TH className="text-right">Users</TH><TH className="text-right">Shipments (month)</TH><TH>Joined</TH></THead><TBody>
          {rows.map((c) => <TR key={c.id}><TD><Link className="font-medium text-brand" href={`/platform/companies/${c.id}`}>{c.name}</Link><div className="text-xs text-slate-500">{c.email}</div></TD><TD><Badge tone={c.status === "ACTIVE" ? "success" : c.status === "SUSPENDED" ? "danger" : "neutral"}>{titleCase(c.status)}</Badge></TD><TD>{c.subscription?.plan.name ?? "—"}</TD><TD><Badge tone={c.subscription?.status === "ACTIVE" ? "success" : c.subscription?.status === "TRIALING" ? "info" : "warning"}>{titleCase(c.subscription?.status ?? "none")}</Badge></TD><TD className="text-right">{c._count.users}</TD><TD className="text-right">{sm.get(c.id) ?? 0}</TD><TD className="text-xs">{dateOnly(c.createdAt)}</TD></TR>)}</TBody></Table>
        <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} basePath="/platform/companies" params={{ q: sp.q, status: sp.status }} />
      </Card>
    </>
  );
}
