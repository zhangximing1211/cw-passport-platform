import type { Context } from "hono";

/** Max rows in one export; beyond this, filter first. */
export const EXPORT_LIMIT = 10_000;

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote everything; neutralise leading =,+,-,@ so spreadsheet apps don't run it as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

/** CSV download with a UTF-8 BOM so Excel shows Chinese text correctly. */
export function csvResponse(c: Context, filename: string, columns: string[], rows: unknown[][]) {
  const body = "﻿" + [columns.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\r\n");
  return c.body(body, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
}
