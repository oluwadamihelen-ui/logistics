"use client";
import * as React from "react";
import "leaflet/dist/leaflet.css";
import type * as Lf from "leaflet";

interface MapData {
  at: string;
  drivers: { id: string; name: string; kind: string; status: string; lat: number | null; lng: number | null; lastAt: string | null; vehicle: string | null; current: { trackingNumber: string; status: string; count: number } | null }[];
  hubs: { id: string; name: string; type: string; lat: number; lng: number }[];
  branches: { id: string; name: string; lat: number; lng: number }[];
  destinations: { id: string; tn: string; status: string; lat: number; lng: number; address: string; driverId: string | null }[];
}

const COLORS: Record<string, string> = { AVAILABLE: "#1baf7a", ON_PICKUP: "#2a78d6", ON_DELIVERY: "#4a3aa7", IDLE: "#eda100", OFFLINE: "#94a3b8", EMERGENCY: "#e34948" };
const STALE_MS = 15 * 60_000;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function LiveMap({ attribution }: { attribution: string }) {
  const el = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<Lf.Map | null>(null);
  const layerRef = React.useRef<Lf.LayerGroup | null>(null);
  const L = React.useRef<typeof Lf | null>(null);
  const fitted = React.useRef(false);
  const [data, setData] = React.useState<MapData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<string>("");

  React.useEffect(() => {
    let dead = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (dead || !el.current || mapRef.current) return;
      L.current = leaflet;
      const map = leaflet.map(el.current, { zoomControl: true }).setView([6.5244, 3.3792], 11);
      leaflet.tileLayer("/api/maps/tiles/{z}/{x}/{y}", { maxZoom: 19, attribution }).addTo(map);
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
    })();
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [attribution]);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch("/api/map/data", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load");
      setData(await r.json()); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load map data"); }
  }, []);
  React.useEffect(() => { void load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);

  React.useEffect(() => {
    const leaflet = L.current, layer = layerRef.current, map = mapRef.current;
    if (!data || !leaflet || !layer || !map) return;
    layer.clearLayers();
    const pts: [number, number][] = [];
    for (const h of data.hubs) { leaflet.marker([h.lat, h.lng], { icon: leaflet.divIcon({ className: "", html: `<div style="background:#0f172a;color:#fff;border-radius:6px;padding:2px 6px;font:600 11px sans-serif;white-space:nowrap">🏭 ${esc(h.name)}</div>` }) }).addTo(layer); pts.push([h.lat, h.lng]); }
    for (const b of data.branches) { leaflet.circleMarker([b.lat, b.lng], { radius: 6, color: "#0f172a", fillColor: "#fff", fillOpacity: 1 }).bindTooltip(esc(b.name)).addTo(layer); }
    for (const d of data.destinations) {
      if (filter && d.driverId !== filter) continue;
      leaflet.circleMarker([d.lat, d.lng], { radius: 5, color: "#eb6834", fillColor: "#eb6834", fillOpacity: 0.7 }).bindPopup(`<b>${esc(d.tn)}</b><br>${esc(d.status.replace(/_/g, " ").toLowerCase())}<br>${esc(d.address)}`).addTo(layer);
    }
    for (const d of data.drivers) {
      if (d.lat === null || d.lng === null) continue;
      if (filter && d.id !== filter) continue;
      const stale = !d.lastAt || Date.now() - new Date(d.lastAt).getTime() > STALE_MS;
      const color = stale && d.status !== "EMERGENCY" ? "#94a3b8" : COLORS[d.status] ?? "#64748b";
      const mins = d.lastAt ? Math.max(0, Math.round((Date.now() - new Date(d.lastAt).getTime()) / 60000)) : null;
      leaflet.marker([d.lat, d.lng], { icon: leaflet.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px sans-serif">${esc(d.name.split(" ").map((p) => p[0]).slice(0, 2).join(""))}</div>` }) })
        .bindPopup(`<b>${esc(d.name)}</b> (${d.kind === "RIDER" ? "rider" : "driver"})<br>Status: ${esc(d.status.replace(/_/g, " ").toLowerCase())}${stale ? " (stale GPS)" : ""}<br>Vehicle: ${esc(d.vehicle ?? "—")}<br>Shipment: ${d.current ? `${esc(d.current.trackingNumber)}${d.current.count > 1 ? ` +${d.current.count - 1}` : ""}` : "none"}<br>Last GPS update: ${mins === null ? "never" : mins < 1 ? "just now" : `${mins} min ago`}`).addTo(layer);
      pts.push([d.lat, d.lng]);
    }
    if (!fitted.current && pts.length) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); fitted.current = true; }
  }, [data, filter]);

  const withGps = data?.drivers.filter((d) => d.lat !== null).length ?? 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <select className="input !w-auto" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Focus driver"><option value="">All drivers</option>{data?.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        {Object.entries(COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: c }} />{k.replace(/_/g, " ").toLowerCase()}</span>)}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#eb6834]" />destination</span>
        <span className="ml-auto text-slate-500">{data ? `${withGps}/${data.drivers.length} drivers sharing GPS · refreshed ${new Date(data.at).toLocaleTimeString()}` : "Loading…"}</span>
      </div>
      {err && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
      <div ref={el} className="h-[68vh] w-full overflow-hidden rounded-xl border border-line" role="application" aria-label="Live operations map" />
      {data && withGps === 0 && <p className="mt-2 text-sm text-slate-500">No driver has reported a GPS position yet. Positions appear when drivers go online in the driver app.</p>}
    </div>
  );
}
