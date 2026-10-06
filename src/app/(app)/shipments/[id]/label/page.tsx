import { notFound } from "next/navigation";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { brand } from "@/config/brand";
import { PrintButton } from "@/components/client/print-button";

export const metadata = { title: "Shipping label" };

export default async function Label({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("shipments.view");
  const s = await ctx.db.shipment.findFirst({ where: { id } });
  if (!s) notFound();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true } });
  return (
    <div className="mx-auto max-w-md p-6 print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <div className="rounded-lg border-2 border-ink p-5">
        <div className="flex items-center justify-between border-b-2 border-ink pb-3"><span className="text-lg font-bold">{company.name}</span><span className="text-xs">{s.priority}</span></div>
        <p className="mt-3 text-xs uppercase text-slate-500">Tracking</p>
        <p className="font-mono text-3xl font-bold tracking-wider">{s.trackingNumber}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-xs uppercase text-slate-500">From</p><p className="font-semibold">{s.senderName}</p><p>{s.pickupAddress}</p><p>{s.pickupCity}, {s.pickupState}</p></div>
          <div><p className="text-xs uppercase text-slate-500">To</p><p className="font-semibold">{s.recipientName}</p><p>{s.recipientPhone}</p><p>{s.deliveryAddress}</p><p className="font-bold">{s.deliveryCity}, {s.deliveryState}</p></div>
        </div>
        <div className="mt-4 flex justify-between border-t-2 border-ink pt-3 text-sm"><span>{s.packageDescription} · {Number(s.weightKg)}kg × {s.quantity}</span>{Number(s.codAmount) > 0 && <span className="font-bold">COD {Number(s.codAmount).toLocaleString()}</span>}</div>
        <p className="mt-3 text-center text-xs text-slate-500">Track at {brand.WEBSITE_URL}/track/{s.trackingNumber}</p>
      </div>
    </div>
  );
}
