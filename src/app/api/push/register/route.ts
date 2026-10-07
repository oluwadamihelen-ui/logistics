import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/platform/context";
import { AppError } from "@/lib/platform/errors";
import { enforceRateLimit } from "@/lib/platform/rate-limit";
import { prisma } from "@/lib/platform/db";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios", "web"]) });

/** Registers (POST) or removes (DELETE) the calling user's device token for push. Tokens are bound to the signed-in user + tenant. */
export async function POST(req: Request) {
  try {
    const ctx = await requireTenant();
    enforceRateLimit(`push:${ctx.user.id}`, 20, 60_000);
    const { token, platform } = body.parse(await req.json().catch(() => { throw new AppError("VALIDATION", "Body must be JSON"); }));
    // A token belongs to whoever is signed in on the device now: re-point it if it was registered to someone else.
    await prisma.pushDevice.upsert({
      where: { token },
      create: { token, platform, userId: ctx.user.id, companyId: ctx.companyId },
      update: { platform, userId: ctx.user.id, companyId: ctx.companyId, lastSeenAt: new Date() },
    });
    return NextResponse.json({ registered: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireTenant();
    const { token } = z.object({ token: z.string().min(20) }).parse(await req.json().catch(() => ({})));
    await prisma.pushDevice.deleteMany({ where: { token, userId: ctx.user.id } });
    return NextResponse.json({ removed: true });
  } catch (e) { return fail(e); }
}

function fail(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  return NextResponse.json({ error: "Failed" }, { status: 500 });
}
