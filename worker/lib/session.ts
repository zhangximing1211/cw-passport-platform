import { and, eq, gt, lt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { UserDto } from "../../shared/api";
import { sessions, users, type UserRow } from "../db/schema";

export const SESSION_COOKIE = "cw_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

export function toUserDto({ passwordHash: _hash, createdAt: _created, disabled: _disabled, ...user }: UserRow): UserDto {
  return user;
}

export async function createSession<E extends { Bindings: Env }>(c: Context<E>, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = drizzle(c.env.DB);
  // Opportunistic cleanup keeps the table small without a cron job.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
  await db.insert(sessions).values({ id: await sha256(token), userId, expiresAt: expiresAt.toISOString() });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionUser<E extends { Bindings: Env }>(c: Context<E>): Promise<UserRow | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await drizzle(c.env.DB)
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, await sha256(token)), gt(sessions.expiresAt, new Date().toISOString()), eq(users.disabled, false)))
    .get();
  return row?.user ?? null;
}

/** The hashed id of the current request's session, if any. */
export async function currentSessionId<E extends { Bindings: Env }>(c: Context<E>) {
  const token = getCookie(c, SESSION_COOKIE);
  return token ? sha256(token) : null;
}

export async function destroySession<E extends { Bindings: Env }>(c: Context<E>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await drizzle(c.env.DB).delete(sessions).where(eq(sessions.id, await sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Signs a user out everywhere, optionally keeping one session (the one changing the password). */
export function revokeSessionsQuery(db: ReturnType<typeof drizzle>, userId: string, keepSessionId?: string | null) {
  return db.delete(sessions).where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
}
