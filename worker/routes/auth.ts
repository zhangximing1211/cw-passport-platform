import { and, count, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { USER_TYPES } from "../../shared/api";
import { loginAttempts, passwordResetTokens, users } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { apiError } from "../lib/errors";
import { notifyInsert } from "../lib/notify";
import { fakeVerify, hashPassword, verifyPassword } from "../lib/password";
import { createSession, currentSessionId, destroySession, randomToken, revokeSessionsQuery, sha256, toUserDto } from "../lib/session";
import { nowIso } from "../lib/time";
import { validate } from "../lib/validate";
import { requireAuth, type AuthEnv } from "../middleware/auth";
import { passwordResetMail, send } from "../services/mailer";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const password = z.string().min(8).max(128);

const registerBody = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9._-]+$/, "Letters, digits, dot, dash and underscore only"),
  email: z.email().max(254),
  password,
  company: z.string().trim().min(1).max(120),
  userType: z.enum(USER_TYPES),
  contact: optionalText(80),
  phone: optionalText(30),
});

const loginBody = z.object({
  /** Username or email. */
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

const forgotBody = z.object({ identifier: z.string().trim().min(1).max(254) });
const resetBody = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password });
const profileBody = z.object({ email: z.email().max(254).optional(), contact: optionalText(80), phone: optionalText(30) });
const passwordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

// Sign-in throttling: failures within the window, per account and per client address.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;
const RESET_TTL_MS = 30 * 60_000;

const byLogin = (login: string) =>
  or(sql`lower(${users.username}) = lower(${login})`, sql`lower(${users.email}) = lower(${login})`);

const clientIp = (c: Context) => c.req.header("CF-Connecting-IP") ?? "local";

async function failuresSince(db: ReturnType<typeof drizzle>, key: string, since: string) {
  const [{ n }] = await db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, since)));
  return n;
}

export const authRoutes = new Hono<AuthEnv>()
  .post("/register", validate("json", registerBody), async (c) => {
    const body = c.req.valid("json");
    const db = drizzle(c.env.DB);
    const clash = await db.select({ username: users.username, email: users.email }).from(users)
      .where(or(sql`lower(${users.username}) = lower(${body.username})`, sql`lower(${users.email}) = lower(${body.email})`)).get();
    if (clash) {
      return clash.username.toLowerCase() === body.username.toLowerCase()
        ? apiError(c, 409, "USERNAME_TAKEN", "This username already exists")
        : apiError(c, 409, "EMAIL_TAKEN", "This email is already registered");
    }
    const { password: plain, ...profile } = body;
    const id = `usr_${crypto.randomUUID()}`;
    // Everyone starts as a member. Choosing "Regulatory Agency" only asks an administrator for the role.
    const [[user]] = await db.batch([
      db.insert(users).values({ id, ...profile, role: "member", passwordHash: await hashPassword(plain) }).returning(),
      auditInsert(db, { userId: id, action: "user.register", entityType: "user", entityId: id, details: { username: body.username, company: body.company, userType: body.userType } }),
      ...(body.userType === "Regulatory Agency"
        ? [notifyInsert(db, { role: "admin" }, "user.regulator_requested", { username: body.username, company: body.company }, { kind: "user", id })]
        : []),
    ]);
    return c.json({ user: toUserDto(user), regulatorRequested: body.userType === "Regulatory Agency" }, 201);
  })
  .post("/login", validate("json", loginBody), async (c) => {
    const { username, password: plain } = c.req.valid("json");
    const db = drizzle(c.env.DB);
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const accountKey = `user:${username.toLowerCase()}`;
    const ipKey = `ip:${clientIp(c)}`;
    const [accountFailures, ipFailures] = await Promise.all([failuresSince(db, accountKey, since), failuresSince(db, ipKey, since)]);
    if (accountFailures >= MAX_FAILURES_PER_ACCOUNT || ipFailures >= MAX_FAILURES_PER_IP) {
      c.header("Retry-After", String(WINDOW_MS / 1000));
      return apiError(c, 429, "TOO_MANY_ATTEMPTS", "Too many failed sign-ins. Try again in 15 minutes.");
    }

    const user = await db.select().from(users).where(byLogin(username)).get();
    const ok = user ? await verifyPassword(plain, user.passwordHash) : await fakeVerify(plain);
    if (!user || !ok) {
      await db.insert(loginAttempts).values([{ key: accountKey }, { key: ipKey }]);
      return apiError(c, 401, "INVALID_CREDENTIALS", "Account or password is incorrect");
    }
    if (user.disabled) return apiError(c, 403, "ACCOUNT_DISABLED", "This account has been disabled. Contact your administrator.");
    await db.delete(loginAttempts).where(eq(loginAttempts.key, accountKey));
    await createSession(c, user.id);
    return c.json({ user: toUserDto(user) });
  })
  .post("/logout", async (c) => {
    await destroySession(c);
    return c.body(null, 204);
  })
  .post("/forgot", validate("json", forgotBody), async (c) => {
    const { identifier } = c.req.valid("json");
    const db = drizzle(c.env.DB);
    const user = await db.select({ id: users.id, email: users.email, disabled: users.disabled }).from(users).where(byLogin(identifier)).get();
    if (user && !user.disabled) {
      const token = randomToken();
      await db.insert(passwordResetTokens).values({ id: await sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString() });
      // The link points at the page the request came from (the SPA), not the API host.
      const origin = c.req.header("Origin") ?? new URL(c.req.url).origin;
      await send(c.env, passwordResetMail(user.email, `${origin}/?reset=${token}`));
    }
    // Same answer either way, so the endpoint can't be used to discover accounts.
    return c.json({ message: "If an account matches, reset instructions will be sent to its email address." });
  })
  .post("/reset", validate("json", resetBody), async (c) => {
    const { token, password: plain } = c.req.valid("json");
    const db = drizzle(c.env.DB);
    const id = await sha256(token);
    const row = await db.select().from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, nowIso()))).get();
    if (!row) return apiError(c, 400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired. Request a new one.");
    await db.batch([
      db.update(users).set({ passwordHash: await hashPassword(plain) }).where(eq(users.id, row.userId)),
      db.update(passwordResetTokens).set({ usedAt: nowIso() }).where(eq(passwordResetTokens.id, id)),
      revokeSessionsQuery(db, row.userId),
      auditInsert(db, { userId: row.userId, action: "user.password_reset", entityType: "user", entityId: row.userId }),
    ]);
    return c.json({ message: "Password updated. You can now sign in." });
  })
  .get("/me", requireAuth, (c) => c.json({ user: toUserDto(c.get("user")) }))
  .patch("/me", requireAuth, validate("json", profileBody), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (body.email) {
      const taken = await db.select({ id: users.id }).from(users)
        .where(and(sql`lower(${users.email}) = lower(${body.email})`, ne(users.id, user.id))).get();
      if (taken) return apiError(c, 409, "EMAIL_TAKEN", "This email is already registered");
    }
    const changes = { ...(body.email ? { email: body.email } : {}), contact: body.contact, phone: body.phone };
    const [[updated]] = await db.batch([
      db.update(users).set(changes).where(eq(users.id, user.id)).returning(),
      auditInsert(db, { userId: user.id, action: "user.update_profile", entityType: "user", entityId: user.id, details: changes }),
    ]);
    return c.json({ user: toUserDto(updated) });
  })
  .post("/password", requireAuth, validate("json", passwordBody), async (c) => {
    const { currentPassword, newPassword } = c.req.valid("json");
    const user = c.get("user");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) return apiError(c, 400, "WRONG_PASSWORD", "The current password is incorrect");
    const db = drizzle(c.env.DB);
    // Other devices are signed out; this session stays.
    await db.batch([
      db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id)),
      revokeSessionsQuery(db, user.id, await currentSessionId(c)),
      auditInsert(db, { userId: user.id, action: "user.change_password", entityType: "user", entityId: user.id }),
    ]);
    return c.json({ message: "Password changed" });
  });
