import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { USER_ROLES, type AdminUserDto, type AuditEntryDto, type NotificationDto, type Page } from "../../shared/api";
import { auditLogs, notificationReads, notifications, users, type UserRow } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { apiError } from "../lib/errors";
import { notifyInsert } from "../lib/notify";
import { isAdmin, isRegulator } from "../lib/permissions";
import { containsAny, pagination } from "../lib/query";
import { revokeSessionsQuery, toUserDto } from "../lib/session";
import { validate } from "../lib/validate";
import { requireRole, type AuthEnv } from "../middleware/auth";

// ── User management (administrators) ────────────────────────────────────────

const userQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  /** true: only users waiting for the regulator role. */
  pending: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  ...pagination,
});

const userPatch = z.object({
  role: z.enum(USER_ROLES).optional(),
  disabled: z.boolean().optional(),
}).refine((body) => body.role !== undefined || body.disabled !== undefined, "Nothing to update");

const toAdminUserDto = (row: UserRow): AdminUserDto => ({
  ...toUserDto(row),
  disabled: row.disabled,
  createdAt: row.createdAt,
  regulatorRequested: row.userType === "Regulatory Agency" && row.role === "member",
});

export const adminRoutes = new Hono<AuthEnv>()
  .use(requireRole("admin"))
  .get("/users", validate("query", userQuery), async (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB);
    const where = and(
      query.role ? eq(users.role, query.role) : undefined,
      query.pending ? and(eq(users.userType, "Regulatory Agency"), eq(users.role, "member")) : undefined,
      query.q ? containsAny([users.username, users.email, users.company, users.contact], query.q) : undefined,
    );
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(users).where(where),
    ]);
    const body: Page<AdminUserDto> = { items: rows.map(toAdminUserDto), total, page: query.page, pageSize: query.pageSize };
    return c.json(body);
  })
  .patch("/users/:id", validate("json", userPatch), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const admin = c.get("user");
    const db = drizzle(c.env.DB);
    const target = await db.select().from(users).where(eq(users.id, id)).get();
    if (!target) return apiError(c, 404, "USER_NOT_FOUND", "User does not exist");
    if (target.id === admin.id && (body.disabled || (body.role && body.role !== "admin"))) {
      return apiError(c, 409, "CANNOT_CHANGE_SELF", "You cannot disable your own account or remove your own administrator role");
    }
    if (target.role === "admin" && ((body.role && body.role !== "admin") || body.disabled)) {
      const [{ admins }] = await db.select({ admins: count() }).from(users).where(and(eq(users.role, "admin"), eq(users.disabled, false)));
      if (admins <= 1) return apiError(c, 409, "LAST_ADMIN", "The platform needs at least one active administrator");
    }
    const changes = { ...(body.role ? { role: body.role } : {}), ...(body.disabled !== undefined ? { disabled: body.disabled } : {}) };
    const [[updated]] = await db.batch([
      db.update(users).set(changes).where(eq(users.id, id)).returning(),
      auditInsert(db, { userId: admin.id, action: "user.admin_update", entityType: "user", entityId: id, details: { before: { role: target.role, disabled: target.disabled }, after: changes } }),
      // A disabled account is signed out everywhere at once.
      ...(body.disabled ? [revokeSessionsQuery(db, id)] : []),
      ...(body.role && body.role !== target.role ? [notifyInsert(db, { userId: id }, "user.role_changed", { role: body.role }, null)] : []),
    ]);
    return c.json(toAdminUserDto(updated));
  });

// ── Audit log ───────────────────────────────────────────────────────────────

const auditQuery = z.object({
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(80).optional(),
  userId: z.string().trim().max(80).optional(),
  action: z.string().trim().max(60).optional(),
  ...pagination,
});

/**
 * The full log is for administrators and regulators. Everyone else may read the history of
 * one record (entityType + entityId), which is what the History tabs show.
 */
export const auditRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", auditQuery), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("user");
    if (!isRegulator(user) && !(query.entityType && query.entityId)) {
      return apiError(c, 403, "FORBIDDEN", "Only administrators and regulators can browse the full audit log");
    }
    const db = drizzle(c.env.DB);
    const where = and(
      query.entityType ? eq(auditLogs.entityType, query.entityType) : undefined,
      query.entityId ? eq(auditLogs.entityId, query.entityId) : undefined,
      query.userId ? eq(auditLogs.userId, query.userId) : undefined,
      query.action ? eq(auditLogs.action, query.action) : undefined,
    );
    const [rows, [{ total }]] = await Promise.all([
      db.select({ log: auditLogs, username: users.username, company: users.company }).from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId)).where(where)
        .orderBy(desc(auditLogs.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(auditLogs).where(where),
    ]);
    const items: AuditEntryDto[] = rows.map(({ log, username, company }) => ({
      id: log.id, action: log.action, entityType: log.entityType, entityId: log.entityId, createdAt: log.createdAt,
      details: log.details ? JSON.parse(log.details) : null,
      user: log.userId && username ? { id: log.userId, username, company: company ?? "" } : null,
    }));
    const body: Page<AuditEntryDto> = { items, total, page: query.page, pageSize: query.pageSize };
    return c.json(body);
  });

// ── Notifications ───────────────────────────────────────────────────────────

/** Notifications addressed to this user, their company, or a role they hold. */
function visibleTo(user: UserRow): SQL {
  const roles = [...(isRegulator(user) ? ["regulator" as const] : []), ...(isAdmin(user) ? ["admin" as const] : [])];
  return or(
    eq(notifications.recipientUserId, user.id),
    sql`lower(${notifications.recipientCompany}) = lower(${user.company})`,
    ...(roles.length ? [inArray(notifications.recipientRole, roles)] : []),
  )!;
}

export const notificationRoutes = new Hono<AuthEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const readJoin = and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, user.id));
    const [rows, [{ unread }]] = await Promise.all([
      db.select({ n: notifications, readBy: notificationReads.userId }).from(notifications).leftJoin(notificationReads, readJoin)
        .where(visibleTo(user)).orderBy(desc(notifications.id)).limit(50),
      db.select({ unread: count() }).from(notifications).leftJoin(notificationReads, readJoin)
        .where(and(visibleTo(user), isNull(notificationReads.userId))),
    ]);
    const items: NotificationDto[] = rows.map(({ n, readBy }) => ({
      id: n.id, type: n.type, params: JSON.parse(n.params), createdAt: n.createdAt, read: readBy !== null,
      link: n.linkKind && n.linkId ? { kind: n.linkKind as NonNullable<NotificationDto["link"]>["kind"], id: n.linkId } : null,
    }));
    return c.json({ items, unread });
  })
  .post("/:id/read", async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return apiError(c, 400, "VALIDATION_ERROR", "Invalid notification id");
    const db = drizzle(c.env.DB);
    const row = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, id), visibleTo(user))).get();
    if (!row) return apiError(c, 404, "NOTIFICATION_NOT_FOUND", "Notification does not exist");
    await db.insert(notificationReads).values({ notificationId: id, userId: user.id }).onConflictDoNothing();
    return c.body(null, 204);
  })
  .post("/read-all", async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const unread = await db.select({ id: notifications.id }).from(notifications)
      .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, user.id)))
      .where(and(visibleTo(user), isNull(notificationReads.userId)));
    // Insert in chunks to stay under D1's bound-parameter limit.
    for (let i = 0; i < unread.length; i += 40) {
      await db.insert(notificationReads).values(unread.slice(i, i + 40).map((n) => ({ notificationId: n.id, userId: user.id }))).onConflictDoNothing();
    }
    return c.body(null, 204);
  });
