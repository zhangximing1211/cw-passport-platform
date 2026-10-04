import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, Page, PassportDto, PassportEventDto } from "../../shared/api";
import { api, login } from "./helpers";

let cookie: string;
beforeAll(async () => { cookie = await login(); });
const get = (path: string) => api(path, { cookie });

it("GET /api/health reports the database as reachable (no sign-in needed)", async () => {
  const res = await api("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
});

describe("GET /api/passports", () => {
  it("lists passports newest ID first with the default page size", async () => {
    const body = await (await get("/passports")).json<Page<PassportDto>>();
    expect(body.total).toBeGreaterThan(100);
    expect(body.items).toHaveLength(20);
    const ids = body.items.map((p) => p.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(body.items[0].quantity).toEqual({ value: expect.any(Number), unit: "t" });
  });

  it("filters by category and sorts ascending", async () => {
    const body = await (await get("/passports?category=Metal&sort=id_asc&pageSize=100")).json<Page<PassportDto>>();
    expect(body.items.length).toBeGreaterThan(2);
    expect(body.items.every((p) => p.category === "Metal")).toBe(true);
    const ids = body.items.map((p) => p.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("searches across text fields case-insensitively", async () => {
    const body = await (await get("/passports?q=dpp-hk-2026-00428")).json<Page<PassportDto>>();
    expect(body.items.map((p) => p.id)).toEqual(["DPP-HK-2026-00428"]);
  });

  it("treats LIKE wildcards in the search term literally", async () => {
    const body = await (await get("/passports?q=%25")).json<Page<PassportDto>>();
    expect(body.total).toBe(0);
  });

  it("paginates without overlap", async () => {
    const first = await (await get("/passports?pageSize=10&page=1")).json<Page<PassportDto>>();
    const second = await (await get("/passports?pageSize=10&page=2")).json<Page<PassportDto>>();
    expect(second).toMatchObject({ page: 2, pageSize: 10, total: first.total });
    expect(second.items.some((p) => first.items.some((q) => q.id === p.id))).toBe(false);
  });

  it("rejects invalid query parameters", async () => {
    const res = await get("/passports?pageSize=500");
    expect(res.status).toBe(400);
    expect((await res.json<ApiErrorBody>()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/passports/:id", () => {
  it("returns one of the original demo passports unchanged", async () => {
    const res = await get("/passports/dpp-hk-2026-00428");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "DPP-HK-2026-00428", material: "Recycled Concrete Aggregate", quantity: { value: 320, unit: "t" },
      stage: "Processing", status: "Verified", updatedAt: "2026-09-16T02:42:00.000Z",
    });
  });

  it("returns the lifecycle timeline in chronological order", async () => {
    const { items } = await (await get("/passports/DPP-HK-2026-00428/events")).json<{ items: PassportEventDto[] }>();
    expect(items.map((e) => e.stage)).toEqual(["Generated", "Collected", "Sorted", "Processing"]);
    expect(items[0]).toMatchObject({ place: "Kai Tak", actor: "Gammon Construction" });
  });

  it("returns 404 for an unknown passport", async () => {
    for (const path of ["/passports/DPP-XX-0000-00000", "/passports/DPP-XX-0000-00000/events"]) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect((await res.json<ApiErrorBody>()).error.code).toBe("PASSPORT_NOT_FOUND");
    }
  });
});

it("returns a JSON 404 for unknown API routes", async () => {
  const res = await get("/nope");
  expect(res.status).toBe(404);
  expect((await res.json<ApiErrorBody>()).error.code).toBe("NOT_FOUND");
});
