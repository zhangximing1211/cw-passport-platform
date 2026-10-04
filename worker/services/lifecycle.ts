// Business rules that tie passports, listings and trades together.
//
//   • A passport whose material has been reused (stage Completed) can no longer be sold:
//     completing it delists every live listing of it.
//   • A transfer that is received completes its passport.
//   • A trade that sells the last of a listing delists it and completes its passport.
//     (Partially sold listings stay on the market.)

import { and, eq, inArray, ne, sum } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { listings, passportEvents, passports, trades, type PassportRow } from "../db/schema";

/** Trades that count against a listing's quantity (everything except cancelled ones). */
export const LIVE_TRADE_STATUSES = ["In Progress", "Completed", "Settled"] as const;
/** Trades whose goods have actually changed hands. */
export const FINISHED_TRADE_STATUSES = ["Completed", "Settled"] as const;

/**
 * Statements (for one db.batch) that mark a passport as completed: a Completed lifecycle
 * event, stage + status Completed, and every listing of it that is still live delisted.
 */
export function completePassportWrites(db: DrizzleD1Database, passport: PassportRow, event: { occurredAt: string; place: string; actor: string }) {
  return [
    ...(passport.stage === "Completed" ? [] : [db.insert(passportEvents).values({ passportId: passport.id, stage: "Completed", ...event })]),
    db.update(passports).set({ stage: "Completed", status: "Completed", updatedAt: event.occurredAt }).where(eq(passports.id, passport.id)),
    db.update(listings).set({ mintStatus: "delisted" }).where(and(eq(listings.passportId, passport.id), ne(listings.mintStatus, "delisted"))),
  ];
}

export async function tradedQuantity(db: DrizzleD1Database, listingId: string, statuses: readonly string[]) {
  const row = await db.select({ total: sum(trades.quantityValue) }).from(trades)
    .where(and(eq(trades.listingId, listingId), inArray(trades.status, [...statuses] as (typeof trades.status.enumValues)[number][]))).get();
  return Number(row?.total ?? 0);
}

/** listingId → quantity committed to live trades, for many listings in one query. */
export async function committedByListing(db: DrizzleD1Database, listingIds: string[]) {
  if (!listingIds.length) return new Map<string, number>();
  const rows = await db.select({ listingId: trades.listingId, total: sum(trades.quantityValue) }).from(trades)
    .where(and(inArray(trades.listingId, listingIds), inArray(trades.status, [...LIVE_TRADE_STATUSES]))).groupBy(trades.listingId);
  return new Map(rows.map((row) => [row.listingId, Number(row.total ?? 0)]));
}
