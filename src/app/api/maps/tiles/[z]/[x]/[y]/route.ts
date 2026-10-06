import { NextResponse } from "next/server";
import { currentUserOrNull } from "@/lib/platform/context";
import { getMapProvider } from "@/lib/platform/maps";

export const dynamic = "force-dynamic";

/** Authenticated tile proxy: keeps provider keys server-side and enforces a sane coordinate range. */
export async function GET(_req: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  if (!(await currentUserOrNull())) return new NextResponse("Unauthorized", { status: 401 });
  const { z, x, y } = await params;
  const [zi, xi, yi] = [z, x, y.replace(/\.png$/, "")].map((v) => Number(v));
  if (![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > 19 || xi < 0 || yi < 0 || xi >= 2 ** zi || yi >= 2 ** zi) return new NextResponse("Bad tile", { status: 400 });
  const url = getMapProvider().upstreamTileUrl(zi, xi, yi);
  if (!url) return new NextResponse("Map provider not configured", { status: 501 });
  try {
    const up = await fetch(url, { headers: { "User-Agent": "logistics-os/1.0 (tile proxy)" }, signal: AbortSignal.timeout(8000) });
    if (!up.ok) return new NextResponse("Upstream error", { status: 502 });
    return new NextResponse(await up.arrayBuffer(), { headers: { "Content-Type": up.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new NextResponse("Tile fetch failed", { status: 502 });
  }
}
