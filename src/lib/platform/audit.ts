import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export interface AuditInput {
  companyId?: string | null;
  actor?: { id: string; name: string; role: string } | null;
  action: string; // e.g. "shipment.reassigned"
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

const SENSITIVE = /password|secret|token|hash|authorization|apikey|signature/i;

/** Drop secrets before persisting snapshots. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Writes an append-only audit record. Never throws into the caller's business flow. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: input.companyId ?? null,
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        before: input.before === undefined ? undefined : (redact(input.before) as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (redact(input.after) as Prisma.InputJsonValue),
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write audit log", e instanceof Error ? e.message : e);
  }
}
