import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { documents } from "../db/schema";
import { auditInsert } from "../lib/audit";
import { canViewDocuments, toDocumentDto } from "../lib/documents";
import { apiError } from "../lib/errors";
import { isAdmin } from "../lib/permissions";
import { validate } from "../lib/validate";
import type { AuthEnv } from "../middleware/auth";

// Uploading and listing live under the owning record (POST /api/transfers/:id/documents, …).
const idParam = z.object({ id: z.string().regex(/^doc_[0-9a-f-]{36}$/) });

export const documentRoutes = new Hono<AuthEnv>()
  .get("/:id/meta", validate("param", idParam), async (c) => {
    const db = drizzle(c.env.DB);
    const row = await db.select().from(documents).where(eq(documents.id, c.req.valid("param").id)).get();
    if (!row) return apiError(c, 404, "DOCUMENT_NOT_FOUND", "Document does not exist");
    if (!(await canViewDocuments(db, c.get("user"), row.ownerType, row.ownerId))) return apiError(c, 403, "FORBIDDEN", "You cannot view this document");
    return c.json(toDocumentDto(row));
  })
  .get("/:id", validate("param", idParam), async (c) => {
    const db = drizzle(c.env.DB);
    const row = await db.select().from(documents).where(eq(documents.id, c.req.valid("param").id)).get();
    if (!row) return apiError(c, 404, "DOCUMENT_NOT_FOUND", "Document does not exist");
    if (!(await canViewDocuments(db, c.get("user"), row.ownerType, row.ownerId))) return apiError(c, 403, "FORBIDDEN", "You cannot view this document");
    const object = await c.env.FILES.get(row.r2Key);
    if (!object) return apiError(c, 404, "FILE_MISSING", "The stored file is missing");
    return new Response(object.body, {
      headers: {
        "Content-Type": row.contentType,
        "Content-Length": String(row.size),
        // Only PDFs and images are ever stored, so inline display is safe; the CSP and nosniff are belt and braces.
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  })
  .delete("/:id", validate("param", idParam), async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const row = await db.select().from(documents).where(eq(documents.id, c.req.valid("param").id)).get();
    if (!row) return apiError(c, 404, "DOCUMENT_NOT_FOUND", "Document does not exist");
    if (!isAdmin(user) && row.uploadedBy !== user.id) return apiError(c, 403, "FORBIDDEN", "Only the uploader or an administrator can delete this document");
    await db.batch([
      db.delete(documents).where(eq(documents.id, row.id)),
      auditInsert(db, { userId: user.id, action: "document.delete", entityType: row.ownerType, entityId: row.ownerId, details: { documentId: row.id, filename: row.filename } }),
    ]);
    await c.env.FILES.delete(row.r2Key);
    return c.body(null, 204);
  });
