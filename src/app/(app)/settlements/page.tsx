import Link from "next/link";
import { Badge, Card, EmptyState, NotConfigured, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, Field, FieldGrid, ModalForm, SelectField, TextareaField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { getEntitlements } from "@/lib/platform/entitlements";
import { generateSettlementAction, settlementStatusAction } from "../finance/actions";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Driver settlements" };

export default async function SettlementsPage() {
  const ctx = await requirePageContext("settlements.manage");
  const ent = await getEntitlements(ctx.companyId);
  if (!ent.features.has("settlements")) return <><PageHeader title="Driver settlements" /><NotConfigured title="Not included in your plan" description="Driver settlements are available on Professional and above." /></>;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  const [rows, drivers] = await Promise.all([ctx.db.settlement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { driver: { select: { id: true, name: true } } } }), ctx.db.driver.findMany({ where: { isActive: true }, select: { id: true, name: true, payModel: true }, orderBy: { name: "asc" } })]);
  const cur = company.currency;
  const week = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Driver settlements" subtitle="Earnings by pay model, less COD cash still held, plus bonuses and reimbursed expenses" actions={<ModalForm trigger="Generate settlement" title="Generate settlement" action={generateSettlementAction}>
        <SelectField name="driverId" label="Driver" required placeholder="Select…" options={drivers.map((d) => ({ value: d.id, label: `${d.name} · ${titleCase(d.payModel)}` }))} />
        <FieldGrid><Field name="periodStart" label="From" type="date" required defaultValue={week} /><Field name="periodEnd" label="To (inclusive)" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></FieldGrid>
        <FieldGrid><Field name="bonuses" label="Bonuses" type="number" min="0" step="0.01" /><Field name="deductions" label="Deductions" type="number" min="0" step="0.01" /></FieldGrid><TextareaField name="notes" label="Notes" />
        <p className="text-xs text-slate-500">Net = earnings + bonuses + expenses reimbursed − deductions − COD cash the driver still holds.</p></ModalForm>} />
      <Card>{!rows.length ? <div className="p-6"><EmptyState title="No settlements yet" description="Generate one for a driver and pay period." /></div> : <Table><THead><TH>Number</TH><TH>Driver</TH><TH>Period</TH><TH className="text-right">Deliveries</TH><TH className="text-right">Earnings</TH><TH className="text-right">COD held</TH><TH className="text-right">Net payable</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>
        {rows.map((s) => <TR key={s.id}><TD className="font-medium">{s.number}</TD><TD><Link href={`/drivers/${s.driver.id}`} className="text-brand">{s.driver.name}</Link></TD><TD className="text-xs">{dateOnly(s.periodStart)} – {dateOnly(s.periodEnd)}</TD><TD className="text-right">{s.deliveriesCount}</TD>
          <TD className="text-right tabular-nums">{money(Number(s.earnings) + Number(s.bonuses), cur)}</TD><TD className="text-right tabular-nums">{money(Math.max(0, Number(s.codCollected) - Number(s.codRemitted)), cur)}</TD><TD className="text-right font-semibold tabular-nums">{money(Number(s.netPayable), cur)}</TD>
          <TD><Badge tone={s.status === "PAID" ? "success" : s.status === "VOID" ? "neutral" : s.status === "APPROVED" ? "info" : "warning"}>{titleCase(s.status)}</Badge></TD>
          <TD className="whitespace-nowrap text-right">{s.status === "DRAFT" && <ActionButton small label="Approve" action={settlementStatusAction} args={{ id: s.id, to: "APPROVED" }} />}{s.status === "APPROVED" && <ModalForm trigger="Mark paid" triggerClassName="btn-primary btn-sm" title="Mark settlement paid" action={settlementStatusAction} extra={{ id: s.id, to: "PAID" }}><Field name="reference" label="Payment reference" required /></ModalForm>}{["DRAFT", "APPROVED"].includes(s.status) && <ActionButton small variant="ghost" label="Void" confirm="Void this settlement?" action={settlementStatusAction} args={{ id: s.id, to: "VOID" }} />}</TD></TR>)}</TBody></Table>}</Card>
    </>
  );
}
