import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorBody } from "../../shared/api";

export function apiError(c: Context, status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: details === undefined ? { code, message } : { code, message, details } };
  return c.json(body, status);
}
