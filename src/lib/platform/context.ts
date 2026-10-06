/**
 * Request context: authenticated user + tenant + permissions. Every server action, route
 * handler and protected page obtains its authority from here. The user record is re-read
 * from the database per request, so deactivation / role change / permission revocation
 * take effect immediately even though the session cookie is a JWT.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Role } from "@prisma/client";
import { authOptions } from "./auth";
import { prisma, createTenantClient, type TenantDb } from "./db";
import { AppError } from "./errors";
import { can as canPerm, permissionsFor, type Permission } from "./permissions";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  branchId: string | null;
  customerId: string | null;
  driverId: string | null;
}

export interface TenantContext {
  user: AuthUser;
  companyId: string;
  db: TenantDb;
  permissions: Set<Permission>;
  can(p: Permission): boolean;
  require(...p: Permission[]): void;
  requireAny(...p: Permission[]): void;
  actor: { id: string; name: string; role: string };
  ip: string | null;
  userAgent: string | null;
}

const loadUser = cache(async (): Promise<(AuthUser & { extra: string[]; denied: string[] }) | null> => {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    include: { driver: { select: { id: true } }, company: { select: { status: true } } },
  });
  if (!u || !u.isActive) return null;
  if (u.tokenVersion !== (session?.tv ?? 0)) return null; // sessions revoked (password change / forced logout)
  if (u.company && (u.company.status === "SUSPENDED" || u.company.status === "CLOSED")) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId, branchId: u.branchId,
    customerId: u.customerId, driverId: u.driver?.id ?? null, extra: u.extraPermissions, denied: u.deniedPermissions,
  };
});

/** Authenticated user (tenant or platform). Throws UNAUTHENTICATED. */
export async function requireUser() {
  const u = await loadUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return u;
}

async function buildContext(): Promise<TenantContext> {
  const u = await requireUser();
  if (!u.companyId) throw new AppError("FORBIDDEN", "This action requires a company account.");
  const permissions = permissionsFor({ role: u.role, extraPermissions: u.extra, deniedPermissions: u.denied });
  let h: Headers | null = null;
  try { h = await headers(); } catch { h = null; }
  const ctx: TenantContext = {
    user: u,
    companyId: u.companyId,
    db: createTenantClient(u.companyId),
    permissions,
    can: (p) => permissions.has(p),
    require: (...ps) => { for (const p of ps) if (!permissions.has(p)) throw new AppError("FORBIDDEN", "You don't have permission to do that."); },
    requireAny: (...ps) => { if (!ps.some((p) => permissions.has(p))) throw new AppError("FORBIDDEN", "You don't have permission to do that."); },
    actor: { id: u.id, name: u.name, role: u.role },
    ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? null,
    userAgent: h?.get("user-agent") ?? null,
  };
  return ctx;
}

export const getTenantContext = cache(buildContext);

/** For server actions / route handlers: authenticate, resolve tenant, check permissions (ALL listed). */
export async function requireTenant(...perms: Permission[]): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (perms.length) ctx.require(...perms);
  return ctx;
}

/** For pages/layouts: redirects instead of throwing. */
export async function requirePageContext(...perms: Permission[]): Promise<TenantContext> {
  try {
    return await requireTenant(...perms);
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") redirect("/login");
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/forbidden");
    throw e;
  }
}

export async function requirePlatformAdmin() {
  const u = await requireUser();
  if (!canPerm({ role: u.role }, "platform.admin")) throw new AppError("FORBIDDEN", "Platform administrators only.");
  return u;
}

export async function requirePlatformPage() {
  try {
    return await requirePlatformAdmin();
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") redirect("/login");
    redirect("/forbidden");
  }
}

export async function currentUserOrNull() {
  return loadUser();
}
