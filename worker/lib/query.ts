import { or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

/** Case-insensitive substring match on any column, with LIKE wildcards in user input escaped. */
export function containsAny(columns: AnyColumn[], term: string): SQL | undefined {
  const pattern = `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  return or(...columns.map((column) => sql`${column} LIKE ${pattern} ESCAPE '\\'`));
}

/** Folds the two quantity columns into the API's { value, unit } shape. */
export function withQuantity<T extends { quantityValue: number; quantityUnit: string }>({ quantityValue, quantityUnit, ...rest }: T) {
  return { ...rest, quantity: { value: quantityValue, unit: quantityUnit } };
}
