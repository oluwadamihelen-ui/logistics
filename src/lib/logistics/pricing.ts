/**
 * Pricing engine. Pure: takes the company's rules and a quote request, returns a price with a
 * transparent breakdown. The first ACTIVE rule (by ascending priority) whose conditions all match wins.
 * Nothing about prices is hard-coded here — companies author their own rules.
 */
import type { CustomerType, PackageType, Priority, VehicleType } from "@prisma/client";

export interface PricingRuleLike {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  originZoneId: string | null;
  destinationZoneId: string | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  vehicleType: VehicleType | null;
  shipmentPriority: Priority | null;
  packageType: PackageType | null;
  customerType: CustomerType | null;
  corporateAccountId: string | null;
  interstate: boolean | null;
  baseFee: number;
  perKgFee: number;
  includedKg: number;
  perKmFee: number;
  insurancePercent: number;
  codFeePercent: number;
  priorityMultiplier: number;
  minimumFee: number;
}

export interface QuoteRequest {
  originZoneId?: string | null;
  destinationZoneId?: string | null;
  weightKg: number;
  distanceKm?: number | null;
  vehicleType?: VehicleType | null;
  priority: Priority;
  packageType: PackageType;
  customerType?: CustomerType | null;
  corporateAccountId?: string | null;
  declaredValue: number;
  codAmount: number;
  interstate?: boolean;
  /** Corporate contract discount (percent). */
  discountPercent?: number;
}

export interface QuoteLine { label: string; amount: number }
export interface Quote {
  matched: boolean;
  ruleId: string | null;
  ruleName: string | null;
  total: number;
  lines: QuoteLine[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function matches(rule: PricingRuleLike, q: QuoteRequest): boolean {
  if (!rule.isActive) return false;
  if (rule.originZoneId && rule.originZoneId !== q.originZoneId) return false;
  if (rule.destinationZoneId && rule.destinationZoneId !== q.destinationZoneId) return false;
  if (rule.minWeightKg !== null && q.weightKg < rule.minWeightKg) return false;
  if (rule.maxWeightKg !== null && q.weightKg > rule.maxWeightKg) return false;
  if (rule.minDistanceKm !== null && (q.distanceKm ?? 0) < rule.minDistanceKm) return false;
  if (rule.maxDistanceKm !== null && (q.distanceKm ?? 0) > rule.maxDistanceKm) return false;
  if (rule.vehicleType && rule.vehicleType !== q.vehicleType) return false;
  if (rule.shipmentPriority && rule.shipmentPriority !== q.priority) return false;
  if (rule.packageType && rule.packageType !== q.packageType) return false;
  if (rule.customerType && rule.customerType !== q.customerType) return false;
  if (rule.corporateAccountId && rule.corporateAccountId !== q.corporateAccountId) return false;
  if (rule.interstate !== null && rule.interstate !== !!q.interstate) return false;
  return true;
}

/** More specific rules (more conditions set) win ties at the same priority. */
function specificity(r: PricingRuleLike): number {
  return [r.originZoneId, r.destinationZoneId, r.minWeightKg, r.maxWeightKg, r.minDistanceKm, r.maxDistanceKm, r.vehicleType,
    r.shipmentPriority, r.packageType, r.customerType, r.corporateAccountId, r.interstate].filter((v) => v !== null).length;
}

export function computeQuote(rules: PricingRuleLike[], q: QuoteRequest): Quote {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || specificity(b) - specificity(a));
  const rule = ordered.find((r) => matches(r, q));
  if (!rule) return { matched: false, ruleId: null, ruleName: null, total: 0, lines: [] };

  const lines: QuoteLine[] = [];
  const add = (label: string, amount: number) => { if (amount !== 0) lines.push({ label, amount: r2(amount) }); };

  add("Base delivery fee", rule.baseFee);
  const extraKg = Math.max(0, q.weightKg - rule.includedKg);
  add(`Weight (${r2(extraKg)}kg above ${rule.includedKg}kg included)`, extraKg * rule.perKgFee);
  if (rule.perKmFee && q.distanceKm) add(`Distance (${r2(q.distanceKm)}km)`, q.distanceKm * rule.perKmFee);

  let subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (rule.priorityMultiplier !== 1) {
    const uplift = subtotal * (rule.priorityMultiplier - 1);
    add(`${q.priority.replace("_", " ").toLowerCase()} service (×${rule.priorityMultiplier})`, uplift);
    subtotal += uplift;
  }
  if (rule.insurancePercent && q.declaredValue) add(`Insurance (${rule.insurancePercent}% of declared value)`, (q.declaredValue * rule.insurancePercent) / 100);
  if (rule.codFeePercent && q.codAmount) add(`COD handling (${rule.codFeePercent}%)`, (q.codAmount * rule.codFeePercent) / 100);

  let total = lines.reduce((s, l) => s + l.amount, 0);
  if (total < rule.minimumFee) { add("Minimum fee adjustment", rule.minimumFee - total); total = rule.minimumFee; }
  if (q.discountPercent && q.discountPercent > 0) {
    const d = -(total * q.discountPercent) / 100;
    add(`Contract discount (${q.discountPercent}%)`, d);
    total += d;
  }
  return { matched: true, ruleId: rule.id, ruleName: rule.name, total: r2(total), lines };
}

/** Great-circle distance (km) for when both coordinates are known. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
