"use server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requirePortal } from "@/lib/platform/portal";
import { toFailure, AppError, type ActionResult } from "@/lib/platform/errors";
import { prisma, nextSequence } from "@/lib/platform/db";
import { auditFrom } from "@/lib/platform/audit";
import { guardMutation } from "@/lib/platform/entitlements";
import { BCRYPT_ROUNDS, validatePassword } from "@/lib/platform/provisioning";
import { emitSafe } from "@/lib/platform/notifications/engine";
import { createShipment, quoteForInput } from "@/lib/logistics/shipments";
import { phone, shipmentInputSchema } from "@/lib/logistics/schemas";
import { addAddress } from "@/lib/logistics/customers";
import { normalizeTracking } from "@/lib/logistics/tracking";

const portalShipment = shipmentInputSchema.omit({ customerId: true, deliveryFeeOverride: true, branchId: true, idempotencyKey: true, notes: true, priority: true }).extend({ priority: z.enum(["STANDARD", "EXPRESS", "URGENT", "SAME_DAY"]).default("STANDARD") });

async function run<T>(perms: Parameters<typeof requirePortal>, fn: (c: Awaited<ReturnType<typeof requirePortal>>) => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await fn(await requirePortal(...perms)) }; } catch (e) { return toFailure(e); }
}

export async function portalQuoteAction(raw: unknown) {
  return run(["portal.shipments.create"], async (c) => (await quoteForInput(c, { ...portalShipment.pick({ pickupCity: true, pickupState: true, deliveryCity: true, deliveryState: true, weightKg: true, priority: true, packageType: true, declaredValue: true, codAmount: true }).parse(raw), customerId: c.customerId })).quote);
}

export async function portalCreateShipmentAction(raw: unknown) {
  return run(["portal.shipments.create"], async (c) => {
    const i = portalShipment.parse(raw);
    const s = await createShipment(c, { ...i, customerId: c.customerId }, "PORTAL");
    return { id: s.id, trackingNumber: s.trackingNumber };
  });
}

export async function portalAddAddressAction(raw: unknown) {
  return run([], async (c) => {
    const a = z.object({ label: z.string().max(40).optional(), line1: z.string().min(3).max(200), city: z.string().min(2).max(80), state: z.string().min(2).max(80), contactName: z.string().max(100).optional(), contactPhone: phone.optional() }).parse(raw);
    await guardMutation(c.companyId);
    await addAddress(c, c.customerId, a); return true;
  });
}

export async function portalCreateTicketAction(raw: unknown) {
  return run([], async (c) => {
    const i = z.object({ subject: z.string().trim().min(3).max(150), description: z.string().trim().min(3).max(3000), tracking: z.string().max(30).optional(), category: z.enum(["SHIPMENT", "PAYMENT", "COD", "DELIVERY", "OTHER"]).default("OTHER") }).parse(raw);
    await guardMutation(c.companyId);
    let shipmentId: string | undefined;
    if (i.tracking) { const s = await c.db.shipment.findFirst({ where: { trackingNumber: normalizeTracking(i.tracking), customerId: c.customerId }, select: { id: true } }); if (!s) throw new AppError("NOT_FOUND", "No shipment of yours has that tracking number"); shipmentId = s.id; }
    const seq = await nextSequence(c.companyId, "ticket");
    const t = await c.db.supportTicket.create({ data: { number: `TKT-${String(seq).padStart(5, "0")}`, subject: i.subject, description: i.description, category: i.category, customerId: c.customerId, shipmentId, createdById: c.user.id } as any });
    await emitSafe(c, { type: "support.ticket_created", title: `New customer ticket ${t.number}`, body: i.subject, entity: { type: "SupportTicket", id: t.id }, actionUrl: `/support/${t.id}` });
    return { number: t.number };
  });
}

/** Corporate account admins manage their own team (users bound to the same customer account). */
export async function portalAddTeamMemberAction(raw: unknown) {
  return run(["portal.team.manage"], async (c) => {
    const i = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), password: z.string().min(10).max(200) }).parse(raw);
    await guardMutation(c.companyId);
    validatePassword(i.password);
    const email = i.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("CONFLICT", "A user with that email already exists");
    const count = await prisma.user.count({ where: { companyId: c.companyId, customerId: c.customerId } });
    if (count >= 25) throw new AppError("LIMIT_EXCEEDED", "Team size limit reached");
    const u = await prisma.user.create({ data: { email, name: i.name, role: "SENDER", companyId: c.companyId, customerId: c.customerId, passwordHash: await bcrypt.hash(i.password, BCRYPT_ROUNDS) } });
    await auditFrom(c, "portal.team_member_added", "User", u.id, undefined, { email });
    return true;
  });
}
export async function portalToggleTeamMemberAction(raw: { id: string; isActive: boolean }) {
  return run(["portal.team.manage"], async (c) => {
    const i = z.object({ id: z.string(), isActive: z.boolean() }).parse(raw);
    const u = await c.db.user.findFirst({ where: { id: i.id, customerId: c.customerId } });
    if (!u || u.id === c.user.id) throw new AppError("NOT_FOUND", "Team member not found");
    await prisma.user.update({ where: { id: u.id }, data: { isActive: i.isActive, tokenVersion: { increment: 1 } } });
    await auditFrom(c, "portal.team_member_toggled", "User", u.id, { isActive: u.isActive }, { isActive: i.isActive });
    return true;
  });
}
