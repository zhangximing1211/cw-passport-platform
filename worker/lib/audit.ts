import type { DrizzleD1Database } from "drizzle-orm/d1";
import { auditLogs } from "../db/schema";

type AuditEntry = { userId: string; action: string; entityType: string; entityId: string; details?: Record<string, unknown> };

/**
 * Returns the INSERT for an audit record without running it, so callers can put it in the
 * same db.batch() as the change it describes (D1 batches are atomic).
 */
export function auditInsert(db: DrizzleD1Database, { details, ...entry }: AuditEntry) {
  return db.insert(auditLogs).values({ ...entry, details: details ? JSON.stringify(details) : null });
}
