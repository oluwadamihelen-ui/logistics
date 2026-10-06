"use client";
import * as React from "react";
import { ActionButton, Field, ModalForm, SelectField, TextareaField, Modal } from "./form";
import { assignAction, regenerateOtpAction, resolveFailureAction, transitionAction, unassignAction } from "@/app/(app)/shipments/actions";
import { STATUS_LABEL } from "@/lib/logistics/shipment-status";
import { useToast } from "./toast";

interface Props {
  id: string;
  status: string;
  hasDriver: boolean;
  allowed: { to: string; perm: boolean }[];
  canAssign: boolean;
  canDispatch: boolean;
  canEdit: boolean;
  drivers: { id: string; name: string; status: string; vehicle: string | null }[];
  hubs: { id: string; name: string }[];
  otpRequired: boolean;
}

const VERB: Record<string, string> = {
  CONFIRMED: "Confirm", PICKED_UP: "Mark picked up", AT_HUB: "Arrived at hub", SORTING: "Start sorting", READY_FOR_DISPATCH: "Ready for dispatch",
  OUT_FOR_DELIVERY: "Start delivery", RETURNING: "Start return", RETURNED_TO_HUB: "Returned to hub", RETURNED_TO_SENDER: "Returned to sender",
  CANCELLED: "Cancel shipment", RESCHEDULED: "Reschedule", PICKUP_ASSIGNED: "", ASSIGNED_FOR_DELIVERY: "",
};

export function ShipmentActions({ id, status, hasDriver, allowed, canAssign, canDispatch, canEdit, drivers, hubs, otpRequired }: Props) {
  const toast = useToast();
  const [otp, setOtp] = React.useState<string | null>(null);
  const assignable = ["CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "RESCHEDULED", "DELIVERY_FAILED"].includes(status);
  const failed = ["DELIVERY_FAILED", "RESCHEDULED"].includes(status);
  const steps = allowed.filter((a) => a.perm && VERB[a.to] && a.to !== "CANCELLED" && a.to !== "RESCHEDULED");
  const canCancel = allowed.some((a) => a.to === "CANCELLED" && a.perm);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {steps.map((a) => a.to === "AT_HUB" ? (
          <ModalForm key={a.to} trigger="Arrived at hub" triggerClassName="btn-primary" title="Record hub arrival" action={transitionAction} extra={{ id, to: "AT_HUB" }} successMessage="Hub arrival recorded">
            <SelectField name="hubId" label="Hub" required options={hubs.map((h) => ({ value: h.id, label: h.name }))} placeholder="Select hub" />
            <Field name="note" label="Note (optional)" />
          </ModalForm>
        ) : (
          <ActionButton key={a.to} variant={a.to === "RETURNING" ? "secondary" : "primary"} label={VERB[a.to]} action={() => transitionAction({ id, to: a.to as any })} successMessage={`${STATUS_LABEL[a.to as keyof typeof STATUS_LABEL]}`} />
        ))}
        {canAssign && assignable && (
          <ModalForm trigger={hasDriver ? "Reassign driver" : "Assign driver"} triggerClassName="btn-secondary" title="Assign driver / rider" action={assignAction} extra={{ shipmentIds: [id] }} successMessage="Assigned">
            <SelectField name="driverId" label="Driver / rider" required placeholder="Select…" options={drivers.map((d) => ({ value: d.id, label: `${d.name} · ${d.status.replace(/_/g, " ").toLowerCase()}${d.vehicle ? ` · ${d.vehicle}` : ""}` }))} />
            <p className="text-xs text-slate-500">The driver&apos;s assigned vehicle is used automatically.</p>
          </ModalForm>
        )}
        {canAssign && hasDriver && ["PICKUP_ASSIGNED", "ASSIGNED_FOR_DELIVERY"].includes(status) && (
          <ActionButton variant="ghost" label="Unassign" confirm="Remove the driver from this shipment?" action={() => unassignAction({ id })} successMessage="Unassigned" />
        )}
        {canEdit && otpRequired && (
          <ActionButton variant="ghost" label="Resend / show OTP" confirm="Generate a new delivery OTP? The previous one stops working." action={async () => { const r = await regenerateOtpAction({ id }); if (r.ok) setOtp(r.data.otp); return r; }} successMessage="New OTP generated" />
        )}
        {canCancel && <ActionButton variant="danger" label="Cancel" confirm="Cancel this shipment? This can't be undone." action={() => transitionAction({ id, to: "CANCELLED" })} successMessage="Shipment cancelled" />}
      </div>

      {failed && canDispatch && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">Failed delivery — choose what happens next</p>
          <div className="flex flex-wrap gap-2">
            <ModalForm trigger="Reschedule" triggerClassName="btn-secondary btn-sm" title="Reschedule delivery" action={resolveFailureAction} extra={{ id, resolution: "RESCHEDULED" }}>
              <Field name="rescheduleFor" label="New delivery date" type="datetime-local" required /><Field name="note" label="Note" />
            </ModalForm>
            <ActionButton small label="Retry (back to dispatch)" action={() => resolveFailureAction({ id, resolution: "RETRY" })} />
            <ActionButton small label="Return to sender" confirm="Start returning this shipment to the sender?" action={() => resolveFailureAction({ id, resolution: "RETURN_TO_SENDER" })} />
          </div>
        </div>
      )}
      <Modal open={!!otp} onClose={() => setOtp(null)} title="Delivery OTP">
        <p className="text-sm text-slate-600">Share this code with the recipient only. It is not stored in readable form and won&apos;t be shown again.</p>
        <p className="my-4 text-center font-mono text-4xl font-bold tracking-widest">{otp}</p>
        <button className="btn-primary w-full" onClick={() => { toast.push("info", "OTP hidden"); setOtp(null); }}>Done</button>
      </Modal>
    </div>
  );
}
