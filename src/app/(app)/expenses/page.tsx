import { Card, CardHeader, EmptyState, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { HBarChart } from "@/components/client/charts";
import { Field, FieldGrid, ModalForm, SelectField, TextareaField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { financeSummary } from "@/lib/logistics/finance";
import { createExpenseAction } from "../finance/actions";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Expenses" };
const CATS = ["FUEL", "VEHICLE_MAINTENANCE", "DRIVER_EXPENSE", "STAFF_EXPENSE", "OFFICE", "HUB", "TOLLS", "PACKAGING", "OTHER"];

export default async function ExpensesPage() {
  const ctx = await requirePageContext("expenses.manage");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  const from = new Date(Date.now() - 30 * 86400_000);
  const [rows, sum, vehicles, drivers, branches] = await Promise.all([
    ctx.db.expense.findMany({ orderBy: { incurredAt: "desc" }, take: 50 }),
    financeSummary(ctx, from, new Date()),
    ctx.db.vehicle.findMany({ select: { id: true, registrationNumber: true }, where: { isActive: true } }),
    ctx.db.driver.findMany({ select: { id: true, name: true }, where: { isActive: true } }),
    ctx.db.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const cur = company.currency;
  return (
    <>
      <PageHeader title="Expenses" subtitle="Operational costs — last 30 days summarised" actions={<ModalForm trigger="Record expense" title="Record expense" action={createExpenseAction}>
        <FieldGrid><SelectField name="category" label="Category" required options={CATS.map((c) => ({ value: c, label: titleCase(c) }))} /><Field name="amount" label={`Amount (${cur})`} type="number" step="0.01" min="0.01" required /></FieldGrid>
        <FieldGrid><Field name="incurredAt" label="Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /><SelectField name="branchId" label="Branch" placeholder="—" options={branches.map((b) => ({ value: b.id, label: b.name }))} /></FieldGrid>
        <FieldGrid><SelectField name="vehicleId" label="Vehicle" placeholder="—" options={vehicles.map((v) => ({ value: v.id, label: v.registrationNumber }))} /><SelectField name="driverId" label="Driver" placeholder="—" options={drivers.map((d) => ({ value: d.id, label: d.name }))} /></FieldGrid>
        <TextareaField name="description" label="Description" /></ModalForm>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><StatCard label="Expenses (30d)" value={money(sum.expenses, cur)} tone="warning" /><StatCard label="Revenue (30d)" value={money(sum.revenue, cur)} tone="success" /><StatCard label="Profit (30d)" value={money(sum.profit, cur)} tone={sum.profit >= 0 ? "success" : "danger"} /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Recent expenses" />{!rows.length ? <div className="p-6"><EmptyState title="No expenses recorded" /></div> : <Table><THead><TH>Date</TH><TH>Category</TH><TH>Description</TH><TH className="text-right">Amount</TH></THead><TBody>{rows.map((e) => <TR key={e.id}><TD className="text-xs">{dateOnly(e.incurredAt)}</TD><TD>{titleCase(e.category)}</TD><TD className="text-slate-600">{e.description ?? "—"}</TD><TD className="text-right tabular-nums">{money(Number(e.amount), cur)}</TD></TR>)}</TBody></Table>}</Card>
        <Card><CardHeader title="By category" subtitle="Last 30 days" /><div className="p-4">{sum.expensesByCategory.length ? <HBarChart label="Expenses by category" dataKey="amount" color="#eb6834" data={sum.expensesByCategory.map((c) => ({ name: titleCase(c.category), amount: c.amount }))} /> : <p className="py-8 text-center text-sm text-slate-500">No data</p>}</div></Card>
      </div>
    </>
  );
}
