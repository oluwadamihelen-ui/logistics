/**
 * Database access.
 *
 *  - `prisma`       — unscoped client. ONLY for platform-level code: authentication, webhooks,
 *                     platform admin, public tracking (which resolves tenant from a tracking number).
 *  - `tenantDb(id)` — tenant-scoped client. Every operation on every model that has a
 *                     `companyId` column is forced to that company; `companyId` cannot be
 *                     overridden by callers and cannot be changed on update.
 *                     This is the default for all application services.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "./errors";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Models that carry a companyId column — derived from the schema so new models are covered automatically. */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === "companyId")).map((m) => m.name),
);

/** Append-only models: no tenant-initiated mutation other than create. */
const APPEND_ONLY = new Set(["AuditLog"]);
const MUTATIONS = new Set(["update", "updateMany", "upsert", "delete", "deleteMany"]);
const WHERE_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate",
  "groupBy", "update", "updateMany", "delete", "deleteMany", "upsert",
]);

function stripCompanyId<T>(data: T): T {
  if (data && typeof data === "object" && "companyId" in (data as object)) {
    const rest = { ...(data as Record<string, unknown>) };
    delete rest.companyId;
    return rest as T;
  }
  return data;
}

export function createTenantClient(companyId: string) {
  if (!companyId) throw new AppError("FORBIDDEN", "Tenant context required");
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a: any = args ?? {};

          if (APPEND_ONLY.has(model) && MUTATIONS.has(operation)) {
            throw new AppError("FORBIDDEN", `${model} is append-only`);
          }

          if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), companyId };

          switch (operation) {
            case "create":
              a.data = { ...stripCompanyId(a.data), companyId };
              break;
            case "createMany":
            case "createManyAndReturn":
              a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d: any) => ({ ...stripCompanyId(d), companyId }));
              break;
            case "update":
            case "updateMany":
              a.data = stripCompanyId(a.data);
              break;
            case "upsert":
              a.create = { ...stripCompanyId(a.create), companyId };
              a.update = stripCompanyId(a.update);
              break;
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;

/**
 * Foreign-key ownership guard. Prisma scalar FKs are not tenant-aware, so a caller could pass
 * another company's driverId/customerId. Services MUST call this for any client-supplied id.
 */
export async function assertOwned(
  db: TenantDb,
  refs: Partial<Record<"customer" | "driver" | "vehicle" | "branch" | "hub" | "zone" | "shipment" | "route" | "invoice" | "user" | "address", string | null | undefined>>,
): Promise<void> {
  for (const [model, id] of Object.entries(refs)) {
    if (!id) continue;
    const delegate = (db as any)[model];
    const found = await delegate.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new AppError("NOT_FOUND", `${model[0].toUpperCase()}${model.slice(1)} not found`);
  }
}

/** Atomic per-company sequence (shipment order numbers, invoice numbers, …). */
export async function nextSequence(companyId: string, key: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("companyId", "key", "value") VALUES (${companyId}, ${key}, 1)
    ON CONFLICT ("companyId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}

/** Decimal → number for JSON/UI. Money is Decimal(14,2) so this is lossless for realistic values. */
export function num(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}
