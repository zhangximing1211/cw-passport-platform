import { z } from "zod";

export const nowIso = () => new Date().toISOString();
export const todayIso = () => nowIso().slice(0, 10);

/** Calendar date, YYYY-MM-DD, that actually exists (rejects 2026-02-30). */
export const isoDate = z.iso.date();

/** Event timestamp: ISO 8601 with offset, normalised to UTC, not in the future (5 min clock-skew allowance). */
export const eventTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
  .refine((value) => Date.parse(value) <= Date.now() + 5 * 60_000, "Cannot be in the future");
