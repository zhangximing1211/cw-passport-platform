// Shared building blocks for the CW Passport views: app context, data loading, and the
// small presentational components every page uses.

import { createContext, useContext, useEffect, useEffectEvent, useState, type FormEvent, type ReactNode } from "react";
import type { UserDto } from "../shared/api";
import { ApiError } from "../src/api/client";

export type Lang = "en" | "zh";
export type L = (en: string, zh: string) => string;

export type View =
  | "overview" | "passport-registry" | "passport-detail" | "materials"
  | "crossborder" | "crossborder-detail" | "compliance"
  | "listings" | "listing-detail" | "demands" | "match-trades"
  | "users" | "audit";

export type AppContext = {
  L: L;
  lang: Lang;
  user: UserDto;
  isAdmin: boolean;
  isRegulator: boolean;
  /** Switch page; `id` selects the record for detail views. */
  go: (view: View, id?: string) => void;
  /** Opens the passport quick-preview drawer. */
  openPassport: (id: string) => void;
  notify: (message: string, tone?: "ok" | "error") => void;
  /** Bump after a write so every list reloads. */
  refresh: () => void;
  version: number;
  search: string;
  setSearch: (value: string) => void;
};

const Ctx = createContext<AppContext | null>(null);
export const AppProvider = Ctx.Provider;
export function useApp(): AppContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp() outside <AppProvider>");
  return value;
}

// ── Data loading ────────────────────────────────────────────────────────────

/**
 * Loads data whenever `key` changes (`null` = don't load). While a new key loads, the
 * previous data stays visible (`stale` is true) so tables don't flash empty.
 */
export function useApiData<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown } | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadLatest = useEffectEvent(load);
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadLatest(controller.signal)
        .then((data) => setState({ key, data }))
        .catch((error: unknown) => {
          if (controller.signal.aborted || (error instanceof ApiError && error.status === 401)) return;
          setState({ key, error });
        });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, nonce]);
  const current = state?.key === key;
  return {
    data: state?.data,
    error: current ? state?.error : undefined,
    loading: key !== null && !current,
    stale: !current,
    reload: () => setNonce((n) => n + 1),
  };
}

/** Runs a mutation with a busy flag; success → toast, failure → error toast. Returns undefined on failure. */
export function useAction() {
  const { notify, L } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const result = await fn();
      if (success) notify(success);
      return result;
    } catch (error) {
      notify(errorMessage(error, L), "error");
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

const ERROR_TEXT: Record<string, [string, string]> = {
  FORBIDDEN: ["You don't have permission to do that.", "您沒有執行此操作的權限。"],
  REGULATOR_REQUIRED: ["Only regulators can do this. Ask an administrator for the regulator role.", "只有監管機構可以執行此操作，請向管理員申請監管身分。"],
  VALIDATION_ERROR: ["Some fields are missing or invalid.", "部分欄位缺漏或格式不正確。"],
  INVALID_CREDENTIALS: ["Account or password is incorrect. Try demo / demo1234.", "帳戶或密碼不正確，可使用 demo / demo1234。"],
  TOO_MANY_ATTEMPTS: ["Too many failed sign-ins. Try again in 15 minutes.", "登入失敗次數過多，請於 15 分鐘後再試。"],
  ACCOUNT_DISABLED: ["This account has been disabled. Contact your administrator.", "此帳戶已停用，請聯絡管理員。"],
  USERNAME_TAKEN: ["This username already exists.", "此帳戶名稱已被使用。"],
  EMAIL_TAKEN: ["This email is already registered.", "此電子郵件已被註冊。"],
  WRONG_PASSWORD: ["The current password is incorrect.", "目前密碼不正確。"],
  INVALID_RESET_TOKEN: ["This reset link is invalid or has expired. Request a new one.", "重設連結無效或已過期，請重新申請。"],
  PASSPORT_NOT_VERIFIED: ["The passport must be verified by a regulator first.", "護照須先經監管機構驗證。"],
  PASSPORT_STAGE_NOT_ELIGIBLE: ["The material must be sorted or processed first.", "材料須先完成分揀或處理。"],
  PASSPORT_COMPLETED: ["This material has already been reused and cannot be sold.", "此材料已完成再利用，不可再出售。"],
  PASSPORT_LOCKED: ["This passport can no longer be changed.", "此護照已不可修改。"],
  PASSPORT_IN_USE: ["This passport already has transfers or listings.", "此護照已有轉運或刊登記錄。"],
  INVALID_STAGE_TRANSITION: ["Lifecycle stages can only move forward.", "生命週期階段只能向前推進。"],
  EVENT_OUT_OF_ORDER: ["The time cannot be earlier than the previous event.", "時間不可早於上一個事件。"],
  TRANSFER_ALREADY_OPEN: ["This passport already has a transfer in progress.", "此護照已有進行中的轉運。"],
  TRANSFER_CANCELLED: ["This transfer has been cancelled.", "此轉運已取消。"],
  TRANSFER_NOT_CANCELLABLE: ["Only transfers still being prepared can be cancelled.", "只有準備中的轉運可以取消。"],
  TRANSFER_ALREADY_RECEIVED: ["This transfer has already been received.", "此轉運已完成接收。"],
  INVALID_STEP_ORDER: ["Steps must be recorded in order.", "步驟必須依序記錄。"],
  DOCUMENTS_REQUIRED: ["Upload at least one document first.", "請先上傳至少一份文件。"],
  QUANTITY_EXCEEDS_PASSPORT: ["The quantity is larger than the passport covers.", "數量超過護照登記的數量。"],
  QUANTITY_EXCEEDS_AVAILABLE: ["Not enough of this listing is still available.", "此刊登的剩餘可售數量不足。"],
  QUANTITY_EXCEEDS_DEMAND: ["The quantity is larger than the buyer's demand.", "數量超過買方需求。"],
  LISTING_ALREADY_EXISTS: ["This passport is already listed.", "此護照已有刊登。"],
  LISTING_NOT_LISTED: ["Only listings published on the platform can be traded.", "只有已上架的刊登可以交易。"],
  INVALID_MINT_STATUS: ["The listing is not in the right state for this.", "刊登目前的狀態不允許此操作。"],
  INVALID_TRADE_STATUS: ["The trade is not in the right state for this.", "交易目前的狀態不允許此操作。"],
  DEMAND_IN_USE: ["This demand already has trades and is kept for the record.", "此需求已有交易，需保留記錄。"],
  CANNOT_CHANGE_SELF: ["You cannot disable yourself or remove your own administrator role.", "不可停用自己或移除自己的管理員身分。"],
  LAST_ADMIN: ["The platform needs at least one active administrator.", "平台至少需要一位有效的管理員。"],
  UNSUPPORTED_FILE_TYPE: ["Only PDF, PNG, JPEG and WebP files are accepted.", "只接受 PDF、PNG、JPEG、WebP 檔案。"],
  FILE_TOO_LARGE: ["Files must be at most 10 MB.", "檔案不可超過 10 MB。"],
  EMPTY_FILE: ["The file is empty.", "檔案是空的。"],
};

export function errorMessage(error: unknown, L: L): string {
  if (!(error instanceof ApiError) || error.code === "BAD_RESPONSE" || error.status >= 500) {
    return L("Cannot reach the server. Make sure the backend is running (npm run dev).", "無法連線伺服器，請確認後端已啟動（npm run dev）。");
  }
  const text = ERROR_TEXT[error.code];
  return text ? L(text[0], text[1]) : error.message;
}

// ── Presentational components ───────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  verified: "verified", cleared: "verified", listed: "verified", "in transit": "processing", minted: "processing",
  completed: "completed", settled: "completed", delisted: "completed",
  pending: "pending", "pending review": "pending", preparing: "pending", draft: "pending",
  cancelled: "issue", disabled: "issue",
};
export function statusClass(status: string) {
  return STATUS_CLASS[status.toLowerCase()] ?? "processing";
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${statusClass(status)}`}><i />{label ?? status}</span>;
}

export function IdLink({ id, onOpen, className = "" }: { id: string; onOpen: (id: string) => void; className?: string }) {
  return <button type="button" className={`id-link ${className}`} onClick={(event) => { event.stopPropagation(); onOpen(id); }}>{id}</button>;
}

export function PassportLink({ id }: { id: string }) {
  const { openPassport } = useApp();
  return <IdLink id={id} onOpen={openPassport} />;
}

export const toneOf = (category: string) => category.toLowerCase().replace(" ", "-");

export function MaterialThumb({ tone, large = false }: { tone: string; large?: boolean }) {
  return <div className={`material-thumb ${tone} ${large ? "large" : ""}`} aria-label={`${tone} material preview`} role="img"><span>{tone.slice(0, 2).toUpperCase()}</span></div>;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function PanelHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function Breadcrumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return <div className="breadcrumbs">{items.map((item, index) => <span key={item.label} className="crumb">
    {index > 0 && <span className="crumb-sep">/</span>}
    {item.onClick ? <button onClick={item.onClick}>{item.label}</button> : <strong>{item.label}</strong>}
  </span>)}</div>;
}

export function LoadingState({ compact = false }: { compact?: boolean }) {
  if (compact) return <div className="loading-inline" role="status" aria-label="Loading"><span /><span /><span /></div>;
  return <div className="loading-state" role="status" aria-label="Loading"><div className="skeleton line wide" /><div className="skeleton line" /><div className="skeleton-grid">{[1, 2, 3, 4, 5].map((item) => <div className="skeleton card" key={item} />)}</div><div className="skeleton block" /></div>;
}

export function EmptyState({ title, hint, action }: { title?: string; hint?: string; action?: ReactNode }) {
  const { L } = useApp();
  return <div className="empty-state"><span className="empty-mark">0</span><h3>{title ?? L("No matching records", "沒有符合條件的記錄")}</h3><p>{hint ?? L("Try another keyword or clear the active filters.", "請更換關鍵字或清除目前篩選條件。")}</p>{action}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { L } = useApp();
  const notFound = error instanceof ApiError && error.status === 404;
  return <div className="empty-state"><span className="empty-mark">!</span>
    <h3>{notFound ? L("Record not found", "找不到記錄") : L("Something went wrong", "發生錯誤")}</h3>
    <p>{errorMessage(error, L)}</p>
    {onRetry && !notFound && <button className="secondary-btn" onClick={onRetry}>{L("Try again", "重試")}</button>}
  </div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const { L } = useApp();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(total, page * pageSize);
  // A window of up to five page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return <div className="pagination"><p>{L("Showing", "顯示")} <strong>{first}–{last}</strong> {L("of", "共")} <strong>{total}</strong></p><div>
    <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={L("Previous page", "上一頁")}>←</button>
    {numbers.map((n) => <button key={n} className={n === page ? "active" : ""} onClick={() => onPage(n)}>{n}</button>)}
    <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={L("Next page", "下一頁")}>→</button>
  </div></div>;
}

/** Modal form shell matching the platform's register-passport dialog. */
export function ModalForm({ eyebrow, title, subtitle, onClose, onSubmit, submitLabel, busy, error, wide = false, children }: {
  eyebrow: string; title: string; subtitle?: string; onClose: () => void; onSubmit: () => void | Promise<void>;
  submitLabel: string; busy?: boolean; error?: string; wide?: boolean; children: ReactNode;
}) {
  const { L } = useApp();
  const submit = (event: FormEvent) => { event.preventDefault(); void onSubmit(); };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
    <button type="button" className="modal-backdrop" onClick={onClose} aria-label={L("Close", "關閉")} />
    <form className={`modal-card ${wide ? "wide" : ""}`} onSubmit={submit}>
      <div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div><button type="button" onClick={onClose} aria-label={L("Close", "關閉")}>×</button></div>
      {error && <div className="form-message error" role="alert">{error}</div>}
      {children}
      <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>{L("Cancel", "取消")}</button><button className="primary-btn" disabled={busy}>{busy ? L("Saving...", "儲存中...") : submitLabel}</button></div>
    </form>
  </div>;
}

/** Local form state + submit handling for a ModalForm. `submit` returns true when done. */
export function useModalForm<T extends Record<string, string>>(initial: T) {
  const { L } = useApp();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (key: keyof T) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });
  const submit = async (fn: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { await fn(); return true; } catch (err) { setError(errorMessage(err, L)); return false; } finally { setBusy(false); }
  };
  return { form, setForm, bind, error, setError, busy, submit };
}

/** A key/value list in the platform's structured-list style. */
export function Facts({ rows, wide = false }: { rows: [string, ReactNode][]; wide?: boolean }) {
  return <dl className={`structured-list ${wide ? "wide" : ""}`}>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}
