"use client";
import * as React from "react";

/**
 * Background GPS inside the Capacitor shell. Uses the @capacitor-community/background-geolocation plugin when it is
 * present (window.Capacitor.Plugins.BackgroundGeolocation) and posts to /api/driver/location with the existing session
 * cookie. In a normal browser this component does nothing (GpsReporter covers foreground use).
 */
type Watcher = { id: string };
export function NativeBridge({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    const cap = (window as any).Capacitor;
    const plugin = cap?.isNativePlatform?.() ? cap.Plugins?.BackgroundGeolocation : null;
    if (!enabled || !plugin) return;
    let id: string | null = null;
    let last = 0;
    plugin.addWatcher(
      { backgroundMessage: "Sharing your location with dispatch while you're on shift.", backgroundTitle: "On shift", requestPermissions: true, stale: false, distanceFilter: 25 },
      (loc: any, err: any) => {
        if (err || !loc || Date.now() - last < 15_000) return;
        last = Date.now();
        fetch("/api/driver/location", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ lat: loc.latitude, lng: loc.longitude, accuracyM: loc.accuracy, speedKmh: loc.speed != null ? loc.speed * 3.6 : undefined, heading: loc.bearing ?? undefined, recordedAt: loc.time ? new Date(loc.time).toISOString() : undefined }) }).catch(() => undefined);
      },
    ).then((w: string | Watcher) => { id = typeof w === "string" ? w : w.id; });
    return () => { if (id) plugin.removeWatcher({ id }); };
  }, [enabled]);
  return null;
}
