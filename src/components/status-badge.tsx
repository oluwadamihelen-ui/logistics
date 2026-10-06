import type { ShipmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/logistics/shipment-status";

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>;
}
