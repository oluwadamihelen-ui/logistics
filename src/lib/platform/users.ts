import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { auditFrom } from "./audit";
import { guardMutation } from "./entitlements";
import { ASSIGNABLE_ROLES, PERMISSIONS } from "./permissions";
import { BCRYPT_ROUNDS, validatePassword } from "./provisioning";
import type { ServiceCtx } from "./service";

const assignable = new Set<Role>([...ASSIGNABLE_ROLES, "COMPANY_OWNER"]);

export async function createStaffUser(svc: ServiceCtx, actorRole: Role, i: { name: string; email: string; phone?: string; role: Role; branchId?: string; password: string }) {
  await guardMutation(svc.companyId, { limit: { key: "users" } });
  if (!assignable.has(i.role)) throw new AppError("FORBIDDEN", "That role cannot be assigned");
  if (i.role === "COMPANY_OWNER" && actorRole !== "COMPANY_OWNER") throw new AppError("FORBIDDEN", "Only an owner can create another owner");
  validatePassword(i.password);
  const email = i.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("CONFLICT", "A user with that email already exists");
  if (i.branchId) { if (!(await svc.db.branch.findFirst({ where: { id: i.branchId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Branch not found"); }
  const u = await prisma.user.create({ data: { email, name: i.name, phone: i.phone, role: i.role, branchId: i.branchId, companyId: svc.companyId, passwordHash: await bcrypt.hash(i.password, BCRYPT_ROUNDS) } });
  await auditFrom(svc, "user.created", "User", u.id, undefined, { email, role: i.role });
  return u;
}

export async function updateStaffUser(svc: ServiceCtx, actorId: string, actorRole: Role, id: string, i: { role?: Role; branchId?: string | null; isActive?: boolean; extraPermissions?: string[]; deniedPermissions?: string[]; name?: string; phone?: string }) {
  await guardMutation(svc.companyId);
  const target = await svc.db.user.findFirst({ where: { id } });
  if (!target) throw new AppError("NOT_FOUND", "User not found");
  if (target.role === "COMPANY_OWNER" && actorRole !== "COMPANY_OWNER") throw new AppError("FORBIDDEN", "Only an owner can modify an owner");
  if (i.role && !assignable.has(i.role)) throw new AppError("FORBIDDEN", "That role cannot be assigned");
  if (i.role === "COMPANY_OWNER" && actorRole !== "COMPANY_OWNER") throw new AppError("FORBIDDEN", "Only an owner can grant ownership");
  const losesOwner = target.role === "COMPANY_OWNER" && ((i.role && i.role !== "COMPANY_OWNER") || i.isActive === false);
  if (losesOwner) {
    const owners = await svc.db.user.count({ where: { role: "COMPANY_OWNER", isActive: true } });
    if (owners <= 1) throw new AppError("INVALID_STATE", "A company must keep at least one active owner");
  }
  if (id === actorId && (i.isActive === false || (i.role && i.role !== target.role))) throw new AppError("INVALID_STATE", "You can't change your own role or deactivate yourself");
  const valid = new Set<string>(PERMISSIONS);
  const clean = (a?: string[]) => a?.filter((p) => valid.has(p) && p !== "platform.admin");
  const security = (i.role && i.role !== target.role) || i.isActive === false || i.extraPermissions || i.deniedPermissions;
  const u = await svc.db.user.update({ where: { id }, data: { ...i, extraPermissions: clean(i.extraPermissions), deniedPermissions: clean(i.deniedPermissions), ...(security ? { tokenVersion: { increment: 1 } } : {}) } as any });
  await auditFrom(svc, i.extraPermissions || i.deniedPermissions || i.role ? "user.permissions_changed" : "user.updated", "User", id,
    { role: target.role, isActive: target.isActive, extra: target.extraPermissions, denied: target.deniedPermissions }, { role: u.role, isActive: u.isActive, extra: u.extraPermissions, denied: u.deniedPermissions });
  return u;
}

export async function resetUserPassword(svc: ServiceCtx, actorRole: Role, id: string, password: string) {
  const target = await svc.db.user.findFirst({ where: { id } });
  if (!target) throw new AppError("NOT_FOUND", "User not found");
  if (target.role === "COMPANY_OWNER" && actorRole !== "COMPANY_OWNER") throw new AppError("FORBIDDEN", "Only an owner can reset an owner's password");
  validatePassword(password);
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
  await auditFrom(svc, "user.password_reset", "User", id);
}
