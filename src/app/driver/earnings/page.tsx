import { requirePageContext } from "@/lib/platform/context";
import { prisma, num } from "@/lib/platform/db";
import { money, dateOnly, titleCase } from "@/lib/utils/format";
import { Badge } from "@/components/ui";
import { estimateEarnings } from "@/lib/logistics/settlements";

export const dynamic = "force-dynamic";

export default async function DriverEarnings() {
  const ctx = await requirePageContext("driver.app");
  const driverId = ctx.user.driverId!;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [driver, settlements, est, held] = await Promise.all([
    ctx.db.driver.findFirstOrThrow({ where: { id: driverId } }),
    ctx.db.settlement.findMany({ where: { driverId, status: { in: ["APPROVED", "PAID"] } }, orderBy: { periodEnd: "desc" }, take: 10 }),
    estimateEarnings(ctx, driverId, monthStart, new Date()),
    ctx.db.codTransaction.aggregate({ where: { driverId }, _sum: { amountCollected: true, amountRemitted: true } }),
  ]);
  const cur = company.currency;
  const owe = num(held._sum.amountCollected) - num(held._sum.amountRemitted);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Earnings</h1>
      <div className="card p-4"><p className="text-xs text-slate-500">This month (estimate, before settlement)</p><p className="text-3xl font-bold">{money(est.net, cur)}</p><p className="text-xs text-slate-500">{est.deliveries} deliveries · pay model: {titleCase(driver.payModel)}</p></div>
      <div className="card p-4"><p className="text-xs text-slate-500">Cash you hold for the company</p><p className={`text-2xl font-bold ${owe > 0 ? "text-amber-600" : ""}`}>{money(owe, cur)}</p><p className="text-xs text-slate-500">COD collected minus amounts already handed over</p></div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settlement statements</h2>
      {settlements.map((s) => <div key={s.id} className="card flex justify-between p-3 text-sm"><span>{s.number}<br /><span className="text-xs text-slate-500">{dateOnly(s.periodStart)} – {dateOnly(s.periodEnd)}</span></span><span className="text-right"><span className="font-semibold">{money(Number(s.netPayable), cur)}</span><br /><Badge tone={s.status === "PAID" ? "success" : "info"}>{titleCase(s.status)}</Badge></span></div>)}
      {!settlements.length && <p className="card p-6 text-center text-sm text-slate-500">No approved statements yet.</p>}
    </div>
  );
}
