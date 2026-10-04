import { DESTINATIONS, type Destination, type Origin } from "../../shared/api";

type Counter = "passport" | "transfer" | "listing" | "trade" | "demand";

/**
 * Atomically increments and returns the named counter for the current year.
 * A single UPSERT … RETURNING statement, so concurrent requests never get the same number.
 */
async function next(db: D1Database, counter: Counter, year: number): Promise<number> {
  const row = await db
    .prepare("INSERT INTO id_sequences (name, value) VALUES (?1, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value")
    .bind(`${counter}:${year}`)
    .first<{ value: number }>();
  return row!.value;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");
const regionCode = (origin: Origin) => (origin === "Macau" ? "MO" : "HK");
const year = () => new Date().getUTCFullYear();

export async function nextPassportId(db: D1Database, origin: Origin) {
  const y = year();
  return `DPP-${regionCode(origin)}-${y}-${pad(await next(db, "passport", y), 5)}`;
}

export async function nextTransferId(db: D1Database, origin: Origin, destination: Destination) {
  const y = year();
  return `CBT-${regionCode(origin)}-${DESTINATIONS[destination]}-${y}-${pad(await next(db, "transfer", y), 4)}`;
}

/** Listings and their NFT tokens share one number: LST-HK-2026-0233 ↔ NFT-CON-0233. */
export async function nextListingIds(db: D1Database, origin: Origin, nftCode: string) {
  const y = year();
  const seq = pad(await next(db, "listing", y), 4);
  return { id: `LST-${regionCode(origin)}-${y}-${seq}`, nftTokenId: `NFT-${nftCode}-${seq}` };
}

export async function nextTradeId(db: D1Database) {
  const y = year();
  return `TRD-${y}-${pad(await next(db, "trade", y), 4)}`;
}

export async function nextDemandId(db: D1Database) {
  const y = year();
  return `DMD-${y}-${pad(await next(db, "demand", y), 4)}`;
}
