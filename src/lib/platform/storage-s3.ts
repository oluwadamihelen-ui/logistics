/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2…) using SigV4 over fetch —
 * no SDK dependency. Path-style addressing, so it works with any endpoint.
 * Env: S3_BUCKET, S3_REGION (use "auto" for R2), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, optional S3_ENDPOINT, S3_KEY_PREFIX.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { StorageDriver } from "./storage";

const sha256 = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const hmac = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();
const KEY = /^[a-z0-9]+\/[a-f0-9-]{36}$/i;

interface Cfg { bucket: string; region: string; accessKeyId: string; secret: string; endpoint: string; prefix: string }

function cfg(): Cfg | null {
  const { S3_BUCKET: bucket, S3_REGION: region, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secret } = process.env;
  if (!bucket || !region || !accessKeyId || !secret) return null;
  const endpoint = (process.env.S3_ENDPOINT ?? `https://s3.${region}.amazonaws.com`).replace(/\/+$/, "");
  return { bucket, region, accessKeyId, secret, endpoint, prefix: (process.env.S3_KEY_PREFIX ?? "").replace(/^\/+|\/+$/g, "") };
}

const encodePath = (p: string) => p.split("/").map((s) => encodeURIComponent(s)).join("/");

/** Builds the signed request for one object operation. Exported for tests. */
export function signRequest(c: Cfg, method: "GET" | "PUT" | "DELETE", objectKey: string, body: Buffer | null, now = new Date()) {
  const url = new URL(c.endpoint);
  const canonicalPath = encodePath(`${url.pathname.replace(/\/+$/, "")}/${c.bucket}/${objectKey}`);
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260101T000000Z
  const date = amz.slice(0, 8);
  const payloadHash = sha256(body ?? "");
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amz };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonical = [method, canonicalPath, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, date), c.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${url.origin}${canonicalPath}`, headers };
}

async function call(method: "GET" | "PUT" | "DELETE", objectKey: string, body: Buffer | null) {
  const c = cfg();
  if (!c) throw new Error("S3 storage is not configured");
  const { url, headers } = signRequest(c, method, objectKey, body);
  const res = await fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(30_000) });
  if (!res.ok && !(method === "DELETE" && res.status === 404)) throw new Error(`S3 ${method} responded ${res.status}`);
  return res;
}

const objectKey = (c: Cfg, key: string) => (c.prefix ? `${c.prefix}/${key}` : key);

export const s3Storage: StorageDriver = {
  name: "s3",
  isConfigured: () => cfg() !== null,
  async put(companyId, data) {
    if (!/^[a-z0-9]+$/i.test(companyId)) throw new Error("bad company id");
    const key = `${companyId}/${randomUUID()}`;
    await call("PUT", objectKey(cfg()!, key), data);
    return key;
  },
  async get(key) {
    if (!KEY.test(key)) throw new Error("bad key");
    return Buffer.from(await (await call("GET", objectKey(cfg()!, key), null)).arrayBuffer());
  },
  async remove(key) {
    if (!KEY.test(key)) return;
    await call("DELETE", objectKey(cfg()!, key), null).catch(() => undefined);
  },
};
