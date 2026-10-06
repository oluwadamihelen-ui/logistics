"use client";
import { Field, FieldGrid, ModalForm, SelectField } from "./form";

const d = (v?: Date | string | null) => (v ? new Date(v).toISOString().slice(0, 10) : undefined);

export function VehicleForm({ action, trigger, title, extra, triggerClassName, initial }: { action: (i: any) => Promise<any>; trigger: string; title: string; extra?: Record<string, unknown>; triggerClassName?: string; initial?: Record<string, any> }) {
  return (
    <ModalForm trigger={trigger} triggerClassName={triggerClassName} title={title} action={action} extra={extra} wide>
      <FieldGrid>
        <Field name="registrationNumber" label="Registration number" required defaultValue={initial?.registrationNumber} />
        <SelectField name="type" label="Type" defaultValue={initial?.type ?? "MOTORCYCLE"} options={["MOTORCYCLE", "CAR", "VAN", "TRUCK", "BUS", "OTHER"].map((t) => ({ value: t, label: t[0] + t.slice(1).toLowerCase() }))} />
        <Field name="make" label="Make" defaultValue={initial?.make ?? ""} /><Field name="model" label="Model" defaultValue={initial?.model ?? ""} />
        <Field name="year" label="Year" type="number" defaultValue={initial?.year ?? ""} /><Field name="capacityKg" label="Capacity (kg)" type="number" defaultValue={initial?.capacityKg ? Number(initial.capacityKg) : ""} />
        <Field name="mileageKm" label="Mileage (km)" type="number" defaultValue={initial?.mileageKm ?? ""} /><Field name="fuelType" label="Fuel type" defaultValue={initial?.fuelType ?? ""} />
        <Field name="insuranceExpiry" label="Insurance expiry" type="date" defaultValue={d(initial?.insuranceExpiry)} /><Field name="inspectionExpiry" label="Inspection expiry" type="date" defaultValue={d(initial?.inspectionExpiry)} />
        <Field name="roadworthinessExpiry" label="Roadworthiness expiry" type="date" defaultValue={d(initial?.roadworthinessExpiry)} /><Field name="nextServiceAt" label="Next service date" type="date" defaultValue={d(initial?.nextServiceAt)} />
        <Field name="nextServiceKm" label="Next service at (km)" type="number" defaultValue={initial?.nextServiceKm ?? ""} />
      </FieldGrid>
    </ModalForm>
  );
}
