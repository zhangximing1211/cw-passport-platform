import type { Viewer } from "../../shared/api";
import type { UserRow } from "../db/schema";

export const isAdmin = (user: UserRow) => user.role === "admin";

/**
 * Regulators verify passports and record inspections, compliance reviews and clearances.
 * The role is granted by an administrator; choosing "Regulatory Agency" at sign-up only requests it.
 */
export const isRegulator = (user: UserRow) => user.role === "admin" || user.role === "regulator";

export const sameCompany = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Who may change a record: admins, the user who created it, or anyone from the organisation
 * named on it (a transfer's organisation, a listing's seller, a trade's buyer or seller).
 */
export function canManage(user: UserRow, record: { createdBy: string | null; companies?: (string | null | undefined)[] }) {
  if (isAdmin(user) || (record.createdBy !== null && record.createdBy === user.id)) return true;
  return (record.companies ?? []).some((name) => sameCompany(name, user.company));
}

export function viewerOf(user: UserRow, record: { createdBy: string | null; companies?: (string | null | undefined)[] }): Viewer {
  return { canManage: canManage(user, record), canRegulate: isRegulator(user) };
}
