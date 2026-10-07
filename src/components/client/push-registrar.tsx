"use client";
import * as React from "react";

const KEY = "push-token";

/**
 * Registers this device for push inside the Capacitor shell (no-op in a normal browser).
 * The token is bound to the signed-in user server-side and removed again on sign-out.
 */
export function PushRegistrar() {
  React.useEffect(() => {
    const cap = (window as any).Capacitor;
    const plugin = cap?.isNativePlatform?.() ? cap.Plugins?.PushNotifications : null;
    if (!plugin) return;
    const platform = cap.getPlatform?.() === "ios" ? "ios" : "android";
    const handles: Array<{ remove: () => void }> = [];
    (async () => {
      const perm = await plugin.requestPermissions();
      if (perm.receive !== "granted") return;
      handles.push(await plugin.addListener("registration", (t: { value: string }) => {
        try { localStorage.setItem(KEY, t.value); } catch { /* storage unavailable */ }
        fetch("/api/push/register", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t.value, platform }) }).catch(() => undefined);
      }));
      handles.push(await plugin.addListener("pushNotificationActionPerformed", (a: any) => {
        const url = a?.notification?.data?.url;
        if (typeof url === "string" && url.startsWith("/")) window.location.assign(url);
      }));
      await plugin.register();
    })().catch(() => undefined);
    return () => handles.forEach((h) => h.remove());
  }, []);
  return null;
}

/** Called before sign-out so a shared device stops receiving the previous user's alerts. */
export async function unregisterPush() {
  try {
    const token = localStorage.getItem(KEY);
    if (!token) return;
    await fetch("/api/push/register", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    localStorage.removeItem(KEY);
  } catch { /* best effort */ }
}
