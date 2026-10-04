import { beforeAll, describe, expect, it } from "vitest";
import type { ApiErrorBody, ListingDetailDto, PassportDetailDto, PassportDto, TradeDto, TransferDetailDto } from "../../shared/api";
import { api, createPassport, login, newMember, postJson, tomorrow, upload } from "./helpers";

let admin: string;
beforeAll(async () => { admin = await login(); });

const errorCode = async (res: Response) => (await res.json<ApiErrorBody>()).error.code;
const getJson = async <T>(path: string, cookie = admin) => (await api(path, { cookie })).json<T>();
const patchJson = (path: string, body: unknown, cookie: string) => api(path, { method: "PATCH", body: JSON.stringify(body), cookie });
const del = (path: string, cookie: string) => api(path, { method: "DELETE", body: "{}", cookie });

async function listedListing(quantity = 100) {
  const passport = await createPassport(admin, { quantity: { value: quantity, unit: "t" } }, admin);
  const listing = await (await postJson("/listings", { passportId: passport.id }, admin)).json<ListingDetailDto>();
  await postJson(`/listings/${listing.id}/mint`, {}, admin);
  await postJson(`/listings/${listing.id}/publish`, {}, admin);
  return { passport, listing };
}

const openTrade = (listingId: string, quantityValue: number, cookie = admin) =>
  postJson("/trades", { listingId, demandId: "DMD-2026-0071", quantityValue, priceHkd: 1000 }, cookie);

describe("business rules", () => {
  it("selling the last of a listing delists it and completes its passport", async () => {
    const { passport, listing } = await listedListing(100);
    const first = await (await openTrade(listing.id, 60)).json<TradeDto>();
    const second = await (await openTrade(listing.id, 40)).json<TradeDto>();
    expect((await getJson<ListingDetailDto>(`/listings/${listing.id}`)).available).toBe(0);

    await postJson(`/trades/${first.id}/complete`, {}, admin);
    // Partially sold: still on the market.
    expect((await getJson<ListingDetailDto>(`/listings/${listing.id}`)).mintStatus).toBe("listed");

    await postJson(`/trades/${second.id}/complete`, {}, admin);
    expect((await getJson<ListingDetailDto>(`/listings/${listing.id}`)).mintStatus).toBe("delisted");
    expect(await getJson<PassportDto>(`/passports/${passport.id}`)).toMatchObject({ stage: "Completed", status: "Completed" });
    const events = await getJson<{ items: { stage: string; actor: string; place: string }[] }>(`/passports/${passport.id}/events`);
    expect(events.items.at(-1)).toMatchObject({ stage: "Completed", actor: "Guangdong Road Base Co.", place: "Shenzhen" });
  });

  it("a received transfer completes the passport and takes its listing off the market", async () => {
    const passport = await createPassport(admin, {}, admin);
    const listing = await (await postJson("/listings", { passportId: passport.id }, admin)).json<ListingDetailDto>();
    const transfer = await (await postJson("/transfers", { passportId: passport.id, destination: "Zhuhai", departureDate: tomorrow(), transportType: "Road Freight" }, admin)).json<TransferDetailDto>();
    await upload(`/transfers/${transfer.id}/documents`, admin);
    for (const step of ["Documentation Submitted", "Inspection", "Customs / Compliance Review", "Cleared", "Transport", "Received"]) {
      expect((await postJson(`/transfers/${transfer.id}/events`, { step }, admin)).status).toBe(201);
    }
    expect(await getJson<PassportDto>(`/passports/${passport.id}`)).toMatchObject({ stage: "Completed", location: "Zhuhai" });
    expect((await getJson<ListingDetailDto>(`/listings/${listing.id}`)).mintStatus).toBe("delisted");
  });

  it("a completed passport's material cannot be sold", async () => {
    const { passport, listing } = await listedListing();
    await postJson(`/passports/${passport.id}/events`, { stage: "Completed", place: "Reused on site" }, admin);
    expect((await getJson<ListingDetailDto>(`/listings/${listing.id}`)).mintStatus).toBe("delisted");
    expect(await errorCode(await openTrade(listing.id, 10))).toBe("LISTING_NOT_LISTED");
    expect(await errorCode(await postJson("/listings", { passportId: passport.id }, admin))).toBe("PASSPORT_COMPLETED");

    // A draft listing of a completed passport cannot be minted either.
    const other = await createPassport(admin, {}, admin);
    const draft = await (await postJson("/listings", { passportId: other.id }, admin)).json<ListingDetailDto>();
    await postJson(`/passports/${other.id}/events`, { stage: "Completed", place: "Site" }, admin);
    expect(await errorCode(await postJson(`/listings/${draft.id}/mint`, {}, admin))).toBe("INVALID_MINT_STATUS");
  });

  it("matches only include listings still on the market and suggest a quantity", async () => {
    const { passport, listing } = await listedListing(45);
    const before = await getJson<{ items: { listing: { id: string }; suggestedQuantity: number }[] }>(`/matches?listingId=${listing.id}&limit=50`);
    expect(before.items.length).toBeGreaterThan(0);
    expect(before.items.every((m) => m.suggestedQuantity <= 45)).toBe(true);
    await postJson(`/passports/${passport.id}/events`, { stage: "Completed", place: "Site" }, admin);
    const after = await getJson<{ total: number }>(`/matches?listingId=${listing.id}`);
    expect(after.total).toBe(0);
  });
});

describe("corrections", () => {
  it("edits a pending passport; after verification only an administrator may", async () => {
    const member = await newMember("Edit Test Ltd");
    const passport = await createPassport(member);
    const edited = await patchJson(`/passports/${passport.id}`, { material: "Corrected Material", quantity: { value: 90, unit: "t" } }, member);
    expect(await edited.json()).toMatchObject({ material: "Corrected Material", quantity: { value: 90, unit: "t" } });

    await postJson(`/passports/${passport.id}/verify`, {}, admin);
    expect(await errorCode(await patchJson(`/passports/${passport.id}`, { material: "Again" }, member))).toBe("PASSPORT_LOCKED");
    expect((await patchJson(`/passports/${passport.id}`, { material: "Admin fix" }, admin)).status).toBe(200);

    const history = await getJson<{ items: { action: string; details: { before: { material: string } } }[] }>(`/audit?entityType=passport&entityId=${passport.id}`, member);
    expect(history.items.find((e) => e.action === "passport.update")?.details.before.material).toBe("Corrected Material");
  });

  it("deletes a pending passport that has nothing attached", async () => {
    const passport = await createPassport(admin);
    expect((await del(`/passports/${passport.id}`, admin)).status).toBe(204);
    expect((await api(`/passports/${passport.id}`, { cookie: admin })).status).toBe(404);

    const inUse = await createPassport(admin, {}, admin);
    await postJson("/listings", { passportId: inUse.id }, admin);
    expect(await errorCode(await del(`/passports/${inUse.id}`, admin))).toBe("PASSPORT_LOCKED");
  });

  it("cancels a transfer before transport, freeing the passport for a new one", async () => {
    const passport = await createPassport(admin, {}, admin);
    const body = { passportId: passport.id, destination: "Foshan", departureDate: tomorrow(), transportType: "Road Freight" };
    const transfer = await (await postJson("/transfers", body, admin)).json<TransferDetailDto>();
    const cancelled = await (await postJson(`/transfers/${transfer.id}/cancel`, { reason: "Buyer changed" }, admin)).json<TransferDetailDto>();
    expect(cancelled.status).toBe("Cancelled");
    expect(await errorCode(await postJson(`/transfers/${transfer.id}/events`, { step: "Documentation Submitted" }, admin))).toBe("TRANSFER_CANCELLED");
    expect((await postJson("/transfers", body, admin)).status).toBe(201);
  });

  it("cancelling a trade releases its quantity; delisting stops new trades", async () => {
    const { listing } = await listedListing(50);
    const trade = await (await openTrade(listing.id, 50)).json<TradeDto>();
    expect(await errorCode(await openTrade(listing.id, 1))).toBe("QUANTITY_EXCEEDS_AVAILABLE");
    const cancelled = await (await postJson(`/trades/${trade.id}/cancel`, {}, admin)).json<TradeDto>();
    expect(cancelled.status).toBe("Cancelled");
    expect((await getJson<ListingDetailDto>(`/listings/${listing.id}`)).available).toBe(50);

    const delisted = await (await postJson(`/listings/${listing.id}/delist`, { reason: "Sold elsewhere" }, admin)).json<ListingDetailDto>();
    expect(delisted.mintStatus).toBe("delisted");
    expect(await errorCode(await openTrade(listing.id, 10))).toBe("LISTING_NOT_LISTED");
  });

  it("only the parties can cancel a trade", async () => {
    const { listing } = await listedListing();
    const trade = await (await openTrade(listing.id, 10)).json<TradeDto>();
    const outsider = await newMember("Unrelated Co");
    expect((await postJson(`/trades/${trade.id}/cancel`, {}, outsider)).status).toBe(403);
    const buyer = await newMember("Guangdong Road Base Co.");
    expect((await postJson(`/trades/${trade.id}/cancel`, {}, buyer)).status).toBe(200);
  });

  it("returns what the viewer may do", async () => {
    const member = await newMember("Viewer Test Ltd");
    const own = await createPassport(member);
    expect((await getJson<PassportDetailDto>(`/passports/${own.id}`, member)).viewer).toEqual({ canManage: true, canRegulate: false });
    const regulator = await login("regulator", "regulator1234");
    expect((await getJson<PassportDetailDto>(`/passports/${own.id}`, regulator)).viewer).toEqual({ canManage: false, canRegulate: true });
  });
});
