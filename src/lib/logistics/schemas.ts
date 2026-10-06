import { z } from "zod";

export const phone = z
  .string()
  .trim()
  .min(7, "Phone number is too short")
  .max(20)
  .regex(/^[+0-9()\-\s]+$/, "Invalid phone number");

const money = z.coerce.number().min(0).max(1_000_000_000);
const optionalText = (max = 500) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const PRIORITIES = ["STANDARD", "EXPRESS", "URGENT", "SAME_DAY"] as const;
export const PACKAGE_TYPES = ["DOCUMENT", "PARCEL", "FRAGILE", "FOOD", "PHARMACY", "GROCERY", "ELECTRONICS", "FREIGHT", "OTHER"] as const;
export const FAILURE_REASONS = ["CUSTOMER_UNAVAILABLE", "WRONG_ADDRESS", "PHONE_UNREACHABLE", "CUSTOMER_REFUSED", "BUSINESS_CLOSED", "VEHICLE_ISSUE", "WEATHER", "SECURITY_ISSUE", "INCORRECT_PACKAGE", "PAYMENT_ISSUE", "OTHER"] as const;

export const shipmentInputSchema = z.object({
  customerId: z.string().optional(),
  idempotencyKey: z.string().max(100).optional(),

  senderName: z.string().trim().min(2).max(120),
  senderPhone: phone,
  senderEmail: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  pickupAddress: z.string().trim().min(3).max(300),
  pickupCity: z.string().trim().min(2).max(80),
  pickupState: z.string().trim().min(2).max(80),
  pickupLat: z.number().min(-90).max(90).optional(),
  pickupLng: z.number().min(-180).max(180).optional(),

  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: phone,
  recipientEmail: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  deliveryAddress: z.string().trim().min(3).max(300),
  deliveryCity: z.string().trim().min(2).max(80),
  deliveryState: z.string().trim().min(2).max(80),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),

  packageDescription: z.string().trim().min(2).max(300),
  packageType: z.enum(PACKAGE_TYPES).default("PARCEL"),
  weightKg: z.coerce.number().min(0).max(100_000).default(1),
  lengthCm: z.coerce.number().min(0).max(10_000).optional(),
  widthCm: z.coerce.number().min(0).max(10_000).optional(),
  heightCm: z.coerce.number().min(0).max(10_000).optional(),
  quantity: z.coerce.number().int().min(1).max(10_000).default(1),
  declaredValue: money.default(0),
  codAmount: money.default(0),
  priority: z.enum(PRIORITIES).default("STANDARD"),
  feePayer: z.enum(["SENDER", "RECIPIENT"]).default("SENDER"),

  branchId: z.string().optional(),
  pickupScheduledAt: z.coerce.date().optional(),
  specialInstructions: optionalText(500),
  notes: optionalText(1000),
  /** Staff may override the computed fee (requires shipments.edit + audit). */
  deliveryFeeOverride: money.optional(),
});
export type ShipmentInput = z.infer<typeof shipmentInputSchema>;

export const proofInputSchema = z.object({
  recipientName: z.string().trim().max(120).optional(),
  signatureData: z.string().max(400_000).optional(), // data URL (PNG) captured on device
  photoUrl: z.string().max(400_000).optional(), // data URL or storage URL
  otp: z.string().regex(/^\d{6}$/).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  codCollected: money.optional(),
  clientEventId: z.string().max(100).optional(),
});
export type ProofInput = z.infer<typeof proofInputSchema>;

export const failureInputSchema = z.object({
  reason: z.enum(FAILURE_REASONS),
  notes: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  rescheduleFor: z.coerce.date().optional(),
  clientEventId: z.string().max(100).optional(),
});
export type FailureInput = z.infer<typeof failureInputSchema>;

export const customerInputSchema = z.object({
  type: z.enum(["INDIVIDUAL", "BUSINESS", "CORPORATE", "MARKETPLACE_SELLER"]).default("INDIVIDUAL"),
  name: z.string().trim().min(2).max(120),
  phone,
  email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  businessName: optionalText(150),
  notes: optionalText(1000),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;
