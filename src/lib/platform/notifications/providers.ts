/**
 * Outbound channel adapters. A channel is only usable when its provider is configured via
 * environment variables; otherwise the engine records the delivery as SKIPPED ("not configured")
 * instead of pretending it was sent.
 */
import type { Channel } from "@prisma/client";

export interface OutboundMessage {
  to: string; // email address or E.164 phone
  subject?: string;
  body: string;
}

export interface ChannelProvider {
  channel: Channel;
  name: string;
  isConfigured(): boolean;
  send(msg: OutboundMessage): Promise<void>;
}

async function post(url: string, init: { headers: Record<string, string>; body: unknown }, label: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${label} responded ${res.status}`);
}

/** Email via Resend (https://resend.com). Needs EMAIL_PROVIDER_KEY and EMAIL_FROM. */
export const emailProvider: ChannelProvider = {
  channel: "EMAIL",
  name: "resend",
  isConfigured: () => !!process.env.EMAIL_PROVIDER_KEY && !!process.env.EMAIL_FROM,
  async send(m) {
    await post("https://api.resend.com/emails", {
      headers: { Authorization: `Bearer ${process.env.EMAIL_PROVIDER_KEY}` },
      body: { from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject ?? "Notification", text: m.body },
    }, "email provider");
  },
};

/** SMS via Termii (Nigeria-focused). Needs SMS_PROVIDER_KEY and SMS_SENDER_ID. */
export const smsProvider: ChannelProvider = {
  channel: "SMS",
  name: "termii",
  isConfigured: () => !!process.env.SMS_PROVIDER_KEY && !!process.env.SMS_SENDER_ID,
  async send(m) {
    await post(process.env.SMS_API_URL ?? "https://api.ng.termii.com/api/sms/send", {
      headers: {},
      body: { api_key: process.env.SMS_PROVIDER_KEY, to: m.to.replace(/^\+/, ""), from: process.env.SMS_SENDER_ID, sms: m.body, type: "plain", channel: "generic" },
    }, "sms provider");
  },
};

/** WhatsApp via Meta Cloud API. Needs WHATSAPP_PROVIDER_KEY (access token) and WHATSAPP_PHONE_NUMBER_ID. */
export const whatsappProvider: ChannelProvider = {
  channel: "WHATSAPP",
  name: "whatsapp-cloud",
  isConfigured: () => !!process.env.WHATSAPP_PROVIDER_KEY && !!process.env.WHATSAPP_PHONE_NUMBER_ID,
  async send(m) {
    await post(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_PROVIDER_KEY}` },
      body: { messaging_product: "whatsapp", to: m.to.replace(/^\+/, ""), type: "text", text: { body: m.body } },
    }, "whatsapp provider");
  },
};

/**
 * Web/mobile push needs a device-token registry and FCM/APNs credentials. Not implemented in this
 * build: reported as unconfigured so no one is told a push was sent.
 */
export const pushProvider: ChannelProvider = {
  channel: "PUSH",
  name: "fcm",
  isConfigured: () => false,
  async send() {
    throw new Error("Push provider not implemented");
  },
};

const REGISTRY: Partial<Record<Channel, ChannelProvider>> = {
  EMAIL: emailProvider, SMS: smsProvider, WHATSAPP: whatsappProvider, PUSH: pushProvider,
};

export function getProvider(channel: Channel): ChannelProvider | null {
  return REGISTRY[channel] ?? null;
}

/** Which channels have working provider credentials on this deployment (shown in settings). */
export function providerStatus(): Record<Exclude<Channel, "IN_APP">, { configured: boolean; provider: string }> {
  return {
    EMAIL: { configured: emailProvider.isConfigured(), provider: emailProvider.name },
    SMS: { configured: smsProvider.isConfigured(), provider: smsProvider.name },
    WHATSAPP: { configured: whatsappProvider.isConfigured(), provider: whatsappProvider.name },
    PUSH: { configured: pushProvider.isConfigured(), provider: pushProvider.name },
  };
}
