import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  COMPLIANCE_STATUSES, DOCUMENT_KINDS, DOCUMENT_OWNER_TYPES, LISTING_STATUSES, NOTIFICATION_TYPES, MINT_STATUSES, PASSPORT_STAGES, PASSPORT_STATUSES,
  TRADE_STATUSES, TRANSFER_STATUSES, TRANSFER_STEPS, USER_ROLES, USER_TYPES,
} from "../../shared/api";

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text("created_at").notNull().default(nowIso);
/** User who created the record; null for seeded/imported data. */
const createdBy = () => text("created_by").references(() => users.id, { onDelete: "set null" });

// ── Accounts ────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull(),
  /** pbkdf2-sha256$<iterations>$<salt b64>$<hash b64> */
  passwordHash: text("password_hash").notNull(),
  company: text("company").notNull(),
  userType: text("user_type", { enum: USER_TYPES }).notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("member"),
  contact: text("contact"),
  phone: text("phone"),
  /** Disabled accounts cannot sign in; their sessions are revoked. */
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("users_username_uq").on(sql`lower(${table.username})`),
  uniqueIndex("users_email_uq").on(sql`lower(${table.email})`),
]);

export const sessions = sqliteTable("sessions", {
  /** SHA-256 of the cookie token; the raw token is never stored. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: createdAt(),
}, (table) => [index("sessions_user_idx").on(table.userId)]);

// ── Digital passports ───────────────────────────────────────────────────────

export const passports = sqliteTable(
  "passports",
  {
    id: text("id").primaryKey(),
    material: text("material").notNull(),
    category: text("category").notNull(),
    project: text("project").notNull(),
    quantityValue: real("quantity_value").notNull(),
    quantityUnit: text("quantity_unit").notNull().default("t"),
    location: text("location").notNull(),
    origin: text("origin").notNull(),
    stage: text("stage", { enum: PASSPORT_STAGES }).notNull(),
    status: text("status", { enum: PASSPORT_STATUSES }).notNull(),
    createdBy: createdBy(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(nowIso),
  },
  (table) => [
    index("passports_category_idx").on(table.category),
    index("passports_status_idx").on(table.status),
    index("passports_updated_at_idx").on(table.updatedAt),
  ],
);

export const passportEvents = sqliteTable("passport_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  passportId: text("passport_id").notNull().references(() => passports.id, { onDelete: "cascade" }),
  stage: text("stage", { enum: PASSPORT_STAGES }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  place: text("place").notNull(),
  actor: text("actor").notNull(),
}, (table) => [index("passport_events_passport_idx").on(table.passportId, table.occurredAt)]);

// ── Cross-border transfers ──────────────────────────────────────────────────

export const transfers = sqliteTable("transfers", {
  id: text("id").primaryKey(),
  passportId: text("passport_id").notNull().references(() => passports.id),
  material: text("material").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  quantityValue: real("quantity_value").notNull(),
  quantityUnit: text("quantity_unit").notNull().default("t"),
  departureDate: text("departure_date").notNull(),
  compliance: text("compliance", { enum: COMPLIANCE_STATUSES }).notNull(),
  status: text("status", { enum: TRANSFER_STATUSES }).notNull(),
  transportType: text("transport_type").notNull(),
  organisation: text("organisation").notNull(),
  createdBy: createdBy(),
  createdAt: createdAt(),
}, (table) => [
  index("transfers_passport_idx").on(table.passportId),
  index("transfers_status_idx").on(table.status),
]);

export const transferEvents = sqliteTable("transfer_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transferId: text("transfer_id").notNull().references(() => transfers.id, { onDelete: "cascade" }),
  step: text("step", { enum: TRANSFER_STEPS }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  note: text("note").notNull(),
}, (table) => [index("transfer_events_transfer_idx").on(table.transferId, table.occurredAt)]);

// ── Marketplace ─────────────────────────────────────────────────────────────

export const listings = sqliteTable("listings", {
  id: text("id").primaryKey(),
  passportId: text("passport_id").notNull().references(() => passports.id),
  transferId: text("transfer_id").references(() => transfers.id),
  material: text("material").notNull(),
  category: text("category").notNull(),
  quantityValue: real("quantity_value").notNull(),
  quantityUnit: text("quantity_unit").notNull().default("t"),
  location: text("location").notNull(),
  availableFrom: text("available_from"),
  status: text("status", { enum: LISTING_STATUSES }).notNull(),
  seller: text("seller").notNull(),
  tone: text("tone").notNull(),
  nftTokenId: text("nft_token_id").notNull().unique(),
  nftType: text("nft_type").notNull(),
  mintStatus: text("mint_status", { enum: MINT_STATUSES }).notNull().default("draft"),
  txHash: text("tx_hash"),
  createdBy: createdBy(),
  createdAt: createdAt(),
}, (table) => [
  index("listings_category_idx").on(table.category),
  index("listings_passport_idx").on(table.passportId),
]);

/** Buyer-side knowledge base used by the matching engine ("RAG" evidence). */
export const companies = sqliteTable("companies", {
  name: text("name").primaryKey(),
  industry: text("industry").notNull(),
  region: text("region").notNull(),
  regionCode: text("region_code").notNull(),
  needs: text("needs").notNull(),
  capacity: text("capacity").notNull(),
  history: text("history").notNull(),
  rating: real("rating").notNull(),
});

export const demands = sqliteTable("demands", {
  id: text("id").primaryKey(),
  company: text("company").notNull().references(() => companies.name),
  industry: text("industry").notNull(),
  region: text("region").notNull(),
  category: text("category").notNull(),
  quantityValue: real("quantity_value").notNull(),
  quantityUnit: text("quantity_unit").notNull().default("t"),
  deadline: text("deadline").notNull(),
  contact: text("contact").notNull(),
  createdBy: createdBy(),
  createdAt: createdAt(),
});

export const trades = sqliteTable("trades", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull().references(() => listings.id),
  demandId: text("demand_id").notNull().references(() => demands.id),
  buyer: text("buyer").notNull(),
  seller: text("seller").notNull(),
  quantityValue: real("quantity_value").notNull(),
  quantityUnit: text("quantity_unit").notNull().default("t"),
  priceHkd: integer("price_hkd").notNull(),
  status: text("status", { enum: TRADE_STATUSES }).notNull(),
  txHash: text("tx_hash"),
  tradedOn: text("traded_on").notNull(),
  createdBy: createdBy(),
  createdAt: createdAt(),
}, (table) => [index("trades_traded_on_idx").on(table.tradedOn)]);

// ── Files, audit, ID sequences ──────────────────────────────────────────────

/** Metadata for a file stored in R2 under `r2Key`. */
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type", { enum: DOCUMENT_OWNER_TYPES }).notNull(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  r2Key: text("r2_key").notNull(),
  uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (table) => [index("documents_owner_idx").on(table.ownerType, table.ownerId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  /** JSON */
  details: text("details"),
  createdAt: createdAt(),
}, (table) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId)]);

/** Failed sign-ins, for rate limiting. key = "user:<login>" or "ip:<address>". */
export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  createdAt: createdAt(),
}, (table) => [index("login_attempts_key_idx").on(table.key, table.createdAt)]);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  /** SHA-256 of the emailed token. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: createdAt(),
});

/**
 * In-app notifications. Exactly one recipient field is set: a user, every member of a
 * company (matched case-insensitively), or everyone holding a role (regulator / admin).
 */
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
  recipientCompany: text("recipient_company"),
  recipientRole: text("recipient_role", { enum: ["regulator", "admin"] }),
  type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
  /** JSON object of message parameters. */
  params: text("params").notNull(),
  linkKind: text("link_kind"),
  linkId: text("link_id"),
  createdAt: createdAt(),
}, (table) => [
  index("notifications_user_idx").on(table.recipientUserId),
  index("notifications_company_idx").on(table.recipientCompany),
  index("notifications_role_idx").on(table.recipientRole),
]);

export const notificationReads = sqliteTable("notification_reads", {
  notificationId: integer("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.notificationId, table.userId] })]);

/** Monotonic counters behind business IDs, e.g. "passport:2026" → 470 → DPP-HK-2026-00471. */
export const idSequences = sqliteTable("id_sequences", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

export type PassportRow = typeof passports.$inferSelect;
export type TransferRow = typeof transfers.$inferSelect;
export type ListingRow = typeof listings.$inferSelect;
export type DemandRow = typeof demands.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;
