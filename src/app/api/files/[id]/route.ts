import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/platform/context";
import { AppError } from "@/lib/platform/errors";
import { getStorage } from "@/lib/platform/storage";

export const dynamic = "force-dynamic";

/** Authenticated, tenant-scoped download. The lookup goes through the tenant client, so other companies' ids 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenant("documents.view");
    const { id } = await params;
    const doc = await ctx.db.document.findFirst({ where: { id } });
    if (!doc?.fileUrl) throw new AppError("NOT_FOUND", "File not found");
    const buf = await getStorage()!.get(doc.fileUrl);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": doc.mimeType ?? "application/octet-stream", "Content-Disposition": `inline; filename="${doc.fileName ?? "file"}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
