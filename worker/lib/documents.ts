import { and, asc, eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { Context } from "hono";
import { DOCUMENT_KINDS, DOCUMENT_MAX_BYTES, type DocumentDto, type DocumentKind, type DocumentOwnerType } from "../../shared/api";
import { documents, listings, passports, transfers, type DocumentRow } from "../db/schema";
import type { AuthEnv } from "../middleware/auth";
import { auditInsert } from "./audit";
import { apiError } from "./errors";
import { canManage, isRegulator } from "./permissions";

type Ctx = Context<AuthEnv>;

/** Detects the real file type from its first bytes; the client's Content-Type is not trusted. */
export function sniffContentType(bytes: Uint8Array): DocumentDto["contentType"] | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF….WEBP
  return null;
}

/** Keeps a display-safe base name; the R2 key never uses it. */
function cleanFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 200);
  return cleaned || "document";
}

export function toDocumentDto({ r2Key: _key, ...row }: DocumentRow): DocumentDto {
  return { ...row, url: `/api/documents/${row.id}` };
}

/** The owning record's permission facts, or null when it doesn't exist. */
async function loadOwner(db: DrizzleD1Database, ownerType: DocumentOwnerType, ownerId: string) {
  switch (ownerType) {
    case "passport": {
      const row = await db.select({ createdBy: passports.createdBy }).from(passports).where(eq(passports.id, ownerId)).get();
      return row && { createdBy: row.createdBy, companies: [] };
    }
    case "transfer": {
      const row = await db.select({ createdBy: transfers.createdBy, organisation: transfers.organisation }).from(transfers).where(eq(transfers.id, ownerId)).get();
      return row && { createdBy: row.createdBy, companies: [row.organisation] };
    }
    case "listing": {
      const row = await db.select({ createdBy: listings.createdBy, seller: listings.seller }).from(listings).where(eq(listings.id, ownerId)).get();
      return row && { createdBy: row.createdBy, companies: [row.seller] };
    }
  }
}

const ownerNotFound = (c: Ctx, ownerType: DocumentOwnerType, ownerId: string) =>
  apiError(c, 404, `${ownerType.toUpperCase()}_NOT_FOUND`, `${ownerType[0].toUpperCase()}${ownerType.slice(1)} ${ownerId} does not exist`);

/**
 * Listing documents (material photos, specs) are for prospective buyers, so every signed-in
 * user sees them. Passport and transfer documents (declarations, inspection reports) are
 * limited to the owning organisation and regulators.
 */
export async function canViewDocuments(db: DrizzleD1Database, user: AuthEnv["Variables"]["user"], ownerType: DocumentOwnerType, ownerId: string) {
  if (ownerType === "listing" || isRegulator(user)) return true;
  const owner = await loadOwner(db, ownerType, ownerId);
  return !!owner && canManage(user, owner);
}

export async function listDocuments(c: Ctx, ownerType: DocumentOwnerType, ownerId: string) {
  const db = drizzle(c.env.DB);
  if (!(await loadOwner(db, ownerType, ownerId))) return ownerNotFound(c, ownerType, ownerId);
  if (!(await canViewDocuments(db, c.get("user"), ownerType, ownerId))) {
    return apiError(c, 403, "FORBIDDEN", "Only the owning organisation and regulators can see these documents");
  }
  const rows = await db.select().from(documents)
    .where(and(eq(documents.ownerType, ownerType), eq(documents.ownerId, ownerId)))
    .orderBy(asc(documents.createdAt));
  return c.json({ items: rows.map(toDocumentDto) });
}

/**
 * multipart/form-data upload with fields `file` and `kind`.
 * Allowed: the owner's managers; for transfers also regulators (inspection reports, certificates).
 */
export async function uploadDocument(c: Ctx, ownerType: DocumentOwnerType, ownerId: string) {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const owner = await loadOwner(db, ownerType, ownerId);
  if (!owner) return ownerNotFound(c, ownerType, ownerId);
  if (!canManage(user, owner) && !(ownerType === "transfer" && isRegulator(user))) {
    return apiError(c, 403, "FORBIDDEN", "You cannot attach documents to this record");
  }

  // Reject oversized bodies before buffering them (form overhead allowance: 64 KiB).
  if (Number(c.req.header("Content-Length") ?? 0) > DOCUMENT_MAX_BYTES + 65_536) {
    return apiError(c, 413, "FILE_TOO_LARGE", `Files must be at most ${DOCUMENT_MAX_BYTES / 1024 / 1024} MB`);
  }
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return apiError(c, 400, "INVALID_UPLOAD", "Send the file as multipart/form-data with a `file` field");
  }
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File)) return apiError(c, 400, "INVALID_UPLOAD", "Missing `file` field");
  if (typeof kind !== "string" || !(DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    return apiError(c, 400, "VALIDATION_ERROR", `\`kind\` must be one of: ${DOCUMENT_KINDS.join(", ")}`);
  }
  if (file.size === 0) return apiError(c, 400, "EMPTY_FILE", "The file is empty");
  if (file.size > DOCUMENT_MAX_BYTES) return apiError(c, 413, "FILE_TOO_LARGE", `Files must be at most ${DOCUMENT_MAX_BYTES / 1024 / 1024} MB`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffContentType(bytes);
  if (!contentType) return apiError(c, 415, "UNSUPPORTED_FILE_TYPE", "Only PDF, PNG, JPEG and WebP files are accepted");

  const id = `doc_${crypto.randomUUID()}`;
  const r2Key = `${ownerType}/${ownerId}/${id}`;
  const filename = cleanFilename(file.name);
  await c.env.FILES.put(r2Key, bytes, { httpMetadata: { contentType }, customMetadata: { filename, uploadedBy: user.id } });

  try {
    const [[row]] = await db.batch([
      db.insert(documents).values({ id, ownerType, ownerId, kind: kind as DocumentKind, filename, contentType, size: file.size, r2Key, uploadedBy: user.id }).returning(),
      auditInsert(db, { userId: user.id, action: "document.upload", entityType: ownerType, entityId: ownerId, details: { documentId: id, kind, filename, size: file.size } }),
    ]);
    return c.json(toDocumentDto(row), 201);
  } catch (error) {
    await c.env.FILES.delete(r2Key); // don't leave an orphaned object behind
    throw error;
  }
}
