/**
 * Customer-facing messages (recipient/sender), rendered from company-configurable templates and
 * sent only through channels the company enabled AND whose providers are configured.
 */
import type { Channel, Shipment } from "@prisma/client";
import type { ServiceCtx } from "../platform/service";
import { prisma } from "../platform/db";
import { getProvider } from "../platform/notifications/providers";

export type CustomerEvent = "shipment.created" | "shipment.out_for_delivery" | "shipment.delivered" | "shipment.delivery_failed" | "shipment.otp";

export const DEFAULT_TEMPLATES: Record<CustomerEvent, string> = {
  "shipment.created": "Hi {{recipientName}}, a shipment from {{senderName}} is on its way via {{company}}. Track it: {{trackingUrl}} (ref {{trackingNumber}}).",
  "shipment.out_for_delivery": "Your {{company}} package {{trackingNumber}} is out for delivery today. Track: {{trackingUrl}}",
  "shipment.delivered": "Your {{company}} package {{trackingNumber}} has been delivered. Thank you!",
  "shipment.delivery_failed": "We couldn't deliver {{trackingNumber}} today. We'll contact you to reschedule. Track: {{trackingUrl}}",
  "shipment.otp": "Your {{company}} delivery code for {{trackingNumber}} is {{otp}}. Share it only with the rider at hand-over.",
};

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

/** Returns true if at least one channel actually sent. Never throws. */
export async function sendCustomerMessage(
  svc: ServiceCtx, s: Pick<Shipment, "id" | "trackingNumber" | "recipientName" | "recipientPhone" | "recipientEmail" | "senderName">,
  event: CustomerEvent, extra: Record<string, string> = {},
): Promise<boolean> {
  try {
    const [settings, company] = await Promise.all([
      svc.db.companySettings.findFirst({ select: { enabledChannels: true } }),
      prisma.company.findUnique({ where: { id: svc.companyId }, select: { name: true } }),
    ]);
    const channels = (settings?.enabledChannels ?? []).filter((c: Channel) => c === "SMS" || c === "WHATSAPP" || c === "EMAIL");
    if (!channels.length) return false;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
    const vars = { recipientName: s.recipientName, senderName: s.senderName, trackingNumber: s.trackingNumber, trackingUrl: `${base}/track/${s.trackingNumber}`, company: company?.name ?? "Delivery", ...extra };
    const templates = await svc.db.messageTemplate.findMany({ where: { event, isActive: true } });
    let sent = false;
    for (const channel of channels) {
      const provider = getProvider(channel);
      const to = channel === "EMAIL" ? s.recipientEmail : s.recipientPhone;
      if (!provider?.isConfigured() || !to) continue;
      const tpl = templates.find((t) => t.channel === channel);
      try {
        await provider.send({ to, subject: tpl?.subject ?? "Delivery update", body: render(tpl?.body ?? DEFAULT_TEMPLATES[event], vars) });
        sent = true;
      } catch (e) {
        console.error("[customer-message] send failed", channel, e instanceof Error ? e.message : e);
      }
    }
    return sent;
  } catch (e) {
    console.error("[customer-message] failed", e instanceof Error ? e.message : e);
    return false;
  }
}
