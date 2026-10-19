import type { z } from "zod";
import { requireTenant, type TenantContext } from "./context";
import { toFailure, type ActionResult } from "./errors";
import type { Permission } from "./permissions";
import { assertNotDemo } from "./demo";

/**
 * Builds a server action with the full guard chain:
 * authenticate → resolve tenant → check permissions → validate input → run → safe error mapping.
 */
export function defineAction<S extends z.ZodTypeAny, R>(opts: {
  permissions?: Permission[];
  anyPermission?: Permission[];
  /** Label of an action that is switched off in demo mode (see demo.ts). */
  blockInDemo?: string;
  schema: S;
  handler: (ctx: TenantContext, input: z.infer<S>) => Promise<R>;
}) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      if (opts.blockInDemo) assertNotDemo(opts.blockInDemo);
      const ctx = await requireTenant(...(opts.permissions ?? []));
      if (opts.anyPermission?.length) ctx.requireAny(...opts.anyPermission);
      const input = opts.schema.parse(raw);
      const data = await opts.handler(ctx, input);
      return { ok: true, data };
    } catch (e) {
      return toFailure(e);
    }
  };
}
