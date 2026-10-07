"use client";
import * as React from "react";

/** Registers the offline app-shell service worker (driver area only; production builds). */
export function OfflineRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

/** Wipes service-worker caches (called on sign-out). */
export async function clearOfflineCaches() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.active?.postMessage("clear");
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* best effort */ }
}
