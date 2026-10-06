"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { driverReportIssueAction, driverSosAction, driverStatusAction } from "@/app/driver/actions";
import { GpsReporter } from "./gps-reporter";
import { useToast } from "../toast";
import { Form, SelectField, TextareaField, Modal } from "../form";
import { Badge } from "@/components/ui";
import { SyncBar } from "./sync-bar";

export interface DriverTask { id: string; trackingNumber: string; status: string; kind: "PICKUP" | "DELIVERY"; name: string; address: string; city: string; phone: string; cod: number; priority: string; accepted: boolean }

export function DriverHome({ status, tasks, deliveredToday }: { status: string; tasks: DriverTask[]; deliveredToday: number }) {
  const router = useRouter();
  const toast = useToast();
  const [st, setSt] = React.useState(status);
  const [issue, setIssue] = React.useState(false);
  const [sos, setSos] = React.useState(false);
  const online = st !== "OFFLINE";

  async function toggle() {
    const next = online ? "OFFLINE" : "AVAILABLE";
    const r = await driverStatusAction({ status: next });
    if (r.ok) { setSt(next); router.refresh(); } else toast.push("error", r.error);
  }
  async function sendSos() {
    setSos(false);
    const pos = await new Promise<{ lat?: number; lng?: number }>((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 4000 }) : res({}));
    const r = await driverSosAction(pos);
    toast.push(r.ok ? "success" : "error", r.ok ? "Emergency alert sent to dispatch" : r.error);
    router.refresh();
  }

  const group = (k: "PICKUP" | "DELIVERY") => tasks.filter((t) => t.kind === k);
  return (
    <div className="space-y-4">
      <SyncBar />
      <div className="card flex items-center justify-between p-4">
        <div><p className="text-xs text-slate-500">Your status</p><p className="font-semibold">{st === "EMERGENCY" ? "🚨 Emergency" : online ? "Online" : "Offline"}</p><GpsReporter enabled={online && st !== "EMERGENCY"} /></div>
        <button className={online ? "btn-secondary" : "btn-primary"} onClick={toggle} disabled={st === "EMERGENCY"}>{online ? "Go offline" : "Go online"}</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card p-3"><p className="text-2xl font-semibold">{group("PICKUP").length}</p><p className="text-xs text-slate-500">Pickups</p></div>
        <div className="card p-3"><p className="text-2xl font-semibold">{group("DELIVERY").length}</p><p className="text-xs text-slate-500">Deliveries</p></div>
        <div className="card p-3"><p className="text-2xl font-semibold text-emerald-600">{deliveredToday}</p><p className="text-xs text-slate-500">Done today</p></div>
      </div>
      {(["PICKUP", "DELIVERY"] as const).map((k) => group(k).length > 0 && (
        <section key={k}><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{k === "PICKUP" ? "Pickups" : "Deliveries"}</h2>
          <div className="space-y-2">{group(k).map((t) => (
            <Link key={t.id} href={`/driver/task/${t.id}`} className="card block p-4 active:bg-slate-50">
              <div className="flex items-start justify-between"><span className="font-mono text-sm font-semibold text-brand">{t.trackingNumber}</span><Badge tone={t.status === "OUT_FOR_DELIVERY" ? "progress" : "info"}>{t.status === "OUT_FOR_DELIVERY" ? "In progress" : t.accepted ? "Accepted" : "New"}</Badge></div>
              <p className="mt-1 font-medium">{t.name}</p><p className="text-sm text-slate-600">{t.address}, {t.city}</p>
              <div className="mt-2 flex gap-1.5">{t.priority !== "STANDARD" && <Badge tone="warning">{t.priority.replace("_", " ").toLowerCase()}</Badge>}{t.cod > 0 && <Badge tone="info">Collect ₦{t.cod.toLocaleString()}</Badge>}</div>
            </Link>))}</div></section>
      ))}
      {!tasks.length && <div className="card p-8 text-center text-sm text-slate-500">No tasks assigned right now. {online ? "Dispatch will assign work to you." : "Go online to receive tasks."}</div>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => setIssue(true)}>Report an issue</button>
        <button className="btn-danger" onClick={() => setSos(true)}>🚨 SOS</button>
      </div>
      <Modal open={sos} onClose={() => setSos(false)} title="Send emergency alert?"><p className="text-sm text-slate-600">Dispatch and managers will be alerted immediately with your location.</p><div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setSos(false)}>Cancel</button><button className="btn-danger" onClick={sendSos}>Send SOS</button></div></Modal>
      <Modal open={issue} onClose={() => setIssue(false)} title="Report an issue">
        <Form action={driverReportIssueAction} onSuccess={() => setIssue(false)} submitLabel="Send report" successMessage="Dispatch has been notified">
          <SelectField name="kind" label="What happened?" required options={[{ value: "VEHICLE_BREAKDOWN", label: "Vehicle breakdown" }, { value: "ACCIDENT", label: "Accident" }, { value: "ADDRESS_PROBLEM", label: "Address problem" }, { value: "CUSTOMER_PROBLEM", label: "Customer problem" }, { value: "OTHER", label: "Other" }]} />
          <TextareaField name="note" label="Details" required />
        </Form>
      </Modal>
    </div>
  );
}
