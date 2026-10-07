import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { ShipmentActions } from "@/components/client/shipment-actions";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { AppError } from "@/lib/platform/errors";
import { getShipmentDetail } from "@/lib/logistics/shipments";
import { TRANSITIONS } from "@/lib/logistics/shipment-status";
import { permissionForTransition } from "@/lib/logistics/permissions-map";
import { dateTime, money, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Shipment" };

export default async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext("shipments.view");
  let s;
  try { s = await getShipmentDetail(ctx, id); } catch (e) { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; }
  const [company, drivers, hubs] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true, timezone: true } }),
    ctx.can("shipments.assign") ? ctx.db.driver.findMany({ where: { isActive: true }, select: { id: true, name: true, status: true, vehicle: { select: { registrationNumber: true } } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    ctx.db.hub.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const cur = company.currency, tz = company.timezone;
  const allowed = TRANSITIONS[s.status].filter((t) => t !== "DELIVERED" && t !== "DELIVERY_FAILED").map((to) => ({ to, perm: ctx.can(permissionForTransition(to)) }));
  const req = (s.proofRequirements ?? {}) as Record<string, boolean>;
  const price = (s.priceBreakdown ?? null) as { lines?: { label: string; amount: number }[]; ruleName?: string } | null;

  return (
    <>
      <PageHeader
        back={{ href: "/shipments", label: "Shipments" }}
        title={<span className="font-mono">{s.trackingNumber}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2">{s.orderNumber} · created {dateTime(s.createdAt, tz)} <StatusBadge status={s.status} />{s.priority !== "STANDARD" && <Badge tone="warning">{titleCase(s.priority)}</Badge>}</span>}
        actions={<><Link href={`/shipments/${s.id}/label`} target="_blank" className="btn-secondary">Print label</Link><Link href={`/track/${s.trackingNumber}`} target="_blank" className="btn-secondary">Public tracking ↗</Link></>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Actions" subtitle="Moves are validated against the shipment lifecycle." />
            <div className="p-5">
              <ShipmentActions id={s.id} status={s.status} hasDriver={!!s.driverId} allowed={allowed} canAssign={ctx.can("shipments.assign")} canDispatch={ctx.can("shipments.dispatch")} canEdit={ctx.can("shipments.edit")} drivers={drivers.map((d) => ({ id: d.id, name: d.name, status: d.status, vehicle: d.vehicle?.registrationNumber ?? null }))} hubs={hubs} otpRequired={!!req.otp} hubPickup={s.deliveryMethod === "HUB_PICKUP"} collectionPoint={s.collectionHub?.name ?? null} codDue={Number(s.codAmount)} canOverrideCollection={ctx.can("shipments.cancel")} />
              {allowed.every((a) => !a.perm) && !["DELIVERED", "CANCELLED", "RETURNED_TO_SENDER"].includes(s.status) && <p className="text-sm text-slate-500">Delivery completion and failure are recorded by the assigned driver in the driver app.</p>}
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader title="Sender / pickup" /><div className="space-y-1 p-5 text-sm"><p className="font-medium">{s.senderName}</p><p>{s.senderPhone}</p><p className="text-slate-600">{s.pickupAddress}, {s.pickupCity}, {s.pickupState}</p></div></Card>
            <Card><CardHeader title={s.deliveryMethod === "HUB_PICKUP" ? "Recipient / collection point" : "Recipient / delivery"} action={s.deliveryMethod === "HUB_PICKUP" ? <Badge tone="warning">Hub pickup</Badge> : undefined} /><div className="space-y-1 p-5 text-sm"><p className="font-medium">{s.recipientName}</p><p>{s.recipientPhone}</p><p className="text-slate-600">{s.deliveryAddress}, {s.deliveryCity}, {s.deliveryState}</p>{s.deliveryMethod === "HUB_PICKUP" && s.collectionHub?.openingHours && <p className="text-xs text-slate-500">Open: {s.collectionHub.openingHours}</p>}{s.collectedByName && <p className="text-emerald-700">Collected by {s.collectedByName}</p>}{s.specialInstructions && <p className="mt-2 rounded bg-amber-50 p-2 text-amber-900">⚑ {s.specialInstructions}</p>}</div></Card>
          </div>
          <Card>
            <CardHeader title="Package" />
            <div className="p-5"><DescriptionList items={[
              { label: "Description", value: s.packageDescription }, { label: "Type", value: titleCase(s.packageType) }, { label: "Weight", value: `${Number(s.weightKg)} kg` }, { label: "Quantity", value: s.quantity },
              { label: "Dimensions", value: s.lengthCm ? `${Number(s.lengthCm)} × ${Number(s.widthCm ?? 0)} × ${Number(s.heightCm ?? 0)} cm` : "—" }, { label: "Declared value", value: money(Number(s.declaredValue), cur) },
              { label: "Expected delivery", value: dateTime(s.expectedDeliveryAt, tz) }, { label: "Delivered at", value: dateTime(s.deliveredAt, tz) }, { label: "Notes", value: s.notes },
            ]} /></div>
          </Card>
          {s.attempts.length > 0 && (
            <Card>
              <CardHeader title="Delivery attempts" />
              <ul className="divide-y divide-line">
                {s.attempts.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div><p className="font-medium">Attempt {a.attemptNo} · {a.driver?.name ?? "—"}</p>{a.failureReason && <p className="text-slate-600">{titleCase(a.failureReason)}{a.notes ? ` — ${a.notes}` : ""}</p>}{a.resolution && a.resolution !== "PENDING" && <p className="text-xs text-slate-500">Resolution: {titleCase(a.resolution)}</p>}</div>
                    <div className="text-right"><Badge tone={a.outcome === "DELIVERED" ? "success" : "danger"}>{titleCase(a.outcome)}</Badge><p className="mt-1 text-xs text-slate-500">{dateTime(a.createdAt, tz)}</p></div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {s.proof && (
            <Card>
              <CardHeader title="Proof of delivery" subtitle={`Captured ${dateTime(s.proof.capturedAt, tz)}`} />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <DescriptionList items={[{ label: "Received by", value: s.proof.recipientName }, { label: "OTP verified", value: s.proof.otpVerified ? "Yes" : "No" }, { label: "GPS", value: s.proof.lat ? `${s.proof.lat.toFixed(5)}, ${s.proof.lng?.toFixed(5)}` : "Not captured" }]} />
                <div className="flex gap-3">
                  {s.proof.photoUrl?.startsWith("data:image/") && /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.proof.photoUrl} alt="Delivery photo" className="h-28 rounded-lg border border-line object-cover" />}
                  {s.proof.signatureData?.startsWith("data:image/") && /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.proof.signatureData} alt="Recipient signature" className="h-28 rounded-lg border border-line bg-white object-contain" />}
                </div>
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Assignment" />
            <div className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Driver</span><span>{s.driver ? <Link className="text-brand hover:underline" href={`/drivers/${s.driver.id}`}>{s.driver.name}</Link> : "Unassigned"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Vehicle</span><span>{s.vehicle?.registrationNumber ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Branch</span><span>{s.branch?.name ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Current hub</span><span>{s.currentHub?.name ?? "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Customer</span><span>{s.customer ? <Link className="text-brand hover:underline" href={`/customers/${s.customer.id}`}>{s.customer.name}</Link> : "Walk-in"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Source</span><span>{titleCase(s.source)}</span></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Charges" />
            <div className="space-y-1.5 p-5 text-sm">
              {price?.lines?.map((l) => <div key={l.label} className="flex justify-between text-slate-600"><span>{l.label}</span><span className="tabular-nums">{money(l.amount, cur)}</span></div>)}
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Delivery fee</span><span className="tabular-nums">{money(Number(s.deliveryFee), cur)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid by</span><span>{titleCase(s.feePayer)} · {titleCase(s.paymentStatus)}</span></div>
              {Number(s.codAmount) > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="flex justify-between font-medium"><span>COD due</span><span>{money(Number(s.codAmount), cur)}</span></div>
                  {s.cod && <><div className="flex justify-between text-slate-600"><span>Collected</span><span>{money(Number(s.cod.amountCollected), cur)}</span></div><div className="mt-1 flex items-center justify-between text-slate-600"><span>Status</span><Badge tone={s.cod.status === "SETTLED" ? "success" : s.cod.status === "DISPUTED" ? "danger" : "info"}>{titleCase(s.cod.status)}</Badge></div></>}
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Proof required" />
            <div className="flex flex-wrap gap-1.5 p-5">{Object.entries(req).filter(([, v]) => v).map(([k]) => <Badge key={k} tone="info">{titleCase(k)}</Badge>)}{!Object.values(req).some(Boolean) && <span className="text-sm text-slate-500">None</span>}</div>
          </Card>
          <Card>
            <CardHeader title="Timeline" subtitle={`${s.events.length} events`} />
            <div className="p-5"><Timeline tz={tz} newestFirst items={s.events.map((e) => ({ id: e.id, at: e.createdAt, text: e.description, tone: e.status === "DELIVERED" ? "success" : e.status === "DELIVERY_FAILED" || e.status === "CANCELLED" ? "danger" : e.status === "RESCHEDULED" || e.status === "RETURNING" ? "warning" : "default", meta: [e.actorName, e.isPublic ? null : "internal"].filter(Boolean).join(" · ") }))} /></div>
          </Card>
        </div>
      </div>
    </>
  );
}
