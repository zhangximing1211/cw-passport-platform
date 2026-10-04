import { beforeAll, describe, expect, it } from "vitest";
import type { DemandDto, ListingDto, MarketplaceSummary, MatchDto, OverviewStats, Page, TradeDto, TransferDto, TransferEventDto } from "../../shared/api";
import { api, login } from "./helpers";

let cookie: string;
beforeAll(async () => { cookie = await login(); });
const getJson = async <T>(path: string) => {
  const res = await api(path, { cookie });
  expect(res.status, path).toBe(200);
  return res.json<T>();
};

describe("transfers", () => {
  it("lists transfers most recent departure first and filters by status", async () => {
    const all = await getJson<Page<TransferDto>>("/transfers?pageSize=100");
    expect(all.total).toBeGreaterThan(20);
    const dates = all.items.map((t) => t.departureDate);
    expect(dates).toEqual([...dates].sort().reverse());
    const inTransit = await getJson<Page<TransferDto>>("/transfers?status=In%20Transit&pageSize=100");
    expect(inTransit.items.every((t) => t.status === "In Transit")).toBe(true);
  });

  it("returns a transfer with its timeline", async () => {
    const body = await getJson<TransferDto & { events: TransferEventDto[] }>("/transfers/CBT-HK-SZ-2026-0128");
    expect(body).toMatchObject({ passportId: "DPP-HK-2026-00428", destination: "Shenzhen", status: "In Transit", compliance: "Cleared" });
    expect(body.events.map((e) => e.step)).toEqual(["Created", "Documentation Submitted", "Inspection", "Customs / Compliance Review", "Cleared", "Transport"]);
  });

  it("returns 404 for an unknown transfer", async () => {
    expect((await api("/transfers/CBT-NOPE", { cookie })).status).toBe(404);
  });
});

describe("listings", () => {
  it("lists and filters listings", async () => {
    const steel = await getJson<Page<ListingDto>>("/listings?category=Steel&pageSize=100");
    expect(steel.items.length).toBeGreaterThan(0);
    expect(steel.items.every((l) => l.category === "Steel")).toBe(true);
    const drafts = await getJson<Page<ListingDto>>("/listings?mintStatus=draft&pageSize=100");
    expect(drafts.items.every((l) => l.mintStatus === "draft" && l.txHash === null)).toBe(true);
  });

  it("returns one listing", async () => {
    expect(await getJson<ListingDto>("/listings/LST-HK-2026-0186")).toMatchObject({
      nftTokenId: "NFT-CON-0186", mintStatus: "listed", availableFrom: "2026-09-20", quantity: { value: 320, unit: "t" },
    });
  });
});

describe("marketplace", () => {
  it("lists buyer demands", async () => {
    const body = await getJson<Page<DemandDto>>("/demands");
    expect(body.total).toBe(14);
    expect(body.items.find((d) => d.id === "DMD-2026-0071")).toMatchObject({ company: "Guangdong Road Base Co.", contact: "procurement@gdroadbase.cn" });
  });

  it("returns matches best score first, all above the threshold", async () => {
    const { items, total } = await getJson<{ items: MatchDto[]; total: number }>("/matches?limit=50");
    expect(total).toBeGreaterThan(items.length - 1);
    expect(items.every((m) => m.score >= 55 && m.score <= 100)).toBe(true);
    const scores = items.map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("lists trades with the listing's NFT token", async () => {
    const body = await getJson<Page<TradeDto>>("/trades?pageSize=100");
    expect(body.items.find((t) => t.id === "TRD-2026-0031")).toMatchObject({ nftTokenId: "NFT-CON-0186", priceHkd: 30000, status: "Completed", quantity: { value: 200, unit: "t" } });
  });

  it("summarises the marketplace consistently with the other endpoints", async () => {
    const summary = await getJson<MarketplaceSummary>("/marketplace/summary");
    const matches = await getJson<{ total: number }>("/matches");
    const trades = await getJson<Page<TradeDto>>("/trades?pageSize=100");
    expect(summary.matches).toBe(matches.total);
    expect(summary.trades).toBe(trades.total);
    expect(summary.demands).toBe(14);
    expect(summary.topCategories.reduce((sum, c) => sum + c.count, 0)).toBe(14);
  });
});

describe("GET /api/stats/overview", () => {
  it("aggregates passports, flow, distribution and alerts", async () => {
    const stats = await getJson<OverviewStats>("/stats/overview");
    const passports = await getJson<Page<unknown>>("/passports?pageSize=1");
    expect(stats.kpis.passports.value).toBe(passports.total);
    expect(stats.flow.map((f) => f.name)).toEqual(["Source", "Collection", "Processing", "Cross-border", "Buyer / Reuse"]);
    expect(stats.flow.reduce((sum, f) => sum + f.count, 0)).toBe(passports.total);
    expect(stats.distribution.reduce((sum, d) => sum + d.share, 0)).toBeCloseTo(100, 0);
    expect(stats.alerts.every((a) => a.count > 0)).toBe(true);
  });
});
