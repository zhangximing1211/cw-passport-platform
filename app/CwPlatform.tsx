"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ExportKind, UserDto } from "../shared/api";
import { getCurrentUser, logout } from "../src/api/auth";
import { SESSION_EXPIRED_EVENT } from "../src/api/client";
import { exportCsv, formatHkDateTime, formatQuantity, getPassport } from "../src/api/data";
import { AppProvider, LoadingState, MaterialThumb, StatusBadge, toneOf, useApiData, useApp, type AppContext, type Lang, type View } from "./ui";
import { AdminOnly, AuditView, roleLabel, UsersView } from "./views/admin";
import { AuthScreen, NotificationBell, ProfileModal, type AuthView } from "./views/account";
import { ListingDetail, SellerListings } from "./views/marketplace";
import { MaterialRecords, Overview } from "./views/overview";
import { PassportDetail, PassportRegistry } from "./views/passports";
import { DemandsView, MatchTradesView } from "./views/trades";
import { ComplianceQueue, CrossborderDetail, CrossborderList } from "./views/transfers";

type Route = { view: View; id?: string };

// URL hash routing (#/passport-detail/DPP-HK-2026-00428) keeps the page across reloads and makes links shareable.
const VIEWS: View[] = ["overview", "passport-registry", "passport-detail", "materials", "crossborder", "crossborder-detail", "compliance", "listings", "listing-detail", "demands", "match-trades", "users", "audit"];
function parseHash(): Route {
  const [view, id] = window.location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return VIEWS.includes(view as View) ? { view: view as View, id: id || undefined } : { view: "overview" };
}
const toHash = ({ view, id }: Route) => `#/${view}${id ? `/${encodeURIComponent(id)}` : ""}`;

/** Detail views fall back to the last record opened (or a showcase record) when no ID is given. */
const DEFAULT_IDS: Partial<Record<View, string>> = {
  "passport-detail": "DPP-HK-2026-00428", "crossborder-detail": "CBT-HK-SZ-2026-0128", "listing-detail": "LST-HK-2026-0186",
};
const EXPORT_FOR: Partial<Record<View, ExportKind>> = {
  "passport-registry": "passports", materials: "passports", "passport-detail": "passports", crossborder: "transfers", "crossborder-detail": "transfers",
  compliance: "transfers", listings: "listings", "listing-detail": "listings", "match-trades": "trades", demands: "demands",
};

export default function CwPlatform() {
  const [lang, setLang] = useState<Lang>("en");
  const [user, setUser] = useState<UserDto | null>(null);
  // A password-reset link (?reset=…) opens the reset form instead of restoring a session.
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));
  const [sessionChecked, setSessionChecked] = useState(!!resetToken);
  const [authView, setAuthView] = useState<AuthView>(resetToken ? "reset" : "login");
  const [route, setRoute] = useState<Route>(parseHash);
  const [lastIds, setLastIds] = useState<Partial<Record<View, string>>>({});
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(30);
  const [version, setVersion] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const L = (en: string, zh: string) => (lang === "en" ? en : zh);

  // Restore an existing server session on page load (not while resetting a password).
  useEffect(() => {
    if (resetToken) return;
    getCurrentUser()
      .then((current) => { if (current) setUser(current); })
      .catch((error: unknown) => console.warn("Could not reach the API to restore the session", error))
      .finally(() => setSessionChecked(true));
  }, [resetToken]);

  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); setDrawerId(null); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const notify = (text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "error" ? 5200 : 2800);
  };

  const go = (view: View, id?: string) => {
    setDrawerId(null); setUserMenuOpen(false); setMobileNav(false);
    const target = { view, id: id ?? lastIds[view] ?? DEFAULT_IDS[view] };
    if (target.id) setLastIds((current) => ({ ...current, [view]: target.id }));
    if (view !== route.view) setSearch("");
    window.location.hash = toHash(target);
    setRoute(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signOut = (message?: string) => {
    setUserMenuOpen(false); setDrawerId(null); setUser(null); setAuthView("login");
    if (message) notify(message);
  };
  const onSessionExpired = useEffectEvent(() => signOut(L("Your session has expired. Please sign in again.", "登入已逾時，請重新登入。")));
  useEffect(() => {
    const handler = () => onSessionExpired();
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") { setDrawerId(null); setUserMenuOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!sessionChecked) return <LoadingState />;
  if (!user) {
    return <AuthScreen view={authView} setView={setAuthView} lang={lang} setLang={setLang} L={L} resetToken={resetToken}
      onSuccess={(message, signedIn) => { setUser(signedIn); notify(message); }} />;
  }

  const isAdmin = user.role === "admin";
  const isRegulator = isAdmin || user.role === "regulator";
  const ctx: AppContext = {
    L, lang, user, isAdmin, isRegulator, go, openPassport: setDrawerId, notify, refresh: () => setVersion((v) => v + 1), version, search, setSearch,
  };

  const displayName = user.contact || user.username;
  const initials = displayName.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";

  const handleGlobalSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const value = search.trim().toUpperCase();
    if (value.startsWith("DPP-")) go("passport-detail", value);
    else if (value.startsWith("CBT-")) go("crossborder-detail", value);
    else if (value.startsWith("LST-")) go("listing-detail", value);
    else if (!["passport-registry", "crossborder", "listings"].includes(route.view)) go("passport-registry");
  };

  const exportKind = EXPORT_FOR[route.view];
  const navSections: { label: string; items: { code: string; label: string; zh: string; target: View; badge?: string }[] }[] = [
    { label: "WORKSPACE", items: [{ code: "OV", label: "Overview", zh: "平台總覽", target: "overview" }] },
    { label: "DIGITAL PASSPORT", items: [
      { code: "PR", label: "Passport Registry", zh: "護照登記冊", target: "passport-registry" },
      { code: "PD", label: "Passport Details", zh: "護照詳情", target: "passport-detail" },
      { code: "MR", label: "Material Records", zh: "材料記錄", target: "materials" },
    ] },
    { label: "CROSS-BORDER DATA", items: [
      { code: "CB", label: "Shipment / Transfer Details", zh: "跨境轉運記錄", target: "crossborder" },
      { code: "CD", label: "Compliance Queue", zh: "合規待辦", target: "compliance" },
    ] },
    { label: "MARKETPLACE", items: [
      { code: "SL", label: "Seller Listings", zh: "賣方刊登", target: "listings" },
      { code: "LD", label: "Listing Details", zh: "刊登詳情", target: "listing-detail" },
      { code: "DM", label: "Buyer Demands", zh: "買方需求", target: "demands" },
    ] },
    { label: "AI MATCHING", items: [{ code: "MT", label: "Match & Trades", zh: "撮合與交易", target: "match-trades" }] },
    ...(isRegulator ? [{ label: "ADMINISTRATION", items: [
      ...(isAdmin ? [{ code: "US", label: "Users", zh: "用戶管理", target: "users" as View }] : []),
      { code: "AL", label: "Audit Log", zh: "審計日誌", target: "audit" as View },
    ] }] : []),
  ];

  const id = route.id ?? DEFAULT_IDS[route.view] ?? "";
  return (
    <AppProvider value={ctx}>
      <main className="app-shell">
        <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
          <button className="brand" onClick={() => go("overview")} aria-label="CW Passport overview">
            <span className="brand-mark"><i /><b>CW</b></span>
            <span><strong>CW Passport</strong><small>Construction Waste<br />Intelligence Platform</small></span>
          </button>
          <nav aria-label="Primary navigation">
            {navSections.map((section) => <div key={section.label} className="nav-group">
              <p className="nav-label">{section.label}</p>
              {section.items.map((item) => <button key={item.label} className={`nav-item ${route.view === item.target ? "active" : ""}`} onClick={() => go(item.target)}><span className="nav-glyph">{item.code}</span><span>{L(item.label, item.zh)}</span></button>)}
            </div>)}
          </nav>
          <div className="sidebar-foot">
            <button className="user-card" onClick={() => setUserMenuOpen(!userMenuOpen)}><span className="avatar">{initials}</span><span><strong>{displayName}</strong><small>{roleLabel(user.role, L)} · {user.company}</small></span><b>•••</b></button>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation">MENU</button>
            <label className="global-search"><span className="search-symbol">⌕</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={handleGlobalSearch} placeholder={L("Search, or enter DPP-/CBT-/LST- ID...", "搜尋，或輸入 DPP-/CBT-/LST- 編號...")} aria-label="Global search" /><kbd>⌘ K</kbd></label>
            <div className="top-actions">
              <select aria-label={L("Date range for overview trends", "總覽趨勢的日期範圍")} value={days} onChange={(event) => { setDays(Number(event.target.value)); if (route.view !== "overview") go("overview"); }}><option value="30">{L("Last 30 days", "最近 30 日")}</option><option value="90">{L("Last 90 days", "最近 90 日")}</option><option value="365">{L("Last 12 months", "最近 12 個月")}</option></select>
              <button disabled={!exportKind} title={exportKind ? undefined : L("Nothing to export on this page", "此頁面沒有可匯出的資料")} onClick={() => { if (exportKind) { exportCsv(exportKind, { q: search.trim() }); notify(L("Export started", "已開始匯出")); } }}><span className="action-code">EX</span>{L("Export", "匯出")}</button>
              <NotificationBell />
              <button className="lang-toggle" onClick={() => setLang(lang === "en" ? "zh" : "en")}>{lang === "en" ? "繁" : "EN"}</button>
              <button className="avatar dark" onClick={() => setUserMenuOpen(!userMenuOpen)} aria-label={L("Account menu", "帳戶選單")}>{initials}</button>
            </div>
          </header>

          {userMenuOpen && <div className="popover user-popover">
            <div className="profile-row"><span className="avatar">{initials}</span><div><strong>{displayName}</strong><small>{user.email}</small></div></div>
            <button onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}>{L("User Profile & Password", "使用者資料及密碼")}</button>
            <button className="signout" onClick={() => { logout().catch((error: unknown) => console.warn("Sign-out request failed", error)).finally(() => signOut()); }}>{L("Sign out", "登出")}</button>
          </div>}

          <div className="content">
            {route.view === "overview" && <Overview days={days} />}
            {route.view === "passport-registry" && <PassportRegistry />}
            {route.view === "passport-detail" && <PassportDetail key={id} id={id} />}
            {route.view === "materials" && <MaterialRecords />}
            {route.view === "crossborder" && <CrossborderList />}
            {route.view === "crossborder-detail" && <CrossborderDetail key={id} id={id} />}
            {route.view === "compliance" && <ComplianceQueue />}
            {route.view === "listings" && <SellerListings />}
            {route.view === "listing-detail" && <ListingDetail key={id} id={id} />}
            {route.view === "demands" && <DemandsView />}
            {route.view === "match-trades" && <MatchTradesView />}
            {route.view === "users" && <AdminOnly><UsersView /></AdminOnly>}
            {route.view === "audit" && <AdminOnly allowRegulator><AuditView /></AdminOnly>}
            <footer><span>CW Passport · Construction Waste Digital Infrastructure</span><span>One Material → One Digital Passport → One Traceable Lifecycle</span></footer>
          </div>
        </section>

        <button type="button" aria-label="Close passport preview" className={`drawer-backdrop ${drawerId ? "visible" : ""}`} onClick={() => setDrawerId(null)} />
        <PassportDrawer id={drawerId} close={() => setDrawerId(null)} />

        {profileOpen && <ProfileModal close={() => setProfileOpen(false)} onUpdated={setUser} />}
        {toast && <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><span>{toast.tone === "error" ? "!" : "✓"}</span>{toast.text}</div>}
        {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      </main>
    </AppProvider>
  );
}

/** Quick passport preview; any passport ID link on the platform opens it. */
function PassportDrawer({ id, close }: { id: string | null; close: () => void }) {
  const { L, go, version } = useApp();
  const passport = useApiData(id ? `drawer|${id}|${version}` : null, (signal) => getPassport(id!, signal));
  const p = id && passport.data?.id === id ? passport.data : null;
  return <aside className={`quick-drawer ${id ? "open" : ""}`} aria-hidden={!id}>
    <div className="drawer-head"><div><p>DIGITAL PASSPORT</p><h2>{L("Quick Preview", "快速預覽")}</h2></div><button onClick={close} aria-label="Close preview">×</button></div>
    {passport.error && id ? <p className="muted-note">{L(`Passport ${id} was not found.`, `找不到護照 ${id}。`)}</p> : !p ? (id ? <LoadingState compact /> : null) : <>
      <MaterialThumb tone={toneOf(p.category)} large />
      <div className="drawer-title"><div><h3>{p.material}</h3><span className="mono-id">{p.id}</span></div><StatusBadge status={p.status} /></div>
      <dl className="detail-list"><div><dt>{L("Quantity", "數量")}</dt><dd>{formatQuantity(p.quantity)}</dd></div><div><dt>{L("Lifecycle stage", "生命週期階段")}</dt><dd>{p.stage}</dd></div><div><dt>{L("Current location", "目前位置")}</dt><dd>{p.location}</dd></div><div><dt>{L("Source project", "來源項目")}</dt><dd>{p.project}</dd></div><div><dt>{L("Last updated", "最後更新")}</dt><dd>{formatHkDateTime(p.updatedAt)}</dd></div></dl>
      <div className="drawer-route"><span>Material</span><i>→</i><span>Passport</span><i>→</i><span>Movement</span></div>
      <button className="primary-btn full" onClick={() => go("passport-detail", p.id)}>{L("View Full Passport", "查看完整護照")} →</button>
    </>}
  </aside>;
}
