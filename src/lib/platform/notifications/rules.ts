/** Rule table for the notification engine: EVENT → category, priority, audience permission. */
import type { NotificationCategory, NotificationPriority } from "@prisma/client";
import type { Permission } from "../permissions";

export interface EventRule {
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Users holding this permission are the audience (unless explicit userIds are given). */
  permission: Permission;
  /** Suppress identical alerts to the same user for this many minutes. */
  dedupeMinutes: number;
}

export const EVENT_RULES = {
  "shipment.created": { category: "SHIPMENT", priority: "LOW", permission: "shipments.view", dedupeMinutes: 0 },
  "shipment.cancelled": { category: "SHIPMENT", priority: "MEDIUM", permission: "shipments.view", dedupeMinutes: 0 },
  "shipment.assigned": { category: "DISPATCH", priority: "HIGH", permission: "driver.app", dedupeMinutes: 0 },
  "shipment.delivered": { category: "DELIVERY", priority: "LOW", permission: "shipments.edit", dedupeMinutes: 0 },
  "shipment.delivery_failed": { category: "DELIVERY", priority: "HIGH", permission: "dispatch.manage", dedupeMinutes: 0 },
  "shipment.ready_for_pickup": { category: "SHIPMENT", priority: "LOW", permission: "shipments.edit", dedupeMinutes: 0 },
  "shipment.uncollected": { category: "SHIPMENT", priority: "MEDIUM", permission: "shipments.edit", dedupeMinutes: 1440 },
  "shipment.returned": { category: "SHIPMENT", priority: "MEDIUM", permission: "shipments.return", dedupeMinutes: 0 },
  "shipment.overdue": { category: "DELIVERY", priority: "HIGH", permission: "dispatch.manage", dedupeMinutes: 720 },
  "pickup.requested": { category: "PICKUP", priority: "MEDIUM", permission: "dispatch.manage", dedupeMinutes: 0 },
  "driver.sos": { category: "DRIVER", priority: "CRITICAL", permission: "dispatch.manage", dedupeMinutes: 10 },
  "driver.offline_active": { category: "DRIVER", priority: "HIGH", permission: "dispatch.manage", dedupeMinutes: 120 },
  "driver.issue_reported": { category: "DRIVER", priority: "HIGH", permission: "dispatch.manage", dedupeMinutes: 0 },
  "vehicle.document_expiring": { category: "MAINTENANCE", priority: "MEDIUM", permission: "fleet.manage", dedupeMinutes: 1440 },
  "vehicle.document_expired": { category: "MAINTENANCE", priority: "HIGH", permission: "fleet.manage", dedupeMinutes: 1440 },
  "vehicle.service_due": { category: "MAINTENANCE", priority: "MEDIUM", permission: "fleet.manage", dedupeMinutes: 1440 },
  "document.expiring": { category: "SYSTEM", priority: "MEDIUM", permission: "documents.manage", dedupeMinutes: 1440 },
  "cod.collected": { category: "COD", priority: "LOW", permission: "cod.manage", dedupeMinutes: 0 },
  "cod.mismatch": { category: "COD", priority: "HIGH", permission: "cod.manage", dedupeMinutes: 360 },
  "cod.unsettled": { category: "COD", priority: "MEDIUM", permission: "cod.manage", dedupeMinutes: 1440 },
  "payment.received": { category: "PAYMENT", priority: "LOW", permission: "payments.manage", dedupeMinutes: 0 },
  "invoice.overdue": { category: "INVOICE", priority: "MEDIUM", permission: "invoices.manage", dedupeMinutes: 1440 },
  "settlement.ready": { category: "FINANCE", priority: "MEDIUM", permission: "settlements.manage", dedupeMinutes: 0 },
  "support.ticket_created": { category: "CUSTOMER", priority: "MEDIUM", permission: "support.manage", dedupeMinutes: 0 },
  "security.user_locked": { category: "SECURITY", priority: "HIGH", permission: "users.manage", dedupeMinutes: 60 },
  "billing.payment_failed": { category: "SYSTEM", priority: "CRITICAL", permission: "billing.manage", dedupeMinutes: 720 },
  "billing.trial_ending": { category: "SYSTEM", priority: "MEDIUM", permission: "billing.manage", dedupeMinutes: 1440 },
  "ai.insight": { category: "AI_INSIGHT", priority: "INFO", permission: "analytics.view", dedupeMinutes: 1440 },
} as const satisfies Record<string, EventRule>;

export type EventType = keyof typeof EVENT_RULES;

/** Channels each priority may use, before company configuration + user preference filtering. */
export const PRIORITY_CHANNELS: Record<NotificationPriority, readonly ("IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH")[]> = {
  CRITICAL: ["IN_APP", "PUSH", "SMS", "EMAIL"],
  HIGH: ["IN_APP", "PUSH", "EMAIL"],
  MEDIUM: ["IN_APP", "PUSH"],
  LOW: ["IN_APP"],
  INFO: ["IN_APP"],
};
