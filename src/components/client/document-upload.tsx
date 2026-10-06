"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Field, FieldGrid, Modal, SelectField } from "./form";
import { useToast } from "./toast";

export function DocumentUpload({ owners }: { owners: Record<string, { id: string; label: string }[]> }) {
  const router = useRouter(); const toast = useToast();
  const [open, setOpen] = React.useState(false); const [type, setType] = React.useState("DRIVER"); const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await fetch("/api/documents", { method: "POST", body: new FormData(e.currentTarget) });
    setBusy(false);
    if (r.ok) { toast.push("success", "Document uploaded"); setOpen(false); router.refresh(); } else setErr((await r.json().catch(() => ({}))).error ?? "Upload failed");
  }
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Upload document</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Upload document">
        <form onSubmit={submit} className="space-y-4">
          {err && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
          <FieldGrid><div><label className="label" htmlFor="ownerType">Belongs to</label><select id="ownerType" name="ownerType" className="input" value={type} onChange={(e) => setType(e.target.value)}>{["DRIVER", "VEHICLE", "STAFF", "CUSTOMER", "COMPANY"].map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}</select></div>
            {type !== "COMPANY" ? <SelectField name="ownerId" label="Record" required placeholder="Select…" options={(owners[type] ?? []).map((o) => ({ value: o.id, label: o.label }))} /> : <span />}</FieldGrid>
          <FieldGrid><Field name="type" label="Document type" required placeholder="Driver licence, Insurance, Contract…" /><Field name="title" label="Title" required /></FieldGrid>
          <FieldGrid><Field name="issueDate" label="Issue date" type="date" /><Field name="expiryDate" label="Expiry date" type="date" hint="You'll be alerted before it expires" /></FieldGrid>
          <div><label className="label" htmlFor="file">File (PDF, PNG, JPEG, WebP · max 5 MB)</label><input id="file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg,image/webp" /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button></div>
        </form>
      </Modal>
    </>
  );
}
