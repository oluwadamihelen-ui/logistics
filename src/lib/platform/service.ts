import type { TenantDb } from "./db";

/**
 * What a domain service needs to act on behalf of a tenant. `TenantContext` satisfies this;
 * so do API-key requests and public-booking flows (actor = null / a synthetic system actor).
 */
export interface ServiceCtx {
  db: TenantDb;
  companyId: string;
  actor: { id: string; name: string; role: string } | null;
  ip?: string | null;
  userAgent?: string | null;
}
