/** Pure shipment lifecycle definition (no DB) — shared by services, UI and tests. */
import type { ShipmentStatus } from "@prisma/client";

export const ALL_STATUSES: ShipmentStatus[] = [
  "CREATED", "CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "AT_HUB", "SORTING", "READY_FOR_DISPATCH", "READY_FOR_PICKUP",
  "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED", "RESCHEDULED", "RETURNING",
  "RETURNED_TO_HUB", "RETURNED_TO_SENDER", "CANCELLED",
];

export const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PICKUP_ASSIGNED", "AT_HUB", "CANCELLED"],
  PICKUP_ASSIGNED: ["PICKED_UP", "CONFIRMED", "CANCELLED"],
  PICKED_UP: ["AT_HUB", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "RETURNING", "CANCELLED"],
  AT_HUB: ["SORTING", "READY_FOR_DISPATCH", "READY_FOR_PICKUP", "AT_HUB", "CANCELLED"],
  SORTING: ["READY_FOR_DISPATCH", "READY_FOR_PICKUP", "AT_HUB", "CANCELLED"],
  /** Waiting at a hub / pickup point for the recipient. Collection (→ DELIVERED) goes through collectShipment. */
  READY_FOR_PICKUP: ["AT_HUB", "RETURNING", "CANCELLED"],
  READY_FOR_DISPATCH: ["ASSIGNED_FOR_DELIVERY", "AT_HUB", "CANCELLED"],
  ASSIGNED_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "READY_FOR_DISPATCH", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["RESCHEDULED", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "RETURNING"],
  RESCHEDULED: ["ASSIGNED_FOR_DELIVERY", "READY_FOR_DISPATCH", "OUT_FOR_DELIVERY", "RETURNING"],
  RETURNING: ["RETURNED_TO_HUB", "RETURNED_TO_SENDER"],
  RETURNED_TO_HUB: ["RETURNED_TO_SENDER", "READY_FOR_DISPATCH"],
  DELIVERED: [],
  RETURNED_TO_SENDER: [],
  CANCELLED: [],
};

export const TERMINAL: ShipmentStatus[] = ["DELIVERED", "RETURNED_TO_SENDER", "CANCELLED"];
/** Shipments in these states are "in flight" for dashboards / driver workload. */
export const ACTIVE_STATUSES: ShipmentStatus[] = ALL_STATUSES.filter((s) => !TERMINAL.includes(s));
export const UNDELIVERED_STATUSES: ShipmentStatus[] = ACTIVE_STATUSES.filter((s) => !["RETURNING", "RETURNED_TO_HUB", "READY_FOR_PICKUP"].includes(s));

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  CREATED: "Created", CONFIRMED: "Confirmed", PICKUP_ASSIGNED: "Pickup assigned", PICKED_UP: "Picked up",
  AT_HUB: "At hub", SORTING: "Sorting", READY_FOR_DISPATCH: "Ready for dispatch", READY_FOR_PICKUP: "Ready for pickup",
  ASSIGNED_FOR_DELIVERY: "Assigned for delivery", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery failed", RESCHEDULED: "Rescheduled", RETURNING: "Returning",
  RETURNED_TO_HUB: "Returned to hub", RETURNED_TO_SENDER: "Returned to sender", CANCELLED: "Cancelled",
};

export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";
export const STATUS_TONE: Record<ShipmentStatus, Tone> = {
  CREATED: "neutral", CONFIRMED: "info", PICKUP_ASSIGNED: "info", PICKED_UP: "progress", AT_HUB: "progress",
  SORTING: "progress", READY_FOR_DISPATCH: "info", READY_FOR_PICKUP: "warning", ASSIGNED_FOR_DELIVERY: "info", OUT_FOR_DELIVERY: "progress",
  DELIVERED: "success", DELIVERY_FAILED: "danger", RESCHEDULED: "warning", RETURNING: "warning",
  RETURNED_TO_HUB: "warning", RETURNED_TO_SENDER: "neutral", CANCELLED: "neutral",
};

/** Customer-facing stage (ordered) for the public tracking progress bar. */
export const PUBLIC_STAGES = ["Order placed", "Picked up", "In transit", "Out for delivery", "Delivered"] as const;
export const PUBLIC_STAGES_PICKUP = ["Order placed", "Picked up", "In transit", "Ready for pickup", "Collected"] as const;

/** A shipment collected at a hub is held this many days before it counts as uncollected. */
export const PICKUP_HOLD_DAYS = 7;
export function publicStageIndex(s: ShipmentStatus): number {
  switch (s) {
    case "CREATED": case "CONFIRMED": case "PICKUP_ASSIGNED": return 0;
    case "PICKED_UP": return 1;
    case "AT_HUB": case "SORTING": case "READY_FOR_DISPATCH": case "ASSIGNED_FOR_DELIVERY": case "RESCHEDULED":
    case "DELIVERY_FAILED": case "RETURNING": case "RETURNED_TO_HUB": return 2;
    case "OUT_FOR_DELIVERY": case "READY_FOR_PICKUP": return 3;
    case "DELIVERED": return 4;
    default: return 0;
  }
}

/** Permission-independent: what a driver may set on their own assignments. */
export const DRIVER_ALLOWED_TARGETS: ShipmentStatus[] = ["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED"];
