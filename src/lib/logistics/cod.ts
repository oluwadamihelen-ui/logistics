import type { CodStatus } from "@prisma/client";
import { num } from "../platform/db";
import type { ServiceCtx } from "../platform/service";
import { AppError } from "../platform/errors";

/** Create the COD ledger row for a shipment (idempotent: one per shipment). */
export async function ensureCod(svc: ServiceCtx, shipment: { id: string; codAmount: any; customerId: string | null }) {
  if (num(shipment.codAmount) <= 0) return null;
  const existing = await svc.db.codTransaction.findFirst({ where: { shipmentId: shipment.id } });
  if (existing) return existing;
  return svc.db.codTransaction.create({
    data: { shipmentId: shipment.id, customerId: shipment.customerId, amountDue: shipment.codAmount, status: "PENDING" } as any,
  });
}

/** Called when a driver completes delivery and collects cash. */
export async function recordCodCollected(svc: ServiceCtx, shipmentId: string, driverId: string | null, collected: number) {
  const cod = await svc.db.codTransaction.findFirst({ where: { shipmentId } });
  if (!cod) return null;
  const due = num(cod.amountDue);
  const disputed = Math.abs(collected - due) > 0.009;
  return svc.db.codTransaction.update({
    where: { id: cod.id },
    data: {
      driverId,
      amountCollected: collected,
      collectedAt: new Date(),
      status: disputed ? "DISPUTED" : "COLLECTED",
      disputeNote: disputed ? `Collected ${collected} but ${due} was due` : null,
    },
  });
}

/**
 * Settlement state derived from the ledger amounts. Money flow:
 *   driver collects → remits to company (amountRemitted) → company pays merchant (amountSettled)
 */
export function deriveCodStatus(c: { amountDue: number; amountCollected: number; amountSettled: number; disputed?: boolean }): CodStatus {
  if (c.disputed) return "DISPUTED";
  if (c.amountCollected <= 0) return "PENDING";
  if (c.amountSettled <= 0) return "COLLECTED";
  if (c.amountSettled + 0.009 >= c.amountCollected) return "SETTLED";
  return "PARTIALLY_SETTLED";
}

export async function recordCodRemittance(svc: ServiceCtx, codId: string, amount: number) {
  if (amount <= 0) throw new AppError("VALIDATION", "Amount must be positive");
  const cod = await svc.db.codTransaction.findFirst({ where: { id: codId } });
  if (!cod) throw new AppError("NOT_FOUND", "COD record not found");
  const remitted = num(cod.amountRemitted) + amount;
  if (remitted > num(cod.amountCollected) + 0.009) throw new AppError("VALIDATION", "Remittance exceeds the amount collected");
  return svc.db.codTransaction.update({ where: { id: codId }, data: { amountRemitted: remitted, remittedAt: new Date() } });
}

export async function recordCodSettlement(svc: ServiceCtx, codId: string, amount: number, reference: string) {
  if (amount <= 0) throw new AppError("VALIDATION", "Amount must be positive");
  const cod = await svc.db.codTransaction.findFirst({ where: { id: codId } });
  if (!cod) throw new AppError("NOT_FOUND", "COD record not found");
  if (num(cod.amountCollected) <= 0) throw new AppError("INVALID_STATE", "Nothing has been collected on this shipment yet");
  const settled = num(cod.amountSettled) + amount;
  // The company can only pay out cash it has actually received from the driver.
  if (settled > num(cod.amountRemitted) + 0.009) throw new AppError("VALIDATION", "Settlement exceeds the amount remitted by the driver");
  const status = deriveCodStatus({ amountDue: num(cod.amountDue), amountCollected: num(cod.amountCollected), amountSettled: settled, disputed: cod.status === "DISPUTED" });
  return svc.db.codTransaction.update({
    where: { id: codId },
    data: { amountSettled: settled, settledAt: new Date(), settlementReference: reference, status },
  });
}

/** Record cash handed over by a driver, applied oldest-first across their unremitted COD collections. */
export async function remitDriverCash(svc: ServiceCtx, driverId: string, amount: number) {
  if (amount <= 0) throw new AppError("VALIDATION", "Amount must be positive");
  const rows = await svc.db.codTransaction.findMany({ where: { driverId, amountCollected: { gt: 0 } }, orderBy: { collectedAt: "asc" } });
  const open = rows.filter((r) => num(r.amountCollected) > num(r.amountRemitted));
  const held = open.reduce((a, r) => a + (num(r.amountCollected) - num(r.amountRemitted)), 0);
  if (amount > held + 0.009) throw new AppError("VALIDATION", `Driver only holds ${held.toFixed(2)} — amount exceeds it`);
  let left = amount;
  for (const r of open) {
    if (left <= 0.0001) break;
    const take = Math.min(left, num(r.amountCollected) - num(r.amountRemitted));
    await svc.db.codTransaction.update({ where: { id: r.id }, data: { amountRemitted: num(r.amountRemitted) + take, remittedAt: new Date() } });
    left -= take;
  }
  return { applied: amount };
}

/** Pay out remitted COD to a sender/merchant, oldest-first. */
export async function settleCustomerCod(svc: ServiceCtx, customerId: string, amount: number, reference: string) {
  if (amount <= 0) throw new AppError("VALIDATION", "Amount must be positive");
  if (!reference.trim()) throw new AppError("VALIDATION", "Enter a settlement reference");
  const rows = await svc.db.codTransaction.findMany({ where: { customerId, amountRemitted: { gt: 0 } }, orderBy: { collectedAt: "asc" } });
  const open = rows.filter((r) => num(r.amountRemitted) > num(r.amountSettled) && r.status !== "DISPUTED");
  const avail = open.reduce((a, r) => a + (num(r.amountRemitted) - num(r.amountSettled)), 0);
  if (amount > avail + 0.009) throw new AppError("VALIDATION", `Only ${avail.toFixed(2)} has been remitted and is available to settle`);
  let left = amount;
  for (const r of open) {
    if (left <= 0.0001) break;
    const take = Math.min(left, num(r.amountRemitted) - num(r.amountSettled));
    await recordCodSettlement(svc, r.id, take, reference);
    left -= take;
  }
}

export async function resolveCodDispute(svc: ServiceCtx, codId: string, note: string) {
  const cod = await svc.db.codTransaction.findFirst({ where: { id: codId } });
  if (!cod) throw new AppError("NOT_FOUND", "COD record not found");
  if (cod.status !== "DISPUTED") throw new AppError("INVALID_STATE", "This record is not disputed");
  const status = deriveCodStatus({ amountDue: num(cod.amountDue), amountCollected: num(cod.amountCollected), amountSettled: num(cod.amountSettled) });
  return svc.db.codTransaction.update({ where: { id: codId }, data: { status, disputeNote: `${cod.disputeNote ?? ""} | Resolved: ${note}`.trim() } });
}
