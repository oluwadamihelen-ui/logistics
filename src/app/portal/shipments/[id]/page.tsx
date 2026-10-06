import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { requirePortalPage } from "@/lib/platform/portal";
import { prisma } from "@/lib/platform/db";
import { dateTime, money } from "@/lib/utils/format";

export default async function PortalShipment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortalPage();
  const s = await ctx.db.shipment.findFirst({ where: { id, customerId: ctx.customerId }, include: { events: { where: { isPublic: true }, orderBy: { createdAt: "asc" } }, proof: { select: { recipientName: true, capturedAt: true } }, cod: { select: { status: true, amountCollected: true } } } });
  if (!s) notFound();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  return (
    <>
      <PageHeader back={{ href: "/portal/shipments", label: "My shipments" }} title={<span className="font-mono">{s.trackingNumber}</span>} subtitle={<StatusBadge status={s.status} />} actions={<Link className="btn-secondary" target="_blank" href={`/track/${s.trackingNumber}`}>Public tracking page</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Details" /><div className="p-5"><DescriptionList items={[{ label: "Recipient", value: `${s.recipientName} · ${s.recipientPhone}` }, { label: "Delivery address", value: `${s.deliveryAddress}, ${s.deliveryCity}` }, { label: "Pickup", value: `${s.pickupAddress}, ${s.pickupCity}` }, { label: "Package", value: s.packageDescription }, { label: "Delivery fee", value: money(Number(s.deliveryFee), company.currency) }, { label: "COD", value: Number(s.codAmount) > 0 ? `${money(Number(s.codAmount), company.currency)} · ${s.cod?.status.toLowerCase() ?? ""}` : "None" }, { label: "Expected", value: dateTime(s.expectedDeliveryAt) }, { label: "Proof of delivery", value: s.proof ? `Received by ${s.proof.recipientName ?? "recipient"} on ${dateTime(s.proof.capturedAt)}` : null }]} /></div></Card>
        <Card><CardHeader title="Timeline" /><div className="p-5"><Timeline newestFirst items={s.events.map((e) => ({ at: e.createdAt, text: e.description }))} /></div></Card>
      </div>
    </>
  );
}
