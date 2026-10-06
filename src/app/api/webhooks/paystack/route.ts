import { NextResponse } from "next/server";
import { prisma } from "@/lib/platform/db";
import { confirmPayment } from "@/lib/platform/billing";
import { getPaymentProvider } from "@/lib/platform/payments/provider";
import { AppError } from "@/lib/platform/errors";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook.
 *  1. Verify the HMAC signature over the RAW body (timing-safe) — otherwise 401, nothing is read.
 *  2. Record the event in a unique ledger (provider+eventId) so redeliveries are no-ops.
 *  3. For charge events, re-verify the transaction with Paystack's API before changing any state.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!getPaymentProvider().verifyWebhookSignature(raw, req.headers.get("x-paystack-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let evt: { event?: string; data?: { id?: number | string; reference?: string } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }
  const type = String(evt.event ?? "unknown");
  const eventId = `${type}:${evt.data?.id ?? evt.data?.reference ?? "n/a"}`;

  const seen = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: "paystack", eventId } } });
  if (seen?.processedAt) return NextResponse.json({ received: true, duplicate: true });
  try {
    if (!seen) await prisma.webhookEvent.create({ data: { provider: "paystack", eventId, eventType: type, payload: evt as Prisma.InputJsonValue } });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const prev = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: "paystack", eventId } } });
      if (prev?.processedAt) return NextResponse.json({ received: true, duplicate: true });
      // seen but not finished (previous attempt crashed) → fall through and retry processing
    } else throw e;
  }

  try {
    if ((type === "charge.success" || type === "charge.failed") && evt.data?.reference) {
      await confirmPayment(evt.data.reference).catch((e) => { if (!(e instanceof AppError && e.code === "NOT_FOUND")) throw e; /* not one of ours */ });
    }
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "paystack", eventId } }, data: { processedAt: new Date() } });
    return NextResponse.json({ received: true });
  } catch (e) {
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "paystack", eventId } }, data: { error: (e instanceof Error ? e.message : "error").slice(0, 300) } }).catch(() => undefined);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Paystack retries
  }
}
