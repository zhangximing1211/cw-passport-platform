import { and, asc, between, count, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import {
  COMPLIANCE_STATUSES, DESTINATIONS, PASSPORT_STAGES, REGULATORY_STEPS, TRANSFER_STATUSES, TRANSFER_STEPS, TRANSPORT_TYPES,
  type Destination, type Page, type TransferDetailDto, type TransferDto, type TransferEventDto,
} from "../../shared/api";
import { documents, passportEvents, passports, transferEvents, transfers, type TransferRow, type UserRow } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { csvResponse, EXPORT_LIMIT } from "../lib/csv";
import { listDocuments, uploadDocument } from "../lib/documents";
import { apiError } from "../lib/errors";
import { nextTransferId } from "../lib/ids";
import { notifyInsert } from "../lib/notify";
import { canManage, isRegulator, viewerOf } from "../lib/permissions";
import { containsAny, pagination, withQuantity } from "../lib/query";
import { eventTime, isoDate, nowIso, todayIso } from "../lib/time";
import { validate } from "../lib/validate";
import type { AuthEnv } from "../middleware/auth";
import { completePassportWrites } from "../services/lifecycle";

const filters = {
  q: z.string().trim().max(100).optional(),
  status: z.enum(TRANSFER_STATUSES).optional(),
  compliance: z.enum(COMPLIANCE_STATUSES).optional(),
  origin: z.string().trim().max(50).optional(),
  destination: z.string().trim().max(50).optional(),
  passportId: z.string().trim().max(40).optional(),
  /** "regulatory": transfers whose next step must be recorded by a regulator. */
  queue: z.enum(["regulatory"]).optional(),
};
const listQuery = z.object({ ...filters, ...pagination });
const exportQuery = z.object(filters);

const idParam = z.object({ id: z.string().trim().min(1).max(40).transform((id) => id.toUpperCase()) });

const createBody = z.object({
  passportId: z.string().trim().min(1).max(40).transform((id) => id.toUpperCase()),
  destination: z.enum(Object.keys(DESTINATIONS) as [Destination, ...Destination[]]),
  departureDate: isoDate.refine((date) => date >= todayIso(), "Departure date cannot be in the past"),
  transportType: z.enum(TRANSPORT_TYPES),
  quantityValue: z.number().positive().optional(),
});

const stepBody = z.object({
  step: z.enum(TRANSFER_STEPS),
  note: z.string().trim().min(1).max(200).optional(),
  occurredAt: eventTime.optional(),
});

const cancelBody = z.object({ reason: z.string().trim().min(1).max(200).optional() });

const SEARCHABLE = [transfers.id, transfers.passportId, transfers.material, transfers.origin, transfers.destination, transfers.status, transfers.compliance];

const DEFAULT_NOTES: Record<(typeof TRANSFER_STEPS)[number], string> = {
  "Created": "Record initiated",
  "Documentation Submitted": "Submission complete",
  "Inspection": "Inspection recorded",
  "Customs / Compliance Review": "Review complete",
  "Cleared": "Transfer cleared",
  "Transport": "Currently in transit",
  "Received": "Receipt confirmed",
};
const BORDER_POINT: Record<string, string> = { "Hong Kong": "Shenzhen Bay Port", Macau: "Hengqin Port" };
/** Transfers that are finished one way or another. */
const CLOSED = ["Completed", "Cancelled"] as const;

// Written out in full: drizzle renders ${transfers.id} unqualified ("id") in single-table selects,
// which inside this subquery would resolve to transfer_events.id instead.
const stepsCompleted = sql<number>`(SELECT COUNT(*) FROM transfer_events te WHERE te.transfer_id = "transfers"."id")`;

type TransferWithSteps = TransferRow & { stepsCompleted: number };
export const toTransferDto = ({ createdAt: _created, createdBy: _by, ...row }: TransferWithSteps): TransferDto => withQuantity(row);

const notFound = (c: Parameters<typeof apiError>[0], id: string) => apiError(c, 404, "TRANSFER_NOT_FOUND", `Transfer ${id} does not exist`);

function whereOf(query: z.infer<typeof exportQuery>): SQL | undefined {
  return and(
    query.status ? eq(transfers.status, query.status) : undefined,
    query.compliance ? eq(transfers.compliance, query.compliance) : undefined,
    query.origin ? eq(transfers.origin, query.origin) : undefined,
    query.destination ? eq(transfers.destination, query.destination) : undefined,
    query.passportId ? eq(transfers.passportId, query.passportId.toUpperCase()) : undefined,
    // Next step = TRANSFER_STEPS[stepsCompleted]; Inspection..Cleared are indexes 2..4.
    query.queue === "regulatory" ? and(notInArray(transfers.status, [...CLOSED]), between(stepsCompleted, 2, 4)) : undefined,
    query.q ? containsAny(SEARCHABLE, query.q) : undefined,
  );
}

function loadEvents(db: DrizzleD1Database, id: string): Promise<TransferEventDto[]> {
  return db.select({ step: transferEvents.step, occurredAt: transferEvents.occurredAt, note: transferEvents.note })
    .from(transferEvents).where(eq(transferEvents.transferId, id)).orderBy(asc(transferEvents.occurredAt), asc(transferEvents.id));
}

/** Full detail for one transfer, as seen by `user`. Also used by the transfer stats endpoint. */
export async function transferDetail(db: DrizzleD1Database, user: UserRow, id: string): Promise<TransferDetailDto | null> {
  const [row, events] = await Promise.all([db.select().from(transfers).where(eq(transfers.id, id)).get(), loadEvents(db, id)]);
  if (!row) return null;
  return {
    ...toTransferDto({ ...row, stepsCompleted: events.length }),
    events,
    viewer: viewerOf(user, { createdBy: row.createdBy, companies: [row.organisation] }),
  };
}

export const transferRoutes = new Hono<AuthEnv>()
  .get("/", validate("query", listQuery), async (c) => {
    const query = c.req.valid("query");
    const db = drizzle(c.env.DB);
    const where = whereOf(query);
    const [rows, [{ total }]] = await Promise.all([
      db.select({ transfer: transfers, stepsCompleted }).from(transfers).where(where)
        .orderBy(desc(transfers.departureDate), desc(transfers.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(transfers).where(where),
    ]);
    const body: Page<TransferDto> = {
      items: rows.map(({ transfer, stepsCompleted: steps }) => toTransferDto({ ...transfer, stepsCompleted: Number(steps) })),
      total, page: query.page, pageSize: query.pageSize,
    };
    return c.json(body);
  })
  .get("/export.csv", validate("query", exportQuery), async (c) => {
    const rows = await drizzle(c.env.DB).select().from(transfers).where(whereOf(c.req.valid("query")))
      .orderBy(desc(transfers.departureDate), desc(transfers.id)).limit(EXPORT_LIMIT);
    return csvResponse(c, "cw-transfers.csv",
      ["Transfer ID", "Passport ID", "Material", "Origin", "Destination", "Quantity", "Unit", "Departure", "Transport", "Organisation", "Compliance", "Status"],
      rows.map((t) => [t.id, t.passportId, t.material, t.origin, t.destination, t.quantityValue, t.quantityUnit, t.departureDate, t.transportType, t.organisation, t.compliance, t.status]));
  })
  .post("/", validate("json", createBody), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [passport, open] = await Promise.all([
      db.select().from(passports).where(eq(passports.id, body.passportId)).get(),
      db.select({ id: transfers.id }).from(transfers).where(and(eq(transfers.passportId, body.passportId), notInArray(transfers.status, [...CLOSED]))).get(),
    ]);
    if (!passport) return apiError(c, 404, "PASSPORT_NOT_FOUND", `Passport ${body.passportId} does not exist`);
    if (!canManage(user, { createdBy: passport.createdBy })) return apiError(c, 403, "FORBIDDEN", "Only the passport's creator or an administrator can start a transfer for it");
    if (passport.status !== "Verified") return apiError(c, 409, "PASSPORT_NOT_VERIFIED", "Only verified passports can be transferred across the border");
    if (passport.stage !== "Sorted" && passport.stage !== "Processing") {
      return apiError(c, 409, "PASSPORT_STAGE_NOT_ELIGIBLE", `Material must be sorted or processed before transfer (current stage: ${passport.stage})`);
    }
    if (open) return apiError(c, 409, "TRANSFER_ALREADY_OPEN", `Transfer ${open.id} for this passport is still in progress`);
    const quantityValue = body.quantityValue ?? passport.quantityValue;
    if (quantityValue > passport.quantityValue) {
      return apiError(c, 422, "QUANTITY_EXCEEDS_PASSPORT", `The passport only covers ${passport.quantityValue} ${passport.quantityUnit}`);
    }

    const origin = passport.origin === "Macau" ? "Macau" : "Hong Kong";
    const id = await nextTransferId(c.env.DB, origin, body.destination);
    await db.batch([
      db.insert(transfers).values({
        id, passportId: passport.id, material: passport.material, origin: passport.origin, destination: body.destination,
        quantityValue, quantityUnit: passport.quantityUnit, departureDate: body.departureDate, compliance: "Pending Review",
        status: "Preparing", transportType: body.transportType, organisation: user.company, createdBy: user.id,
      }),
      db.insert(transferEvents).values({ transferId: id, step: "Created", occurredAt: nowIso(), note: DEFAULT_NOTES.Created }),
      auditInsert(db, { userId: user.id, action: "transfer.create", entityType: "transfer", entityId: id, details: body }),
    ]);
    return c.json(await transferDetail(db, user, id), 201);
  })
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const detail = await transferDetail(drizzle(c.env.DB), c.get("user"), id);
    return detail ? c.json(detail) : notFound(c, id);
  })
  .post("/:id/events", validate("param", idParam), validate("json", stepBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [transfer, events] = await Promise.all([db.select().from(transfers).where(eq(transfers.id, id)).get(), loadEvents(db, id)]);
    if (!transfer) return notFound(c, id);
    if (transfer.status === "Cancelled") return apiError(c, 409, "TRANSFER_CANCELLED", "This transfer has been cancelled");

    const expected = TRANSFER_STEPS[events.length];
    if (!expected) return apiError(c, 409, "TRANSFER_ALREADY_RECEIVED", "This transfer has already been received");
    if (body.step !== expected) return apiError(c, 409, "INVALID_STEP_ORDER", `The next step must be "${expected}"`, { expected });

    if ((REGULATORY_STEPS as readonly string[]).includes(body.step)) {
      if (!isRegulator(user)) return apiError(c, 403, "REGULATOR_REQUIRED", `Only regulators can record "${body.step}"`);
    } else if (!canManage(user, { createdBy: transfer.createdBy, companies: [transfer.organisation] })) {
      return apiError(c, 403, "FORBIDDEN", "Only the transferring organisation or an administrator can update this transfer");
    }

    if (body.step === "Documentation Submitted") {
      const [{ docs }] = await db.select({ docs: count() }).from(documents).where(and(eq(documents.ownerType, "transfer"), eq(documents.ownerId, id)));
      if (docs === 0) return apiError(c, 409, "DOCUMENTS_REQUIRED", "Upload at least one document before submitting documentation");
    }

    const occurredAt = body.occurredAt ?? nowIso();
    const lastAt = events.at(-1)?.occurredAt;
    if (lastAt && occurredAt < lastAt) return apiError(c, 409, "EVENT_OUT_OF_ORDER", `Step time must not be earlier than the previous step (${lastAt})`);

    const changes: Partial<TransferRow> = {};
    if (body.step === "Customs / Compliance Review") changes.compliance = "Verified";
    if (body.step === "Cleared") changes.compliance = "Cleared";
    if (body.step === "Transport") changes.status = "In Transit";
    if (body.step === "Received") changes.status = "Completed";

    // Transport and receipt move the material itself, so they update its passport too.
    const passport = await db.select().from(passports).where(eq(passports.id, transfer.passportId)).get();
    const passportWrites = [];
    if (passport && body.step === "Transport") {
      const borderPoint = BORDER_POINT[transfer.origin] ?? `${transfer.destination} border`;
      const advance = PASSPORT_STAGES.indexOf(passport.stage) < PASSPORT_STAGES.indexOf("Cross-border");
      passportWrites.push(
        db.update(passports).set({ ...(advance ? { stage: "Cross-border" as const } : {}), location: borderPoint, updatedAt: occurredAt }).where(eq(passports.id, passport.id)),
        ...(advance ? [db.insert(passportEvents).values({ passportId: passport.id, stage: "Cross-border", occurredAt, place: borderPoint, actor: transfer.organisation })] : []),
      );
    }
    if (passport && body.step === "Received") {
      // Business rule: a received transfer completes its passport (and takes its listings off the market).
      passportWrites.push(
        ...completePassportWrites(db, passport, { occurredAt, place: transfer.destination, actor: transfer.organisation }),
        db.update(passports).set({ location: transfer.destination }).where(eq(passports.id, passport.id)),
      );
    }

    const link = { kind: "transfer" as const, id };
    const notices = [
      ...(body.step === "Documentation Submitted" ? [notifyInsert(db, { role: "regulator" }, "transfer.awaiting_inspection", { transferId: id, organisation: transfer.organisation }, link)] : []),
      ...(body.step === "Cleared" ? [notifyInsert(db, { company: transfer.organisation }, "transfer.cleared", { transferId: id }, link)] : []),
      ...(body.step === "Received" ? [notifyInsert(db, { company: transfer.organisation }, "transfer.received", { transferId: id, destination: transfer.destination }, link)] : []),
    ];

    await db.batch([
      db.insert(transferEvents).values({ transferId: id, step: body.step, occurredAt, note: body.note ?? DEFAULT_NOTES[body.step] }),
      ...(Object.keys(changes).length ? [db.update(transfers).set(changes).where(eq(transfers.id, id))] : []),
      ...passportWrites,
      ...notices,
      auditInsert(db, { userId: user.id, action: "transfer.step", entityType: "transfer", entityId: id, details: body }),
    ]);
    return c.json(await transferDetail(db, user, id), 201);
  })
  .post("/:id/cancel", validate("param", idParam), validate("json", cancelBody), async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const transfer = await db.select().from(transfers).where(eq(transfers.id, id)).get();
    if (!transfer) return notFound(c, id);
    if (!canManage(user, { createdBy: transfer.createdBy, companies: [transfer.organisation] })) {
      return apiError(c, 403, "FORBIDDEN", "Only the transferring organisation or an administrator can cancel this transfer");
    }
    // Once the material is on the road, the record must be completed, not cancelled.
    if (transfer.status !== "Preparing") return apiError(c, 409, "TRANSFER_NOT_CANCELLABLE", `A transfer that is ${transfer.status} cannot be cancelled`);
    await db.batch([
      db.update(transfers).set({ status: "Cancelled" }).where(eq(transfers.id, id)),
      auditInsert(db, { userId: user.id, action: "transfer.cancel", entityType: "transfer", entityId: id, details: { reason } }),
    ]);
    return c.json(await transferDetail(db, user, id));
  })
  .get("/:id/documents", validate("param", idParam), (c) => listDocuments(c, "transfer", c.req.valid("param").id))
  .post("/:id/documents", validate("param", idParam), (c) => uploadDocument(c, "transfer", c.req.valid("param").id));
