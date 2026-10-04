import { and, count, desc, eq, gt, gte, isNull, like, lte, ne, or, type SQL } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { LISTING_CATEGORIES, LISTING_STATUSES, MINT_STATUSES, ORIGINS, type ListingDetailDto, type ListingDto, type MintStatus, type Page } from "../../shared/api";
import { listings, passports, transfers, type ListingRow, type UserRow } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { csvResponse, EXPORT_LIMIT } from "../lib/csv";
import { listDocuments, uploadDocument } from "../lib/documents";
import { apiError } from "../lib/errors";
import { nextListingIds } from "../lib/ids";
import { canManage, viewerOf } from "../lib/permissions";
import { containsAny, pagination, withQuantity } from "../lib/query";
import { isoDate, todayIso } from "../lib/time";
import { validate } from "../lib/validate";
import type { AuthEnv } from "../middleware/auth";
import { getChainService } from "../services/chain";
import { committedByListing } from "../services/lifecycle";

const flag = z.enum(["true", "false"]).transform((value) => value === "true");

const filters = {
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  status: z.enum(LISTING_STATUSES).optional(),
  mintStatus: z.enum(MINT_STATUSES).optional(),
  passportId: z.string().trim().max(40).optional(),
  /** Hong Kong / Macau: matched against the listing's location. */
  region: z.enum(ORIGINS).optional(),
  minQty: z.coerce.number().nonnegative().optional(),
  maxQty: z.coerce.number().positive().optional(),
  /** now: available today or earlier; upcoming: from a future date. */
  availability: z.enum(["now", "upcoming"]).optional(),
  /** true: hide delisted listings (what buyers browse). */
  active: flag.optional(),
};
const listQuery = z.object({ ...filters, ...pagination });
const exportQuery = z.object(filters);

const idParam = z.object({ id: z.string().trim().min(1).max(40).transform((id) => id.toUpperCase()) });

type ListingCategory = (typeof LISTING_CATEGORIES)[number];

const createBody = z.object({
  passportId: z.string().trim().min(1).max(40).transform((id) => id.toUpperCase()),
  category: z.enum(LISTING_CATEGORIES).optional(),
  quantityValue: z.number().positive().optional(),
  location: z.string().trim().min(2).max(120).optional(),
  availableFrom: isoDate.nullable().optional(),
});

const delistBody = z.object({ reason: z.string().trim().min(1).max(200).optional() });

const SEARCHABLE = [listings.id, listings.passportId, listings.material, listings.category, listings.location, listings.seller, listings.nftTokenId];

/** Passport category → default marketplace category (steel sections can be re-categorised by the seller). */
const DEFAULT_CATEGORY: Record<string, ListingCategory> = { Concrete: "Concrete", Metal: "Metal", Timber: "Timber", Glass: "Glass", "Mixed Waste": "Mixed" };
/** Marketplace category → thumbnail tone (see .material-thumb in globals.css) and NFT token prefix. */
const CATEGORY_STYLE: Record<ListingCategory, { tone: string; nftCode: string }> = {
  Concrete: { tone: "concrete", nftCode: "CON" },
  Steel: { tone: "steel", nftCode: "STL" },
  Metal: { tone: "aluminium", nftCode: "ALU" },
  Timber: { tone: "timber", nftCode: "TMB" },
  Glass: { tone: "glass", nftCode: "GLS" },
  Mixed: { tone: "mixed", nftCode: "MXD" },
};

export const toListingDto = ({ createdAt: _created, createdBy: _by, ...row }: ListingRow, committed = 0): ListingDto =>
  ({ ...withQuantity(row), available: Math.max(0, row.quantityValue - committed) });

const notFound = (c: Parameters<typeof apiError>[0], id: string) => apiError(c, 404, "LISTING_NOT_FOUND", `Listing ${id} does not exist`);

function whereOf(query: z.infer<typeof exportQuery>): SQL | undefined {
  const today = todayIso();
  return and(
    query.category ? eq(listings.category, query.category) : undefined,
    query.status ? eq(listings.status, query.status) : undefined,
    query.mintStatus ? eq(listings.mintStatus, query.mintStatus) : undefined,
    query.passportId ? eq(listings.passportId, query.passportId.toUpperCase()) : undefined,
    query.region ? like(listings.location, `%${query.region}%`) : undefined,
    query.minQty !== undefined ? gte(listings.quantityValue, query.minQty) : undefined,
    query.maxQty !== undefined ? lte(listings.quantityValue, query.maxQty) : undefined,
    query.availability === "now" ? or(isNull(listings.availableFrom), lte(listings.availableFrom, today)) : undefined,
    query.availability === "upcoming" ? gt(listings.availableFrom, today) : undefined,
    query.active ? ne(listings.mintStatus, "delisted") : undefined,
    query.q ? containsAny(SEARCHABLE, query.q) : undefined,
  );
}

export async function listingDetail(db: DrizzleD1Database, user: UserRow, id: string): Promise<ListingDetailDto | null> {
  const row = await db.select().from(listings).where(eq(listings.id, id)).get();
  if (!row) return null;
  const committed = (await committedByListing(db, [id])).get(id) ?? 0;
  return { ...toListingDto(row, committed), viewer: viewerOf(user, { createdBy: row.createdBy, companies: [row.seller] }) };
}

/** draft → minted (on-chain) → listed (visible to buyers). */
function mintTransition(from: MintStatus, to: "minted" | "listed") {
  return (to === "minted" && from === "draft") || (to === "listed" && from === "minted");
}

export const listingRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", listQuery), async (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB);
    const where = whereOf(query);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(listings).where(where).orderBy(desc(listings.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(listings).where(where),
    ]);
    const committed = await committedByListing(db, rows.map((row) => row.id));
    const body: Page<ListingDto> = { items: rows.map((row) => toListingDto(row, committed.get(row.id))), total, page: query.page, pageSize: query.pageSize };
    return c.json(body);
  })
  .get("/export.csv", validate("query", exportQuery), async (c) => {
    const rows = await drizzle(c.env.DB).select().from(listings).where(whereOf(c.req.valid("query"))).orderBy(desc(listings.id)).limit(EXPORT_LIMIT);
    return csvResponse(c, "cw-listings.csv",
      ["Listing ID", "Passport ID", "Material", "Category", "Quantity", "Unit", "Location", "Available From", "Seller", "Verification", "NFT Token", "Mint Status", "Tx Hash"],
      rows.map((l) => [l.id, l.passportId, l.material, l.category, l.quantityValue, l.quantityUnit, l.location, l.availableFrom ?? "now", l.seller, l.status, l.nftTokenId, l.mintStatus, l.txHash]));
  })
  .post("/", validate("json", createBody), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [passport, existing, latestTransfer] = await Promise.all([
      db.select().from(passports).where(eq(passports.id, body.passportId)).get(),
      db.select({ id: listings.id }).from(listings).where(and(eq(listings.passportId, body.passportId), ne(listings.mintStatus, "delisted"))).get(),
      db.select({ id: transfers.id }).from(transfers).where(eq(transfers.passportId, body.passportId)).orderBy(desc(transfers.departureDate)).get(),
    ]);
    if (!passport) return apiError(c, 404, "PASSPORT_NOT_FOUND", `Passport ${body.passportId} does not exist`);
    if (!canManage(user, { createdBy: passport.createdBy })) return apiError(c, 403, "FORBIDDEN", "Only the passport's creator or an administrator can list its material");
    if (passport.stage === "Completed") return apiError(c, 409, "PASSPORT_COMPLETED", "This material has already been reused and cannot be sold");
    if (passport.status !== "Verified") return apiError(c, 409, "PASSPORT_NOT_VERIFIED", "Only verified passports can be listed on the marketplace");
    if (existing) return apiError(c, 409, "LISTING_ALREADY_EXISTS", `Passport ${passport.id} is already listed as ${existing.id}`);
    const quantityValue = body.quantityValue ?? passport.quantityValue;
    if (quantityValue > passport.quantityValue) {
      return apiError(c, 422, "QUANTITY_EXCEEDS_PASSPORT", `The passport only covers ${passport.quantityValue} ${passport.quantityUnit}`);
    }

    const category = body.category ?? DEFAULT_CATEGORY[passport.category] ?? "Mixed";
    const { tone, nftCode } = CATEGORY_STYLE[category];
    const { id, nftTokenId } = await nextListingIds(c.env.DB, passport.origin === "Macau" ? "Macau" : "Hong Kong", nftCode);
    await db.batch([
      db.insert(listings).values({
        id, passportId: passport.id, transferId: latestTransfer?.id ?? null, material: passport.material, category,
        quantityValue, quantityUnit: passport.quantityUnit, location: body.location ?? `${passport.location}, ${passport.origin}`,
        availableFrom: body.availableFrom ?? null, status: "Verified", seller: user.company, tone,
        nftTokenId, nftType: passport.material, mintStatus: "draft", txHash: null, createdBy: user.id,
      }),
      auditInsert(db, { userId: user.id, action: "listing.create", entityType: "listing", entityId: id, details: body }),
    ]);
    return c.json(await listingDetail(db, user, id), 201);
  })
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const detail = await listingDetail(drizzle(c.env.DB), c.get("user"), id);
    return detail ? c.json(detail) : notFound(c, id);
  })
  .post("/:id/mint", validate("param", idParam), (c) => changeMintStatus(c, c.req.valid("param").id, "minted"))
  .post("/:id/publish", validate("param", idParam), (c) => changeMintStatus(c, c.req.valid("param").id, "listed"))
  .post("/:id/delist", validate("param", idParam), validate("json", delistBody), async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const listing = await db.select().from(listings).where(eq(listings.id, id)).get();
    if (!listing) return notFound(c, id);
    if (!canManage(user, { createdBy: listing.createdBy, companies: [listing.seller] })) {
      return apiError(c, 403, "FORBIDDEN", "Only the seller or an administrator can withdraw this listing");
    }
    if (listing.mintStatus === "delisted") return apiError(c, 409, "INVALID_MINT_STATUS", "This listing is already off the market");
    // Trades already in progress may still complete; no new ones can start.
    await db.batch([
      db.update(listings).set({ mintStatus: "delisted" }).where(eq(listings.id, id)),
      auditInsert(db, { userId: user.id, action: "listing.delist", entityType: "listing", entityId: id, details: { reason } }),
    ]);
    return c.json(await listingDetail(db, user, id));
  })
  .get("/:id/documents", validate("param", idParam), (c) => listDocuments(c, "listing", c.req.valid("param").id))
  .post("/:id/documents", validate("param", idParam), (c) => uploadDocument(c, "listing", c.req.valid("param").id));

async function changeMintStatus(c: Context<AuthEnv>, id: string, to: "minted" | "listed") {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const listing = await db.select().from(listings).where(eq(listings.id, id)).get();
  if (!listing) return notFound(c, id);
  if (!canManage(user, { createdBy: listing.createdBy, companies: [listing.seller] })) {
    return apiError(c, 403, "FORBIDDEN", "Only the seller or an administrator can mint or publish this listing");
  }
  if (!mintTransition(listing.mintStatus, to)) {
    return apiError(c, 409, "INVALID_MINT_STATUS", `A ${listing.mintStatus} listing cannot become ${to}`);
  }
  const passport = await db.select({ stage: passports.stage }).from(passports).where(eq(passports.id, listing.passportId)).get();
  if (passport?.stage === "Completed") return apiError(c, 409, "PASSPORT_COMPLETED", "This material has already been reused and cannot be sold");

  const txHash = to === "minted" ? await getChainService(c.env).mintListing(listing) : listing.txHash;
  // The status condition turns a concurrent double-mint into a no-op instead of a second token.
  const updated = await db.update(listings).set({ mintStatus: to, txHash })
    .where(and(eq(listings.id, id), eq(listings.mintStatus, listing.mintStatus))).returning().get();
  if (!updated) return apiError(c, 409, "INVALID_MINT_STATUS", "The listing changed while this request was running; reload and try again");
  await auditInsert(db, { userId: user.id, action: `listing.${to === "minted" ? "mint" : "publish"}`, entityType: "listing", entityId: id, details: { txHash } });
  return c.json(await listingDetail(db, user, id));
}
