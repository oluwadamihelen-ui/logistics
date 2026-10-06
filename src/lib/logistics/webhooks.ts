/** Outbound webhooks to customer-configured endpoints (signed with HMAC-SHA256). */
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "../platform/db";

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^::1$/, /^fc/i, /^fd/i, /^fe80/i];

/** Basic SSRF guard: https only, no localhost / private IP literals. (DNS-based private resolution should additionally be blocked at the network layer.) */
export function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.replace(/^\[|\]$/g, "");
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (isIP(h) && PRIVATE.some((r) => r.test(h))) return false;
    return true;
  } catch { return false; }
}
export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("hex")}`;
export const sign = (secret: string, ts: number, body: string) => createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

export async function emitWebhook(companyId: string, event: string, data: unknown) {
  try {
    const eps = await prisma.webhookEndpoint.findMany({ where: { companyId, isActive: true, events: { has: event } } });
    if (!eps.length) return;
    const body = JSON.stringify({ id: randomBytes(8).toString("hex"), event, createdAt: new Date().toISOString(), data });
    await Promise.all(eps.map(async (ep) => {
      if (!isSafeWebhookUrl(ep.url)) return;
      const ts = Math.floor(Date.now() / 1000);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Timestamp": String(ts), "X-Webhook-Signature": `v1=${sign(ep.secret, ts, body)}` }, body, signal: AbortSignal.timeout(5000), redirect: "manual" });
          if (r.ok) return;
        } catch { /* retry once */ }
      }
    }));
  } catch (e) { console.error("[webhooks] emit failed", e instanceof Error ? e.message : e); }
}
