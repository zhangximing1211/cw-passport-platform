import { createMiddleware } from "hono/factory";
import { apiError } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie sessions. A state-changing request must either be JSON, or carry
 * an `X-Requested-With` header (used for multipart file uploads). A cross-site page can send
 * neither without a CORS preflight, which this API never grants, and HTML forms can't at all.
 * Unlike an Origin check this keeps working behind the Vite dev proxy and on custom domains.
 */
export const requireJsonWrites = createMiddleware(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const isJson = c.req.header("Content-Type")?.toLowerCase().startsWith("application/json");
    if (!isJson && !c.req.header("X-Requested-With")) {
      return apiError(c, 415, "JSON_REQUIRED", "Write requests must use Content-Type: application/json (uploads: send an X-Requested-With header)");
    }
  }
  await next();
});
