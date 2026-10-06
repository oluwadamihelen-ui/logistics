"use client";
import * as React from "react";
import { Field, FieldGrid, ModalForm, SelectField } from "./form";

export function DriverForm({ action, branches, vehicles, trigger, title, initial, extra, triggerClassName }: {
  action: (i: any) => Promise<any>; branches: { id: string; name: string }[]; vehicles: { id: string; registrationNumber: string }[]; trigger: string; title: string; extra?: Record<string, unknown>; triggerClassName?: string;
  initial?: { name?: string; phone?: string; kind?: string; branchId?: string | null; licenseNumber?: string | null; payModel?: string; licenseExpiry?: string | null; vehicleId?: string | null; rates?: Record<string, number> };
}) {
  const [login, setLogin] = React.useState(false);
  const r = initial?.rates ?? {};
  return (
    <ModalForm trigger={trigger} triggerClassName={triggerClassName} title={title} action={action} extra={extra} wide>
      <FieldGrid><Field name="name" label="Full name" required defaultValue={initial?.name} /><Field name="phone" label="Phone" type="tel" required defaultValue={initial?.phone} /></FieldGrid>
      <FieldGrid>
        <SelectField name="kind" label="Role" defaultValue={initial?.kind ?? "DRIVER"} options={[{ value: "DRIVER", label: "Driver" }, { value: "RIDER", label: "Rider (motorcycle/bike)" }]} />
        <SelectField name="branchId" label="Branch" placeholder="None" defaultValue={initial?.branchId ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        <Field name="licenseNumber" label="Licence number" defaultValue={initial?.licenseNumber ?? ""} /><Field name="licenseExpiry" label="Licence expiry" type="date" defaultValue={initial?.licenseExpiry?.slice(0, 10)} />
        <SelectField name="vehicleId" label="Assigned vehicle" placeholder="None" defaultValue={initial?.vehicleId ?? ""} options={vehicles.map((v) => ({ value: v.id, label: v.registrationNumber }))} />
        <SelectField name="payModel" label="Pay model" defaultValue={initial?.payModel ?? "PER_DELIVERY"} options={[{ value: "PER_DELIVERY", label: "Per delivery" }, { value: "PER_TRIP", label: "Per trip" }, { value: "PERCENTAGE", label: "Percentage of fee" }, { value: "SALARY", label: "Salary" }, { value: "HYBRID", label: "Hybrid (salary + per delivery)" }]} />
      </FieldGrid>
      <FieldGrid cols={3}>
        <Field name="payPerDelivery" label="Per delivery" type="number" min="0" defaultValue={r.perDelivery} /><Field name="payPerTrip" label="Per trip" type="number" min="0" defaultValue={r.perTrip} />
        <Field name="payPercentage" label="Percentage %" type="number" min="0" max="100" step="0.1" defaultValue={r.percentage} /><Field name="paySalary" label="Monthly salary" type="number" min="0" defaultValue={r.salary} />
      </FieldGrid>
      {!initial && <>
        <div className="rounded-lg bg-slate-50 p-3"><button type="button" className="text-xs font-medium text-brand" onClick={() => setLogin((v) => !v)}>{login ? "Hide" : "Set"} login credentials</button>
          {login && <FieldGrid><Field name="loginEmail" label="Login email" type="email" /><Field name="loginPassword" label="Password" type="password" minLength={10} hint="10+ characters, letters and numbers" /></FieldGrid>}</div></>}
    </ModalForm>
  );
}
