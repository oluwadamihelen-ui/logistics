import type { Shipment, ShipmentEvent } from "@prisma/client";
import { num } from "../platform/db";

export function serializeShipment(s: Shipment & { events?: Pick<ShipmentEvent, "description" | "status" | "createdAt" | "isPublic">[] }) {
  return {
    trackingNumber: s.trackingNumber, orderNumber: s.orderNumber, status: s.status, priority: s.priority,
    sender: { name: s.senderName, phone: s.senderPhone, address: s.pickupAddress, city: s.pickupCity, state: s.pickupState },
    recipient: { name: s.recipientName, phone: s.recipientPhone, address: s.deliveryAddress, city: s.deliveryCity, state: s.deliveryState },
    package: { description: s.packageDescription, type: s.packageType, weightKg: num(s.weightKg), quantity: s.quantity, declaredValue: num(s.declaredValue) },
    deliveryFee: num(s.deliveryFee), codAmount: num(s.codAmount), paymentStatus: s.paymentStatus,
    expectedDeliveryAt: s.expectedDeliveryAt, deliveredAt: s.deliveredAt, createdAt: s.createdAt,
    ...(s.events ? { events: s.events.filter((e) => e.isPublic).map((e) => ({ at: e.createdAt, status: e.status, description: e.description })) } : {}),
  };
}
