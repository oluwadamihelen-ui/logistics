"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { AppError } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { getStorage } from "@/lib/platform/storage";

export const deleteDocumentAction = defineAction({
  permissions: ["documents.manage"], schema: z.object({ id: z.string() }),
  handler: async (ctx, i) => {
    const d = await ctx.db.document.findFirst({ where: { id: i.id } });
    if (!d) throw new AppError("NOT_FOUND", "Document not found");
    await ctx.db.document.delete({ where: { id: i.id } });
    if (d.fileUrl) await getStorage()?.remove(d.fileUrl);
    await auditFrom(ctx, "document.deleted", "Document", i.id, { type: d.type, title: d.title });
    return true;
  },
});
