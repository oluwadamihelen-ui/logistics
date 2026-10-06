/** API-key authentication for /api/v1. Keys are shown once; only a SHA-256 hash is stored. */
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma, createTenantClient } from "./db";
import { AppError, type ErrorCode } from "./errors";
import { enforceRateLimit } from "./rate-limit";
import { getEntitlements, assertFeature } from "./entitlements";
import type { ServiceCtx } from "./service";

export const API_SCOPES = ["shipments:create", "shipments:read", "shipments:cancel", "tracking:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

export function generateApiKey() {
  const secret = randomBytes(24).toString("hex");
  const key = `lgx_live_${secret}`;
  return { key, prefix: key.slice(0, 13), hash: hashKey(key) };
}

export interface ApiContext extends ServiceCtx { keyId: string; scopes: string[]; customerId: string | null }

export async function authenticateApi(req: Request, need: ApiScope): Promise<ApiContext> {
  const m = /^Bearer\s+(lgx_live_[a-f0-9]{48})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new AppError("UNAUTHENTICATED", "Provide a valid API key as 'Authorization: Bearer <key>'.");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(m[1]) } });
  if (!key || key.revokedAt) throw new AppError("UNAUTHENTICATED", "Invalid or revoked API key.");
  enforceRateLimit(`api:${key.id}`, 120, 60_000);
  if (!key.scopes.includes(need)) throw new AppError("FORBIDDEN", `This API key lacks the "${need}" scope.`);
  const company = await prisma.company.findUnique({ where: { id: key.companyId }, select: { status: true } });
  if (!company || company.status === "SUSPENDED" || company.status === "CLOSED") throw new AppError("FORBIDDEN", "Company account is not active.");
  const ent = await getEntitlements(key.companyId);
  assertFeature(ent, "api_access");
  if (need === "shipments:create" || need === "shipments:cancel") { const { assertWritable } = await import("./entitlements"); assertWritable(ent); }
  if (key.customerId) {
    const acc = await prisma.corporateAccount.findFirst({ where: { companyId: key.companyId, customerId: key.customerId } });
    if (!acc?.apiEnabled) throw new AppError("FORBIDDEN", "API access is not enabled for this corporate account.");
  }
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { db: createTenantClient(key.companyId), companyId: key.companyId, actor: { id: `api:${key.id}`, name: `API key ${key.name}`, role: "API" }, keyId: key.id, scopes: key.scopes, customerId: key.customerId };
}

export function apiError(e: unknown) {
  if (e instanceof AppError) {
    const code: ErrorCode = e.code;
    return NextResponse.json({ error: { code, message: e.message } }, { status: e.status, headers: e.code === "RATE_LIMITED" ? { "Retry-After": "60" } : undefined });
  }
  if (e instanceof Error && e.name === "ZodError") return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request body", details: (e as any).flatten?.().fieldErrors } }, { status: 422 });
  console.error("[api] unhandled", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Internal error" } }, { status: 500 });
}
