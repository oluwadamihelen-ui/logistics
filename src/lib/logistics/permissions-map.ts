import type { ShipmentStatus } from "@prisma/client";
import type { Permission } from "../platform/permissions";

/** Which permission is needed to move a shipment INTO a status via the generic transition action. */
export function permissionForTransition(to: ShipmentStatus): Permission {
  switch (to) {
    case "CANCELLED": return "shipments.cancel";
    case "RETURNING": case "RETURNED_TO_HUB": case "RETURNED_TO_SENDER": return "shipments.return";
    case "OUT_FOR_DELIVERY": case "PICKED_UP": return "shipments.dispatch";
    default: return "shipments.edit";
  }
}
