"use server";
import { z } from "zod";
import { defineAction } from "@/lib/platform/action";
import { customerInputSchema, phone } from "@/lib/logistics/schemas";
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
