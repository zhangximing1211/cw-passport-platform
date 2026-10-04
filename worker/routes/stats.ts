import { desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import type { Kpi, MaterialStats, OverviewStats, PassportStage, TransferStats } from "../../shared/api";
import { passports, transfers } from "../db/schema";
import { validate } from "../lib/validate";
import type { AuthEnv } from "../middleware/auth";
import { transferDetail } from "./transfers";

const DAY_MS = 86_400_000;

/** % growth of new records in the last window vs the window before; null when there is no baseline. */
function kpi(value: number, current: number, previous: number): Kpi {
  return { value, trend: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

const FLOW = [
  { name: "Source", stages: ["Generated"] },
  { name: "Collection", stages: ["Collected", "Sorted"] },
  { name: "Processing", stages: ["Processing"] },
  { name: "Cross-border", stages: ["Cross-border"] },
  { name: "Buyer / Reuse", stages: ["Completed"] },
];

const overviewQuery = z.object({ days: z.coerce.number().int().refine((d) => [30, 90, 365].includes(d), "days must be 30, 90 or 365").default(30) });

export const statsRoutes = new Hono<AuthEnv>()
  .get("/overview", validate("query", overviewQuery), async (c) => {
    const { days } = c.req.valid("query");
    const now = Date.now();
    const start = new Date(now - days * DAY_MS).toISOString();
    const previousStart = new Date(now - 2 * days * DAY_MS).toISOString();
    const db = c.env.DB;

    // Windowed counts: [total, created in this window, created in the window before]
    const windowed = (table: string, dateColumn: string, where = "1=1") => db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(${dateColumn} >= ?1) AS current,
              SUM(${dateColumn} >= ?2 AND ${dateColumn} < ?1) AS previous,
              COALESCE(SUM(quantity_value), 0) AS tonnes,
              COALESCE(SUM(CASE WHEN ${dateColumn} >= ?1 THEN quantity_value END), 0) AS tonnesCurrent,
              COALESCE(SUM(CASE WHEN ${dateColumn} >= ?2 AND ${dateColumn} < ?1 THEN quantity_value END), 0) AS tonnesPrevious
         FROM ${table} WHERE ${where}`,
    ).bind(start, previousStart);

    type Windowed = { total: number; current: number | null; previous: number | null; tonnes: number; tonnesCurrent: number; tonnesPrevious: number };
    const [passportsW, activeW, transfersW, listingsCount, byStage, byCategory, alertCounts] = await db.batch([
      windowed("passports", "created_at"),
      windowed("passports", "created_at", "stage <> 'Completed'"),
      windowed("transfers", "departure_date", "status <> 'Cancelled'"),
      db.prepare("SELECT COUNT(*) AS total FROM listings WHERE mint_status = 'listed'"),
      db.prepare("SELECT stage, COUNT(*) AS count, SUM(quantity_value) AS tonnes FROM passports GROUP BY stage"),
      db.prepare("SELECT category, SUM(quantity_value) AS tonnes FROM passports GROUP BY category ORDER BY tonnes DESC"),
      db.prepare(`SELECT
          (SELECT COUNT(*) FROM passports WHERE status = 'Pending') AS passportsPending,
          (SELECT COUNT(*) FROM transfers WHERE compliance = 'Pending Review' AND status <> 'Cancelled') AS transfersPendingReview,
          (SELECT COUNT(*) FROM listings WHERE status = 'Pending' AND mint_status <> 'delisted') AS listingsPending,
          (SELECT COUNT(*) FROM listings WHERE mint_status = 'draft') AS listingsUnminted`),
    ]);

    const p = passportsW.results[0] as Windowed;
    const a = activeW.results[0] as Windowed;
    const t = transfersW.results[0] as Windowed;
    const stages = byStage.results as { stage: string; count: number; tonnes: number }[];
    const categories = byCategory.results as { category: string; tonnes: number }[];
    const alerts = alertCounts.results[0] as Record<"passportsPending" | "transfersPendingReview" | "listingsPending" | "listingsUnminted", number>;

    const body: OverviewStats = {
      days,
      kpis: {
        passports: kpi(p.total, p.current ?? 0, p.previous ?? 0),
        activeBatches: kpi(a.total, a.current ?? 0, a.previous ?? 0),
        transfers: kpi(t.total, t.current ?? 0, t.previous ?? 0),
        listings: { value: (listingsCount.results[0] as { total: number }).total, trend: null },
        volumeTonnes: kpi(p.tonnes, p.tonnesCurrent, p.tonnesPrevious),
      },
      flow: FLOW.map(({ name, stages: members }) => {
        const rows = stages.filter((s) => members.includes(s.stage));
        return { name, count: rows.reduce((sum, r) => sum + r.count, 0), tonnes: rows.reduce((sum, r) => sum + r.tonnes, 0) };
      }),
      distribution: categories.map(({ category, tonnes }) => ({ category, tonnes, share: p.tonnes ? Math.round((tonnes / p.tonnes) * 1000) / 10 : 0 })),
      alerts: [
        { code: "TRANSFERS_PENDING_REVIEW" as const, priority: "High" as const, count: alerts.transfersPendingReview },
        { code: "PASSPORTS_PENDING" as const, priority: "Medium" as const, count: alerts.passportsPending },
        { code: "LISTINGS_PENDING" as const, priority: "Low" as const, count: alerts.listingsPending },
        { code: "LISTINGS_UNMINTED" as const, priority: "Low" as const, count: alerts.listingsUnminted },
      ].filter((alert) => alert.count > 0),
    };
    return c.json(body);
  })
  .get("/transfers", async (c) => {
    const d1 = c.env.DB;
    const row = await d1.prepare(`SELECT
        COUNT(*) AS total,
        COALESCE(SUM(quantity_value), 0) AS volumeTonnes,
        SUM(status = 'Preparing' OR compliance = 'Pending Review') AS pending,
        SUM(status = 'In Transit') AS inTransit,
        SUM(status = 'Completed') AS completed
      FROM transfers WHERE status <> 'Cancelled'`).first<Omit<TransferStats, "featured">>();
    const db = drizzle(d1);
    const featuredRow = await db.select({ id: transfers.id }).from(transfers)
      .orderBy(sql`${transfers.status} = 'In Transit' DESC`, desc(transfers.departureDate)).get();
    const body: TransferStats = {
      total: row?.total ?? 0,
      volumeTonnes: row?.volumeTonnes ?? 0,
      pending: row?.pending ?? 0,
      inTransit: row?.inTransit ?? 0,
      completed: row?.completed ?? 0,
      featured: featuredRow ? await transferDetail(db, c.get("user"), featuredRow.id) : null,
    };
    return c.json(body);
  })
  .get("/materials", async (c) => {
    const rows = await drizzle(c.env.DB).select({
      category: passports.category, material: passports.material, stage: passports.stage,
      passports: sql<number>`COUNT(*)`, tonnes: sql<number>`SUM(${passports.quantityValue})`,
    }).from(passports).groupBy(passports.category, passports.material, passports.stage);
    const byMaterial = new Map<string, MaterialStats["items"][number]>();
    for (const row of rows) {
      const key = `${row.category}|${row.material}`;
      const item = byMaterial.get(key) ?? { category: row.category, material: row.material, passports: 0, tonnes: 0, byStage: {} };
      item.passports += row.passports;
      item.tonnes += row.tonnes;
      item.byStage[row.stage as PassportStage] = row.passports;
      byMaterial.set(key, item);
    }
    const body: MaterialStats = { items: [...byMaterial.values()].sort((a, b) => b.tonnes - a.tonnes) };
    return c.json(body);
  });
