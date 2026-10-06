import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/platform/context";
import { AppError } from "@/lib/platform/errors";
import { assertOwned } from "@/lib/platform/db";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";
import { enforceRateLimit } from "@/lib/platform/rate-limit";
import { getStorage, MAX_UPLOAD, safeFileName, sniffMime } from "@/lib/platform/storage";

export const dynamic = "force-dynamic";

const meta = z.object({
  ownerType: z.enum(["DRIVER", "VEHICLE", "STAFF", "CUSTOMER", "SHIPMENT", "COMPANY"]), ownerId: z.string().optional(), type: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(120),
  issueDate: z.coerce.date().optional(), expiryDate: z.coerce.date().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requireTenant("documents.manage");
    enforceRateLimit(`upload:${ctx.user.id}`, 30, 60_000);
    await guardMutation(ctx.companyId);
    const storage = getStorage();
    if (!storage?.isConfigured()) throw new AppError("NOT_CONFIGURED", "File storage is not configured (STORAGE_PROVIDER).");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Choose a file to upload");
    if (file.size > MAX_UPLOAD) throw new AppError("VALIDATION", "File is larger than 5 MB");
    const m = meta.parse(Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string" && v !== "")));
    if (m.ownerId) {
      const map: Record<string, "driver" | "vehicle" | "user" | "customer" | "shipment" | undefined> = { DRIVER: "driver", VEHICLE: "vehicle", STAFF: "user", CUSTOMER: "customer", SHIPMENT: "shipment", COMPANY: undefined };
      const k = map[m.ownerType]; if (k) await assertOwned(ctx.db, { [k]: m.ownerId });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffMime(buf);
    if (!mime) throw new AppError("VALIDATION", "Only PDF, PNG, JPEG or WebP files are allowed");
    const key = await storage.put(ctx.companyId, buf);
    const days = m.expiryDate ? Math.ceil((m.expiryDate.getTime() - Date.now()) / 86400_000) : null;
    const doc = await ctx.db.document.create({ data: { ...m, fileUrl: key, fileName: safeFileName(file.name), mimeType: mime, sizeBytes: buf.length, uploadedById: ctx.user.id, status: days !== null && days < 0 ? "EXPIRED" : days !== null && days <= 30 ? "EXPIRING" : "VALID" } as any });
    await auditFrom(ctx, "document.uploaded", "Document", doc.id, undefined, { type: m.type, owner: `${m.ownerType}:${m.ownerId ?? ""}`, size: buf.length });
    return NextResponse.json({ id: doc.id });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Please complete the required fields" }, { status: 422 });
    console.error("[upload] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
