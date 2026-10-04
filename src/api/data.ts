import type {
  AdminUserDto, AdvanceTransferInput, AuditEntryDto, CompanyDto, CompanyInput, CreateListingInput, CreatePassportInput, CreateTradeInput,
  CreateTransferInput, DemandDto, DemandInput, DocumentDto, DocumentKind, DocumentOwnerType, ExportKind, ListingDetailDto, ListingDto,
  MarketplaceSummary, MatchDto, MaterialStats, NotificationDto, OverviewStats, Page, PassportDetailDto, PassportDto, PassportEventDto,
  RecordPassportEventInput, TradeDto, TransferDetailDto, TransferDto, TransferStats, UpdatePassportInput, UserRole,
} from "../../shared/api";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload, download, type Query } from "./client";

const enc = encodeURIComponent;

// ── Passports ───────────────────────────────────────────────────────────────

export const listPassports = (query: Query, signal?: AbortSignal) => apiGet<Page<PassportDto>>("/passports", query, signal);
export const getPassportFacets = (signal?: AbortSignal) => apiGet<{ projects: string[]; origins: string[]; locations: string[] }>("/passports/facets", {}, signal);
export const getPassport = (id: string, signal?: AbortSignal) => apiGet<PassportDetailDto>(`/passports/${enc(id)}`, {}, signal);
export const getPassportEvents = (id: string, signal?: AbortSignal) => apiGet<{ items: PassportEventDto[] }>(`/passports/${enc(id)}/events`, {}, signal);
export const createPassport = (input: CreatePassportInput) => apiPost<PassportDto>("/passports", input);
export const updatePassport = (id: string, input: UpdatePassportInput) => apiPatch<PassportDto>(`/passports/${enc(id)}`, input);
export const deletePassport = (id: string) => apiDelete(`/passports/${enc(id)}`);
export const recordPassportEvent = (id: string, input: RecordPassportEventInput) =>
  apiPost<{ passport: PassportDto; event: PassportEventDto }>(`/passports/${enc(id)}/events`, input);
export const verifyPassport = (id: string) => apiPost<PassportDto>(`/passports/${enc(id)}/verify`);

// ── Transfers ───────────────────────────────────────────────────────────────

export const listTransfers = (query: Query, signal?: AbortSignal) => apiGet<Page<TransferDto>>("/transfers", query, signal);
export const getTransfer = (id: string, signal?: AbortSignal) => apiGet<TransferDetailDto>(`/transfers/${enc(id)}`, {}, signal);
export const createTransfer = (input: CreateTransferInput) => apiPost<TransferDetailDto>("/transfers", input);
export const advanceTransfer = (id: string, input: AdvanceTransferInput) => apiPost<TransferDetailDto>(`/transfers/${enc(id)}/events`, input);
export const cancelTransfer = (id: string, reason?: string) => apiPost<TransferDetailDto>(`/transfers/${enc(id)}/cancel`, { reason });

// ── Listings ────────────────────────────────────────────────────────────────

export const listListings = (query: Query, signal?: AbortSignal) => apiGet<Page<ListingDto>>("/listings", query, signal);
export const getListing = (id: string, signal?: AbortSignal) => apiGet<ListingDetailDto>(`/listings/${enc(id)}`, {}, signal);
export const createListing = (input: CreateListingInput) => apiPost<ListingDetailDto>("/listings", input);
export const mintListing = (id: string) => apiPost<ListingDetailDto>(`/listings/${enc(id)}/mint`);
export const publishListing = (id: string) => apiPost<ListingDetailDto>(`/listings/${enc(id)}/publish`);
export const delistListing = (id: string, reason?: string) => apiPost<ListingDetailDto>(`/listings/${enc(id)}/delist`, { reason });

// ── Marketplace ─────────────────────────────────────────────────────────────

export const listDemands = (query: Query, signal?: AbortSignal) => apiGet<Page<DemandDto>>("/demands", query, signal);
export const createDemand = (input: DemandInput) => apiPost<DemandDto>("/demands", input);
export const updateDemand = (id: string, input: Partial<DemandInput>) => apiPatch<DemandDto>(`/demands/${enc(id)}`, input);
export const deleteDemand = (id: string) => apiDelete(`/demands/${enc(id)}`);
export const listCompanies = (signal?: AbortSignal) => apiGet<{ items: CompanyDto[] }>("/companies", {}, signal);
export const getCompany = (name: string, signal?: AbortSignal) => apiGet<CompanyDto & { viewer: { canManage: boolean } }>(`/companies/${enc(name)}`, {}, signal);
export const saveCompany = (name: string, input: CompanyInput) => apiPut<CompanyDto>(`/companies/${enc(name)}`, input);
export const listMatches = (query: Query, signal?: AbortSignal) => apiGet<{ items: MatchDto[]; total: number }>("/matches", query, signal);
export const listTrades = (query: Query, signal?: AbortSignal) => apiGet<Page<TradeDto>>("/trades", query, signal);
export const createTrade = (input: CreateTradeInput) => apiPost<TradeDto>("/trades", input);
export const completeTrade = (id: string) => apiPost<TradeDto>(`/trades/${enc(id)}/complete`);
export const settleTrade = (id: string) => apiPost<TradeDto>(`/trades/${enc(id)}/settle`);
export const cancelTrade = (id: string, reason?: string) => apiPost<TradeDto>(`/trades/${enc(id)}/cancel`, { reason });
export const getMarketplaceSummary = (signal?: AbortSignal) => apiGet<MarketplaceSummary>("/marketplace/summary", {}, signal);

// ── Documents ───────────────────────────────────────────────────────────────

const OWNER_PATHS: Record<DocumentOwnerType, string> = { passport: "passports", transfer: "transfers", listing: "listings" };
export const listDocuments = (ownerType: DocumentOwnerType, ownerId: string, signal?: AbortSignal) =>
  apiGet<{ items: DocumentDto[] }>(`/${OWNER_PATHS[ownerType]}/${enc(ownerId)}/documents`, {}, signal);
export const uploadDocument = (ownerType: DocumentOwnerType, ownerId: string, file: File, kind: DocumentKind) =>
  apiUpload<DocumentDto>(`/${OWNER_PATHS[ownerType]}/${enc(ownerId)}/documents`, file, kind);
export const deleteDocument = (id: string) => apiDelete(`/documents/${enc(id)}`);

// ── Stats, notifications, audit, admin ──────────────────────────────────────

export const getOverviewStats = (days: number, signal?: AbortSignal) => apiGet<OverviewStats>("/stats/overview", { days }, signal);
export const getTransferStats = (signal?: AbortSignal) => apiGet<TransferStats>("/stats/transfers", {}, signal);
export const getMaterialStats = (signal?: AbortSignal) => apiGet<MaterialStats>("/stats/materials", {}, signal);
export const listNotifications = (signal?: AbortSignal) => apiGet<{ items: NotificationDto[]; unread: number }>("/notifications", {}, signal);
export const markNotificationRead = (id: number) => apiPost<void>(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => apiPost<void>("/notifications/read-all");
export const listAudit = (query: Query, signal?: AbortSignal) => apiGet<Page<AuditEntryDto>>("/audit", query, signal);
export const listUsers = (query: Query, signal?: AbortSignal) => apiGet<Page<AdminUserDto>>("/admin/users", query, signal);
export const updateUser = (id: string, input: { role?: UserRole; disabled?: boolean }) => apiPatch<AdminUserDto>(`/admin/users/${enc(id)}`, input);

export const exportCsv = (kind: ExportKind, query: Query = {}) => download(`/${kind}/export.csv`, query);

// ── Display formatting ──────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hkParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong", year: "numeric", month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function hk(iso: string) {
  return Object.fromEntries(hkParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
}

/** "2026-09-16T02:42:00.000Z" → "16 Sep 2026 · 10:42" (Hong Kong time). */
export function formatHkDateTime(iso: string): string {
  const p = hk(iso);
  return `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year} · ${p.hour}:${p.minute}`;
}

/** "2026-09-16T02:42:00.000Z" → "16 Sep 2026" (Hong Kong time). */
export const formatHkDate = (iso: string) => formatHkDateTime(iso).split(" · ")[0];

/** "2026-09-18" → "18 Sep 2026". Calendar dates carry no time zone, so no conversion. */
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

export const formatQuantity = ({ value, unit }: { value: number; unit: string }) => `${value.toLocaleString("en-US")} ${unit}`;
export const formatTonnes = (value: number) => `${Math.round(value).toLocaleString("en-US")} t`;
export const formatHash = (hash: string | null) => hash ? `${hash.slice(0, 14)}…${hash.slice(-4)}` : "—";
export const formatHkd = (amount: number) => `HK$ ${amount.toLocaleString("en-US")}`;
export const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
export const todayIso = () => new Date().toISOString().slice(0, 10);
