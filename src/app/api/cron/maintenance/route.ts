import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runMaintenance } from "@/lib/platform/jobs";

export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // disabled unless configured
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runMaintenance());
}

/** POST for any scheduler; GET because Vercel Cron issues GET requests (it sends `Authorization: Bearer $CRON_SECRET`). */
export const POST = handle;
export const GET = handle;

export const maxDuration = 60;
