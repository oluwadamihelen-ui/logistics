"use client";
import * as React from "react";
import { Modal } from "./form";

/** Shows a secret exactly once after creation. */
export function SecretModal({ secret, title, onClose }: { secret: string | null; title: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Modal open={!!secret} onClose={onClose} title={title}>
      <p className="text-sm text-slate-600">Copy this now — it won&apos;t be shown again.</p>
      <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-300">{secret}</pre>
      <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={async () => { await navigator.clipboard?.writeText(secret ?? ""); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button><button className="btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}
