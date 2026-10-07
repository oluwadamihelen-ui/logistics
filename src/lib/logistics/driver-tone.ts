import type { Tone } from "./shipment-status";

export const driverTone: Record<string, Tone> = { AVAILABLE: "success", ON_PICKUP: "progress", ON_DELIVERY: "progress", IDLE: "warning", OFFLINE: "neutral", EMERGENCY: "danger" };
