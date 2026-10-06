import { redirect } from "next/navigation";
import { requirePageContext, requireTenant, type TenantContext } from "./context";
import { AppError } from "./errors";
import { getEntitlements, assertFeature } from "./entitlements";

export type PortalContext = TenantContext & { customerId: string };

/** Portal users are bound to ONE customer account. Every portal query must filter by customerId. */
export async function requirePortal(...perms: Parameters<TenantContext["require"]>): Promise<PortalContext> {
  const ctx = await requireTenant("portal.access", ...perms);
  if (!ctx.user.customerId) throw new AppError("FORBIDDEN", "Your login isn't linked to a customer account.");
  assertFeature(await getEntitlements(ctx.companyId), "customer_portal");
  return Object.assign(ctx, { customerId: ctx.user.customerId });
}

export async function requirePortalPage(...perms: Parameters<TenantContext["require"]>): Promise<PortalContext> {
  const ctx = await requirePageContext("portal.access", ...perms);
  if (!ctx.user.customerId) redirect("/forbidden");
  try { assertFeature(await getEntitlements(ctx.companyId), "customer_portal"); } catch { redirect("/forbidden"); }
  return Object.assign(ctx, { customerId: ctx.user.customerId });
}
