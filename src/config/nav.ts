import type { Permission } from "@/lib/platform/permissions";
import type { Feature } from "@/lib/platform/entitlements";

export interface NavItem { href: string; label: string; icon: string; permission?: Permission; anyOf?: Permission[]; feature?: Feature }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { href: "/shipments", label: "Shipments", icon: "package", permission: "shipments.view" },
      { href: "/dispatch", label: "Dispatch", icon: "send", permission: "dispatch.view", feature: "dispatch" },
      { href: "/map", label: "Live map", icon: "map", permission: "map.view", feature: "live_map" },
      { href: "/routes", label: "Routes", icon: "route", permission: "routes.view", feature: "routes" },
      { href: "/hubs", label: "Hubs & branches", icon: "warehouse", permission: "hubs.view" },
    ],
  },
  {
    label: "People & fleet",
    items: [
      { href: "/customers", label: "Customers", icon: "users", permission: "customers.view" },
      { href: "/drivers", label: "Drivers & riders", icon: "id-card", permission: "drivers.view" },
      { href: "/fleet", label: "Fleet", icon: "truck", permission: "fleet.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/cod", label: "Cash on delivery", icon: "banknote", permission: "cod.view" },
      { href: "/invoices", label: "Invoices & payments", icon: "receipt", permission: "finance.view" },
      { href: "/expenses", label: "Expenses", icon: "wallet", permission: "expenses.manage" },
      { href: "/settlements", label: "Driver settlements", icon: "hand-coins", permission: "settlements.manage", feature: "settlements" },
      { href: "/pricing", label: "Pricing rules", icon: "tag", permission: "pricing.manage" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: "bar-chart", permission: "analytics.view" },
      { href: "/reports", label: "Reports", icon: "file-text", permission: "reports.view" },
      { href: "/assistant", label: "AI assistant", icon: "sparkles", permission: "ai.use", feature: "ai_assistant" },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/notifications", label: "Notifications", icon: "bell" },
      { href: "/support", label: "Support", icon: "life-buoy", permission: "support.view" },
      { href: "/inventory", label: "Packaging stock", icon: "boxes", permission: "inventory.view", feature: "inventory" },
      { href: "/staff", label: "Staff", icon: "user-cog", permission: "staff.view" },
      { href: "/documents", label: "Documents", icon: "folder", permission: "documents.view" },
      { href: "/audit", label: "Audit log", icon: "shield", permission: "audit.view" },
      { href: "/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
      { href: "/billing", label: "Subscription", icon: "credit-card", permission: "billing.manage" },
    ],
  },
];
