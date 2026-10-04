import { describe, expect, it } from "vitest";
import type { ApiErrorBody, UserDto } from "../../shared/api";
import { api, login, postJson } from "./helpers";

const newUser = (suffix: string) => ({
  username: `tester_${suffix}`,
  email: `tester_${suffix}@example.com`,
  password: "Str0ng!pass",
  company: "Test Demolition Ltd",
  userType: "Transporter",
});

describe("auth", () => {
  it("signs in the seeded demo account and sets an HttpOnly session cookie", async () => {
    const res = await postJson("/auth/login", { username: "demo", password: "demo1234" });
    expect(res.status).toBe(200);
    expect((await res.json<{ user: UserDto }>()).user).toMatchObject({ username: "demo", role: "admin", contact: "Alex Leung" });
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^cw_session=[0-9a-f]{64};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("accepts the email address as the login name, case-insensitively", async () => {
    const res = await postJson("/auth/login", { username: "Alex.Leung@CWPassport.hk", password: "demo1234" });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password and an unknown user with the same error", async () => {
    for (const body of [{ username: "demo", password: "wrong-pass" }, { username: "nobody", password: "demo1234" }]) {
      const res = await postJson("/auth/login", body);
      expect(res.status).toBe(401);
      expect((await res.json<ApiErrorBody>()).error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("returns the current user from /auth/me and 401 without a session", async () => {
    expect((await api("/auth/me")).status).toBe(401);
    const res = await api("/auth/me", { cookie: await login() });
    expect(res.status).toBe(200);
    expect((await res.json<{ user: UserDto }>()).user.username).toBe("demo");
  });

  it("invalidates the session on logout", async () => {
    const cookie = await login();
    expect((await postJson("/auth/logout", {}, cookie)).status).toBe(204);
    expect((await api("/auth/me", { cookie })).status).toBe(401);
  });

  it("registers a new account that can then sign in, without storing the plain password", async () => {
    const user = newUser("reg");
    const res = await postJson("/auth/register", user);
    expect(res.status).toBe(201);
    const body = await res.json<{ user: UserDto & { passwordHash?: string } }>();
    expect(body.user).toMatchObject({ username: user.username, userType: "Transporter", role: "member" });
    expect(body.user.passwordHash).toBeUndefined();
    await expect(login(user.username, user.password)).resolves.toMatch(/^cw_session=/);
  });

  it("refuses duplicate usernames and emails", async () => {
    const user = newUser("dup");
    expect((await postJson("/auth/register", user)).status).toBe(201);
    const sameName = await postJson("/auth/register", { ...user, username: user.username.toUpperCase(), email: "other@example.com" });
    expect((await sameName.json<ApiErrorBody>()).error.code).toBe("USERNAME_TAKEN");
    const sameEmail = await postJson("/auth/register", { ...user, username: "someone_else" });
    expect((await sameEmail.json<ApiErrorBody>()).error.code).toBe("EMAIL_TAKEN");
  });

  it("validates registration input", async () => {
    const res = await postJson("/auth/register", { ...newUser("bad"), password: "short", userType: "Wizard" });
    expect(res.status).toBe(400);
    expect((await res.json<ApiErrorBody>()).error.code).toBe("VALIDATION_ERROR");
  });

  it("answers password-reset requests identically whether or not the account exists", async () => {
    const known = await (await postJson("/auth/forgot", { identifier: "demo" })).json();
    const unknown = await (await postJson("/auth/forgot", { identifier: "ghost" })).json();
    expect(known).toEqual(unknown);
  });

  it("rejects writes that are not JSON (CSRF protection)", async () => {
    const cookie = await login();
    const form = await api("/auth/logout", { method: "POST", cookie, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "x=1" });
    expect(form.status).toBe(415);
    const bodyless = await api("/auth/logout", { method: "POST", cookie });
    expect(bodyless.status).toBe(415);
    expect((await api("/auth/me", { cookie })).status).toBe(200);
  });

  it("protects business endpoints", async () => {
    for (const path of ["/passports", "/transfers", "/listings", "/demands", "/matches", "/trades", "/marketplace/summary", "/stats/overview"]) {
      const res = await api(path);
      expect(res.status, path).toBe(401);
    }
  });
});
