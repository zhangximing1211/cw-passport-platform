import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ApiErrorBody, DocumentDto, ListingDto, PassportDto, PassportEventDto, TradeDto, TransferDto, TransferEventDto,
} from "../../shared/api";
import { api, createPassport, login, newMember, newPassportBody, pdfBytes, postJson, tomorrow, upload } from "./helpers";

type TransferWithEvents = TransferDto & { events: TransferEventDto[] };

let admin: string;
beforeAll(async () => { admin = await login(); });

const errorCode = async (res: Response) => (await res.json<ApiErrorBody>()).error.code;

describe("passports: register, record events, verify", () => {
  it("registers a passport with a server-assigned ID after the seeded ones", async () => {
    const res = await postJson("/passports", newPassportBody({ origin: "Macau", stage: "Collected" }), admin);
    expect(res.status).toBe(201);
    const passport = await res.json<PassportDto>();
    expect(passport.id).toMatch(/^DPP-MO-\d{4}-\d{5}$/);
    expect(Number(passport.id.slice(-5))).toBeGreaterThan(461);
    expect(passport).toMatchObject({ status: "Pending", stage: "Collected", quantity: { value: 100, unit: "t" } });
    expect(passport).not.toHaveProperty("createdBy");

    const { items } = await (await api(`/passports/${passport.id}/events`, { cookie: admin })).json<{ items: PassportEventDto[] }>();
    expect(items).toEqual([expect.objectContaining({ stage: "Collected", place: "EcoPark, Tuen Mun", actor: "CW Passport" })]);
  });

  it("validates the registration body", async () => {
    const res = await postJson("/passports", newPassportBody({ quantity: { value: -5 }, origin: "Taiwan", stage: "Completed" }), admin);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
  });

  it("moves the lifecycle forward only, in chronological order", async () => {
    const passport = await createPassport(admin, { stage: "Collected" });
    const forward = await postJson(`/passports/${passport.id}/events`, { stage: "Processing", place: "EcoPark", location: "EcoPark Store 2" }, admin);
    expect(forward.status).toBe(201);
    const body = await forward.json<{ passport: PassportDto; event: PassportEventDto }>();
    expect(body.passport).toMatchObject({ stage: "Processing", location: "EcoPark Store 2" });
    expect(body.event).toMatchObject({ stage: "Processing", actor: "CW Passport" });

    const backward = await postJson(`/passports/${passport.id}/events`, { stage: "Sorted", place: "EcoPark" }, admin);
    expect(backward.status).toBe(409);
    expect(await errorCode(backward)).toBe("INVALID_STAGE_TRANSITION");

    const tooEarly = await postJson(`/passports/${passport.id}/events`, { stage: "Completed", place: "Site", occurredAt: "2020-01-01T00:00:00Z" }, admin);
    expect(await errorCode(tooEarly)).toBe("EVENT_OUT_OF_ORDER");

    const future = await postJson(`/passports/${passport.id}/events`, { stage: "Completed", place: "Site", occurredAt: "2999-01-01T00:00:00Z" }, admin);
    expect(future.status).toBe(400);
  });

  it("only allows Cross-border through a transfer", async () => {
    const passport = await createPassport(admin);
    const res = await postJson(`/passports/${passport.id}/events`, { stage: "Cross-border", place: "Border" }, admin);
    expect(res.status).toBe(400);
  });

  it("completing the lifecycle completes the passport", async () => {
    const passport = await createPassport(admin);
    const res = await postJson(`/passports/${passport.id}/events`, { stage: "Completed", place: "Buyer site" }, admin);
    expect((await res.json<{ passport: PassportDto }>()).passport).toMatchObject({ stage: "Completed", status: "Completed" });
  });

  it("lets members manage their own passports but not other people's", async () => {
    const member = await newMember("Kowloon Demolition Ltd");
    const own = await createPassport(member, { stage: "Generated" });
    expect((await postJson(`/passports/${own.id}/events`, { stage: "Collected", place: "Site" }, member)).status).toBe(201);

    const adminOwned = await createPassport(admin);
    const res = await postJson(`/passports/${adminOwned.id}/events`, { stage: "Completed", place: "Site" }, member);
    expect(res.status).toBe(403);
  });

  it("verification is reserved for regulators and only applies once", async () => {
    const member = await newMember("Kowloon Demolition Ltd");
    const passport = await createPassport(member);
    expect(await errorCode(await postJson(`/passports/${passport.id}/verify`, {}, member))).toBe("REGULATOR_REQUIRED");

    const regulator = await login("regulator", "regulator1234");
    const verified = await postJson(`/passports/${passport.id}/verify`, {}, regulator);
    expect(verified.status).toBe(200);
    expect((await verified.json<PassportDto>()).status).toBe("Verified");
    expect(await errorCode(await postJson(`/passports/${passport.id}/verify`, {}, regulator))).toBe("INVALID_STATUS");
  });
});

describe("transfers: create and advance", () => {
  const newTransfer = (passportId: string, cookie = admin) =>
    postJson("/transfers", { passportId, destination: "Shenzhen", departureDate: tomorrow(), transportType: "Road Freight" }, cookie);

  it("refuses unverified passports and ineligible stages", async () => {
    const unverified = await createPassport(admin);
    expect(await errorCode(await newTransfer(unverified.id))).toBe("PASSPORT_NOT_VERIFIED");
    const tooEarly = await createPassport(admin, { stage: "Generated" }, admin);
    expect(await errorCode(await newTransfer(tooEarly.id))).toBe("PASSPORT_STAGE_NOT_ELIGIBLE");
  });

  it("validates destination, date and quantity", async () => {
    const passport = await createPassport(admin, {}, admin);
    const bad = await postJson("/transfers", { passportId: passport.id, destination: "Beijing", departureDate: "2020-01-01", transportType: "Road Freight" }, admin);
    expect(bad.status).toBe(400);
    const tooMuch = await postJson("/transfers", { passportId: passport.id, destination: "Zhuhai", departureDate: tomorrow(), transportType: "Road Freight", quantityValue: 101 }, admin);
    expect(await errorCode(tooMuch)).toBe("QUANTITY_EXCEEDS_PASSPORT");
  });

  it("runs the full transfer workflow and moves the passport across the border", async () => {
    const passport = await createPassport(admin, {}, admin);
    const created = await newTransfer(passport.id);
    expect(created.status).toBe(201);
    const transfer = await created.json<TransferWithEvents>();
    expect(transfer.id).toMatch(/^CBT-HK-SZ-\d{4}-\d{4}$/);
    expect(transfer).toMatchObject({ status: "Preparing", compliance: "Pending Review", organisation: "CW Passport", quantity: { value: 100, unit: "t" } });
    expect(transfer.events.map((e) => e.step)).toEqual(["Created"]);

    expect(await errorCode(await newTransfer(passport.id))).toBe("TRANSFER_ALREADY_OPEN");

    const step = (name: string, cookie = admin) => postJson(`/transfers/${transfer.id}/events`, { step: name }, cookie);
    expect(await errorCode(await step("Documentation Submitted"))).toBe("DOCUMENTS_REQUIRED");
    expect((await upload(`/transfers/${transfer.id}/documents`, admin, { kind: "Transfer Document" })).status).toBe(201);
    expect(await errorCode(await step("Inspection"))).toBe("INVALID_STEP_ORDER");
    expect((await step("Documentation Submitted")).status).toBe(201);

    // Compliance steps need a regulator, even from the transferring organisation.
    const colleague = await newMember("CW Passport");
    expect(await errorCode(await step("Inspection", colleague))).toBe("REGULATOR_REQUIRED");
    for (const name of ["Inspection", "Customs / Compliance Review", "Cleared"]) expect((await step(name)).status).toBe(201);
    expect((await (await api(`/transfers/${transfer.id}`, { cookie: admin })).json<TransferDto>()).compliance).toBe("Cleared");

    const inTransit = await (await step("Transport", colleague)).json<TransferWithEvents>();
    expect(inTransit.status).toBe("In Transit");
    const moved = await (await api(`/passports/${passport.id}`, { cookie: admin })).json<PassportDto>();
    expect(moved).toMatchObject({ stage: "Cross-border", location: "Shenzhen Bay Port" });

    const received = await (await step("Received")).json<TransferWithEvents>();
    expect(received.status).toBe("Completed");
    expect(received.events).toHaveLength(7);
    // Business rule: a received transfer completes the passport.
    expect(await (await api(`/passports/${passport.id}`, { cookie: admin })).json<PassportDto>()).toMatchObject({ location: "Shenzhen", stage: "Completed", status: "Completed" });
    expect(await errorCode(await step("Received"))).toBe("TRANSFER_ALREADY_RECEIVED");

    const timeline = await (await api(`/passports/${passport.id}/events`, { cookie: admin })).json<{ items: PassportEventDto[] }>();
    expect(timeline.items.map((e) => e.stage)).toEqual(["Processing", "Cross-border", "Completed"]);
  });

  it("keeps other organisations out", async () => {
    const passport = await createPassport(admin, {}, admin);
    const transfer = await (await newTransfer(passport.id)).json<TransferDto>();
    const outsider = await newMember("Other Logistics Ltd");
    expect((await postJson(`/transfers/${transfer.id}/events`, { step: "Documentation Submitted" }, outsider)).status).toBe(403);
    expect((await upload(`/transfers/${transfer.id}/documents`, outsider)).status).toBe(403);
  });
});

describe("listings: create, mint, publish", () => {
  it("creates a draft listing from a verified passport, then mints and publishes it", async () => {
    const passport = await createPassport(admin, { category: "Metal", material: "Rebar Offcuts" }, admin);
    const res = await postJson("/listings", { passportId: passport.id, category: "Steel", availableFrom: tomorrow() }, admin);
    expect(res.status).toBe(201);
    const listing = await res.json<ListingDto>();
    expect(listing.id).toMatch(/^LST-HK-\d{4}-(\d{4})$/);
    expect(listing.nftTokenId).toBe(`NFT-STL-${listing.id.slice(-4)}`);
    expect(listing).toMatchObject({ category: "Steel", tone: "steel", mintStatus: "draft", txHash: null, seller: "CW Passport", location: "EcoPark, Tuen Mun, Hong Kong" });

    expect(await errorCode(await postJson("/listings", { passportId: passport.id }, admin))).toBe("LISTING_ALREADY_EXISTS");
    expect(await errorCode(await postJson(`/listings/${listing.id}/publish`, {}, admin))).toBe("INVALID_MINT_STATUS");

    const outsider = await newMember("Other Recycling Ltd");
    expect((await postJson(`/listings/${listing.id}/mint`, {}, outsider)).status).toBe(403);

    const minted = await (await postJson(`/listings/${listing.id}/mint`, {}, admin)).json<ListingDto>();
    expect(minted).toMatchObject({ mintStatus: "minted", txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    expect(await errorCode(await postJson(`/listings/${listing.id}/mint`, {}, admin))).toBe("INVALID_MINT_STATUS");

    const listed = await (await postJson(`/listings/${listing.id}/publish`, {}, admin)).json<ListingDto>();
    expect(listed).toMatchObject({ mintStatus: "listed", txHash: minted.txHash });
  });

  it("refuses unverified passports", async () => {
    const passport = await createPassport(admin);
    expect(await errorCode(await postJson("/listings", { passportId: passport.id }, admin))).toBe("PASSPORT_NOT_VERIFIED");
  });
});

describe("trades: open, complete, settle", () => {
  async function listedListing(quantity = 100) {
    const passport = await createPassport(admin, { quantity: { value: quantity, unit: "t" } }, admin);
    const listing = await (await postJson("/listings", { passportId: passport.id }, admin)).json<ListingDto>();
    await postJson(`/listings/${listing.id}/mint`, {}, admin);
    await postJson(`/listings/${listing.id}/publish`, {}, admin);
    return listing;
  }

  it("lets the buyer open a trade and the seller complete and settle it", async () => {
    const listing = await listedListing();
    const buyer = await newMember("Guangdong Road Base Co.");
    const res = await postJson("/trades", { listingId: listing.id, demandId: "DMD-2026-0071", quantityValue: 60, priceHkd: 9000 }, buyer);
    expect(res.status).toBe(201);
    const trade = await res.json<TradeDto>();
    expect(trade).toMatchObject({ buyer: "Guangdong Road Base Co.", seller: "CW Passport", status: "In Progress", txHash: null, nftTokenId: listing.nftTokenId });

    const overdraw = await postJson("/trades", { listingId: listing.id, demandId: "DMD-2026-0071", quantityValue: 41, priceHkd: 9000 }, buyer);
    expect(overdraw.status).toBe(422);
    expect((await overdraw.json<ApiErrorBody>()).error).toMatchObject({ code: "QUANTITY_EXCEEDS_AVAILABLE", details: { available: 40 } });

    expect((await postJson(`/trades/${trade.id}/complete`, {}, buyer)).status).toBe(403);
    expect(await errorCode(await postJson(`/trades/${trade.id}/settle`, {}, admin))).toBe("INVALID_TRADE_STATUS");

    const completed = await (await postJson(`/trades/${trade.id}/complete`, {}, admin)).json<TradeDto>();
    expect(completed).toMatchObject({ status: "Completed", txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    const settled = await (await postJson(`/trades/${trade.id}/settle`, {}, admin)).json<TradeDto>();
    expect(settled.status).toBe("Settled");
  });

  it("only the buyer's company can open a trade for its demand", async () => {
    const listing = await listedListing();
    const stranger = await newMember("Someone Else Ltd");
    const res = await postJson("/trades", { listingId: listing.id, demandId: "DMD-2026-0071", quantityValue: 10, priceHkd: 1000 }, stranger);
    expect(res.status).toBe(403);
  });

  it("refuses unpublished listings and quantities above the demand", async () => {
    const passport = await createPassport(admin, {}, admin);
    const draft = await (await postJson("/listings", { passportId: passport.id }, admin)).json<ListingDto>();
    expect(await errorCode(await postJson("/trades", { listingId: draft.id, demandId: "DMD-2026-0071", quantityValue: 10, priceHkd: 1000 }, admin))).toBe("LISTING_NOT_LISTED");

    const listing = await listedListing(1000);
    // DMD-2026-0064 wants 60 t.
    expect(await errorCode(await postJson("/trades", { listingId: listing.id, demandId: "DMD-2026-0064", quantityValue: 61, priceHkd: 1000 }, admin))).toBe("QUANTITY_EXCEEDS_DEMAND");
  });
});

describe("documents", () => {
  it("uploads, lists, downloads and deletes a file", async () => {
    const passport = await createPassport(admin);
    const bytes = pdfBytes("certificate");
    const res = await upload(`/passports/${passport.id}/documents`, admin, { bytes, filename: "C:\\scans\\Cert 01.pdf", kind: "Processing Record" });
    expect(res.status).toBe(201);
    const doc = await res.json<DocumentDto>();
    expect(doc).toMatchObject({ ownerType: "passport", ownerId: passport.id, kind: "Processing Record", filename: "Cert 01.pdf", contentType: "application/pdf", size: bytes.length, url: `/api/documents/${doc.id}` });
    expect(doc).not.toHaveProperty("r2Key");

    const list = await (await api(`/passports/${passport.id}/documents`, { cookie: admin })).json<{ items: DocumentDto[] }>();
    expect(list.items.map((d) => d.id)).toEqual([doc.id]);

    const download = await api(`/documents/${doc.id}`, { cookie: admin });
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Type")).toBe("application/pdf");
    expect(download.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''Cert%2001.pdf");
    expect(download.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    expect((await api(`/documents/${doc.id}`)).status).toBe(401);

    const other = await newMember("Other Co");
    expect((await api(`/documents/${doc.id}`, { method: "DELETE", body: "{}", cookie: other })).status).toBe(403);
    expect((await api(`/documents/${doc.id}`, { method: "DELETE", body: "{}", cookie: admin })).status).toBe(204);
    expect((await api(`/documents/${doc.id}`, { cookie: admin })).status).toBe(404);
    expect(await env.FILES.get(`passport/${passport.id}/${doc.id}`)).toBeNull();
  });

  it("detects the real file type instead of trusting the client", async () => {
    const passport = await createPassport(admin);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const res = await upload(`/passports/${passport.id}/documents`, admin, { bytes: html, filename: "fake.pdf" });
    expect(res.status).toBe(415);
    expect(await errorCode(res)).toBe("UNSUPPORTED_FILE_TYPE");

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const photo = await upload(`/passports/${passport.id}/documents`, admin, { bytes: png, filename: "photo.pdf", kind: "Material Photo" });
    expect((await photo.json<DocumentDto>()).contentType).toBe("image/png");
  });

  it("rejects empty, oversized, unknown-kind and non-CSRF-safe uploads", async () => {
    const passport = await createPassport(admin);
    const path = `/passports/${passport.id}/documents`;
    expect(await errorCode(await upload(path, admin, { bytes: new Uint8Array() }))).toBe("EMPTY_FILE");
    expect(await errorCode(await upload(path, admin, { kind: "Selfie" }))).toBe("VALIDATION_ERROR");

    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(pdfBytes());
    expect((await upload(path, admin, { bytes: big })).status).toBe(413);

    const noHeader = await upload(path, admin, { headers: { "X-Requested-With": "" } });
    expect(await errorCode(noHeader)).toBe("JSON_REQUIRED");
  });

  it("returns 404 for documents of unknown records", async () => {
    expect((await upload("/listings/LST-NOPE/documents", admin)).status).toBe(404);
  });
});

it("records every write in the audit log", async () => {
  const passport = await createPassport(admin, {}, admin);
  const { results } = await env.DB.prepare("SELECT action, user_id FROM audit_logs WHERE entity_id = ? ORDER BY id").bind(passport.id).all();
  expect(results).toEqual([{ action: "passport.create", user_id: "usr_demo" }, { action: "passport.verify", user_id: "usr_demo" }]);
});
