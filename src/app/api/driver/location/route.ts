import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/platform/context";
import { AppError } from "@/lib/platform/errors";
import { enforceRateLimit } from "@/lib/platform/rate-limit";
import { recordLocation } from "@/lib/logistics/drivers";

export const dynamic = "force-dynamic";

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), speedKmh: z.number().min(0).max(400).optional(), heading: z.number().min(0).max(360).optional(), accuracyM: z.number().min(0).optional(), recordedAt: z.coerce.date().optional() });

/**
 * GPS ingestion for the native (Capacitor) background-geolocation plugin and any other client.
 * Uses the same session cookie as the web app — no separate auth system. The driver can only write their OWN position.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireTenant("driver.app");
    if (!ctx.user.driverId) throw new AppError("FORBIDDEN", "No driver profile is linked to this login.");
    enforceRateLimit(`gps:${ctx.user.driverId}`, 30, 60_000);
    const pts = z.array(point).min(1).max(50).parse(await req.json().then((j) => (Array.isArray(j) ? j : [j])).catch(() => { throw new AppError("VALIDATION", "Body must be JSON"); }));
    for (const p of pts) await recordLocation(ctx, ctx.user.driverId, p);
    return NextResponse.json({ stored: pts.length });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid location payload" }, { status: 422 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
