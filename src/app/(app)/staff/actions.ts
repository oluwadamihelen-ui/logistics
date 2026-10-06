"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { AppError } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { phone } from "@/lib/logistics/schemas";

export const saveStaffProfileAction = defineAction({
  permissions: ["staff.manage"],
  schema: z.object({ userId: z.string(), department: z.string().max(60).optional(), jobTitle: z.string().max(60).optional(), employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"]).default("ACTIVE"), hireDate: z.coerce.date().optional(), emergencyName: z.string().max(100).optional(), emergencyPhone: phone.optional(), phone: phone.optional() }),
  handler: async (ctx, i) => {
    const u = await ctx.db.user.findFirst({ where: { id: i.userId } });
    if (!u) throw new AppError("NOT_FOUND", "Staff member not found");
    const { userId, phone: ph, ...p } = i;
    const existing = await ctx.db.staffProfile.findFirst({ where: { userId } });
    if (existing) await ctx.db.staffProfile.update({ where: { id: existing.id }, data: p }); else await ctx.db.staffProfile.create({ data: { userId, ...p } as any });
    if (ph) await ctx.db.user.update({ where: { id: userId }, data: { phone: ph } });
    await auditFrom(ctx, "staff.profile_saved", "User", userId, existing ?? undefined, p);
    return true;
  },
});
