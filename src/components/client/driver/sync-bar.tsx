"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { all, flush, remove, type QueueItem } from "@/lib/driver/offline-queue";
import { senders } from "@/lib/driver/senders";

/** Shows connectivity + sync state and flushes the outbox when back online. */
export function SyncBar() {
  const router = useRouter();
  const [online, setOnline] = React.useState(true);
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [syncing, setSyncing] = React.useState(false);

  const refresh = React.useCallback(async () => setItems(await all().catch(() => [])), []);
  const sync = React.useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const r = await flush(senders).catch(() => null);
    setSyncing(false);
    await refresh();
    if (r?.sent) router.refresh();
  }, [refresh, router]);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void sync(); }, off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const t = setInterval(() => void sync(), 30_000);
    void refresh(); void sync();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [sync, refresh]);

  const pending = items.filter((i) => i.state === "pending").length;
  const failed = items.filter((i) => i.state === "failed");
  if (online && !pending && !failed.length) return null;
  return (
    <div className="space-y-2">
      {(!online || pending > 0) && <div className={`rounded-lg px-3 py-2 text-sm ${online ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-900"}`} role="status">{!online ? "You're offline. " : ""}{pending ? `${pending} update${pending > 1 ? "s" : ""} waiting to sync${syncing ? "…" : ""}` : "All updates synced"}{online && pending > 0 && !syncing && <button className="ml-2 font-semibold underline" onClick={sync}>Sync now</button>}</div>}
      {failed.map((f) => <div key={f.id} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">An update could not be applied: {f.error}. <button className="ml-1 font-semibold underline" onClick={async () => { await remove(f.id); await refresh(); }}>Dismiss</button></div>)}
    </div>
  );
}
