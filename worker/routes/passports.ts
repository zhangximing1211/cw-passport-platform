import { and, asc, count, desc, eq, max, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import {
  INITIAL_STAGES, MANUAL_STAGES, ORIGINS, PASSPORT_CATEGORIES, PASSPORT_SORTS, PASSPORT_STAGES, PASSPORT_STATUSES,
  type Page, type PassportDetailDto, type PassportDto, type PassportEventDto,
} from "../../shared/api";
import { documents, listings, passportEvents, passports, transfers, type PassportRow } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { runBatch } from "../lib/batch";
import { csvResponse, EXPORT_LIMIT } from "../lib/csv";
import { listDocuments, uploadDocument } from "../lib/documents";
import { apiError } from "../lib/errors";
import { nextPassportId } from "../lib/ids";
import { notifyInsert } from "../lib/notify";
import { canManage, isAdmin, isRegulator, viewerOf } from "../lib/permissions";
import { containsAny, pagination, withQuantity } from "../lib/query";
import { eventTime, nowIso } from "../lib/time";
import { validate } from "../lib/validate";
import type { AuthEnv } from "../middleware/auth";
import { completePassportWrites } from "../services/lifecycle";

const filters = {
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  status: z.enum(PASSPORT_STATUSES).optional(),
  stage: z.enum(PASSPORT_STAGES).optional(),
  origin: z.string().trim().max(50).optional(),
  project: z.string().trim().max(120).optional(),
  sort: z.enum(PASSPORT_SORTS).default("id_desc"),
};
const listQuery = z.object({ ...filters, ...pagination });
const exportQuery = z.object(filters);

const idParam = z.object({ id: z.string().trim().min(1).max(40).transform((id) => id.toUpperCase()) });

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const quantity = z.object({ value: z.number().positive().max(1_000_000), unit: z.literal("t").default("t") });

const createBody = z.object({
  material: text(2, 120),
  category: z.enum(PASSPORT_CATEGORIES),
  project: text(2, 120),
  quantity,
  location: text(2, 120),
  origin: z.enum(ORIGINS),
  stage: z.enum(INITIAL_STAGES).default("Generated"),
});

const updateBody = z.object({
  material: text(2, 120).optional(),
  category: z.enum(PASSPORT_CATEGORIES).optional(),
  project: text(2, 120).optional(),
  quantity: quantity.optional(),
  location: text(2, 120).optional(),
}).refine((body) => Object.keys(body).length > 0, "Nothing to update");

const eventBody = z.object({
  stage: z.enum(MANUAL_STAGES),
  place: text(1, 120),
  actor: text(1, 120).optional(),
  occurredAt: eventTime.optional(),
  location: text(2, 120).optional(),
});

const SEARCHABLE = [
  passports.id, passports.material, passports.category, passports.project,
  passports.location, passports.origin, passports.stage, passports.status,
];

const ORDER_BY = {
  id_desc: desc(passports.id),
  id_asc: asc(passports.id),
  updated_desc: desc(passports.updatedAt),
} as const;

function whereOf(query: z.infer<typeof exportQuery>): SQL | undefined {
  return and(
    query.category ? eq(passports.category, query.category) : undefined,
    query.status ? eq(passports.status, query.status) : undefined,
    query.stage ? eq(passports.stage, query.stage) : undefined,
    query.origin ? eq(passports.origin, query.origin) : undefined,
    query.project ? eq(passports.project, query.project) : undefined,
    query.q ? containsAny(SEARCHABLE, query.q) : undefined,
  );
}

export const toPassportDto = ({ createdBy: _by, ...row }: PassportRow): PassportDto => withQuantity(row);

const notFound = (c: Parameters<typeof apiError>[0], id: string) => apiError(c, 404, "PASSPORT_NOT_FOUND", `Passport ${id} does not exist`);

export const passportRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", listQuery), async (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB);
    const where = whereOf(query);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(passports).where(where).orderBy(ORDER_BY[query.sort]).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(passports).where(where),
    ]);
    const body: Page<PassportDto> = { items: rows.map(toPassportDto), total, page: query.page, pageSize: query.pageSize };
    return c.json(body);
  })
  .get("/facets", async (c) => {
    const db = drizzle(c.env.DB);
    const [projects, origins, locations] = await Promise.all([
      db.selectDistinct({ value: passports.project }).from(passports).orderBy(asc(passports.project)),
      db.selectDistinct({ value: passports.origin }).from(passports).orderBy(asc(passports.origin)),
      db.selectDistinct({ value: passports.location }).from(passports).orderBy(asc(passports.location)),
    ]);
    return c.json({ projects: projects.map((r) => r.value), origins: origins.map((r) => r.value), locations: locations.map((r) => r.value) });
  })
  .get("/export.csv", validate("query", exportQuery), async (c) => {
    const query = c.req.valid("query");
    const rows = await drizzle(c.env.DB).select().from(passports).where(whereOf(query)).orderBy(ORDER_BY[query.sort]).limit(EXPORT_LIMIT);
    return csvResponse(c, "cw-passports.csv",
      ["Passport ID", "Material", "Category", "Source Project", "Quantity", "Unit", "Origin", "Current Location", "Stage", "Status", "Created (UTC)", "Updated (UTC)"],
      rows.map((p) => [p.id, p.material, p.category, p.project, p.quantityValue, p.quantityUnit, p.origin, p.location, p.stage, p.status, p.createdAt, p.updatedAt]));
  })
  .post("/", validate("json", createBody), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const id = await nextPassportId(c.env.DB, body.origin);
    const now = nowIso();
    const [[created]] = await db.batch([
      db.insert(passports).values({
        id, material: body.material, category: body.category, project: body.project,
        quantityValue: body.quantity.value, quantityUnit: body.quantity.unit, location: body.location, origin: body.origin,
        stage: body.stage, status: "Pending", createdBy: user.id, createdAt: now, updatedAt: now,
      }).returning(),
      db.insert(passportEvents).values({ passportId: id, stage: body.stage, occurredAt: now, place: body.location, actor: user.company }),
      auditInsert(db, { userId: user.id, action: "passport.create", entityType: "passport", entityId: id, details: body }),
    ]);
    return c.json(toPassportDto(created), 201);
  })
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const row = await drizzle(c.env.DB).select().from(passports).where(eq(passports.id, id)).get();
    if (!row) return notFound(c, id);
    const body: PassportDetailDto = { ...toPassportDto(row), viewer: viewerOf(c.get("user"), { createdBy: row.createdBy }) };
    return c.json(body);
  })
  .patch("/:id", validate("param", idParam), validate("json", updateBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const passport = await db.select().from(passports).where(eq(passports.id, id)).get();
    if (!passport) return notFound(c, id);
    if (!canManage(user, { createdBy: passport.createdBy })) return apiError(c, 403, "FORBIDDEN", "Only the passport's creator or an administrator can edit it");
    // Once a regulator has verified the record, only an administrator may correct it.
    if (passport.status !== "Pending" && !isAdmin(user)) return apiError(c, 409, "PASSPORT_LOCKED", "Verified passports can only be corrected by an administrator");
    if (passport.status === "Completed") return apiError(c, 409, "PASSPORT_LOCKED", "Completed passports cannot be edited");

    const { quantity: newQuantity, ...fields } = body;
    const changes = { ...fields, ...(newQuantity ? { quantityValue: newQuantity.value, quantityUnit: newQuantity.unit } : {}), updatedAt: nowIso() };
    const before = Object.fromEntries(Object.keys(changes).filter((k) => k !== "updatedAt").map((k) => [k, passport[k as keyof PassportRow]]));
    const [[updated]] = await db.batch([
      db.update(passports).set(changes).where(eq(passports.id, id)).returning(),
      auditInsert(db, { userId: user.id, action: "passport.update", entityType: "passport", entityId: id, details: { before, after: body } }),
    ]);
    return c.json(toPassportDto(updated));
  })
  .delete("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [passport, transfer, listing, docs] = await Promise.all([
      db.select().from(passports).where(eq(passports.id, id)).get(),
      db.select({ id: transfers.id }).from(transfers).where(eq(transfers.passportId, id)).get(),
      db.select({ id: listings.id }).from(listings).where(eq(listings.passportId, id)).get(),
      db.select({ r2Key: documents.r2Key }).from(documents).where(and(eq(documents.ownerType, "passport"), eq(documents.ownerId, id))),
    ]);
    if (!passport) return notFound(c, id);
    if (!canManage(user, { createdBy: passport.createdBy })) return apiError(c, 403, "FORBIDDEN", "Only the passport's creator or an administrator can delete it");
    if (passport.status !== "Pending") return apiError(c, 409, "PASSPORT_LOCKED", "Only passports still pending verification can be deleted");
    if (transfer || listing) return apiError(c, 409, "PASSPORT_IN_USE", "This passport already has transfers or listings");
    await db.batch([
      db.delete(passportEvents).where(eq(passportEvents.passportId, id)),
      db.delete(documents).where(and(eq(documents.ownerType, "passport"), eq(documents.ownerId, id))),
      db.delete(passports).where(eq(passports.id, id)),
      auditInsert(db, { userId: user.id, action: "passport.delete", entityType: "passport", entityId: id, details: toPassportDto(passport) }),
    ]);
    await Promise.all(docs.map((doc) => c.env.FILES.delete(doc.r2Key)));
    return c.body(null, 204);
  })
  .get("/:id/events", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const db = drizzle(c.env.DB);
    const exists = await db.select({ id: passports.id }).from(passports).where(eq(passports.id, id)).get();
    if (!exists) return notFound(c, id);
    const items: PassportEventDto[] = await db
      .select({ stage: passportEvents.stage, occurredAt: passportEvents.occurredAt, place: passportEvents.place, actor: passportEvents.actor })
      .from(passportEvents).where(eq(passportEvents.passportId, id)).orderBy(asc(passportEvents.occurredAt), asc(passportEvents.id));
    return c.json({ items });
  })
  .post("/:id/events", validate("param", idParam), validate("json", eventBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [passport, last] = await Promise.all([
      db.select().from(passports).where(eq(passports.id, id)).get(),
      db.select({ at: max(passportEvents.occurredAt) }).from(passportEvents).where(eq(passportEvents.passportId, id)).get(),
    ]);
    if (!passport) return notFound(c, id);
    if (!canManage(user, { createdBy: passport.createdBy })) return apiError(c, 403, "FORBIDDEN", "Only the passport's creator or an administrator can record its events");

    // Stages only move forward; skipping ahead is allowed (e.g. material reused locally without sorting).
    if (PASSPORT_STAGES.indexOf(body.stage) <= PASSPORT_STAGES.indexOf(passport.stage)) {
      return apiError(c, 409, "INVALID_STAGE_TRANSITION", `Passport is already at stage ${passport.stage}; events can only move it forward`);
    }
    const occurredAt = body.occurredAt ?? nowIso();
    if (last?.at && occurredAt < last.at) {
      return apiError(c, 409, "EVENT_OUT_OF_ORDER", `Event time must not be earlier than the previous event (${last.at})`);
    }

    const event = { stage: body.stage, occurredAt, place: body.place, actor: body.actor ?? user.company };
    const audit = auditInsert(db, { userId: user.id, action: "passport.event", entityType: "passport", entityId: id, details: body });
    if (body.stage === "Completed") {
      // Reused material: completes the passport and takes its listings off the market.
      await runBatch(db, [
        ...completePassportWrites(db, passport, event),
        ...(body.location ? [db.update(passports).set({ location: body.location }).where(eq(passports.id, id))] : []),
        audit,
      ]);
    } else {
      await db.batch([
        db.insert(passportEvents).values({ passportId: id, ...event }),
        db.update(passports).set({ stage: body.stage, location: body.location ?? passport.location, updatedAt: nowIso() }).where(eq(passports.id, id)),
        audit,
      ]);
    }
    const updated = (await db.select().from(passports).where(eq(passports.id, id)).get())!;
    return c.json({ passport: toPassportDto(updated), event: event satisfies PassportEventDto }, 201);
  })
  .post("/:id/verify", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    if (!isRegulator(user)) return apiError(c, 403, "REGULATOR_REQUIRED", "Only regulators or administrators can verify passports");
    const db = drizzle(c.env.DB);
    const passport = await db.select().from(passports).where(eq(passports.id, id)).get();
    if (!passport) return notFound(c, id);
    if (passport.status !== "Pending" && passport.status !== "Processing") {
      return apiError(c, 409, "INVALID_STATUS", `A ${passport.status} passport cannot be verified`);
    }
    const [[updated]] = await db.batch([
      db.update(passports).set({ status: "Verified", updatedAt: nowIso() }).where(eq(passports.id, id)).returning(),
      auditInsert(db, { userId: user.id, action: "passport.verify", entityType: "passport", entityId: id }),
      ...(passport.createdBy ? [notifyInsert(db, { userId: passport.createdBy }, "passport.verified", { passportId: id, material: passport.material }, { kind: "passport", id })] : []),
    ]);
    return c.json(toPassportDto(updated));
  })
  .get("/:id/documents", validate("param", idParam), (c) => listDocuments(c, "passport", c.req.valid("param").id))
  .post("/:id/documents", validate("param", idParam), (c) => uploadDocument(c, "passport", c.req.valid("param").id));
