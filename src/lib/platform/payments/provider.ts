/**
 * Payment-provider abstraction (subscriptions billing). Paystack is implemented; others can be added
 * by implementing `PaymentProvider`. The frontend never decides whether a payment succeeded — only
 * `verify()` (server → provider API) and signature-checked webhooks can.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface InitializeInput { email: string; amountKobo: number; currency: string; reference: string; callbackUrl: string; metadata?: Record<string, unknown> }
export interface VerifyResult { status: "success" | "failed" | "pending" | "abandoned"; amountKobo: number; currency: string; reference: string; paidAt: Date | null; raw: unknown }

export interface PaymentProvider {
  name: string;
  isConfigured(): boolean;
  publicKey(): string | null;
  initialize(i: InitializeInput): Promise<{ authorizationUrl: string; reference: string }>;
  verify(reference: string): Promise<VerifyResult>;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
}

const BASE = "https://api.paystack.co";

export const paystack: PaymentProvider = {
  name: "paystack",
  isConfigured: () => !!process.env.PAYSTACK_SECRET_KEY,
  publicKey: () => process.env.PAYSTACK_PUBLIC_KEY ?? null,
  async initialize(i) {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: i.email, amount: i.amountKobo, currency: i.currency, reference: i.reference, callback_url: i.callbackUrl, metadata: i.metadata }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !j.status) throw new Error(`Paystack initialize failed (${res.status})`);
    return { authorizationUrl: j.data.authorization_url as string, reference: j.data.reference as string };
  },
  async verify(reference) {
    const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, signal: AbortSignal.timeout(15_000) });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !j.status) throw new Error(`Paystack verify failed (${res.status})`);
    const d = j.data;
    return { status: d.status === "success" ? "success" : d.status === "failed" ? "failed" : d.status === "abandoned" ? "abandoned" : "pending", amountKobo: Number(d.amount), currency: String(d.currency), reference: String(d.reference), paidAt: d.paid_at ? new Date(d.paid_at) : null, raw: { id: d.id, status: d.status, gateway_response: d.gateway_response, channel: d.channel } };
  },
  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
    if (!secret || !signature) return false;
    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected), b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  },
};

let override: PaymentProvider | null = null;
/** Test hook. */
export function setPaymentProvider(p: PaymentProvider | null) { override = p; }
export function getPaymentProvider(): PaymentProvider { return override ?? paystack; }
