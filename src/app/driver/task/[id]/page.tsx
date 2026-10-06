import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskPanel } from "@/components/client/driver/task-panel";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { navigationUrl } from "@/lib/platform/maps";

export const dynamic = "force-dynamic";

export default async function DriverTask({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("driver.app");
  const s = await ctx.db.shipment.findFirst({ where: { id, driverId: ctx.user.driverId! } }); // only the assigned driver's own shipments
  if (!s) notFound();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } });
  const req = { signature: false, photo: false, otp: false, gps: false, recipientName: false, ...((s.proofRequirements as object) ?? {}) };
  return (
    <>
      <Link href="/driver" className="mb-3 inline-block text-xs font-medium text-slate-500">← Back to tasks</Link>
      <TaskPanel t={{
        id: s.id, trackingNumber: s.trackingNumber, status: s.status, accepted: s.driverAccepted, recipientName: s.recipientName, recipientPhone: s.recipientPhone, senderName: s.senderName, senderPhone: s.senderPhone,
        pickupAddress: s.pickupAddress, pickupCity: s.pickupCity, deliveryAddress: s.deliveryAddress, deliveryCity: s.deliveryCity, instructions: s.specialInstructions, cod: Number(s.codAmount), description: `${s.packageDescription} · ${Number(s.weightKg)}kg × ${s.quantity}`,
        priority: s.priority, req, currency: company.currency,
        navPickup: navigationUrl({ lat: s.pickupLat, lng: s.pickupLng, address: `${s.pickupAddress}, ${s.pickupCity}` }), navDelivery: navigationUrl({ lat: s.deliveryLat, lng: s.deliveryLng, address: `${s.deliveryAddress}, ${s.deliveryCity}` }),
      }} />
    </>
  );
}
