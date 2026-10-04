import { createMiddleware } from "hono/factory";
import type { UserRole } from "../../shared/api";
import type { UserRow } from "../db/schema";
import { apiError } from "../lib/errors";
import { getSessionUser } from "../lib/session";

export type AuthEnv = { Bindings: Env; Variables: { user: UserRow } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, 401, "UNAUTHENTICATED", "Sign in to access this resource");
  c.set("user", user);
  await next();
});

export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").role)) return apiError(c, 403, "FORBIDDEN", "Your account cannot perform this action");
    await next();
  });
