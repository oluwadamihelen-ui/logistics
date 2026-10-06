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
  if (settled > num(cod.amountCollected) + 0.009) throw new AppError("VALIDATION", "Settlement exceeds the amount collected");
  const status = deriveCodStatus({ amountDue: num(cod.amountDue), amountCollected: num(cod.amountCollected), amountSettled: settled, disputed: cod.status === "DISPUTED" });
  return svc.db.codTransaction.update({
    where: { id: codId },
    data: { amountSettled: settled, settledAt: new Date(), settlementReference: reference, status },
  });
}
