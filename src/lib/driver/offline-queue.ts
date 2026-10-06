"use client";
/**
 * Offline-aware outbox for driver actions.
 *
 * Every queued item carries a client-generated `clientEventId`. The server treats that id as an
 * idempotency key (status changes, proof of delivery, failed deliveries), so a retry after an
 * ambiguous network failure can never create a duplicate update.
 *
 * Storage is IndexedDB (proof photos/signatures are too big for localStorage).
 */
export type QueueKind = "transition" | "complete" | "fail";
export interface QueueItem {
  id: string; // = clientEventId
  kind: QueueKind;
  shipmentId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  state: "pending" | "failed";
  error?: string;
}

const DB = "driver-outbox";
const STORE = "items";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const newEventId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const enqueue = (item: QueueItem) => tx("readwrite", (s) => s.put(item));
export const remove = (id: string) => tx("readwrite", (s) => s.delete(id));
export const all = async (): Promise<QueueItem[]> => ((await tx("readonly", (s) => s.getAll())) as QueueItem[]).sort((a, b) => a.createdAt - b.createdAt);

type Result = { ok: true; data?: unknown } | { ok: false; error: string; code: string };
export type Senders = Record<QueueKind, (payload: any) => Promise<Result>>;

/** Errors that will never succeed on retry (business rule / auth) are parked as "failed" for the driver to see. */
const PERMANENT = new Set(["VALIDATION", "FORBIDDEN", "NOT_FOUND", "UNAUTHENTICATED"]);

let flushing = false;
export async function flush(senders: Senders): Promise<{ sent: number; failed: number; left: number }> {
  if (flushing) return { sent: 0, failed: 0, left: (await all()).length };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    for (const item of await all()) {
      if (item.state === "failed") continue;
      try {
        const res = await senders[item.kind]({ ...item.payload, id: item.shipmentId, clientEventId: item.id });
        if (res.ok) { await remove(item.id); sent++; }
        else if (res.code === "INVALID_STATE" || PERMANENT.has(res.code)) {
          // INVALID_STATE usually means it was already applied (e.g. replay) — still surface rather than silently drop.
          await enqueue({ ...item, state: "failed", error: res.error, attempts: item.attempts + 1 }); failed++;
        } else break; // transient server problem: stop, retry later, preserve order
      } catch {
        break; // network error: stop and retry on reconnect
      }
    }
  } finally { flushing = false; }
  return { sent, failed, left: (await all()).filter((i) => i.state === "pending").length };
}
