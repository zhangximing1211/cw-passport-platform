// Types shared by the Worker API (worker/) and the SPA (src/, app/).
// Keep this file free of runtime dependencies so both sides can import it.

export const PASSPORT_STAGES = ["Generated", "Collected", "Sorted", "Processing", "Cross-border", "Completed"] as const;
export const PASSPORT_STATUSES = ["Pending", "Processing", "Verified", "Completed"] as const;
export const PASSPORT_SORTS = ["id_desc", "id_asc", "updated_desc"] as const;

export const TRANSFER_STATUSES = ["Preparing", "In Transit", "Completed", "Cancelled"] as const;
export const COMPLIANCE_STATUSES = ["Pending Review", "Verified", "Cleared"] as const;
export const TRANSFER_STEPS = ["Created", "Documentation Submitted", "Inspection", "Customs / Compliance Review", "Cleared", "Transport", "Received"] as const;
/** Steps only a regulator (or admin) may record. */
export const REGULATORY_STEPS = ["Inspection", "Customs / Compliance Review", "Cleared"] as const;

export const LISTING_STATUSES = ["Pending", "Processing", "Verified"] as const;
/** draft → minted (on-chain) → listed (buyers can trade) → delisted (sold out, material reused, or withdrawn). */
export const MINT_STATUSES = ["draft", "minted", "listed", "delisted"] as const;
export const TRADE_STATUSES = ["In Progress", "Completed", "Settled", "Cancelled"] as const;

export const ORIGINS = ["Hong Kong", "Macau"] as const;
/** Cross-border destinations and the code used in transfer IDs (CBT-HK-SZ-…). */
export const DESTINATIONS = { Shenzhen: "SZ", Dongguan: "DG", Zhuhai: "ZH", Foshan: "FS", Guangzhou: "GZ", Zhongshan: "ZS" } as const;
/** Every region the platform serves, with its code. */
export const REGIONS = { "Hong Kong": "HK", Macau: "MO", ...DESTINATIONS } as const;
export const TRANSPORT_TYPES = ["Road Freight", "River Barge", "Sea Freight"] as const;
export const PASSPORT_CATEGORIES = ["Concrete", "Metal", "Timber", "Glass", "Mixed Waste"] as const;
export const LISTING_CATEGORIES = ["Concrete", "Steel", "Metal", "Timber", "Glass", "Mixed"] as const;
/** Stages a passport can be registered at; later stages are reached through events. */
export const INITIAL_STAGES = ["Generated", "Collected", "Sorted", "Processing"] as const;
/** Stages a user can record by hand ("Cross-border" only comes from a transfer's Transport step). */
export const MANUAL_STAGES = ["Collected", "Sorted", "Processing", "Completed"] as const;

export const DOCUMENT_OWNER_TYPES = ["passport", "transfer", "listing"] as const;
export const DOCUMENT_KINDS = ["Material Declaration", "Transfer Document", "Inspection Report", "Receiving Certificate", "Processing Record", "Material Photo", "Other"] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_CONTENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

export const USER_TYPES = ["Construction Waste Generator", "Transporter", "Processing / Disposal Unit", "Regulatory Agency", "Other"] as const;
/** Regulator is granted by an administrator, never chosen at sign-up. */
export const USER_ROLES = ["admin", "regulator", "member"] as const;

export const EXPORT_KINDS = ["passports", "transfers", "listings", "trades", "demands"] as const;

export type PassportStage = (typeof PASSPORT_STAGES)[number];
export type PassportStatus = (typeof PASSPORT_STATUSES)[number];
export type PassportSort = (typeof PASSPORT_SORTS)[number];
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export type TransferStep = (typeof TRANSFER_STEPS)[number];
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type MintStatus = (typeof MINT_STATUSES)[number];
export type TradeStatus = (typeof TRADE_STATUSES)[number];
export type UserType = (typeof USER_TYPES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type Region = keyof typeof REGIONS;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export type Origin = (typeof ORIGINS)[number];
export type Destination = keyof typeof DESTINATIONS;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type Quantity = { value: number; unit: string };

/** What the signed-in user may do with a record; computed by the server. */
export type Viewer = { canManage: boolean; canRegulate: boolean };

export type PassportDto = {
  id: string;
  material: string;
  category: string;
  project: string;
  quantity: Quantity;
  location: string;
  origin: string;
  stage: PassportStage;
  status: PassportStatus;
  /** ISO 8601, UTC */
  createdAt: string;
  /** ISO 8601, UTC */
  updatedAt: string;
};

export type PassportDetailDto = PassportDto & { viewer: Viewer };

export type PassportEventDto = {
  stage: PassportStage;
  occurredAt: string;
  place: string;
  actor: string;
};

export type TransferDto = {
  id: string;
  passportId: string;
  material: string;
  origin: string;
  destination: string;
  quantity: Quantity;
  /** YYYY-MM-DD */
  departureDate: string;
  compliance: ComplianceStatus;
  status: TransferStatus;
  transportType: string;
  organisation: string;
  /** How many of the seven steps are recorded; TRANSFER_STEPS[stepsCompleted] is the next one. */
  stepsCompleted: number;
};

export type TransferEventDto = {
  step: TransferStep;
  occurredAt: string;
  note: string;
};

export type TransferDetailDto = TransferDto & { events: TransferEventDto[]; viewer: Viewer };

export type ListingDto = {
  id: string;
  passportId: string;
  transferId: string | null;
  material: string;
  category: string;
  quantity: Quantity;
  /** Quantity not yet committed to an open or finished trade. */
  available: number;
  location: string;
  /** YYYY-MM-DD, or null when available now */
  availableFrom: string | null;
  status: ListingStatus;
  seller: string;
  tone: string;
  nftTokenId: string;
  nftType: string;
  mintStatus: MintStatus;
  txHash: string | null;
};

export type ListingDetailDto = ListingDto & { viewer: Viewer };

export type DemandDto = {
  id: string;
  company: string;
  industry: string;
  region: string;
  category: string;
  quantity: Quantity;
  /** YYYY-MM-DD */
  deadline: string;
  contact: string;
  viewer: Viewer;
};

export type CompanyDto = {
  name: string;
  industry: string;
  region: string;
  regionCode: string;
  needs: string;
  capacity: string;
  history: string;
  rating: number;
};

export type MatchDto = {
  id: string;
  score: number;
  reasons: string[];
  listing: Pick<ListingDto, "id" | "material" | "seller" | "nftTokenId" | "category">;
  demand: Pick<DemandDto, "id" | "company" | "industry" | "region" | "category">;
  /** Largest quantity a trade on this pair could have right now. */
  suggestedQuantity: number;
};

export type TradeDto = {
  id: string;
  listingId: string;
  nftTokenId: string;
  demandId: string;
  buyer: string;
  seller: string;
  quantity: Quantity;
  priceHkd: number;
  status: TradeStatus;
  txHash: string | null;
  /** YYYY-MM-DD */
  tradedOn: string;
  /** isSeller: may complete/settle; isBuyer: may cancel while in progress (so may the seller). */
  viewer: { isBuyer: boolean; isSeller: boolean };
};

export type AlertCode = "PASSPORTS_PENDING" | "TRANSFERS_PENDING_REVIEW" | "LISTINGS_PENDING" | "LISTINGS_UNMINTED";

export type Kpi = { value: number; /** % change of new records, last N days vs the N before; null when not computable */ trend: number | null };

export type OverviewStats = {
  days: number;
  kpis: { passports: Kpi; activeBatches: Kpi; transfers: Kpi; listings: Kpi; volumeTonnes: Kpi };
  flow: { name: string; count: number; tonnes: number }[];
  distribution: { category: string; tonnes: number; share: number }[];
  /** The SPA turns `code` into a localised message. */
  alerts: { code: AlertCode; priority: "High" | "Medium" | "Low"; count: number }[];
};

export type TransferStats = {
  total: number;
  volumeTonnes: number;
  /** Preparing, or compliance still pending review. */
  pending: number;
  inTransit: number;
  completed: number;
  /** The most recent transfer still in transit (else the most recent one), for the route panel. */
  featured: TransferDetailDto | null;
};

export type MaterialStats = {
  items: { category: string; material: string; passports: number; tonnes: number; byStage: Partial<Record<PassportStage, number>> }[];
};

export type MarketplaceSummary = {
  minted: number;
  listings: number;
  matches: number;
  avgScore: number;
  demands: number;
  settled: number;
  trades: number;
  topCategories: { name: string; count: number }[];
  topRegions: { name: string; count: number }[];
};

export type UserDto = {
  id: string;
  username: string;
  email: string;
  company: string;
  userType: UserType;
  role: UserRole;
  contact: string | null;
  phone: string | null;
};

export type AdminUserDto = UserDto & {
  disabled: boolean;
  createdAt: string;
  /** Signed up as a Regulatory Agency but not yet granted the regulator role. */
  regulatorRequested: boolean;
};

export type AuditEntryDto = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: string;
  user: { id: string; username: string; company: string } | null;
};

export const NOTIFICATION_TYPES = [
  "passport.verified",
  "transfer.awaiting_inspection",
  "transfer.cleared",
  "transfer.received",
  "trade.created",
  "trade.completed",
  "trade.settled",
  "trade.cancelled",
  "listing.sold_out",
  "user.regulator_requested",
  "user.role_changed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationDto = {
  id: number;
  type: NotificationType;
  /** Values the SPA interpolates into the localised message (IDs, company names…). */
  params: Record<string, string>;
  link: { kind: "passport" | "transfer" | "listing" | "trade" | "user"; id: string } | null;
  createdAt: string;
  read: boolean;
};

export type DocumentDto = {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  kind: DocumentKind;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
  /** Authenticated download URL. */
  url: string;
};

// ── Write request bodies ────────────────────────────────────────────────────
// The Worker validates these with Zod (worker/routes/*); these types are for the SPA.

export type CreatePassportInput = {
  material: string;
  category: (typeof PASSPORT_CATEGORIES)[number];
  project: string;
  quantity: Quantity;
  location: string;
  origin: Origin;
  stage: (typeof INITIAL_STAGES)[number];
};

export type UpdatePassportInput = Partial<Pick<CreatePassportInput, "material" | "category" | "project" | "quantity" | "location">>;

export type RecordPassportEventInput = {
  stage: (typeof MANUAL_STAGES)[number];
  place: string;
  actor?: string;
  /** Defaults to now. */
  occurredAt?: string;
  /** New current location, if the material moved. */
  location?: string;
};

export type CreateTransferInput = {
  passportId: string;
  destination: Destination;
  departureDate: string;
  transportType: (typeof TRANSPORT_TYPES)[number];
  /** Defaults to the passport's full quantity. */
  quantityValue?: number;
};

export type AdvanceTransferInput = { step: TransferStep; note?: string; occurredAt?: string };

export type CreateListingInput = {
  passportId: string;
  category?: (typeof LISTING_CATEGORIES)[number];
  quantityValue?: number;
  location?: string;
  availableFrom?: string | null;
};

export type CreateTradeInput = { listingId: string; demandId: string; quantityValue: number; priceHkd: number };

export type DemandInput = {
  industry: string;
  region: Region;
  category: (typeof LISTING_CATEGORIES)[number];
  quantity: Quantity;
  deadline: string;
  contact: string;
  /** Admins only: post on behalf of another company. */
  company?: string;
};

export type CompanyInput = { industry: string; region: Region; needs: string; capacity: string; history: string; rating?: number };

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};
