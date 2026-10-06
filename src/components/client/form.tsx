"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/platform/errors";
import { cn } from "@/lib/utils/format";
import { useToast } from "./toast";

type FormState = { errors: Record<string, string[]>; pending: boolean };
const FormCtx = React.createContext<FormState>({ errors: {}, pending: false });

function readForm(form: HTMLFormElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
    if (!el.name || el.disabled) continue;
    const name = el.name;
    const isArray = name.endsWith("[]");
    const key = isArray ? name.slice(0, -2) : name;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      if (isArray) { if (el.checked) ((out[key] as string[]) ??= []).push(el.value); else out[key] ??= []; }
      else out[key] = el.checked;
      continue;
    }
    if (el instanceof HTMLInputElement && el.type === "radio") { if (el.checked) out[key] = el.value; continue; }
    if (el instanceof HTMLSelectElement && el.multiple) { out[key] = Array.from(el.selectedOptions).map((o) => o.value); continue; }
    const v = el.value;
    if (isArray) { if (v !== "") ((out[key] as string[]) ??= []).push(v); continue; }
    if (v === "") continue; // empty → undefined (optional fields)
    if (el instanceof HTMLInputElement && el.type === "datetime-local") { out[key] = new Date(v).toISOString(); continue; }
    out[key] = v;
  }
  return out;
}

export function Form<T = unknown>({
  action, children, onSuccess, successMessage, submitLabel = "Save", className, resetOnSuccess, redirectTo, hideSubmit, extra, cancel,
}: {
  action: (input: any) => Promise<ActionResult<T>>;
  children: React.ReactNode;
  onSuccess?: (data: T) => void;
  successMessage?: string;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  redirectTo?: (data: T) => string;
  hideSubmit?: boolean;
  /** Extra values merged into the payload (e.g. ids). */
  extra?: Record<string, unknown>;
  cancel?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = React.useState<FormState>({ errors: {}, pending: false });
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    setState({ errors: {}, pending: true });
    try {
      const res = await action({ ...readForm(form), ...(extra ?? {}) });
      if (res.ok) {
        setState({ errors: {}, pending: false });
        if (successMessage !== "") toast.push("success", successMessage ?? "Saved");
        if (resetOnSuccess) form.reset();
        onSuccess?.(res.data);
        if (redirectTo) router.push(redirectTo(res.data));
        router.refresh();
      } else {
        setState({ errors: res.fieldErrors ?? {}, pending: false });
        setError(res.error);
      }
    } catch {
      setState({ errors: {}, pending: false });
      setError("Network error. Check your connection and try again.");
    }
  }

  return (
    <FormCtx.Provider value={state}>
      <form onSubmit={onSubmit} className={cn("space-y-4", className)}>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {children}
        {!hideSubmit && (
          <div className="flex items-center justify-end gap-2 pt-1">
            {cancel}
            <button type="submit" className="btn-primary" disabled={state.pending}>{state.pending ? "Saving…" : submitLabel}</button>
          </div>
        )}
      </form>
    </FormCtx.Provider>
  );
}

interface BaseFieldProps { name: string; label: string; hint?: string; required?: boolean; className?: string }

function FieldShell({ name, label, hint, required, className, children }: BaseFieldProps & { children: React.ReactNode }) {
  const { errors } = React.useContext(FormCtx);
  const err = errors[name]?.[0];
  return (
    <div className={className}>
      <label htmlFor={name} className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {hint && !err && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function Field({ name, label, hint, required, className, ...rest }: BaseFieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  return (
    <FieldShell {...{ name, label, hint, required, className }}>
      <input id={name} name={name} required={required} className="input" {...rest} />
    </FieldShell>
  );
}

export function TextareaField({ name, label, hint, required, className, ...rest }: BaseFieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  return (
    <FieldShell {...{ name, label, hint, required, className }}>
      <textarea id={name} name={name} required={required} rows={3} className="input" {...rest} />
    </FieldShell>
  );
}

export function SelectField({ name, label, hint, required, className, options, placeholder, ...rest }: BaseFieldProps & { options: { value: string; label: string }[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return (
    <FieldShell {...{ name, label, hint, required, className }}>
      <select id={name} name={name} required={required} className="input" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, hint, className, defaultChecked, value }: { name: string; label: string; hint?: string; className?: string; defaultChecked?: boolean; value?: string }) {
  return (
    <label className={cn("flex items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30" />
      <span><span className="font-medium text-ink">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cn("grid gap-4", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-1 sm:grid-cols-2", cols === 3 && "grid-cols-1 sm:grid-cols-3")}>{children}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Button that opens a modal containing a Form; closes on success. */
export function ModalForm<T = unknown>({ trigger, triggerClassName = "btn-primary", title, action, children, submitLabel, wide, extra, successMessage, redirectTo, onSuccess }: {
  trigger: React.ReactNode; triggerClassName?: string; title: string; action: (input: any) => Promise<ActionResult<T>>; children: React.ReactNode; submitLabel?: string; wide?: boolean; extra?: Record<string, unknown>; successMessage?: string; redirectTo?: (d: T) => string; onSuccess?: (d: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        <Form action={action} submitLabel={submitLabel} extra={extra} successMessage={successMessage} redirectTo={redirectTo} onSuccess={(d) => { setOpen(false); onSuccess?.(d); }} cancel={<button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>}>
          {children}
        </Form>
      </Modal>
    </>
  );
}

/** Button that confirms, runs a server action, toasts the result and refreshes. */
export function ActionButton<T = unknown>({ action, label, confirm, variant = "secondary", small, successMessage, onSuccess, disabled, className }: {
  action: () => Promise<ActionResult<T>>; label: React.ReactNode; confirm?: string; variant?: "primary" | "secondary" | "danger" | "ghost"; small?: boolean; successMessage?: string; onSuccess?: (d: T) => void; disabled?: boolean; className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [askOpen, setAskOpen] = React.useState(false);

  async function run() {
    setAskOpen(false);
    setPending(true);
    try {
      const r = await action();
      if (r.ok) { toast.push("success", successMessage ?? "Done"); onSuccess?.(r.data); router.refresh(); }
      else toast.push("error", r.error);
    } catch { toast.push("error", "Network error. Please try again."); }
    setPending(false);
  }
  return (
    <>
      <button type="button" disabled={pending || disabled} className={cn(`btn-${variant}`, small && "btn-sm", className)} onClick={() => (confirm ? setAskOpen(true) : run())}>
        {pending ? "Working…" : label}
      </button>
      <Modal open={askOpen} onClose={() => setAskOpen(false)} title="Please confirm">
        <p className="text-sm text-slate-600">{confirm}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setAskOpen(false)}>Cancel</button>
          <button className={variant === "danger" ? "btn-danger" : "btn-primary"} onClick={run}>Confirm</button>
        </div>
      </Modal>
    </>
  );
}
