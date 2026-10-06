"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { driverAcceptAction } from "@/app/driver/actions";
import { enqueue, flush, newEventId, type QueueKind } from "@/lib/driver/offline-queue";
import { senders } from "@/lib/driver/senders";
import { SignaturePad } from "./signature-pad";
import { SyncBar } from "./sync-bar";
import { Modal } from "../form";
import { useToast } from "../toast";
import { Badge } from "@/components/ui";

export interface TaskData {
  id: string; trackingNumber: string; status: string; accepted: boolean; recipientName: string; recipientPhone: string; senderName: string; senderPhone: string;
  pickupAddress: string; deliveryAddress: string; deliveryCity: string; pickupCity: string; instructions: string | null; cod: number; description: string; priority: string;
  req: { signature: boolean; photo: boolean; otp: boolean; gps: boolean; recipientName: boolean }; navPickup: string; navDelivery: string; currency: string;
}

const REASONS = ["CUSTOMER_UNAVAILABLE", "WRONG_ADDRESS", "PHONE_UNREACHABLE", "CUSTOMER_REFUSED", "BUSINESS_CLOSED", "VEHICLE_ISSUE", "WEATHER", "SECURITY_ISSUE", "INCORRECT_PACKAGE", "PAYMENT_ISSUE", "OTHER"];

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 8000 }) : res(null));
}

async function compressImage(file: File, max = 1024): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

export function TaskPanel({ t }: { t: TaskData }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = React.useState(t.status);
  const [pendingSync, setPendingSync] = React.useState(false);
  const [mode, setMode] = React.useState<null | "complete" | "fail">(null);
  const [busy, setBusy] = React.useState(false);
  const [sig, setSig] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isPickup = status === "PICKUP_ASSIGNED";
  const dest = isPickup ? { addr: `${t.pickupAddress}, ${t.pickupCity}`, name: t.senderName, phone: t.senderPhone, nav: t.navPickup } : { addr: `${t.deliveryAddress}, ${t.deliveryCity}`, name: t.recipientName, phone: t.recipientPhone, nav: t.navDelivery };

  /** Outbox pattern: persist first, then try to send. Safe to retry thanks to clientEventId. */
  async function submit(kind: QueueKind, shipmentId: string, payload: Record<string, unknown>, optimistic: string) {
    const id = newEventId();
    await enqueue({ id, kind, shipmentId, payload, createdAt: Date.now(), attempts: 0, state: "pending" });
    setStatus(optimistic);
    if (!navigator.onLine) { setPendingSync(true); toast.push("info", "Saved offline — will sync when you're back online"); return true; }
    const r = await flush(senders).catch(() => ({ left: 1, failed: 0, sent: 0 }));
    if (r.left > 0) { setPendingSync(true); toast.push("info", "Saved — will sync shortly"); } else if (r.failed > 0) { toast.push("error", "That update was rejected. See the banner above."); setStatus(t.status); } else { setPendingSync(false); toast.push("success", "Updated"); }
    router.refresh();
    return true;
  }

  async function accept() {
    setBusy(true);
    const r = await driverAcceptAction({ id: t.id }).catch(() => null);
    setBusy(false);
    if (r?.ok) { toast.push("success", "Task accepted"); router.refresh(); } else toast.push("error", r && !r.ok ? r.error : "You appear to be offline");
  }

  async function step(to: "PICKED_UP" | "OUT_FOR_DELIVERY") {
    setBusy(true);
    const pos = await getPosition();
    await submit("transition", t.id, { to, ...(pos ?? {}) }, to);
    setBusy(false);
  }

  async function complete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("recipientName") ?? "").trim();
    const otp = String(fd.get("otp") ?? "").trim();
    const cod = fd.get("cod") ? Number(fd.get("cod")) : undefined;
    if (t.req.recipientName && !name) return setError("Enter the name of the person who received the package.");
    if (t.req.signature && !sig) return setError("A signature is required.");
    if (t.req.photo && !photo) return setError("Take a delivery photo.");
    if (t.req.otp && !/^\d{6}$/.test(otp)) return setError("Enter the 6-digit OTP from the recipient.");
    if (t.cod > 0 && cod === undefined) return setError("Enter the cash amount collected.");
    setBusy(true);
    const pos = await getPosition();
    if (t.req.gps && !pos) { setBusy(false); return setError("GPS location is required — enable location and try again."); }
    await submit("complete", t.id, { recipientName: name || undefined, signatureData: sig ?? undefined, photoUrl: photo ?? undefined, otp: otp || undefined, codCollected: cod, ...(pos ?? {}) }, "DELIVERED");
    setBusy(false); setMode(null);
  }

  async function fail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const pos = await getPosition();
    const when = fd.get("rescheduleFor") ? new Date(String(fd.get("rescheduleFor"))).toISOString() : undefined;
    await submit("fail", t.id, { reason: fd.get("reason"), notes: String(fd.get("notes") ?? "") || undefined, rescheduleFor: when, ...(pos ?? {}) }, "DELIVERY_FAILED");
    setBusy(false); setMode(null);
  }

  return (
    <div className="space-y-4">
      <SyncBar />
      <div className="card p-4">
        <div className="flex items-start justify-between"><span className="font-mono text-lg font-bold">{t.trackingNumber}</span><Badge tone="progress">{status.replace(/_/g, " ").toLowerCase()}</Badge></div>
        {pendingSync && <p className="mt-1 text-xs font-medium text-amber-700">⏳ Pending sync</p>}
        <p className="mt-3 text-xs uppercase text-slate-500">{isPickup ? "Pick up from" : "Deliver to"}</p>
        <p className="font-semibold">{dest.name}</p><p className="text-sm text-slate-600">{dest.addr}</p>
        {t.instructions && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">⚑ {t.instructions}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <a className="btn-secondary" href={`tel:${dest.phone}`}>📞 Call</a>
          <a className="btn-secondary" href={`sms:${dest.phone}`}>💬 Message</a>
          <a className="btn-secondary" href={dest.nav} target="_blank" rel="noreferrer">🧭 Navigate</a>
        </div>
      </div>
      <div className="card p-4 text-sm"><p>{t.description}</p>{t.cod > 0 && <p className="mt-2 rounded bg-blue-50 p-2 font-semibold text-blue-900">Collect cash on delivery: {t.currency} {t.cod.toLocaleString()}</p>}</div>

      <div className="space-y-2">
        {!t.accepted && ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY"].includes(status) && <button className="btn-primary w-full !py-3" disabled={busy} onClick={accept}>Accept task</button>}
        {status === "PICKUP_ASSIGNED" && <button className="btn-primary w-full !py-3" disabled={busy} onClick={() => step("PICKED_UP")}>Mark picked up</button>}
        {status === "ASSIGNED_FOR_DELIVERY" && <button className="btn-primary w-full !py-3" disabled={busy} onClick={() => step("OUT_FOR_DELIVERY")}>Start delivery</button>}
        {status === "OUT_FOR_DELIVERY" && <>
          <button className="btn-primary w-full !py-3" onClick={() => setMode("complete")}>Complete delivery</button>
          <button className="btn-secondary w-full !py-3" onClick={() => setMode("fail")}>Delivery failed</button></>}
        {["DELIVERED", "DELIVERY_FAILED", "PICKED_UP"].includes(status) && <p className="rounded-lg bg-slate-100 p-3 text-center text-sm text-slate-600">{status === "DELIVERED" ? "✅ Delivered" : status === "PICKED_UP" ? "Picked up — drop at the hub as instructed." : "Failure recorded — dispatch will decide the next step."}</p>}
      </div>

      <Modal open={mode === "complete"} onClose={() => setMode(null)} title="Proof of delivery">
        <form onSubmit={complete} className="space-y-4">
          {error && <div role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</div>}
          {(t.req.recipientName || true) && <div><label className="label" htmlFor="recipientName">Received by{t.req.recipientName && " *"}</label><input id="recipientName" name="recipientName" className="input" defaultValue={t.recipientName} /></div>}
          {t.req.otp && <div><label className="label" htmlFor="otp">Recipient OTP *</label><input id="otp" name="otp" inputMode="numeric" maxLength={6} className="input text-center font-mono text-xl tracking-widest" placeholder="••••••" /></div>}
          {t.cod > 0 && <div><label className="label" htmlFor="cod">Cash collected ({t.currency}) *</label><input id="cod" name="cod" type="number" min="0" step="0.01" className="input" defaultValue={t.cod} /></div>}
          {t.req.photo && <div><label className="label">Delivery photo *</label><input type="file" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressImage(f)); }} />{photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="Captured delivery" className="mt-2 h-28 rounded-lg object-cover" />}</div>}
          {t.req.signature && <div><label className="label">Signature *</label><SignaturePad onChange={setSig} /></div>}
          {t.req.gps && <p className="text-xs text-slate-500">Your GPS location will be recorded.</p>}
          <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? "Saving…" : "Confirm delivery"}</button>
        </form>
      </Modal>
      <Modal open={mode === "fail"} onClose={() => setMode(null)} title="Delivery failed">
        <form onSubmit={fail} className="space-y-4">
          <div><label className="label" htmlFor="reason">Reason *</label><select id="reason" name="reason" required className="input">{REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</option>)}</select></div>
          <div><label className="label" htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={2} className="input" /></div>
          <div><label className="label" htmlFor="rescheduleFor">Reschedule for (optional)</label><input id="rescheduleFor" name="rescheduleFor" type="datetime-local" className="input" /></div>
          <button className="btn-danger w-full !py-3" disabled={busy}>{busy ? "Saving…" : "Record failed delivery"}</button>
        </form>
      </Modal>
    </div>
  );
}
