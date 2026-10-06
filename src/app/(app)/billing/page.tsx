import { Alert, Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/client/form";
import { PlanPicker } from "@/components/client/plan-picker";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { currentUsage, getEntitlements, limitFor, LIMIT_KEYS } from "@/lib/platform/entitlements";
import { getPaymentProvider } from "@/lib/platform/payments/provider";
import { brand } from "@/config/brand";
import { cancelAction } from "./actions";
import { dateOnly, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Subscription" };
const LABEL: Record<string, string> = { shipmentsPerMonth: "Shipments this month", drivers: "Drivers & riders", vehicles: "Vehicles", users: "Staff users", branches: "Branches" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("billing.manage");
  const [ent, usage, plans, payments, sub] = await Promise.all([
    getEntitlements(ctx.companyId), currentUsage(ctx.companyId),
    prisma.subscriptionPlan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } }),
    prisma.billingPayment.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.subscription.findUnique({ where: { companyId: ctx.companyId } }),
  ]);
  const planName = new Map((await prisma.subscriptionPlan.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const provider = getPaymentProvider();
  const tone = ent.access.status === "ACTIVE" ? "success" : ent.access.status === "TRIALING" ? "info" : ent.access.status === "PAST_DUE" ? "warning" : "danger";
  return (
    <>
      <PageHeader title="Subscription & billing" subtitle="Plan, usage limits and payment history" />
      {sp.result === "successful" && <div className="mb-4"><Alert tone="success" title="Payment confirmed">Your subscription has been updated.</Alert></div>}
      {sp.result === "pending" && <div className="mb-4"><Alert tone="info" title="Payment pending">We'll update your plan as soon as the provider confirms it.</Alert></div>}
      {(sp.result === "failed" || sp.result === "error" || sp.result === "unknown") && <div className="mb-4"><Alert tone="danger" title="Payment not confirmed">We couldn't confirm that payment. If you were charged, it will be applied automatically once the provider confirms it.</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardHeader title="Current plan" /><div className="space-y-2 p-5 text-sm">
          <p className="text-2xl font-bold">{ent.planName ?? "None"}</p><Badge tone={tone as any}>{titleCase(ent.access.status)}</Badge>
          {sub?.status === "TRIALING" && sub.trialEndsAt && <p className="text-slate-600">Trial ends {dateOnly(sub.trialEndsAt)}</p>}
          {sub?.currentPeriodEnd && <p className="text-slate-600">{sub.cancelAtPeriodEnd ? "Access until" : "Renews / expires"} {dateOnly(sub.currentPeriodEnd)} · {titleCase(sub.interval)}</p>}
          {ent.access.level === "GRACE" && <p className="text-amber-700">Payment overdue — grace period until {dateOnly(sub?.graceEndsAt)}.</p>}
          {ent.access.level === "READ_ONLY" && <p className="text-red-700">{ent.access.reason}. Your workspace is read-only until you subscribe.</p>}
          {sub?.cancelAtPeriodEnd ? <ActionButton label="Resume subscription" action={cancelAction} args={{ resume: true }} /> : sub && ["ACTIVE", "PAST_DUE"].includes(sub.status) && <ActionButton variant="ghost" label="Cancel at period end" confirm="Cancel your subscription? You keep access until the current period ends." action={cancelAction} args={{}} />}
        </div></Card>
        <Card className="lg:col-span-2"><CardHeader title="Usage" /><div className="grid gap-4 p-5 sm:grid-cols-2">
          {LIMIT_KEYS.map((k) => { const lim = limitFor(ent, k); const pctUsed = lim ? Math.min(100, (usage[k] / lim) * 100) : 0; return (
            <div key={k}><div className="flex justify-between text-sm"><span>{LABEL[k]}</span><span className="tabular-nums text-slate-600">{usage[k].toLocaleString()} / {lim === null ? "∞" : lim.toLocaleString()}</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${pctUsed > 90 ? "bg-red-500" : pctUsed > 75 ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${lim ? pctUsed : 4}%` }} /></div></div>); })}
        </div></Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Plans</h2>
      <PlanPicker paymentsReady={provider.isConfigured()} contactEmail={brand.SUPPORT_EMAIL} plans={plans.map((p) => ({ key: p.key, name: p.name, description: p.description, monthly: p.monthlyPriceKobo, annual: p.annualPriceKobo, features: p.features, limits: p.limits as any, current: p.key === ent.planKey }))} />
      <Card className="mt-8"><CardHeader title="Payment history" />
        <Table><THead><TH>Date</TH><TH>Plan</TH><TH>Interval</TH><TH>Reference</TH><TH>Status</TH><TH className="text-right">Amount</TH></THead><TBody>
          {payments.map((p) => <TR key={p.id}><TD className="text-xs">{dateOnly(p.paidAt ?? p.createdAt)}</TD><TD>{planName.get(p.planId) ?? "—"}</TD><TD>{titleCase(p.interval)}</TD><TD className="font-mono text-xs">{p.reference}</TD><TD><Badge tone={p.status === "SUCCESSFUL" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>{titleCase(p.status)}</Badge></TD><TD className="text-right tabular-nums">{money(p.amountKobo / 100, p.currency)}</TD></TR>)}
          {!payments.length && <TR><TD colSpan={6} className="text-center text-slate-500">No payments yet</TD></TR>}</TBody></Table></Card>
    </>
  );
}
