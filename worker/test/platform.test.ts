import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  AdminUserDto, ApiErrorBody, AuditEntryDto, DemandDto, MaterialStats, NotificationDto, OverviewStats, Page, TransferDto, TransferStats, UserDto,
} from "../../shared/api";
import { api, createPassport, login, newMember, postJson, upload } from "./helpers";

let admin: string;
beforeAll(async () => { admin = await login(); });

const errorCode = async (res: Response) => (await res.json<ApiErrorBody>()).error.code;
const getJson = async <T>(path: string, cookie = admin) => (await api(path, { cookie })).json<T>();
const patchJson = (path: string, body: unknown, cookie: string) => api(path, { method: "PATCH", body: JSON.stringify(body), cookie });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("regulator role is granted by an administrator", () => {
  it("signing up as a Regulatory Agency only requests the role", async () => {
    const res = await postJson("/auth/register", { username: "epd_officer", email: "officer@example.gov", password: "Str0ng!pass", company: "EPD", userType: "Regulatory Agency" });
    const body = await res.json<{ user: UserDto; regulatorRequested: boolean }>();
    expect(body).toMatchObject({ user: { role: "member" }, regulatorRequested: true });

    const officer = await login("epd_officer", "Str0ng!pass");
    const passport = await createPassport(admin);
    expect(await errorCode(await postJson(`/passports/${passport.id}/verify`, {}, officer))).toBe("REGULATOR_REQUIRED");

    const pending = await getJson<Page<AdminUserDto>>("/admin/users?pending=true");
    const request = pending.items.find((u) => u.username === "epd_officer")!;
    expect(request.regulatorRequested).toBe(true);
    const admins = await getJson<{ items: NotificationDto[] }>("/notifications");
    expect(admins.items.some((n) => n.type === "user.regulator_requested" && n.params.username === "epd_officer")).toBe(true);

    const granted = await (await patchJson(`/admin/users/${request.id}`, { role: "regulator" }, admin)).json<AdminUserDto>();
    expect(granted).toMatchObject({ role: "regulator", regulatorRequested: false });
    expect((await postJson(`/passports/${passport.id}/verify`, {}, officer)).status).toBe(200);
    const mine = await getJson<{ items: NotificationDto[] }>("/notifications", officer);
    expect(mine.items.some((n) => n.type === "user.role_changed" && n.params.role === "regulator")).toBe(true);
  });

  it("keeps user management to administrators and protects the last admin", async () => {
    const member = await newMember("Some Co");
    expect((await api("/admin/users", { cookie: member })).status).toBe(403);
    const me = await getJson<{ user: UserDto }>("/auth/me");
    expect(await errorCode(await patchJson(`/admin/users/${me.user.id}`, { disabled: true }, admin))).toBe("CANNOT_CHANGE_SELF");
  });

  it("disabling an account signs it out and blocks sign-in", async () => {
    const member = await newMember("Disabled Co");
    const me = await getJson<{ user: UserDto }>("/auth/me", member);
    await patchJson(`/admin/users/${me.user.id}`, { disabled: true }, admin);
    expect((await api("/auth/me", { cookie: member })).status).toBe(401);
    const res = await postJson("/auth/login", { username: me.user.username, password: "Str0ng!pass" });
    expect(await errorCode(res)).toBe("ACCOUNT_DISABLED");
  });
});

describe("account", () => {
  it("locks sign-in after five failures for that account", async () => {
    await postJson("/auth/register", { username: "lockme", email: "lockme@example.com", password: "Str0ng!pass", company: "X", userType: "Other" });
    for (let i = 0; i < 5; i++) expect((await postJson("/auth/login", { username: "lockme", password: "wrong-pass" })).status).toBe(401);
    const locked = await postJson("/auth/login", { username: "lockme", password: "Str0ng!pass" });
    expect(locked.status).toBe(429);
    expect(locked.headers.get("Retry-After")).toBe("900");
  });

  it("updates the profile and changes the password", async () => {
    const member = await newMember("Profile Co");
    const updated = await (await patchJson("/auth/me", { contact: "Mei Ling", phone: "+852 1234 5678" }, member)).json<{ user: UserDto }>();
    expect(updated.user).toMatchObject({ contact: "Mei Ling", phone: "+852 1234 5678" });

    expect(await errorCode(await postJson("/auth/password", { currentPassword: "nope-nope", newPassword: "N3w!password" }, member))).toBe("WRONG_PASSWORD");
    expect((await postJson("/auth/password", { currentPassword: "Str0ng!pass", newPassword: "N3w!password" }, member)).status).toBe(200);
    // The session that changed the password stays signed in.
    expect((await api("/auth/me", { cookie: member })).status).toBe(200);
    await expect(login(updated.user.username, "N3w!password")).resolves.toMatch(/^cw_session=/);
  });

  it("resets a forgotten password with a one-time token", async () => {
    const member = await newMember("Reset Co");
    const { user } = await getJson<{ user: UserDto }>("/auth/me", member);
    // The emailed link carries a random token; insert a known one the way /auth/forgot does.
    const token = "ab".repeat(32);
    await env.DB.prepare("INSERT INTO password_reset_tokens (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), user.id, new Date(Date.now() + 600_000).toISOString()).run();

    expect((await postJson("/auth/reset", { token, password: "Reset!12345" })).status).toBe(200);
    expect((await api("/auth/me", { cookie: member })).status).toBe(401); // old sessions revoked
    await expect(login(user.username, "Reset!12345")).resolves.toMatch(/^cw_session=/);
    expect(await errorCode(await postJson("/auth/reset", { token, password: "Again!12345" }))).toBe("INVALID_RESET_TOKEN");
  });

  it("issues a reset token for a real account", async () => {
    await postJson("/auth/forgot", { identifier: "demo" });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = 'usr_demo'").first<{ n: number }>();
    expect(row?.n).toBeGreaterThan(0);
  });
});

describe("demands and company profiles", () => {
  it("lets a buyer post, edit and delete its own demand", async () => {
    const buyer = await newMember("New Buyer Ltd");
    const body = { industry: "Road Construction", region: "Dongguan", category: "Concrete", quantity: { value: 120, unit: "t" }, deadline: "2099-12-31", contact: "buy@newbuyer.cn" };
    const res = await postJson("/demands", body, buyer);
    expect(res.status).toBe(201);
    const demand = await res.json<DemandDto>();
    expect(demand).toMatchObject({ id: expect.stringMatching(/^DMD-\d{4}-\d{4}$/), company: "New Buyer Ltd", viewer: { canManage: true } });

    // First demand creates a basic company profile for the matching engine.
    const profile = await getJson<{ name: string; region: string }>(`/companies/${encodeURIComponent("New Buyer Ltd")}`, buyer);
    expect(profile).toMatchObject({ name: "New Buyer Ltd", region: "Dongguan" });

    const other = await newMember("Rival Ltd");
    expect((await patchJson(`/demands/${demand.id}`, { quantity: { value: 1, unit: "t" } }, other)).status).toBe(403);
    expect((await (await patchJson(`/demands/${demand.id}`, { quantity: { value: 150, unit: "t" } }, buyer)).json<DemandDto>()).quantity.value).toBe(150);

    const mine = await getJson<Page<DemandDto>>("/demands?mine=true", buyer);
    expect(mine.items.map((d) => d.id)).toEqual([demand.id]);
    expect((await api(`/demands/${demand.id}`, { method: "DELETE", body: "{}", cookie: buyer })).status).toBe(204);
  });

  it("keeps demands that already have trades", async () => {
    const res = await api("/demands/DMD-2026-0071", { method: "DELETE", body: "{}", cookie: admin });
    expect(await errorCode(res)).toBe("DEMAND_IN_USE");
  });

  it("members edit their own company profile; only admins set ratings", async () => {
    const member = await newMember("Profile Owner Ltd");
    const profile = { industry: "Recycling", region: "Hong Kong", needs: "Clean glass cullet", capacity: "50 t/month", history: "New" };
    expect((await api(`/companies/${encodeURIComponent("Profile Owner Ltd")}`, { method: "PUT", body: JSON.stringify(profile), cookie: member })).status).toBe(201);
    expect((await api(`/companies/${encodeURIComponent("Profile Owner Ltd")}`, { method: "PUT", body: JSON.stringify({ ...profile, rating: 5 }), cookie: member })).status).toBe(403);
    expect((await api(`/companies/${encodeURIComponent("Harbour Glassworks")}`, { method: "PUT", body: JSON.stringify(profile), cookie: member })).status).toBe(403);
  });
});

describe("notifications", () => {
  it("tells the seller about a new trade and tracks read state", async () => {
    const seller = await newMember("CW Passport"); // same company as the demo admin, who creates the listing
    const passport = await createPassport(admin, {}, admin);
    const listing = await (await postJson("/listings", { passportId: passport.id }, admin)).json<{ id: string }>();
    await postJson(`/listings/${listing.id}/mint`, {}, admin);
    await postJson(`/listings/${listing.id}/publish`, {}, admin);
    await postJson("/trades", { listingId: listing.id, demandId: "DMD-2026-0071", quantityValue: 10, priceHkd: 900 }, admin);

    const inbox = await getJson<{ items: NotificationDto[]; unread: number }>("/notifications", seller);
    const notice = inbox.items.find((n) => n.type === "trade.created" && n.params.listingId === listing.id)!;
    expect(notice).toMatchObject({ read: false, link: { kind: "listing", id: listing.id } });
    expect((await postJson(`/notifications/${notice.id}/read`, {}, seller)).status).toBe(204);
    expect((await getJson<{ items: NotificationDto[] }>("/notifications", seller)).items.find((n) => n.id === notice.id)?.read).toBe(true);
    await postJson("/notifications/read-all", {}, seller);
    expect((await getJson<{ unread: number }>("/notifications", seller)).unread).toBe(0);
  });
});

describe("audit log", () => {
  it("is browsable by regulators; others only per record", async () => {
    const member = await newMember("Audit Co");
    expect((await api("/audit", { cookie: member })).status).toBe(403);
    const passport = await createPassport(member);
    const own = await getJson<Page<AuditEntryDto>>(`/audit?entityType=passport&entityId=${passport.id}`, member);
    expect(own.items[0]).toMatchObject({ action: "passport.create", user: { company: "Audit Co" } });
    const regulator = await login("regulator", "regulator1234");
    expect((await api("/audit?action=passport.create", { cookie: regulator })).status).toBe(200);
  });
});

describe("documents visibility", () => {
  it("hides passport documents from other organisations but shows listing photos to all", async () => {
    const passport = await createPassport(admin, {}, admin);
    await upload(`/passports/${passport.id}/documents`, admin);
    const outsider = await newMember("Curious Co");
    expect((await api(`/passports/${passport.id}/documents`, { cookie: outsider })).status).toBe(403);
    const listing = await (await postJson("/listings", { passportId: passport.id }, admin)).json<{ id: string }>();
    await upload(`/listings/${listing.id}/documents`, admin, { kind: "Material Photo" });
    expect((await api(`/listings/${listing.id}/documents`, { cookie: outsider })).status).toBe(200);
  });
});

describe("exports, filters and stats", () => {
  it("exports the filtered list as CSV", async () => {
    const res = await api("/passports/export.csv?category=Metal", { cookie: admin });
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM, for Excel
    const lines = new TextDecoder().decode(bytes).split("\r\n");
    expect(lines[0]).toContain('"Passport ID"');
    expect(lines.slice(1).every((line) => line.includes('"Metal"'))).toBe(true);
    for (const kind of ["transfers", "listings", "trades", "demands"]) {
      expect((await api(`/${kind}/export.csv`, { cookie: admin })).status, kind).toBe(200);
    }
  });

  it("filters listings by region, quantity, availability and hides delisted ones on request", async () => {
    const macau = await getJson<Page<{ location: string }>>("/listings?region=Macau&pageSize=100");
    expect(macau.items.every((l) => l.location.includes("Macau"))).toBe(true);
    const big = await getJson<Page<{ quantity: { value: number } }>>("/listings?minQty=200&pageSize=100");
    expect(big.items.every((l) => l.quantity.value >= 200)).toBe(true);
    const active = await getJson<Page<{ mintStatus: string }>>("/listings?active=true&pageSize=100");
    expect(active.items.every((l) => l.mintStatus !== "delisted")).toBe(true);
    const now = await getJson<Page<{ availableFrom: string | null }>>("/listings?availability=now&pageSize=100");
    const today = new Date().toISOString().slice(0, 10);
    expect(now.items.every((l) => l.availableFrom === null || l.availableFrom <= today)).toBe(true);
  });

  it("lists passport facets and the regulator's queue", async () => {
    const facets = await getJson<{ projects: string[]; origins: string[] }>("/passports/facets");
    expect(facets.projects).toContain("Kai Tak Redevelopment");
    expect(facets.origins).toEqual(["Hong Kong", "Macau"]);
    const queue = await getJson<Page<TransferDto>>("/transfers?queue=regulatory&pageSize=100");
    expect(queue.items.every((t) => t.stepsCompleted >= 2 && t.stepsCompleted <= 4 && t.status !== "Cancelled")).toBe(true);
  });

  it("serves overview, transfer and material stats", async () => {
    expect((await getJson<OverviewStats>("/stats/overview?days=90")).days).toBe(90);
    expect((await api("/stats/overview?days=7", { cookie: admin })).status).toBe(400);
    const transfers = await getJson<TransferStats>("/stats/transfers");
    expect(transfers.total).toBeGreaterThan(0);
    expect(transfers.featured?.events.length).toBeGreaterThan(0);
    const materials = await getJson<MaterialStats>("/stats/materials");
    expect(materials.items[0]).toMatchObject({ category: expect.any(String), passports: expect.any(Number), tonnes: expect.any(Number) });
  });
});
