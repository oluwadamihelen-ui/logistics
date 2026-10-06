/**
 * Map-provider abstraction. The app talks to this interface only; nothing else knows which provider is used.
 *
 *  - osm    : OpenStreetMap raster tiles (no key). The public tile server has a strict usage policy —
 *             fine for development/small use; set MAPS_TILE_URL to your own/commercial tiles for production.
 *  - mapbox : Mapbox raster tiles (needs MAPS_PROVIDER_KEY).
 *  - google : navigation deep-links only in this build (embedded Google map not implemented).
 *
 * Tile requests go through /api/maps/tiles (server-side proxy) so provider keys never reach the browser.
 */
export type MapProviderId = "osm" | "mapbox" | "google";

export interface MapProvider {
  id: MapProviderId;
  label: string;
  /** Can this provider render the embedded live map? */
  embeddedMap: boolean;
  configured: boolean;
  attribution: string;
  /** Upstream tile URL (server-side only; contains the key). */
  upstreamTileUrl(z: number, x: number, y: number): string | null;
  navigationUrl(dest: { lat?: number | null; lng?: number | null; address?: string }): string;
}

function dest(d: { lat?: number | null; lng?: number | null; address?: string }) {
  return d.lat != null && d.lng != null ? `${d.lat},${d.lng}` : encodeURIComponent(d.address ?? "");
}

const providers: Record<MapProviderId, () => MapProvider> = {
  osm: () => ({
    id: "osm", label: "OpenStreetMap", embeddedMap: true, configured: true, attribution: "© OpenStreetMap contributors",
    upstreamTileUrl: (z, x, y) => (process.env.MAPS_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png").replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)).replace("{key}", process.env.MAPS_PROVIDER_KEY ?? ""),
    navigationUrl: (d) => d.lat != null && d.lng != null ? `https://www.openstreetmap.org/directions?to=${d.lat}%2C${d.lng}` : `https://www.openstreetmap.org/search?query=${dest(d)}`,
  }),
  mapbox: () => ({
    id: "mapbox", label: "Mapbox", embeddedMap: true, configured: !!process.env.MAPS_PROVIDER_KEY, attribution: "© Mapbox © OpenStreetMap",
    upstreamTileUrl: (z, x, y) => process.env.MAPS_PROVIDER_KEY ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/${z}/${x}/${y}?access_token=${process.env.MAPS_PROVIDER_KEY}` : null,
    navigationUrl: (d) => `https://www.google.com/maps/dir/?api=1&destination=${dest(d)}`,
  }),
  google: () => ({
    id: "google", label: "Google Maps", embeddedMap: false, configured: true, attribution: "",
    upstreamTileUrl: () => null,
    navigationUrl: (d) => `https://www.google.com/maps/dir/?api=1&destination=${dest(d)}`,
  }),
};

export function getMapProvider(): MapProvider {
  const id = (process.env.MAPS_PROVIDER ?? "osm") as MapProviderId;
  return (providers[id] ?? providers.osm)();
}

/** Navigation links are always available even if the embedded map is not. */
export function navigationUrl(d: { lat?: number | null; lng?: number | null; address?: string }) {
  return getMapProvider().navigationUrl(d);
}
