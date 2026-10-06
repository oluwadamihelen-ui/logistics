/**
 * Centralised permission system.
 *
 * Roles map to permission sets here; per-user grants/denials (User.extraPermissions /
 * deniedPermissions) layer on top. Application code must check permissions through
 * `can()` / `requirePermission()` — never compare role names directly.
 */
import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "dashboard.view",
  "shipments.view", "shipments.create", "shipments.edit", "shipments.cancel", "shipments.assign",
  "shipments.dispatch", "shipments.track", "shipments.deliver", "shipments.return",
  "customers.view", "customers.manage",
  "drivers.view", "drivers.create", "drivers.edit", "drivers.assign",
  "fleet.view", "fleet.manage", "fleet.maintenance",
  "dispatch.view", "dispatch.manage",
  "routes.view", "routes.manage",
  "map.view",
  "hubs.view", "hubs.manage",
  "inventory.view", "inventory.manage",
  "finance.view", "finance.manage", "payments.manage", "invoices.manage",
  "settlements.manage", "cod.view", "cod.manage", "expenses.manage", "pricing.manage",
  "reports.view", "analytics.view",
  "staff.view", "staff.manage",
  "documents.view", "documents.manage",
  "support.view", "support.manage",
  "notifications.manage",
  "ai.use",
  "audit.view",
  "settings.manage", "billing.manage", "users.manage", "api.manage",
  // Self-service (customer portal / driver app)
  "portal.access", "portal.shipments.create", "portal.team.manage",
  "driver.app",
  // Platform
  "platform.admin",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const TENANT_ALL = PERMISSIONS.filter((p) => !p.startsWith("platform.") && !p.startsWith("portal.") && p !== "driver.app");

const OPS = [
  "dashboard.view", "shipments.view", "shipments.create", "shipments.edit", "shipments.cancel",
  "shipments.assign", "shipments.dispatch", "shipments.track", "shipments.return",
  "customers.view", "customers.manage", "drivers.view", "drivers.edit", "drivers.assign",
  "fleet.view", "dispatch.view", "dispatch.manage", "routes.view", "routes.manage", "map.view",
  "hubs.view", "inventory.view", "cod.view", "reports.view", "analytics.view", "documents.view",
  "support.view", "support.manage", "ai.use", "finance.view",
] as const;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_SUPER_ADMIN: ["platform.admin"],
  COMPANY_OWNER: TENANT_ALL,
  COMPANY_ADMIN: TENANT_ALL.filter((p) => p !== "billing.manage"),
  OPERATIONS_MANAGER: [...OPS, "drivers.create", "fleet.manage", "hubs.manage", "inventory.manage", "documents.manage", "staff.view", "notifications.manage"],
  BRANCH_MANAGER: [...OPS, "drivers.create", "hubs.view", "staff.view", "documents.view"],
  DISPATCH_MANAGER: [
    "dashboard.view", "shipments.view", "shipments.edit", "shipments.assign", "shipments.dispatch", "shipments.track",
    "shipments.return", "drivers.view", "drivers.assign", "fleet.view", "dispatch.view", "dispatch.manage",
    "routes.view", "routes.manage", "map.view", "hubs.view", "customers.view", "ai.use", "analytics.view",
  ],
  DISPATCHER: [
    "dashboard.view", "shipments.view", "shipments.assign", "shipments.dispatch", "shipments.track",
    "drivers.view", "drivers.assign", "fleet.view", "dispatch.view", "dispatch.manage", "routes.view",
    "routes.manage", "map.view", "customers.view",
  ],
  FLEET_MANAGER: [
    "dashboard.view", "drivers.view", "drivers.create", "drivers.edit", "fleet.view", "fleet.manage",
    "fleet.maintenance", "map.view", "documents.view", "documents.manage", "expenses.manage", "analytics.view",
    "shipments.view",
  ],
  DRIVER: ["driver.app", "shipments.track", "shipments.deliver"],
  RIDER: ["driver.app", "shipments.track", "shipments.deliver"],
  WAREHOUSE_STAFF: [
    "dashboard.view", "shipments.view", "shipments.track", "shipments.edit", "hubs.view",
    "inventory.view", "inventory.manage", "shipments.return",
  ],
  CUSTOMER_SERVICE: [
    "dashboard.view", "shipments.view", "shipments.create", "shipments.edit", "shipments.track", "customers.view",
    "customers.manage", "support.view", "support.manage", "cod.view", "dispatch.view", "ai.use", "map.view",
  ],
  ACCOUNTANT: [
    "dashboard.view", "finance.view", "finance.manage", "payments.manage", "invoices.manage", "settlements.manage",
    "cod.view", "cod.manage", "expenses.manage", "pricing.manage", "reports.view", "analytics.view", "customers.view",
    "shipments.view", "drivers.view", "ai.use",
  ],
  SALES_STAFF: [
    "dashboard.view", "customers.view", "customers.manage", "shipments.view", "shipments.create", "pricing.manage",
    "reports.view",
  ],
  HR_ADMIN: ["dashboard.view", "staff.view", "staff.manage", "documents.view", "documents.manage", "drivers.view"],
  CUSTOMER: ["portal.access", "portal.shipments.create", "portal.team.manage"],
  SENDER: ["portal.access", "portal.shipments.create"],
  RECIPIENT: ["portal.access"],
};

export const ROLE_LABELS: Record<Role, string> = {
  PLATFORM_SUPER_ADMIN: "Platform Super Admin",
  COMPANY_OWNER: "Company Owner",
  COMPANY_ADMIN: "Company Admin",
  OPERATIONS_MANAGER: "Operations Manager",
  BRANCH_MANAGER: "Branch Manager",
  DISPATCH_MANAGER: "Dispatch Manager",
  DISPATCHER: "Dispatcher",
  FLEET_MANAGER: "Fleet Manager",
  DRIVER: "Driver",
  RIDER: "Rider",
  WAREHOUSE_STAFF: "Warehouse / Hub Staff",
  CUSTOMER_SERVICE: "Customer Service",
  ACCOUNTANT: "Accountant / Finance",
  SALES_STAFF: "Sales",
  HR_ADMIN: "HR / Staff Admin",
  CUSTOMER: "Customer",
  SENDER: "Sender",
  RECIPIENT: "Recipient",
};

/** Roles a company admin may assign to its own users (never platform admin). */
export const ASSIGNABLE_ROLES: Role[] = [
  "COMPANY_ADMIN", "OPERATIONS_MANAGER", "BRANCH_MANAGER", "DISPATCH_MANAGER", "DISPATCHER", "FLEET_MANAGER",
  "DRIVER", "RIDER", "WAREHOUSE_STAFF", "CUSTOMER_SERVICE", "ACCOUNTANT", "SALES_STAFF", "HR_ADMIN",
];

export const STAFF_ROLES: Role[] = [...ASSIGNABLE_ROLES, "COMPANY_OWNER"];
export const PORTAL_ROLES: Role[] = ["CUSTOMER", "SENDER", "RECIPIENT"];

export interface PermissionSubject {
  role: Role;
  extraPermissions?: string[];
  deniedPermissions?: string[];
}

export function permissionsFor(subject: PermissionSubject): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[subject.role] ?? []);
  for (const p of subject.extraPermissions ?? []) if ((PERMISSIONS as readonly string[]).includes(p) && p !== "platform.admin") set.add(p as Permission);
  for (const p of subject.deniedPermissions ?? []) set.delete(p as Permission);
  return set;
}

export function can(subject: PermissionSubject, permission: Permission): boolean {
  return permissionsFor(subject).has(permission);
}
