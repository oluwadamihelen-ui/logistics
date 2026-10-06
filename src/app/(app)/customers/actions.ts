"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { customerInputSchema, phone } from "@/lib/logistics/schemas";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/platform/db";
import { AppError } from "@/lib/platform/errors";
import { auditFrom } from "@/lib/platform/audit";
import { BCRYPT_ROUNDS, validatePassword } from "@/lib/platform/provisioning";
import { assertFeature, getEntitlements, guardMutation } from "@/lib/platform/entitlements";
import { addAddress, createCustomer, setCorporateAccount, updateCustomer } from "@/lib/logistics/customers";

export const createCustomerAction = defineAction({ permissions: ["customers.manage"], schema: customerInputSchema, handler: async (ctx, i) => { const c = await createCustomer(ctx, i); return { id: c.id }; } });

export const updateCustomerAction = defineAction({
  permissions: ["customers.manage"], schema: customerInputSchema.partial().extend({ id: z.string(), isActive: z.boolean().optional() }),
  handler: async (ctx, { id, ...rest }) => { await updateCustomer(ctx, id, rest); return true; },
});

export const addAddressAction = defineAction({
  permissions: ["customers.manage"],
  schema: z.object({ customerId: z.string(), label: z.string().max(40).optional(), line1: z.string().min(3).max(200), city: z.string().min(2).max(80), state: z.string().min(2).max(80), contactName: z.string().max(100).optional(), contactPhone: phone.optional(), isDefault: z.boolean().optional() }),
  handler: async (ctx, { customerId, ...a }) => { await addAddress(ctx, customerId, a); return true; },
});

export const setCorporateAction = defineAction({
  permissions: ["customers.manage"],
  schema: z.object({ customerId: z.string(), creditLimit: z.coerce.number().min(0), paymentTermsDays: z.coerce.number().int().min(0).max(180), discountPercent: z.coerce.number().min(0).max(100), apiEnabled: z.boolean().default(false) }),
  handler: async (ctx, { customerId, ...d }) => { await setCorporateAccount(ctx, customerId, d); return true; },
});

/** Staff create a portal login for a customer account (the customer can later manage their team). */
export const createPortalLoginAction = defineAction({
  permissions: ["customers.manage"],
  schema: z.object({ customerId: z.string(), name: z.string().trim().min(2).max(100), email: z.string().email(), password: z.string().min(10).max(200), canManageTeam: z.boolean().default(false) }),
  handler: async (ctx, i) => {
    await guardMutation(ctx.companyId);
    assertFeature(await getEntitlements(ctx.companyId), "customer_portal");
    const c = await ctx.db.customer.findFirst({ where: { id: i.customerId } });
    if (!c) throw new AppError("NOT_FOUND", "Customer not found");
    validatePassword(i.password);
    const email = i.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("CONFLICT", "A user with that email already exists");
    const u = await prisma.user.create({ data: { email, name: i.name, role: i.canManageTeam ? "CUSTOMER" : "SENDER", companyId: ctx.companyId, customerId: c.id, passwordHash: await bcrypt.hash(i.password, BCRYPT_ROUNDS) } });
    await auditFrom(ctx, "customer.portal_login_created", "User", u.id, undefined, { customerId: c.id, email });
    return true;
  },
});
