import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_STATE"
  | "LIMIT_EXCEEDED"
  | "FEATURE_UNAVAILABLE"
  | "SUBSCRIPTION_INACTIVE"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_STATE: 409,
  LIMIT_EXCEEDED: 402,
  FEATURE_UNAVAILABLE: 402,
  SUBSCRIPTION_INACTIVE: 402,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 501,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode; fieldErrors?: Record<string, string[]> };

/** Convert any thrown value to a safe, client-presentable failure. Never leaks internals. */
export function toFailure(e: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      code: "VALIDATION",
      fieldErrors: e.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  console.error("[unhandled]", e instanceof Error ? e.message : "unknown error");
  return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" };
}
