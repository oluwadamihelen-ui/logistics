"use client";
import * as React from "react";
import { driverLocationAction } from "@/app/driver/actions";

/**
 * Reports the device position while the driver app is open and the driver is online.
 * Samples are buffered while offline and sent in batches. In the Capacitor shell the native
 * background-geolocation plugin feeds the same server action (see docs/MOBILE.md).
 */
export function GpsReporter({ enabled, onPosition }: { enabled: boolean; onPosition?: (p: { lat: number; lng: number }) => void }) {
  const buf = React.useRef<{ lat: number; lng: number; speedKmh?: number; heading?: number; accuracyM?: number; recordedAt: string }[]>([]);
  const last = React.useRef(0);
  const [state, setState] = React.useState<"idle" | "ok" | "denied" | "unsupported">("idle");

  React.useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) { setState("unsupported"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState("ok");
        onPosition?.({ lat: p.coords.latitude, lng: p.coords.longitude });
        const now = Date.now();
        if (now - last.current < 20_000) return;
        last.current = now;
        buf.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : undefined, heading: p.coords.heading ?? undefined, accuracyM: p.coords.accuracy, recordedAt: new Date(p.timestamp).toISOString() });
        if (buf.current.length > 200) buf.current.splice(0, buf.current.length - 200);
        void send();
      },
      (e) => setState(e.code === 1 ? "denied" : "idle"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    const t = setInterval(() => void send(), 60_000);
    window.addEventListener("online", send);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(t); window.removeEventListener("online", send); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function send() {
    if (!buf.current.length || !navigator.onLine) return;
    const batch = buf.current.splice(0, 50);
    try {
      const r = await driverLocationAction(batch);
      if (!r.ok && r.code !== "VALIDATION") buf.current.unshift(...batch);
    } catch { buf.current.unshift(...batch); }
  }

  if (!enabled) return null;
  return <p className="text-xs text-slate-500">{state === "ok" ? "● GPS sharing active" : state === "denied" ? "⚠ Location permission denied — dispatch cannot see you" : state === "unsupported" ? "⚠ GPS unavailable on this device" : "Waiting for GPS…"}</p>;
}
