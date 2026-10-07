/**
 * Push delivery via Firebase Cloud Messaging HTTP v1 (covers Android natively and iOS through APNs-in-FCM).
 * Needs FCM_SERVICE_ACCOUNT_JSON (the Firebase service-account key, as JSON or base64 of the JSON).
 * Uses node:crypto to sign the OAuth JWT, so no SDK dependency.
 */
import { createSign } from "node:crypto";

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }

export class PushTokenInvalid extends Error {}

export function loadServiceAccount(raw = process.env.FCM_SERVICE_ACCOUNT_JSON): ServiceAccount | null {
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text);
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    return j;
  } catch {
    return null;
  }
}

export const pushConfigured = () => loadServiceAccount() !== null;

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signServiceJwt(sa: ServiceAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64u(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600,
  }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key);
  return `${head}.${claims}.${b64u(sig)}`;
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceJwt(sa) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM auth responded ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

/** Sends one push. Throws PushTokenInvalid when FCM says the device token is dead (caller prunes it). */
export async function sendPush(token: string, msg: { title: string; body: string; url?: string }): Promise<void> {
  const sa = loadServiceAccount();
  if (!sa) throw new Error("Push provider not configured");
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken(sa)}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: msg.url ? { url: msg.url } : undefined,
        android: { priority: "HIGH" },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return;
  if (res.status === 404 || res.status === 400) {
    const text = await res.text().catch(() => "");
    if (/UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/.test(text)) throw new PushTokenInvalid(text.slice(0, 120));
  }
  throw new Error(`FCM responded ${res.status}`);
}
