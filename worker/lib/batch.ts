import type { BatchItem } from "drizzle-orm/batch";
import type { DrizzleD1Database } from "drizzle-orm/d1";

/**
 * db.batch() for a list assembled at runtime (drizzle's signature wants a non-empty tuple).
 * D1 runs the statements in one transaction: all apply or none do.
 */
export function runBatch(db: DrizzleD1Database, items: BatchItem<"sqlite">[]) {
  if (!items.length) return Promise.resolve([]);
  return db.batch(items as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
