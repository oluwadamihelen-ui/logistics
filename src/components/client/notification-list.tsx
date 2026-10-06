"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dismissAction, markReadAction } from "@/app/(app)/notifications/actions";
import { Badge } from "@/components/ui";
import { cn, relativeTime, titleCase } from "@/lib/utils/format";

export interface NItem { id: string; category: string; priority: string; title: string; body: string; actionUrl: string | null; readAt: string | null; createdAt: string; ai: boolean }
const TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = { CRITICAL: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral", INFO: "neutral" };

export function NotificationList({ items }: { items: NItem[] }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  async function run(fn: () => Promise<unknown>) { await fn(); setSel(new Set()); router.refresh(); }
  const ids = [...sel];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
        <label className="flex items-center gap-2"><input type="checkbox" checked={sel.size === items.length && items.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} />Select all</label>
        <button className="btn-ghost btn-sm" disabled={!sel.size} onClick={() => run(() => markReadAction({ ids }))}>Mark read</button>
        <button className="btn-ghost btn-sm" disabled={!sel.size} onClick={() => run(() => markReadAction({ ids, unread: true }))}>Mark unread</button>
        <button className="btn-ghost btn-sm" disabled={!sel.size} onClick={() => run(() => dismissAction({ ids }))}>Dismiss</button>
        <button className="btn-ghost btn-sm ml-auto" onClick={() => run(() => markReadAction({ all: true }))}>Mark all read</button>
      </div>
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-brand-soft/40")}>
            <input type="checkbox" className="mt-1" checked={sel.has(n.id)} onChange={() => setSel((p) => { const s = new Set(p); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s; })} aria-label="Select notification" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[n.priority]}>{n.priority.toLowerCase()}</Badge><Badge>{titleCase(n.category)}</Badge>{n.ai && <Badge tone="progress">AI</Badge>}{!n.readAt && <span className="h-2 w-2 rounded-full bg-brand" aria-label="Unread" />}</div>
              <p className="mt-1 text-sm font-medium">{n.title}</p><p className="text-sm text-slate-600">{n.body}</p>
              <p className="mt-1 text-xs text-slate-400">{relativeTime(n.createdAt)}{n.actionUrl && <> · <Link href={n.actionUrl} onClick={() => markReadAction({ ids: [n.id] })} className="font-medium text-brand">Open</Link></>}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
