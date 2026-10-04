import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { apiError } from "./errors";

/** zValidator that answers with the API's standard error body instead of Zod's raw output. */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return apiError(c, 400, "VALIDATION_ERROR", "Request parameters are invalid", result.error.issues);
    }
  });
}
