import Link from "next/link";
import { headers } from "next/headers";
import { Badge } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { getPublicTracking } from "@/lib/logistics/shipments";
import { normalizeTracking } from "@/lib/logistics/tracking";
import { PUBLIC_STAGES, publicStageIndex, STATUS_LABEL, STATUS_TONE } from "@/lib/logistics/shipment-status";
import { rateLimit, clientIp } from "@/lib/platform/rate-limit";
import { dateTime, titleCase, cn } from "@/lib/utils/format";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracking", robots: { index: false } };

export default async function TrackPage({ params }: { params: Promise<{ trackingNumber: string }> }) {
  const tn = normalizeTracking((await params).trackingNumber);
  // Public endpoint: throttle enumeration attempts per IP.
  const rl = rateLimit(`track:${clientIp(await headers())}`, 40, 60_000);
  const t = rl.allowed ? await getPublicTracking(tn) : null;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <Link href="/track" className="text-xs font-medium text-slate-500 hover:text-brand">← Track another shipment</Link>
      {!rl.allowed ? (
        <div className="card mt-4 p-8 text-center"><h1 className="text-lg font-semibold">Too many lookups</h1><p className="mt-1 text-sm text-slate-500">Please wait a minute and try again.</p></div>
      ) : !t ? (
        <div className="card mt-4 p-8 text-center"><h1 className="text-lg font-semibold">We couldn&apos;t find that shipment</h1><p className="mt-1 text-sm text-slate-500">Check the tracking number <span className="font-mono">{tn}</span> and try again.</p></div>
      ) : (
        <>
          <div className="card mt-4 overflow-hidden">
            <div className="bg-ink p-6 text-white">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t.company?.name ?? brand.APP_NAME}</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{t.trackingNumber}</p>
              <div className="mt-3"><Badge tone={STATUS_TONE[t.status]} className="!bg-white/10 !text-white !ring-white/20" dot>{STATUS_LABEL[t.status]}</Badge></div>
            </div>
            <div className="p-6">
              {t.status === "CANCELLED" ? <p className="text-sm text-slate-600">This shipment was cancelled.</p> : (
                <ol className="flex items-start justify-between" aria-label="Delivery progress">
                  {PUBLIC_STAGES.map((st, i) => {
                    const idx = publicStageIndex(t.status); const done = i <= idx;
                    return (
                      <li key={st} className="flex flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                          <span className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : done ? "bg-brand" : "bg-line")} />
                          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", done ? "bg-brand text-white" : "bg-line text-slate-400")}>{done ? "✓" : i + 1}</span>
                          <span className={cn("h-0.5 flex-1", i === PUBLIC_STAGES.length - 1 ? "opacity-0" : i < idx ? "bg-brand" : "bg-line")} />
                        </div>
                        <span className={cn("mt-2 text-[11px] leading-tight", done ? "font-semibold text-ink" : "text-slate-400")}>{st}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-slate-500">From</dt><dd className="font-medium">{t.origin}</dd></div>
                <div><dt className="text-xs text-slate-500">To</dt><dd className="font-medium">{t.destination}</dd></div>
                <div><dt className="text-xs text-slate-500">{t.deliveredAt ? "Delivered" : "Estimated delivery"}</dt><dd className="font-medium">{dateTime(t.deliveredAt ?? t.expectedDeliveryAt)}</dd></div>
                <div><dt className="text-xs text-slate-500">Service</dt><dd className="font-medium">{titleCase(t.priority)} · {titleCase(t.packageType)}</dd></div>
                {t.driver && <div className="col-span-2"><dt className="text-xs text-slate-500">Your {t.driver.kind === "RIDER" ? "rider" : "driver"}</dt><dd className="font-medium">{t.driver.firstName} is on the way</dd></div>}
              </dl>
              {t.proof && <div className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">Proof of delivery</p><p>Received{t.proof.recipientName ? ` by ${t.proof.recipientName}` : ""} on {dateTime(t.proof.at)}.{t.proof.hasSignature ? " Signature captured." : ""}{t.proof.hasPhoto ? " Photo captured." : ""}</p></div>}
            </div>
          </div>
          <div className="card mt-4 p-6">
            <h2 className="mb-4 text-sm font-semibold">Shipment history</h2>
            <Timeline newestFirst items={t.timeline.map((e) => ({ at: e.createdAt, text: e.description, tone: e.status === "DELIVERED" ? "success" : e.status === "DELIVERY_FAILED" ? "danger" : "default" }))} />
          </div>
          {t.company?.phone && <p className="mt-4 text-center text-xs text-slate-500">Questions? Contact {t.company.name}: {t.company.phone}</p>}
        </>
      )}
    </main>
  );
}
