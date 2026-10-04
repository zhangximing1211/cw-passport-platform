import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { NotificationDto, NotificationType } from "../../shared/api";
import { notifications } from "../db/schema";

type Recipient = { userId: string } | { company: string } | { role: "regulator" | "admin" };

/**
 * Returns the INSERT for a notification without running it, so it can join the db.batch()
 * of the change that caused it (same pattern as auditInsert).
 */
export function notifyInsert(db: DrizzleD1Database, to: Recipient, type: NotificationType, params: Record<string, string>, link?: NotificationDto["link"]) {
  return db.insert(notifications).values({
    recipientUserId: "userId" in to ? to.userId : null,
    recipientCompany: "company" in to ? to.company : null,
    recipientRole: "role" in to ? to.role : null,
    type,
    params: JSON.stringify(params),
    linkKind: link?.kind ?? null,
    linkId: link?.id ?? null,
  });
}
