import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/format";
import type { Tone } from "@/lib/logistics/shipment-status";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 border-b border-line pb-5">
      {back && <Link href={back.href} className="mb-2 inline-block text-xs font-medium text-slate-500 hover:text-brand">← {back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral", href, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; href?: string; icon?: React.ReactNode }) {
  const dot: Record<Tone, string> = { neutral: "bg-slate-300", info: "bg-blue-500", progress: "bg-indigo-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500" };
  const body = (
    <div className="h-full rounded-xl border border-line bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-slate-500"><span className={cn("h-2 w-2 flex-none rounded-full", dot[tone])} />{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="route-motif flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Shown instead of fake data when an integration / feature is not set up. */
export function NotConfigured({ title, description, steps }: { title: string; description: string; steps?: string[] }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h3 className="text-sm font-semibold text-amber-900">{title}</h3>
      <p className="mt-1 text-sm text-amber-800">{description}</p>
      {steps && <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-800">{steps.map((s) => <li key={s}>{s}</li>)}</ol>}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full divide-y divide-line text-slate-700">{children}</table>
    </div>
  );
}
export const THead = ({ children }: { children: React.ReactNode }) => <thead className="bg-slate-50/70"><tr>{children}</tr></thead>;
export const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) => <th className={cn("th", className)}>{children}</th>;
export const TBody = ({ children }: { children: React.ReactNode }) => <tbody className="divide-y divide-line bg-white">{children}</tbody>;
export const TR = ({ children, className }: { children: React.ReactNode; className?: string }) => <tr className={cn("hover:bg-slate-50/60", className)}>{children}</tr>;
export const TD = ({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cn("td", className)}>{children}</td>;

export function Pagination({ page, pages, total, basePath, params }: { page: number; pages: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-500">
      <span>{total.toLocaleString()} result{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        {page > 1 ? <Link className="btn-secondary btn-sm" href={href(page - 1)}>Previous</Link> : <span className="btn-secondary btn-sm pointer-events-none opacity-40">Previous</span>}
        <span className="tabular-nums">Page {page} of {pages}</span>
        {page < pages ? <Link className="btn-secondary btn-sm" href={href(page + 1)}>Next</Link> : <span className="btn-secondary btn-sm pointer-events-none opacity-40">Next</span>}
      </div>
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: React.ReactNode }) {
  const c = { info: "border-blue-200 bg-blue-50 text-blue-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900", warning: "border-amber-200 bg-amber-50 text-amber-900", danger: "border-red-200 bg-red-50 text-red-900" }[tone];
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", c)} role="alert">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export function DescriptionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink [overflow-wrap:anywhere]">{i.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const i = name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand", className)}>{i}</span>;
}

export function Tabs({ tabs, active, basePath }: { tabs: { key: string; label: string; count?: number }[]; active: string; basePath: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={`${basePath}?tab=${t.key}`} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", active === t.key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink")}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
