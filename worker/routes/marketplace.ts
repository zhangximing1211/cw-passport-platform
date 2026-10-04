import { and, asc, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  LISTING_CATEGORIES, REGIONS, TRADE_STATUSES,
  type CompanyDto, type DemandDto, type MarketplaceSummary, type Page, type Region, type TradeDto, type TradeStatus,
} from "../../shared/api";
import { companies, demands, listings, passports, trades, type DemandRow, type TradeRow, type UserRow } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { runBatch } from "../lib/batch";
import { csvResponse, EXPORT_LIMIT } from "../lib/csv";
import { apiError } from "../lib/errors";
import { nextDemandId, nextTradeId } from "../lib/ids";
import { notifyInsert } from "../lib/notify";
import { canManage, isAdmin, sameCompany, viewerOf } from "../lib/permissions";
import { containsAny, pagination, withQuantity } from "../lib/query";
import { isoDate, nowIso, todayIso } from "../lib/time";
import { validate } from "../lib/validate";
import type { AuthEnv } from "../middleware/auth";
import { getChainService } from "../services/chain";
import { committedByListing, completePassportWrites, FINISHED_TRADE_STATUSES, LIVE_TRADE_STATUSES, tradedQuantity } from "../services/lifecycle";
import { buildMatches } from "../services/matching";

const REGION_NAMES = Object.keys(REGIONS) as [Region, ...Region[]];
const upperId = z.string().trim().min(1).max(40).transform((id) => id.toUpperCase());
const idParam = z.object({ id: upperId });
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

// ── Matching ────────────────────────────────────────────────────────────────

/** Matches between live listings (not delisted) and all demands, best first. */
async function computeMatches(db: DrizzleD1Database) {
  const [listingRows, demandRows, companyRows] = await Promise.all([
    db.select({
      id: listings.id, material: listings.material, seller: listings.seller, nftTokenId: listings.nftTokenId,
      category: listings.category, location: listings.location, quantityValue: listings.quantityValue, quantityUnit: listings.quantityUnit,
    }).from(listings).where(ne(listings.mintStatus, "delisted")),
    db.select({
      id: demands.id, company: demands.company, industry: demands.industry, region: demands.region,
      category: demands.category, quantityValue: demands.quantityValue, quantityUnit: demands.quantityUnit,
    }).from(demands),
    db.select({ name: companies.name, needs: companies.needs, rating: companies.rating }).from(companies),
  ]);
  const committed = await committedByListing(db, listingRows.map((l) => l.id));
  const available = new Map(listingRows.map((l) => [l.id, Math.max(0, l.quantityValue - (committed.get(l.id) ?? 0))]));
  const wanted = new Map(demandRows.map((d) => [d.id, d.quantityValue]));
  return buildMatches(listingRows, demandRows, companyRows).map((match) => ({
    ...match,
    suggestedQuantity: Math.min(available.get(match.listing.id) ?? 0, wanted.get(match.demand.id) ?? 0),
  }));
}

function topCounts(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, count: n }));
}

export const matchRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", z.object({ limit: z.coerce.number().int().min(1).max(200).default(20), demandId: upperId.optional(), listingId: upperId.optional() })), async (c) => {
    const { limit, demandId, listingId } = c.req.valid("query");
    const all = (await computeMatches(drizzle(c.env.DB)))
      .filter((m) => (!demandId || m.demand.id === demandId) && (!listingId || m.listing.id === listingId));
    return c.json({ items: all.slice(0, limit), total: all.length });
  });

export const marketplaceRoutes = new Hono<AuthEnv>()
  .get("/summary", async (c) => {
    const db = drizzle(c.env.DB);
    const [matches, listingRows, demandRows, tradeRows] = await Promise.all([
      computeMatches(db),
      db.select({ mintStatus: listings.mintStatus }).from(listings),
      db.select({ category: demands.category, region: demands.region }).from(demands),
      db.select({ status: trades.status }).from(trades).where(ne(trades.status, "Cancelled")),
    ]);
    const body: MarketplaceSummary = {
      minted: listingRows.filter((l) => l.mintStatus !== "draft").length,
      listings: listingRows.length,
      matches: matches.length,
      avgScore: matches.length ? Math.round(matches.reduce((sum, m) => sum + m.score, 0) / matches.length) : 0,
      demands: demandRows.length,
      settled: tradeRows.filter((t) => t.status !== "In Progress").length,
      trades: tradeRows.length,
      topCategories: topCounts(demandRows.map((d) => d.category)),
      topRegions: topCounts(demandRows.map((d) => d.region)),
    };
    return c.json(body);
  });

// ── Companies (buyer knowledge base) ────────────────────────────────────────

const companyBody = z.object({
  industry: text(2, 120),
  region: z.enum(REGION_NAMES),
  needs: text(2, 300),
  capacity: text(1, 60),
  history: text(1, 200),
  /** Administrators only. */
  rating: z.number().min(0).max(5).optional(),
});

export const companyRoutes = new Hono<AuthEnv>()
  .get("/", async (c) => {
    const rows = await drizzle(c.env.DB).select().from(companies).orderBy(asc(companies.name));
    return c.json({ items: rows satisfies CompanyDto[] });
  })
  .get("/:name", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const row = await drizzle(c.env.DB).select().from(companies).where(sql`lower(${companies.name}) = lower(${name})`).get();
    if (!row) return apiError(c, 404, "COMPANY_NOT_FOUND", `No profile for ${name}`);
    return c.json({ ...row, viewer: viewerOf(c.get("user"), { createdBy: null, companies: [row.name] }) });
  })
  /** Creates or updates a company profile. Members may edit their own company's; admins any. */
  .put("/:name", validate("json", companyBody), async (c) => {
    const name = decodeURIComponent(c.req.param("name")).trim();
    const body = c.req.valid("json");
    const user = c.get("user");
    if (!name || name.length > 120) return apiError(c, 400, "VALIDATION_ERROR", "Invalid company name");
    if (!canManage(user, { createdBy: null, companies: [name] })) return apiError(c, 403, "FORBIDDEN", "You can only edit your own company's profile");
    if (body.rating !== undefined && !isAdmin(user)) return apiError(c, 403, "FORBIDDEN", "Only administrators can set a buyer rating");
    const db = drizzle(c.env.DB);
    const existing = await db.select().from(companies).where(sql`lower(${companies.name}) = lower(${name})`).get();
    const values = { industry: body.industry, region: body.region, regionCode: REGIONS[body.region], needs: body.needs, capacity: body.capacity, history: body.history };
    const [[row]] = existing
      ? await db.batch([
        db.update(companies).set({ ...values, ...(body.rating !== undefined ? { rating: body.rating } : {}) }).where(eq(companies.name, existing.name)).returning(),
        auditInsert(db, { userId: user.id, action: "company.update", entityType: "company", entityId: existing.name, details: body }),
      ])
      : await db.batch([
        db.insert(companies).values({ name, ...values, rating: body.rating ?? 4 }).returning(),
        auditInsert(db, { userId: user.id, action: "company.create", entityType: "company", entityId: name, details: body }),
      ]);
    return c.json(row satisfies CompanyDto, existing ? 200 : 201);
  });

// ── Demands ─────────────────────────────────────────────────────────────────

const demandFilters = {
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  region: z.string().trim().max(50).optional(),
  /** true: only my company's demands. */
  mine: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
};
const demandQuery = z.object({ ...demandFilters, ...pagination });

const demandBody = z.object({
  industry: text(2, 120),
  region: z.enum(REGION_NAMES),
  category: z.enum(LISTING_CATEGORIES),
  quantity: z.object({ value: z.number().positive().max(1_000_000), unit: z.literal("t").default("t") }),
  deadline: isoDate.refine((date) => date >= todayIso(), "Deadline cannot be in the past"),
  contact: z.email().max(254),
  company: text(1, 120).optional(),
});
const demandPatch = demandBody.omit({ company: true }).partial().refine((body) => Object.keys(body).length > 0, "Nothing to update");

const toDemandDto = ({ createdAt: _created, createdBy, ...row }: DemandRow, user: UserRow): DemandDto =>
  ({ ...withQuantity(row), viewer: viewerOf(user, { createdBy, companies: [row.company] }) });

function demandWhere(query: z.infer<z.ZodObject<typeof demandFilters>>, user: UserRow): SQL | undefined {
  return and(
    query.category ? eq(demands.category, query.category) : undefined,
    query.region ? eq(demands.region, query.region) : undefined,
    query.mine ? sql`lower(${demands.company}) = lower(${user.company})` : undefined,
    query.q ? containsAny([demands.id, demands.company, demands.industry, demands.region, demands.category], query.q) : undefined,
  );
}

export const demandRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", demandQuery), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const where = demandWhere(query, user);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(demands).where(where).orderBy(desc(demands.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(demands).where(where),
    ]);
    const body: Page<DemandDto> = { items: rows.map((row) => toDemandDto(row, user)), total, page: query.page, pageSize: query.pageSize };
    return c.json(body);
  })
  .get("/export.csv", validate("query", z.object(demandFilters)), async (c) => {
    const rows = await drizzle(c.env.DB).select().from(demands).where(demandWhere(c.req.valid("query"), c.get("user"))).orderBy(desc(demands.id)).limit(EXPORT_LIMIT);
    return csvResponse(c, "cw-demands.csv", ["Demand ID", "Company", "Industry", "Region", "Category", "Quantity", "Unit", "Deadline", "Contact"],
      rows.map((d) => [d.id, d.company, d.industry, d.region, d.category, d.quantityValue, d.quantityUnit, d.deadline, d.contact]));
  })
  .post("/", validate("json", demandBody), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    if (body.company && !isAdmin(user) && !sameCompany(body.company, user.company)) {
      return apiError(c, 403, "FORBIDDEN", "Only administrators can post demands for another company");
    }
    const company = body.company ?? user.company;
    const db = drizzle(c.env.DB);
    const profile = await db.select({ name: companies.name }).from(companies).where(sql`lower(${companies.name}) = lower(${company})`).get();
    const id = await nextDemandId(c.env.DB);
    const companyName = profile?.name ?? company;
    await runBatch(db, [
      // First demand from a company creates a basic profile the matching engine can use; it can be completed later.
      ...(profile ? [] : [db.insert(companies).values({
        name: companyName, industry: body.industry, region: body.region, regionCode: REGIONS[body.region],
        needs: `${body.category} materials for ${body.industry.toLowerCase()}`, capacity: "Not stated", history: "New to the platform", rating: 4,
      })]),
      db.insert(demands).values({
        id, company: companyName, industry: body.industry, region: body.region, category: body.category,
        quantityValue: body.quantity.value, quantityUnit: body.quantity.unit, deadline: body.deadline, contact: body.contact, createdBy: user.id,
      }),
      auditInsert(db, { userId: user.id, action: "demand.create", entityType: "demand", entityId: id, details: body }),
    ]);
    const row = (await db.select().from(demands).where(eq(demands.id, id)).get())!;
    return c.json(toDemandDto(row, user), 201);
  })
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const row = await drizzle(c.env.DB).select().from(demands).where(eq(demands.id, id)).get();
    if (!row) return apiError(c, 404, "DEMAND_NOT_FOUND", `Demand ${id} does not exist`);
    return c.json(toDemandDto(row, c.get("user")));
  })
  .patch("/:id", validate("param", idParam), validate("json", demandPatch), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const row = await db.select().from(demands).where(eq(demands.id, id)).get();
    if (!row) return apiError(c, 404, "DEMAND_NOT_FOUND", `Demand ${id} does not exist`);
    if (!canManage(user, { createdBy: row.createdBy, companies: [row.company] })) return apiError(c, 403, "FORBIDDEN", "Only the buyer's company or an administrator can edit this demand");
    const { quantity, ...fields } = body;
    const changes = { ...fields, ...(quantity ? { quantityValue: quantity.value, quantityUnit: quantity.unit } : {}) };
    const [[updated]] = await db.batch([
      db.update(demands).set(changes).where(eq(demands.id, id)).returning(),
      auditInsert(db, { userId: user.id, action: "demand.update", entityType: "demand", entityId: id, details: body }),
    ]);
    return c.json(toDemandDto(updated, user));
  })
  .delete("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [row, trade] = await Promise.all([
      db.select().from(demands).where(eq(demands.id, id)).get(),
      db.select({ id: trades.id }).from(trades).where(eq(trades.demandId, id)).get(),
    ]);
    if (!row) return apiError(c, 404, "DEMAND_NOT_FOUND", `Demand ${id} does not exist`);
    if (!canManage(user, { createdBy: row.createdBy, companies: [row.company] })) return apiError(c, 403, "FORBIDDEN", "Only the buyer's company or an administrator can delete this demand");
    if (trade) return apiError(c, 409, "DEMAND_IN_USE", `Demand ${id} already has trades and is kept for the record`);
    await db.batch([
      db.delete(demands).where(eq(demands.id, id)),
      auditInsert(db, { userId: user.id, action: "demand.delete", entityType: "demand", entityId: id, details: toDemandDto(row, user) }),
    ]);
    return c.body(null, 204);
  });

// ── Trades ──────────────────────────────────────────────────────────────────

const tradeFilters = {
  status: z.enum(TRADE_STATUSES).optional(),
  listingId: upperId.optional(),
  /** true: trades where my company is buyer or seller. */
  mine: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
};
const tradeQuery = z.object({ ...tradeFilters, ...pagination });

const createTradeBody = z.object({
  listingId: upperId,
  demandId: upperId,
  quantityValue: z.number().positive(),
  priceHkd: z.number().int().positive().max(1_000_000_000),
});
const cancelBody = z.object({ reason: z.string().trim().min(1).max(200).optional() });

type TradeJoin = { trade: TradeRow; nftTokenId: string; listingCreatedBy: string | null };

function tradeViewer(user: UserRow, { trade, listingCreatedBy }: TradeJoin): TradeDto["viewer"] {
  return {
    isSeller: canManage(user, { createdBy: listingCreatedBy, companies: [trade.seller] }),
    isBuyer: canManage(user, { createdBy: trade.createdBy, companies: [trade.buyer] }),
  };
}

const toTradeDto = (join: TradeJoin, user: UserRow): TradeDto => {
  const { createdAt: _created, createdBy: _by, ...trade } = join.trade;
  return { ...withQuantity(trade), nftTokenId: join.nftTokenId, viewer: tradeViewer(user, join) };
};

const tradeSelect = (db: DrizzleD1Database) =>
  db.select({ trade: trades, nftTokenId: listings.nftTokenId, listingCreatedBy: listings.createdBy }).from(trades).innerJoin(listings, eq(listings.id, trades.listingId));

function tradeWhere(query: z.infer<z.ZodObject<typeof tradeFilters>>, user: UserRow): SQL | undefined {
  return and(
    query.status ? eq(trades.status, query.status) : undefined,
    query.listingId ? eq(trades.listingId, query.listingId) : undefined,
    query.mine ? sql`(lower(${trades.buyer}) = lower(${user.company}) OR lower(${trades.seller}) = lower(${user.company}))` : undefined,
  );
}

async function loadTrade(db: DrizzleD1Database, id: string) {
  return tradeSelect(db).where(eq(trades.id, id)).get();
}

/**
 * In Progress → Completed (seller confirms delivery; the NFT moves to the buyer on-chain)
 * Completed → Settled (seller confirms payment received).
 * Completing the trade that sells the last of a listing delists it and completes its passport.
 */
async function advanceTrade(c: Context<AuthEnv>, id: string, to: "Completed" | "Settled") {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const found = await loadTrade(db, id);
  if (!found) return apiError(c, 404, "TRADE_NOT_FOUND", `Trade ${id} does not exist`);
  const { trade, nftTokenId } = found;
  if (!tradeViewer(user, found).isSeller) return apiError(c, 403, "FORBIDDEN", "Only the seller or an administrator can update this trade");
  const from: TradeStatus = to === "Completed" ? "In Progress" : "Completed";
  if (trade.status !== from) return apiError(c, 409, "INVALID_TRADE_STATUS", `A trade that is ${trade.status} cannot become ${to}`);

  const txHash = to === "Completed" ? await getChainService(c.env).transferForTrade({ id, nftTokenId, buyer: trade.buyer }) : trade.txHash;
  const updated = await db.update(trades).set({ status: to, txHash })
    .where(and(eq(trades.id, id), eq(trades.status, from))).returning().get();
  if (!updated) return apiError(c, 409, "INVALID_TRADE_STATUS", "The trade changed while this request was running; reload and try again");

  const followUps: BatchItem<"sqlite">[] = [
    auditInsert(db, { userId: user.id, action: `trade.${to === "Completed" ? "complete" : "settle"}`, entityType: "trade", entityId: id, details: { txHash } }),
    notifyInsert(db, { company: trade.buyer }, to === "Completed" ? "trade.completed" : "trade.settled", { tradeId: id, seller: trade.seller }, { kind: "listing", id: trade.listingId }),
  ];
  if (to === "Completed") {
    // Business rule: selling the last of a listing takes it off the market and completes its passport.
    const listing = (await db.select().from(listings).where(eq(listings.id, trade.listingId)).get())!;
    const sold = await tradedQuantity(db, listing.id, FINISHED_TRADE_STATUSES);
    if (sold >= listing.quantityValue) {
      const passport = await db.select().from(passports).where(eq(passports.id, listing.passportId)).get();
      const demand = await db.select({ region: demands.region }).from(demands).where(eq(demands.id, trade.demandId)).get();
      followUps.push(
        db.update(listings).set({ mintStatus: "delisted" }).where(eq(listings.id, listing.id)),
        notifyInsert(db, { company: listing.seller }, "listing.sold_out", { listingId: listing.id, nftTokenId: listing.nftTokenId }, { kind: "listing", id: listing.id }),
        ...(passport ? completePassportWrites(db, passport, { occurredAt: nowIso(), place: demand?.region ?? trade.buyer, actor: trade.buyer }) : []),
      );
    }
  }
  await runBatch(db, followUps);
  return c.json(toTradeDto({ ...found, trade: updated }, user));
}

export const tradeRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", tradeQuery), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const where = tradeWhere(query, user);
    const [rows, [{ total }]] = await Promise.all([
      tradeSelect(db).where(where).orderBy(desc(trades.tradedOn), desc(trades.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(trades).where(where),
    ]);
    const body: Page<TradeDto> = { items: rows.map((row) => toTradeDto(row, user)), total, page: query.page, pageSize: query.pageSize };
    return c.json(body);
  })
  .get("/export.csv", validate("query", z.object(tradeFilters)), async (c) => {
    const rows = await tradeSelect(drizzle(c.env.DB)).where(tradeWhere(c.req.valid("query"), c.get("user"))).orderBy(desc(trades.tradedOn), desc(trades.id)).limit(EXPORT_LIMIT);
    return csvResponse(c, "cw-trades.csv", ["Trade ID", "Listing ID", "NFT Token", "Demand ID", "Buyer", "Seller", "Quantity", "Unit", "Price (HKD)", "Status", "Tx Hash", "Date"],
      rows.map(({ trade: t, nftTokenId }) => [t.id, t.listingId, nftTokenId, t.demandId, t.buyer, t.seller, t.quantityValue, t.quantityUnit, t.priceHkd, t.status, t.txHash, t.tradedOn]));
  })
  .post("/", validate("json", createTradeBody), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [listing, demand, committed] = await Promise.all([
      db.select().from(listings).where(eq(listings.id, body.listingId)).get(),
      db.select().from(demands).where(eq(demands.id, body.demandId)).get(),
      tradedQuantity(db, body.listingId, LIVE_TRADE_STATUSES),
    ]);
    if (!listing) return apiError(c, 404, "LISTING_NOT_FOUND", `Listing ${body.listingId} does not exist`);
    if (!demand) return apiError(c, 404, "DEMAND_NOT_FOUND", `Demand ${body.demandId} does not exist`);
    // The buyer side opens the trade: someone from the demand's company, or an administrator.
    if (!canManage(user, { createdBy: demand.createdBy, companies: [demand.company] })) {
      return apiError(c, 403, "FORBIDDEN", `Only ${demand.company} or an administrator can open a trade for this demand`);
    }
    if (listing.mintStatus !== "listed") return apiError(c, 409, "LISTING_NOT_LISTED", "Only listings published on the platform can be traded");
    const passport = await db.select({ stage: passports.stage }).from(passports).where(eq(passports.id, listing.passportId)).get();
    if (passport?.stage === "Completed") return apiError(c, 409, "PASSPORT_COMPLETED", "This material has already been reused and cannot be sold");
    const available = listing.quantityValue - committed;
    if (body.quantityValue > available) {
      return apiError(c, 422, "QUANTITY_EXCEEDS_AVAILABLE", `Only ${available} ${listing.quantityUnit} of this listing is still available`, { available });
    }
    if (body.quantityValue > demand.quantityValue) {
      return apiError(c, 422, "QUANTITY_EXCEEDS_DEMAND", `The demand is for ${demand.quantityValue} ${demand.quantityUnit}`);
    }

    const id = await nextTradeId(c.env.DB);
    await db.batch([
      db.insert(trades).values({
        id, listingId: listing.id, demandId: demand.id, buyer: demand.company, seller: listing.seller,
        quantityValue: body.quantityValue, quantityUnit: listing.quantityUnit, priceHkd: body.priceHkd,
        status: "In Progress", txHash: null, tradedOn: todayIso(), createdBy: user.id,
      }),
      auditInsert(db, { userId: user.id, action: "trade.create", entityType: "trade", entityId: id, details: body }),
      notifyInsert(db, { company: listing.seller }, "trade.created", { tradeId: id, buyer: demand.company, listingId: listing.id }, { kind: "listing", id: listing.id }),
    ]);
    return c.json(toTradeDto((await loadTrade(db, id))!, user), 201);
  })
  .post("/:id/complete", validate("param", idParam), (c) => advanceTrade(c, c.req.valid("param").id, "Completed"))
  .post("/:id/settle", validate("param", idParam), (c) => advanceTrade(c, c.req.valid("param").id, "Settled"))
  .post("/:id/cancel", validate("param", idParam), validate("json", cancelBody), async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const found = await loadTrade(db, id);
    if (!found) return apiError(c, 404, "TRADE_NOT_FOUND", `Trade ${id} does not exist`);
    const viewer = tradeViewer(user, found);
    if (!viewer.isBuyer && !viewer.isSeller) return apiError(c, 403, "FORBIDDEN", "Only the buyer, the seller or an administrator can cancel this trade");
    if (found.trade.status !== "In Progress") return apiError(c, 409, "INVALID_TRADE_STATUS", `A trade that is ${found.trade.status} cannot be cancelled`);
    // Tell the other side (both, when an administrator cancels).
    const notifyCompanies = [
      ...(viewer.isBuyer && !isAdmin(user) ? [] : [found.trade.buyer]),
      ...(viewer.isSeller && !isAdmin(user) ? [] : [found.trade.seller]),
    ];
    const [[updated]] = await db.batch([
      db.update(trades).set({ status: "Cancelled" }).where(eq(trades.id, id)).returning(),
      auditInsert(db, { userId: user.id, action: "trade.cancel", entityType: "trade", entityId: id, details: { reason } }),
      ...notifyCompanies.map((company) => notifyInsert(db, { company }, "trade.cancelled", { tradeId: id, by: user.company }, { kind: "listing", id: found.trade.listingId })),
    ]);
    return c.json(toTradeDto({ ...found, trade: updated }, user));
  });
