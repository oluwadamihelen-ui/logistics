"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { createApiKeyAction, createWebhookAction } from "@/app/(app)/settings/api-actions";
import { CheckboxField, Field, Form, Modal, SelectField } from "./form";
import { SecretModal } from "./secret-reveal";
import { API_SCOPES } from "@/lib/platform/api-scopes";

export function ApiKeyForm({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter(); const [open, setOpen] = React.useState(false); const [secret, setSecret] = React.useState<string | null>(null);
  return (<>
    <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>Create API key</button>
    <Modal open={open} onClose={() => setOpen(false)} title="New API key">
      <Form action={createApiKeyAction} successMessage="" onSuccess={(d: any) => { setOpen(false); setSecret(d.key); }}>
        <Field name="name" label="Name" required placeholder="Shopify integration" />
        <SelectField name="customerId" label="Restrict to corporate customer (optional)" placeholder="Whole company" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
        <p className="text-sm font-medium">Scopes</p><div className="grid grid-cols-2 gap-2">{API_SCOPES.map((s) => <CheckboxField key={s} name="scopes[]" value={s} label={s} defaultChecked={s !== "shipments:cancel"} />)}</div>
      </Form>
    </Modal>
    <SecretModal secret={secret} title="Your API key" onClose={() => { setSecret(null); router.refresh(); }} />
  </>);
}

export function WebhookForm() {
  const router = useRouter(); const [open, setOpen] = React.useState(false); const [secret, setSecret] = React.useState<string | null>(null);
  return (<>
    <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>Add webhook</button>
    <Modal open={open} onClose={() => setOpen(false)} title="New webhook endpoint">
      <Form action={createWebhookAction} successMessage="" onSuccess={(d: any) => { setOpen(false); setSecret(d.secret); }}>
        <Field name="url" label="HTTPS URL" type="url" required placeholder="https://example.com/hooks/shipments" />
        <CheckboxField name="events[]" value="shipment.status_changed" label="shipment.status_changed" defaultChecked />
      </Form>
    </Modal>
    <SecretModal secret={secret} title="Webhook signing secret" onClose={() => { setSecret(null); router.refresh(); }} />
  </>);
}
