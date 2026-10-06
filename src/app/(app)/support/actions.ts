"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { AppError } from "@/lib/platform/errors";
import { assertOwned, nextSequence } from "@/lib/platform/db";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";
import { emitSafe } from "@/lib/platform/notifications/engine";
import { normalizeTracking } from "@/lib/logistics/tracking";

const cats = ["SHIPMENT", "CUSTOMER", "DRIVER", "PAYMENT", "COD", "DELIVERY", "TECHNICAL", "OTHER"] as const;
const prios = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const createTicketAction = defineAction({
  permissions: ["support.manage"],
  schema: z.object({ subject: z.string().trim().min(3).max(150), description: z.string().trim().min(3).max(3000), category: z.enum(cats).default("OTHER"), priority: z.enum(prios).default("MEDIUM"), customerId: z.string().optional(), tracking: z.string().max(30).optional(), assigneeId: z.string().optional() }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    await assertOwned(ctx.db, { customer: i.customerId });
    let shipmentId: string | undefined;
    if (i.tracking) { const s = await ctx.db.shipment.findFirst({ where: { trackingNumber: normalizeTracking(i.tracking) }, select: { id: true } }); if (!s) throw new AppError("NOT_FOUND", "No shipment with that tracking number"); shipmentId = s.id; }
    if (i.assigneeId && !(await ctx.db.user.findFirst({ where: { id: i.assigneeId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Assignee not found");
    const seq = await nextSequence(ctx.companyId, "ticket");
    const t = await ctx.db.supportTicket.create({ data: { number: `TKT-${String(seq).padStart(5, "0")}`, subject: i.subject, description: i.description, category: i.category, priority: i.priority, customerId: i.customerId, shipmentId, assigneeId: i.assigneeId, createdById: ctx.user.id } as any });
    await auditFrom(ctx, "ticket.created", "SupportTicket", t.id, undefined, { number: t.number });
    await emitSafe(ctx, { type: "support.ticket_created", priority: i.priority === "CRITICAL" ? "CRITICAL" : i.priority === "HIGH" ? "HIGH" : "MEDIUM", title: `New ticket ${t.number}: ${i.subject}`, body: i.description.slice(0, 140), entity: { type: "SupportTicket", id: t.id }, actionUrl: `/support/${t.id}` });
    return { id: t.id };
  },
});

export const updateTicketAction = defineAction({
  permissions: ["support.manage"],
  schema: z.object({ id: z.string(), status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]).optional(), priority: z.enum(prios).optional(), assigneeId: z.string().nullable().optional() }),
  handler: async (ctx, { id, ...i }) => {
    const t = await ctx.db.supportTicket.findFirst({ where: { id } });
    if (!t) throw new AppError("NOT_FOUND", "Ticket not found");
    if (t.status === "CLOSED" && i.status && i.status !== "OPEN") throw new AppError("INVALID_STATE", "Reopen the ticket first");
    if (i.assigneeId && !(await ctx.db.user.findFirst({ where: { id: i.assigneeId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Assignee not found");
    await ctx.db.supportTicket.update({ where: { id }, data: { ...i, ...(i.status === "RESOLVED" || i.status === "CLOSED" ? { resolvedAt: new Date() } : i.status ? { resolvedAt: null } : {}) } });
    await auditFrom(ctx, "ticket.updated", "SupportTicket", id, { status: t.status, priority: t.priority, assigneeId: t.assigneeId }, i);
    return true;
  },
});

export const commentTicketAction = defineAction({
  permissions: ["support.manage"], schema: z.object({ ticketId: z.string(), body: z.string().trim().min(1).max(3000), isInternal: z.boolean().default(false) }),
  handler: async (ctx, i) => { await assertOwned(ctx.db, {} as any); const t = await ctx.db.supportTicket.findFirst({ where: { id: i.ticketId } }); if (!t) throw new AppError("NOT_FOUND", "Ticket not found"); await ctx.db.ticketComment.create({ data: { ticketId: i.ticketId, authorId: ctx.user.id, authorName: ctx.user.name, body: i.body, isInternal: i.isInternal } as any }); return true; },
});
