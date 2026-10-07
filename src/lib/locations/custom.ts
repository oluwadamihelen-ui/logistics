import type { TenantDb } from "../platform/db";

/** Company-added cities grouped by state, for the state → city pickers. */
export async function customCitiesByState(db: TenantDb): Promise<Record<string, string[]>> {
  const rows = await db.cityOption.findMany({ select: { state: true, name: true }, orderBy: { name: "asc" } });
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.state] ??= []).push(r.name);
  return out;
}
