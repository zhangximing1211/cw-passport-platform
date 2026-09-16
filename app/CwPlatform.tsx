"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Lang = "en" | "zh";
type View = "overview" | "passport-registry" | "passport-detail" | "crossborder" | "crossborder-detail" | "listings" | "listing-detail";
type AuthView = "app" | "login" | "register" | "forgot";
type L = (en: string, zh: string) => string;

type Passport = {
  id: string; material: string; category: string; project: string; quantity: string;
  location: string; stage: string; status: string; updated: string; origin: string;
};

type Transfer = {
  id: string; passportId: string; material: string; origin: string; destination: string;
  quantity: string; departure: string; compliance: string; status: string;
};

type Listing = {
  id: string; passportId: string; transferId?: string; material: string; category: string;
  quantity: string; location: string; available: string; status: string; seller: string; tone: string;
};

const PASSPORTS: Passport[] = [
  { id:"DPP-HK-2026-00428", material:"Recycled Concrete Aggregate", category:"Concrete", project:"Kai Tak Redevelopment", quantity:"320 t", location:"EcoPark, Tuen Mun", stage:"Processing", status:"Verified", updated:"16 Sep 2026 · 10:42", origin:"Hong Kong" },
  { id:"DPP-HK-2026-00417", material:"Structural Steel Sections", category:"Metal", project:"Central Harbour Works", quantity:"84 t", location:"Shenzhen Bay Port", stage:"Cross-border", status:"Verified", updated:"16 Sep 2026 · 09:18", origin:"Hong Kong" },
  { id:"DPP-HK-2026-00396", material:"Reclaimed Timber", category:"Timber", project:"West Kowloon Site C", quantity:"46 t", location:"Yuen Long Sorting Facility", stage:"Sorted", status:"Pending", updated:"15 Sep 2026 · 17:36", origin:"Hong Kong" },
  { id:"DPP-MO-2026-00381", material:"Crushed Glass Aggregate", category:"Glass", project:"Taipa Civic Complex", quantity:"38 t", location:"Macau Transfer Station", stage:"Collected", status:"Verified", updated:"14 Sep 2026 · 15:08", origin:"Macau" },
  { id:"DPP-HK-2026-00372", material:"Mixed Mineral Recovery", category:"Mixed Waste", project:"Northern Metropolis A2", quantity:"216 t", location:"Fanling Recovery Centre", stage:"Processing", status:"Processing", updated:"14 Sep 2026 · 11:25", origin:"Hong Kong" },
  { id:"DPP-HK-2026-00354", material:"Recovered Aluminium", category:"Metal", project:"Admiralty Office Renewal", quantity:"24 t", location:"Kwai Tsing Yard", stage:"Completed", status:"Completed", updated:"13 Sep 2026 · 16:52", origin:"Hong Kong" },
];

const TRANSFERS: Transfer[] = [
  { id:"CBT-HK-SZ-2026-0128", passportId:"DPP-HK-2026-00428", material:"Recycled Concrete Aggregate", origin:"Hong Kong", destination:"Shenzhen", quantity:"320 t", departure:"18 Sep 2026", compliance:"Cleared", status:"In Transit" },
  { id:"CBT-HK-DG-2026-0119", passportId:"DPP-HK-2026-00417", material:"Structural Steel Sections", origin:"Hong Kong", destination:"Dongguan", quantity:"84 t", departure:"15 Sep 2026", compliance:"Verified", status:"Completed" },
  { id:"CBT-MO-ZH-2026-0042", passportId:"DPP-MO-2026-00381", material:"Crushed Glass Aggregate", origin:"Macau", destination:"Zhuhai", quantity:"38 t", departure:"20 Sep 2026", compliance:"Pending Review", status:"Preparing" },
  { id:"CBT-HK-SZ-2026-0113", passportId:"DPP-HK-2026-00372", material:"Mixed Mineral Recovery", origin:"Hong Kong", destination:"Shenzhen", quantity:"216 t", departure:"12 Sep 2026", compliance:"Verified", status:"Completed" },
  { id:"CBT-HK-FS-2026-0108", passportId:"DPP-HK-2026-00354", material:"Recovered Aluminium", origin:"Hong Kong", destination:"Foshan", quantity:"24 t", departure:"10 Sep 2026", compliance:"Cleared", status:"Completed" },
];

const LISTINGS: Listing[] = [
  { id:"LST-HK-2026-0186", passportId:"DPP-HK-2026-00428", transferId:"CBT-HK-SZ-2026-0128", material:"Recycled Concrete Aggregate", category:"Concrete", quantity:"320 t", location:"Tuen Mun, Hong Kong", available:"20 Sep 2026", status:"Verified", seller:"Circular Materials Ltd", tone:"concrete" },
  { id:"LST-HK-2026-0174", passportId:"DPP-HK-2026-00417", transferId:"CBT-HK-DG-2026-0119", material:"Structural Steel Sections", category:"Steel", quantity:"84 t", location:"Kwai Tsing, Hong Kong", available:"Available now", status:"Verified", seller:"Metro Reuse Co.", tone:"steel" },
  { id:"LST-HK-2026-0168", passportId:"DPP-HK-2026-00396", material:"Reclaimed Timber Beams", category:"Timber", quantity:"46 t", location:"Yuen Long, Hong Kong", available:"25 Sep 2026", status:"Pending", seller:"TimberLoop Ltd", tone:"timber" },
  { id:"LST-MO-2026-0062", passportId:"DPP-MO-2026-00381", transferId:"CBT-MO-ZH-2026-0042", material:"Crushed Glass Aggregate", category:"Glass", quantity:"38 t", location:"Taipa, Macau", available:"28 Sep 2026", status:"Verified", seller:"Macau Circular Works", tone:"glass" },
  { id:"LST-HK-2026-0152", passportId:"DPP-HK-2026-00372", material:"Mixed Mineral Recovery", category:"Mixed", quantity:"216 t", location:"Fanling, Hong Kong", available:"22 Sep 2026", status:"Processing", seller:"NorthLoop Resources", tone:"mixed" },
  { id:"LST-HK-2026-0149", passportId:"DPP-HK-2026-00354", transferId:"CBT-HK-FS-2026-0108", material:"Recovered Aluminium", category:"Metal", quantity:"24 t", location:"Kwai Tsing, Hong Kong", available:"Available now", status:"Verified", seller:"Urban Alloy Ltd", tone:"aluminium" },
];

const PASSPORT_TIMELINE = [
  ["Generated", "03 Sep 2026", "Kai Tak", "Gammon Construction", "done"],
  ["Collected", "05 Sep 2026", "Kai Tak", "GreenHaul Logistics", "done"],
  ["Sorted", "07 Sep 2026", "Tuen Mun", "EcoSort HK", "done"],
  ["Processed", "12 Sep 2026", "EcoPark", "Circular Materials Ltd", "current"],
  ["Cross-border Transfer", "Scheduled 18 Sep", "Shenzhen Bay", "Pending", "next"],
  ["Reuse / Buyer", "Not started", "—", "—", "next"],
];

const TRANSFER_TIMELINE = [
  ["Created", "10 Sep · 09:14", "Record initiated", "done"],
  ["Documentation Submitted", "12 Sep · 16:20", "Submission complete", "done"],
  ["Inspection", "14 Sep · 11:05", "Inspection recorded", "done"],
  ["Customs / Compliance Review", "16 Sep · 14:28", "Review complete", "done"],
  ["Cleared", "17 Sep · 09:42", "Transfer cleared", "done"],
  ["Transport", "18 Sep · 08:30", "Currently in transit", "current"],
  ["Received", "Pending", "Awaiting receipt", "next"],
];

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (value.includes("verified") || value.includes("cleared")) return "verified";
  if (value.includes("complete")) return "completed";
  if (value.includes("pending") || value.includes("preparing")) return "pending";
  if (value.includes("issue") || value.includes("expired")) return "issue";
  return "processing";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusClass(status)}`}><i />{status}</span>;
}

function PassportLink({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  return <button type="button" className="id-link" onClick={(event) => { event.stopPropagation(); onOpen(id); }}>{id}</button>;
}

function MaterialThumb({ tone, large = false }: { tone: string; large?: boolean }) {
  return <div className={`material-thumb ${tone} ${large ? "large" : ""}`} aria-label={`${tone} material preview`} role="img"><span>{tone.slice(0, 2).toUpperCase()}</span></div>;
}

function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: React.ReactNode }) {
  return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function PanelHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function EmptyState({ onClear, L }: { onClear: () => void; L: L }) {
  return <div className="empty-state"><span className="empty-mark">0</span><h3>{L("No matching records", "沒有符合條件的記錄")}</h3><p>{L("Try another keyword or clear the active filters.", "請更換關鍵字或清除目前篩選條件。")}</p><button className="secondary-btn" onClick={onClear}>{L("Clear filters", "清除篩選")}</button></div>;
}

export default function CwPlatform() {
  const [lang, setLang] = useState<Lang>("en");
  const [authView, setAuthView] = useState<AuthView>("app");
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [passportFilter, setPassportFilter] = useState("All materials");
  const [transferFilter, setTransferFilter] = useState("All statuses");
  const [listingFilter, setListingFilter] = useState("All materials");
  const [sortAsc, setSortAsc] = useState(false);
  const [listingMode, setListingMode] = useState<"grid" | "table">("grid");
  const [selectedPassport, setSelectedPassport] = useState(PASSPORTS[0]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [registerModal, setRegisterModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const L: L = (en, zh) => lang === "en" ? en : zh;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const navigate = (next: View) => {
    setDrawerOpen(false);
    setUserMenuOpen(false);
    setMobileNav(false);
    if (next === view) return;
    setLoading(true);
    window.setTimeout(() => { setView(next); setSearch(""); setLoading(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, 180);
  };

  const openPassport = (id: string) => {
    setSelectedPassport(PASSPORTS.find((item) => item.id === id) ?? PASSPORTS[0]);
    setDrawerOpen(true);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setDrawerOpen(false); setUserMenuOpen(false); setRegisterModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredPassports = useMemo(() => {
    const query = search.toLowerCase();
    return [...PASSPORTS]
      .filter((item) => passportFilter === "All materials" || item.category === passportFilter)
      .filter((item) => Object.values(item).some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));
  }, [search, passportFilter, sortAsc]);

  const filteredTransfers = useMemo(() => {
    const query = search.toLowerCase();
    return TRANSFERS.filter((item) => transferFilter === "All statuses" || item.status === transferFilter)
      .filter((item) => Object.values(item).some((value) => value.toLowerCase().includes(query)));
  }, [search, transferFilter]);

  const filteredListings = useMemo(() => {
    const query = search.toLowerCase();
    return LISTINGS.filter((item) => listingFilter === "All materials" || item.category === listingFilter)
      .filter((item) => Object.values(item).some((value) => String(value).toLowerCase().includes(query)));
  }, [search, listingFilter]);

  const exportData = () => {
    const rows = view.startsWith("crossborder") ? TRANSFERS : view.startsWith("listing") ? LISTINGS : PASSPORTS;
    const csv = [Object.keys(rows[0]).join(","), ...rows.map((row) => Object.values(row).map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `cw-passport-${view}.csv`; anchor.click(); URL.revokeObjectURL(url);
    showToast(L("Export prepared successfully", "匯出檔案已準備完成"));
  };

  const handleGlobalSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const value = search.trim().toUpperCase();
    if (value.startsWith("DPP")) openPassport(value);
    if (value.startsWith("CBT")) navigate("crossborder-detail");
    if (value.startsWith("LST")) navigate("listing-detail");
  };

  if (authView !== "app") {
    return <AuthScreen view={authView} setView={setAuthView} lang={lang} setLang={setLang} L={L} onSuccess={(message) => { setAuthView("app"); showToast(message); }} />;
  }

  const navSections: { label: string; items: { code: string; label: string; zh: string; target: View }[] }[] = [
    { label:"WORKSPACE", items:[{ code:"OV", label:"Overview", zh:"平台總覽", target:"overview" }] },
    { label:"DIGITAL PASSPORT", items:[
      { code:"PR", label:"Passport Registry", zh:"護照登記冊", target:"passport-registry" },
      { code:"PD", label:"Passport Details", zh:"護照詳情", target:"passport-detail" },
      { code:"MR", label:"Material Records", zh:"材料記錄", target:"passport-registry" },
    ]},
    { label:"CROSS-BORDER DATA", items:[
      { code:"CB", label:"Shipment / Transfer Details", zh:"跨境轉運記錄", target:"crossborder" },
      { code:"CD", label:"Compliance Data", zh:"合規資料", target:"crossborder-detail" },
    ]},
    { label:"MARKETPLACE", items:[
      { code:"SL", label:"Seller Listings", zh:"賣方刊登", target:"listings" },
      { code:"LD", label:"Listing Details", zh:"刊登詳情", target:"listing-detail" },
    ]},
  ];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate("overview")} aria-label="CW Passport overview">
          <span className="brand-mark"><i /><b>CW</b></span>
          <span><strong>CW Passport</strong><small>Construction Waste<br />Intelligence Platform</small></span>
        </button>
        <nav aria-label="Primary navigation">
          {navSections.map((section) => <div key={section.label} className="nav-group">
            <p className="nav-label">{section.label}</p>
            {section.items.map((item) => <button key={item.label} className={`nav-item ${view === item.target ? "active" : ""}`} onClick={() => navigate(item.target)}><span className="nav-glyph">{item.code}</span><span>{L(item.label, item.zh)}</span></button>)}
          </div>)}
        </nav>
        <div className="sidebar-foot">
          <button className="user-card" onClick={() => setUserMenuOpen(!userMenuOpen)}><span className="avatar">AL</span><span><strong>Alex Leung</strong><small>Platform Administrator</small></span><b>•••</b></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation">MENU</button>
          <label className="global-search"><span className="search-symbol">⌕</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={handleGlobalSearch} placeholder={L("Search passports, transfers, listings...", "搜尋護照、轉運或刊登資料...")} aria-label="Global search" /><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <select aria-label="Date range" defaultValue="30"><option value="30">{L("Last 30 days", "最近 30 日")}</option><option value="90">{L("Last 90 days", "最近 90 日")}</option><option value="365">{L("This year", "本年度")}</option></select>
            <button onClick={exportData}><span className="action-code">EX</span>{L("Export", "匯出")}</button>
            <button className="lang-toggle" onClick={() => setLang(lang === "en" ? "zh" : "en")}>{lang === "en" ? "繁" : "EN"}</button>
            <button className="avatar dark" onClick={() => setUserMenuOpen(!userMenuOpen)}>AL</button>
          </div>
        </header>

        {userMenuOpen && <div className="popover user-popover">
          <div className="profile-row"><span className="avatar">AL</span><div><strong>Alex Leung</strong><small>alex.leung@cwpassport.hk</small></div></div>
          <button onClick={() => showToast(L("Profile panel opened", "個人資料面板已開啟"))}>{L("User Profile", "使用者資料")}</button>
          <button className="signout" onClick={() => { setUserMenuOpen(false); setAuthView("login"); }}>{L("Sign out", "登出")}</button>
        </div>}

        <div className="content">
          {loading ? <LoadingState /> : <>
            {view === "overview" && <Overview L={L} navigate={navigate} openPassport={openPassport} />}
            {view === "passport-registry" && <PassportRegistry L={L} data={filteredPassports} filter={passportFilter} setFilter={setPassportFilter} sortAsc={sortAsc} setSortAsc={setSortAsc} openPassport={openPassport} navigate={navigate} setSearch={setSearch} onRegister={() => setRegisterModal(true)} exportData={exportData} />}
            {view === "passport-detail" && <PassportDetail L={L} passport={selectedPassport} navigate={navigate} />}
            {view === "crossborder" && <CrossborderData L={L} data={filteredTransfers} filter={transferFilter} setFilter={setTransferFilter} openPassport={openPassport} navigate={navigate} setSearch={setSearch} exportData={exportData} />}
            {view === "crossborder-detail" && <CrossborderDetail L={L} navigate={navigate} openPassport={openPassport} />}
            {view === "listings" && <SellerListings L={L} data={filteredListings} filter={listingFilter} setFilter={setListingFilter} mode={listingMode} setMode={setListingMode} setSearch={setSearch} openPassport={openPassport} navigate={navigate} />}
            {view === "listing-detail" && <ListingDetail L={L} navigate={navigate} openPassport={openPassport} />}
          </>}
          <footer><span>CW Passport · Construction Waste Digital Infrastructure</span><span>One Material → One Digital Passport → One Traceable Lifecycle</span></footer>
        </div>
      </section>

      <button type="button" aria-label="Close passport preview" className={`drawer-backdrop ${drawerOpen ? "visible" : ""}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`quick-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head"><div><p>DIGITAL PASSPORT</p><h2>{L("Quick Preview", "快速預覽")}</h2></div><button onClick={() => setDrawerOpen(false)} aria-label="Close preview">×</button></div>
        <MaterialThumb tone={selectedPassport.category.toLowerCase().replace(" ", "-")} large />
        <div className="drawer-title"><div><h3>{selectedPassport.material}</h3><span className="mono-id">{selectedPassport.id}</span></div><StatusBadge status={selectedPassport.status} /></div>
        <dl className="detail-list"><div><dt>{L("Quantity", "數量")}</dt><dd>{selectedPassport.quantity}</dd></div><div><dt>{L("Lifecycle stage", "生命週期階段")}</dt><dd>{selectedPassport.stage}</dd></div><div><dt>{L("Current location", "目前位置")}</dt><dd>{selectedPassport.location}</dd></div><div><dt>{L("Source project", "來源項目")}</dt><dd>{selectedPassport.project}</dd></div><div><dt>{L("Last updated", "最後更新")}</dt><dd>{selectedPassport.updated}</dd></div></dl>
        <div className="drawer-route"><span>Material</span><i>→</i><span>Passport</span><i>→</i><span>Movement</span></div>
        <button className="primary-btn full" onClick={() => navigate("passport-detail")}>{L("View Full Passport", "查看完整護照")} →</button>
      </aside>

      {registerModal && <RegisterPassportModal L={L} close={() => setRegisterModal(false)} save={() => { setRegisterModal(false); showToast(L("Passport draft prepared", "護照草稿已建立")); }} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    </main>
  );
}

function LoadingState() {
  return <div className="loading-state" role="status" aria-label="Loading"><div className="skeleton line wide" /><div className="skeleton line" /><div className="skeleton-grid">{[1,2,3,4,5].map((item) => <div className="skeleton card" key={item} />)}</div><div className="skeleton block" /></div>;
}

function AuthScreen({ view, setView, lang, setLang, L, onSuccess }: { view: Exclude<AuthView,"app">; setView: (view: AuthView) => void; lang: Lang; setLang: (lang: Lang) => void; L: L; onSuccess: (message: string) => void }) {
  const [form, setForm] = useState({ username:"", password:"", email:"", confirm:"", company:"", userType:"", contact:"", phone:"", identifier:"" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordScore = [form.password.length >= 8, /[A-Z]/.test(form.password) && /[a-z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length;
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); setMessage(""); setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      const users = JSON.parse(localStorage.getItem("cw-passport-users") || "[]") as { username:string; password:string; email:string }[];
      if (view === "login") {
        const valid = (form.username === "demo" && form.password === "demo1234") || users.some((user) => user.username === form.username && user.password === form.password);
        if (!valid) return setMessage(L("Account or password is incorrect. Try demo / demo1234.", "帳戶或密碼不正確，可使用 demo / demo1234。"));
        localStorage.setItem("cw-passport-session", form.username); onSuccess(L("Welcome to the CW Passport workspace", "歡迎進入建廢數碼護照工作區"));
      }
      if (view === "register") {
        if (!form.username || !form.email || !form.company || !form.userType) return setMessage(L("Complete all required fields.", "請填寫所有必填欄位。"));
        if (form.password.length < 8) return setMessage(L("Password must contain at least 8 characters.", "密碼長度至少為 8 個字元。"));
        if (form.password !== form.confirm) return setMessage(L("Passwords do not match.", "兩次輸入的密碼不一致。"));
        if (users.some((user) => user.username === form.username)) return setMessage(L("This username already exists.", "此帳戶名稱已被使用。"));
        localStorage.setItem("cw-passport-users", JSON.stringify([...users, { username:form.username, password:form.password, email:form.email }]));
        setMessage(L("Registration complete. You can now sign in.", "註冊完成，現在可以登入。")); window.setTimeout(() => setView("login"), 900);
      }
      if (view === "forgot") {
        const found = form.identifier === "demo" || users.some((user) => user.username === form.identifier || user.email === form.identifier);
        setMessage(found ? L("Reset instructions have been prepared for your account.", "重設指示已為您的帳戶準備完成。") : L("No matching account was found.", "找不到符合的帳戶。"));
      }
    }, 520);
  };
  return <main className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand"><span className="brand-mark"><i /><b>CW</b></span><div><strong>CW Passport</strong><small>Construction Waste Intelligence Platform</small></div></div>
      <div className="auth-copy"><p className="eyebrow">TRUSTED MATERIAL INFRASTRUCTURE</p><h1>{L("One material. One digital identity. A traceable lifecycle.", "一種材料，一個數碼身份，一條可追溯生命週期。")}</h1><p>{L("Connect construction material identity, cross-border movement and B2B resource listings through one trusted data layer.", "以可信資料層連接建築材料身份、跨境流動與 B2B 資源刊登。")}</p></div>
      <div className="auth-flow"><div><span>01</span><strong>Material</strong><small>Identity</small></div><i>→</i><div><span>02</span><strong>Passport</strong><small>Verification</small></div><i>→</i><div><span>03</span><strong>Movement</strong><small>Traceability</small></div><i>→</i><div><span>04</span><strong>Marketplace</strong><small>Reuse</small></div></div>
      <p className="auth-foot">Digital Passport · Traceability · Cross-border Data · Circular Economy</p>
    </section>
    <section className="auth-panel">
      <div className="auth-lang"><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button><button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>繁中</button></div>
      <form className="auth-form" onSubmit={submit}>
        <p className="eyebrow">CW PASSPORT / SECURE ACCESS</p>
        <h2>{view === "login" ? L("Sign in to your workspace", "登入您的工作區") : view === "register" ? L("Register an organisation account", "註冊機構帳戶") : L("Recover account access", "恢復帳戶存取權")}</h2>
        <p className="form-intro">{view === "login" ? L("Manage construction waste passports and material movements.", "管理建築廢棄物護照與材料流轉。") : view === "register" ? L("Create an account for your company or organisation.", "為您的公司或機構建立帳戶。") : L("Enter your username or email to prepare reset instructions.", "輸入帳戶名稱或電子郵件以取得重設指示。")}</p>
        {message && <div className={`form-message ${message.includes("complete") || message.includes("prepared") || message.includes("完成") || message.includes("準備") ? "success" : "error"}`}>{message}</div>}
        {view === "login" && <><label>{L("Username", "帳戶名稱")}<input value={form.username} onChange={(event) => update("username", event.target.value)} placeholder="demo" required /></label><label>{L("Password", "密碼")}<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="demo1234" required /></label><div className="form-between"><button type="button" className="text-btn" onClick={() => setView("register")}>{L("Register account", "註冊帳戶")}</button><button type="button" className="text-btn" onClick={() => setView("forgot")}>{L("Forgot password?", "忘記密碼？")}</button></div></>}
        {view === "register" && <><div className="form-row"><label>{L("Username", "帳戶名稱")}<input value={form.username} onChange={(event) => update("username", event.target.value)} required /></label><label>{L("Email", "電子郵件")}<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required /></label></div><div className="form-row"><label>{L("Password", "密碼")}<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required /><small className={`strength s${passwordScore}`}>{L(["Password strength","Weak","Fair","Good","Strong"][passwordScore], ["密碼強度","弱","一般","良好","強"][passwordScore])}</small></label><label>{L("Confirm password", "確認密碼")}<input type="password" value={form.confirm} onChange={(event) => update("confirm", event.target.value)} required /></label></div><label>{L("Company / Organisation", "企業／機構名稱")}<input value={form.company} onChange={(event) => update("company", event.target.value)} required /></label><div className="form-row"><label>{L("User type", "使用者類型")}<select value={form.userType} onChange={(event) => update("userType", event.target.value)} required><option value="">{L("Select type", "選擇類型")}</option><option>Construction Waste Generator</option><option>Transporter</option><option>Processing / Disposal Unit</option><option>Regulatory Agency</option><option>Other</option></select></label><label>{L("Contact person", "聯絡人")}<input value={form.contact} onChange={(event) => update("contact", event.target.value)} /></label></div><label>{L("Phone number", "手機號碼")}<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+852 0000 0000" /></label><button type="button" className="text-btn back-link" onClick={() => setView("login")}>← {L("Back to sign in", "返回登入")}</button></>}
        {view === "forgot" && <><label>{L("Username or email", "帳戶名稱或電子郵件")}<input value={form.identifier} onChange={(event) => update("identifier", event.target.value)} required /></label><button type="button" className="text-btn back-link" onClick={() => setView("login")}>← {L("Back to sign in", "返回登入")}</button></>}
        <button className="primary-btn full auth-submit" disabled={busy}>{busy ? L("Please wait...", "請稍候...") : view === "login" ? L("Sign in", "登入") : view === "register" ? L("Register account", "註冊帳戶") : L("Prepare reset link", "準備重設連結")}</button>
        {view === "login" && <div className="demo-note"><span>DEMO</span><p>{L("Use demo / demo1234 to review the complete platform.", "使用 demo / demo1234 檢視完整平台。")}</p></div>}
      </form>
    </section>
  </main>;
}

function Overview({ L, navigate, openPassport }: { L: L; navigate: (view: View) => void; openPassport: (id: string) => void }) {
  const kpis = [["Total Digital Passports","12,846","+8.4%","DP"],["Active Material Batches","1,284","+3.2%","MB"],["Cross-border Records","428","+12.1%","CB"],["Active Seller Listings","186","−2.6%","SL"],["Total Material Volume","84,260 t","+6.8%","TV"]];
  const flow = [["Source","1,482","28,460 t"],["Collection","1,206","24,180 t"],["Processing","936","19,740 t"],["Cross-border","428","8,920 t"],["Buyer / Reuse","364","7,680 t"]];
  return <>
    <PageHeader eyebrow={L("WORKSPACE / OVERVIEW", "工作區／平台總覽")} title={L("Construction Waste Intelligence Overview", "建築廢棄物智慧總覽")} subtitle={L("Monitor material passports, cross-border movement and marketplace activity.", "監察材料護照、跨境流動與資源刊登活動。")} actions={<div className="network-status"><span />{L("Data network operational", "資料網絡運作正常")} <strong>99.98%</strong></div>} />
    <section className="kpi-grid" aria-label="Key metrics">{kpis.map(([label,value,trend,code]) => <button className="kpi-card" key={label} onClick={() => navigate(code === "CB" ? "crossborder" : code === "SL" ? "listings" : "passport-registry")}><div className="kpi-top"><span className="mini-icon">{code}</span><span className={trend.startsWith("−") ? "trend down" : "trend"}>{trend.startsWith("−") ? "↘" : "↗"} {trend}</span></div><strong>{value}</strong><p>{label}</p><small>{L("Compared with last period", "與上一期間比較")}</small></button>)}</section>
    <section className="panel flow-panel"><PanelHead title={L("Material Flow Overview", "材料流動總覽")} subtitle={L("Lifecycle status across the construction material network", "建築材料網絡的全生命週期狀態")} action={<button className="text-btn" onClick={() => navigate("passport-registry")}>{L("View material records", "查看材料記錄")} →</button>} /><div className="flow">{flow.map(([name,count,volume], index) => <button className="flow-step" key={name} onClick={() => navigate(index === 3 ? "crossborder" : index === 4 ? "listings" : "passport-registry")}><div className="flow-line"><span className={`flow-dot ${index < 3 ? "complete" : index === 3 ? "current" : ""}`}>{index + 1}</span>{index < flow.length - 1 && <i />}</div><h3>{name}</h3><strong>{count}</strong><small>{volume}</small></button>)}</div></section>
    <section className="overview-split"><article className="panel recent-panel"><PanelHead title={L("Recent Digital Passports", "最近數碼護照")} subtitle={L("Latest material identity activity", "最新材料身份活動")} action={<button className="text-btn" onClick={() => navigate("passport-registry")}>{L("Open registry", "開啟登記冊")} →</button>} /><div className="table-scroll"><table><thead><tr><th>Passport ID</th><th>Material</th><th>Source</th><th>Quantity</th><th>Stage</th><th>Status</th><th>Updated</th></tr></thead><tbody>{PASSPORTS.slice(0,3).map((item) => <tr key={item.id} onClick={() => openPassport(item.id)}><td><PassportLink id={item.id} onOpen={openPassport} /></td><td><strong>{item.material}</strong></td><td>{item.project}</td><td>{item.quantity}</td><td>{item.stage}</td><td><StatusBadge status={item.status} /></td><td>{item.updated.split(" · ")[1]}</td></tr>)}</tbody></table></div></article>
      <article className="panel activity-panel"><PanelHead title={L("Cross-border Activity", "跨境活動")} subtitle={L("Recent jurisdiction movements", "最近跨司法管轄區流動")} action={<button className="text-btn" onClick={() => navigate("crossborder")}>{L("All transfers", "全部轉運")} →</button>} />{TRANSFERS.slice(0,3).map((item) => <button className="route-row" key={item.id} onClick={() => navigate("crossborder-detail")}><span className="route-code">{item.origin === "Hong Kong" ? "HK" : "MO"}</span><div><strong>{item.origin} <b>→</b> {item.destination}</strong><small>{item.material} · {item.quantity}</small></div><StatusBadge status={item.status} /></button>)}</article>
    </section>
    <section className="overview-lower"><article className="panel distribution-panel"><PanelHead title={L("Material Distribution", "材料分佈")} subtitle={L("Registered volume by category", "按類別統計已登記材料量")} /><div className="distribution-content"><div className="donut" role="img" aria-label="Concrete 42%, Steel 24%, Timber 13%, Glass 9%, Mixed Waste 8%, Other 4%"><div><strong>84.3k</strong><small>tonnes</small></div></div><div className="legend">{[["Concrete","42%","c1"],["Steel","24%","c2"],["Timber","13%","c3"],["Glass","9%","c4"],["Mixed Waste","8%","c5"],["Other","4%","c6"]].map(([name,value,color]) => <div key={name}><span className={color} /><p>{name}</p><strong>{value}</strong></div>)}</div></div></article>
      <article className="panel alerts-panel"><PanelHead title={L("System & Compliance Alerts", "系統及合規提示")} subtitle={L("Prioritised items requiring attention", "需要處理的優先事項")} action={<span className="alert-count">4 {L("open", "項待處理")}</span>} />{[["PD","8 passports have incomplete source data","Medium","16 Sep"],["CB","3 cross-border documents pending review","High","16 Sep"],["CT","5 material certifications expire within 30 days","Medium","15 Sep"],["SL","6 listings awaiting verification","Low","15 Sep"]].map(([code,text,priority,date]) => <div className="alert-row" key={text}><span className={`alert-icon p-${priority.toLowerCase()}`}>{code}</span><div><strong>{text}</strong><small>{priority} priority · {date}</small></div><button onClick={() => navigate(code === "CB" ? "crossborder" : code === "SL" ? "listings" : "passport-registry")}>Review →</button></div>)}</article>
    </section>
  </>;
}

function PassportRegistry({ L, data, filter, setFilter, sortAsc, setSortAsc, openPassport, navigate, setSearch, onRegister, exportData }: { L:L; data:Passport[]; filter:string; setFilter:(value:string)=>void; sortAsc:boolean; setSortAsc:(value:boolean)=>void; openPassport:(id:string)=>void; navigate:(view:View)=>void; setSearch:(value:string)=>void; onRegister:()=>void; exportData:()=>void }) {
  return <><PageHeader eyebrow={L("DIGITAL PASSPORT / REGISTRY", "數碼護照／登記冊")} title={L("Digital Passport Registry", "數碼護照登記冊")} subtitle={L("Manage and track digital identities for construction waste materials.", "管理及追蹤建築廢棄材料的數碼身份。")} actions={<><button className="secondary-btn" onClick={exportData}>{L("Export", "匯出")}</button><button className="primary-btn" onClick={onRegister}>+ {L("Register Passport", "登記護照")}</button></>} />
    <section className="panel registry-panel"><div className="filter-toolbar"><label className="inline-search"><span>⌕</span><input placeholder={L("Search registry...", "搜尋登記冊...")} onChange={(event) => setSearch(event.target.value)} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All materials</option><option>Concrete</option><option>Metal</option><option>Timber</option><option>Glass</option><option>Mixed Waste</option></select><select aria-label="Project filter"><option>All projects</option><option>Kai Tak Redevelopment</option><option>Central Harbour Works</option></select><select aria-label="Status filter"><option>All statuses</option><option>Verified</option><option>Pending</option><option>Processing</option></select><select aria-label="Location filter"><option>All locations</option><option>Hong Kong</option><option>Macau</option></select><button className="secondary-btn compact" onClick={() => setSortAsc(!sortAsc)}>{L("Sort", "排序")} {sortAsc ? "A→Z" : "Newest"}</button>{filter !== "All materials" && <button className="filter-chip" onClick={() => setFilter("All materials")}>{filter} ×</button>}</div>
      {data.length ? <><div className="table-scroll registry-table"><table><thead><tr><th>Passport ID</th><th>Material</th><th>Category</th><th>Source Project</th><th>Quantity</th><th>Current Location</th><th>Lifecycle Stage</th><th>Verification</th><th>Last Updated</th></tr></thead><tbody>{data.map((item) => <tr key={item.id} tabIndex={0} onClick={() => openPassport(item.id)} onDoubleClick={() => { openPassport(item.id); navigate("passport-detail"); }}><td><PassportLink id={item.id} onOpen={openPassport} /></td><td><div className="material-cell"><MaterialThumb tone={item.category.toLowerCase().replace(" ", "-")} /><strong>{item.material}</strong></div></td><td>{item.category}</td><td>{item.project}</td><td><strong>{item.quantity}</strong></td><td>{item.location}</td><td><span className="stage-label"><i />{item.stage}</span></td><td><StatusBadge status={item.status} /></td><td>{item.updated}</td></tr>)}</tbody></table></div><Pagination L={L} count={data.length} /></> : <EmptyState L={L} onClear={() => { setFilter("All materials"); setSearch(""); }} />}
    </section></>;
}

function PassportDetail({ L, passport, navigate }: { L:L; passport:Passport; navigate:(view:View)=>void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview","Material Data","Source","Processing","Transport","Cross-border","Documents","History"];
  return <><div className="breadcrumbs"><button onClick={() => navigate("passport-registry")}>{L("Digital Passport", "數碼護照")}</button><span>/</span><button onClick={() => navigate("passport-registry")}>{L("Registry", "登記冊")}</button><span>/</span><strong>{passport.id}</strong></div>
    <section className="panel passport-identity"><div className="identity-main"><MaterialThumb tone={passport.category.toLowerCase().replace(" ", "-")} large /><div><p className="eyebrow">DIGITAL MATERIAL IDENTITY</p><div className="title-with-status"><h1>{passport.material}</h1><StatusBadge status={passport.status} /></div><span className="mono-id large-id">{passport.id}</span><div className="identity-meta"><span><small>Category</small><strong>{passport.category}</strong></span><span><small>Quantity</small><strong>{passport.quantity}</strong></span><span><small>Source Project</small><strong>{passport.project}</strong></span><span><small>Origin</small><strong>{passport.origin}</strong></span><span><small>Current Location</small><strong>{passport.location}</strong></span><span><small>Last Updated</small><strong>{passport.updated}</strong></span></div></div></div><div className="credential-panel"><div className="credential-seal"><span>✓</span></div><p>{L("VERIFIED DIGITAL PASSPORT", "已驗證數碼護照")}</p><strong>{passport.id}</strong><small>{L("Created 03 Sep 2026", "建立於 2026 年 9 月 3 日")}</small></div></section>
    <section className="panel lifecycle-panel"><PanelHead title={L("Traceable Lifecycle", "可追溯生命週期")} subtitle={L("Material events from generation to reuse", "由產生到再利用的材料事件")} action={<span className="current-stage"><i />{L("Current: Processed", "目前：已處理")}</span>} /><div className="lifecycle">{PASSPORT_TIMELINE.map(([name,date,place,actor,state], index) => <div className={`life-step ${state}`} key={name}><div className="life-track"><span>{state === "done" ? "✓" : index + 1}</span>{index < PASSPORT_TIMELINE.length - 1 && <i />}</div><div><h3>{name}</h3><strong>{date}</strong><small>{place}</small><small>{actor}</small></div></div>)}</div></section>
    <section className="panel detail-tabs"><div className="tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><div className="tab-content">{tab === "Overview" ? <div className="detail-grid"><div><PanelHead title={L("Material Profile", "材料檔案")} /><dl className="structured-list"><div><dt>Material category</dt><dd>{passport.category}</dd></div><div><dt>Declared quantity</dt><dd>{passport.quantity}</dd></div><div><dt>Source project</dt><dd>{passport.project}</dd></div><div><dt>Origin jurisdiction</dt><dd>{passport.origin}</dd></div><div><dt>Current stage</dt><dd><StatusBadge status={passport.stage} /></dd></div><div><dt>Verification</dt><dd><StatusBadge status={passport.status} /></dd></div></dl></div><div><PanelHead title={L("Connected Records", "關聯記錄")} /><div className="relationship-stack"><button onClick={() => navigate("crossborder-detail")}><span>CB</span><div><small>Cross-border Record</small><strong>CBT-HK-SZ-2026-0128</strong></div><b>→</b></button><button onClick={() => navigate("listing-detail")}><span>SL</span><div><small>Seller Listing</small><strong>LST-HK-2026-0186</strong></div><b>→</b></button></div></div></div> : <TabRecord tab={tab} passport={passport} L={L} />}</div></section>
    <RelationRail navigate={navigate} active="passport" />
  </>;
}

function TabRecord({ tab, passport, L }: { tab:string; passport:Passport; L:L }) {
  const rows: Record<string,[string,string][]> = {
    "Material Data":[["Material name",passport.material],["Category",passport.category],["Quantity",passport.quantity],["Record unit","Metric tonnes"]],
    "Source":[["Source project",passport.project],["Origin",passport.origin],["Generated","03 Sep 2026"],["Source record","Recorded"]],
    "Processing":[["Facility","EcoPark Processing Facility"],["Process stage",passport.stage],["Recorded","12 Sep 2026"],["Operator","Circular Materials Ltd"]],
    "Transport":[["Collection partner","GreenHaul Logistics"],["Collection date","05 Sep 2026"],["Current location",passport.location],["Transport record","Available"]],
    "Cross-border":[["Linked transfer","CBT-HK-SZ-2026-0128"],["Destination","Shenzhen"],["Planned date","18 Sep 2026"],["Status","In Transit"]],
    "Documents":[["Material record","Available"],["Processing record","Available"],["Transfer record","Available"],["Receiving record","Pending"]],
    "History":[["03 Sep 2026","Passport created"],["07 Sep 2026","Sorting event recorded"],["12 Sep 2026","Processing event recorded"],["16 Sep 2026","Verification updated"]],
  };
  return <div className="tab-record"><div><p className="eyebrow">{tab.toUpperCase()}</p><h3>{L("Structured passport information", "結構化護照資料")}</h3><p>{L("Existing record fields are grouped here for faster review.", "現有記錄欄位在此分組，以便更快速審閱。")}</p></div><dl className="structured-list wide">{rows[tab].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></div>;
}

function CrossborderData({ L, data, filter, setFilter, openPassport, navigate, setSearch, exportData }: { L:L; data:Transfer[]; filter:string; setFilter:(value:string)=>void; openPassport:(id:string)=>void; navigate:(view:View)=>void; setSearch:(value:string)=>void; exportData:()=>void }) {
  return <><PageHeader eyebrow={L("CROSS-BORDER DATA / TRANSFERS", "跨境資料／轉運")} title={L("Cross-border Material Data", "跨境材料資料")} subtitle={L("Track construction waste movements across jurisdictions.", "追蹤建築廢棄材料在不同司法管轄區之間的流動。")} actions={<button className="secondary-btn" onClick={exportData}>{L("Export records", "匯出記錄")}</button>} />
    <section className="kpi-grid four">{[["Cross-border Transfers","428","+12.1%","CB"],["Total Volume","8,920 t","+6.8%","TV"],["Pending Records","23","−4.2%","PR"],["Completed Transfers","316","+9.3%","CT"]].map(([label,value,trend,code]) => <article className="kpi-card" key={label}><div className="kpi-top"><span className="mini-icon">{code}</span><span className="trend">{trend.startsWith("−") ? "↘" : "↗"} {trend}</span></div><strong>{value}</strong><p>{label}</p><small>Compared with last period</small></article>)}</section>
    <section className="panel route-panel"><PanelHead title={L("Primary Material Route", "主要材料路線")} subtitle="CBT-HK-SZ-2026-0128 · Recycled Concrete Aggregate · 320 t" action={<StatusBadge status="Cleared" />} /><div className="route-visual"><button><span className="port-code">HK</span><div><small>ORIGIN</small><strong>Hong Kong</strong><p>Departure · 18 Sep, 08:30</p></div></button><div className="route-connector"><span>Road freight · 42 km</span><i><b /></i><em>Cleared</em></div><button><span className="port-code current">SB</span><div><small>BORDER / PORT</small><strong>Shenzhen Bay Port</strong><p>Inspection · Recorded</p></div></button><div className="route-connector"><span>Estimated · 14:30</span><i><b /></i><em>In transit</em></div><button><span className="port-code muted">SZ</span><div><small>DESTINATION</small><strong>Shenzhen</strong><p>Receiving record · Pending</p></div></button></div></section>
    <section className="panel records-panel"><PanelHead title={L("Cross-border Records", "跨境記錄")} subtitle={L("Material movements and compliance states", "材料流動及合規狀態")} /><div className="filter-toolbar"><label className="inline-search"><span>⌕</span><input placeholder={L("Search transfer records...", "搜尋轉運記錄...")} onChange={(event) => setSearch(event.target.value)} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All statuses</option><option>In Transit</option><option>Completed</option><option>Preparing</option></select><select><option>All origins</option><option>Hong Kong</option><option>Macau</option></select><select><option>All destinations</option><option>Shenzhen</option><option>Dongguan</option><option>Zhuhai</option></select>{filter !== "All statuses" && <button className="filter-chip" onClick={() => setFilter("All statuses")}>{filter} ×</button>}</div>{data.length ? <><div className="table-scroll"><table><thead><tr><th>Transfer ID</th><th>Passport ID</th><th>Material</th><th>Origin</th><th>Destination</th><th>Quantity</th><th>Departure</th><th>Compliance</th><th>Transfer Status</th></tr></thead><tbody>{data.map((item) => <tr key={item.id} onClick={() => navigate("crossborder-detail")}><td><button className="id-link transfer-link" onClick={() => navigate("crossborder-detail")}>{item.id}</button></td><td><PassportLink id={item.passportId} onOpen={openPassport} /></td><td><strong>{item.material}</strong></td><td>{item.origin}</td><td>{item.destination}</td><td><strong>{item.quantity}</strong></td><td>{item.departure}</td><td><StatusBadge status={item.compliance} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div><Pagination L={L} count={data.length} /></> : <EmptyState L={L} onClear={() => { setFilter("All statuses"); setSearch(""); }} />}</section>
  </>;
}

function CrossborderDetail({ L, navigate, openPassport }: { L:L; navigate:(view:View)=>void; openPassport:(id:string)=>void }) {
  return <><div className="breadcrumbs"><button onClick={() => navigate("crossborder")}>{L("Cross-border Data", "跨境資料")}</button><span>/</span><button onClick={() => navigate("crossborder")}>{L("Transfer Records", "轉運記錄")}</button><span>/</span><strong>CBT-HK-SZ-2026-0128</strong></div>
    <section className="panel transfer-hero"><div><p className="eyebrow">CROSS-BORDER TRANSFER</p><div className="title-with-status"><h1>CBT-HK-SZ-2026-0128</h1><StatusBadge status="In Transit" /></div><div className="hero-route"><span>Hong Kong</span><i><b /></i><span>Shenzhen</span></div></div><dl><div><dt>Material</dt><dd>Recycled Concrete Aggregate</dd></div><div><dt>Quantity</dt><dd>320 t</dd></div><div><dt>Associated Passport</dt><dd><PassportLink id="DPP-HK-2026-00428" onOpen={openPassport} /></dd></div><div><dt>Organisation</dt><dd>Circular Materials Ltd</dd></div><div><dt>Transfer Date</dt><dd>18 Sep 2026</dd></div></dl></section>
    <section className="transfer-layout"><article className="panel vertical-timeline-panel"><PanelHead title={L("Transfer Timeline", "轉運時間線")} subtitle={L("Recorded events from creation to receipt", "由建立至接收的已記錄事件")} /><div className="vertical-timeline">{TRANSFER_TIMELINE.map(([name,date,note,state], index) => <div className={`timeline-event ${state}`} key={name}><div className="event-track"><span>{state === "done" ? "✓" : index + 1}</span>{index < TRANSFER_TIMELINE.length - 1 && <i />}</div><div><h3>{name}</h3><strong>{date}</strong><p>{note}</p></div>{state === "current" && <StatusBadge status="In Transit" />}</div>)}</div></article><aside className="transfer-side"><section className="panel"><PanelHead title={L("Transfer Summary", "轉運摘要")} /><dl className="detail-list"><div><dt>Origin</dt><dd>Hong Kong</dd></div><div><dt>Destination</dt><dd>Shenzhen</dd></div><div><dt>Transport Type</dt><dd>Road Freight</dd></div><div><dt>Material Volume</dt><dd>320 t</dd></div><div><dt>Passport ID</dt><dd><PassportLink id="DPP-HK-2026-00428" onOpen={openPassport} /></dd></div></dl></section><section className="panel compliance-panel"><PanelHead title={L("Compliance Status", "合規狀態")} subtitle={L("Existing transfer documents", "現有轉運文件")} />{[["Material Declaration","Verified"],["Transfer Document","Verified"],["Receiving Certificate","Pending"]].map(([name,status]) => <div className="document-row" key={name}><span>DOC</span><div><strong>{name}</strong><small>Record attached</small></div><StatusBadge status={status} /></div>)}</section></aside></section>
    <RelationRail navigate={navigate} active="movement" />
  </>;
}

function SellerListings({ L, data, filter, setFilter, mode, setMode, setSearch, openPassport, navigate }: { L:L; data:Listing[]; filter:string; setFilter:(value:string)=>void; mode:"grid"|"table"; setMode:(mode:"grid"|"table")=>void; setSearch:(value:string)=>void; openPassport:(id:string)=>void; navigate:(view:View)=>void }) {
  return <><PageHeader eyebrow={L("MARKETPLACE / SELLER LISTINGS", "資源市場／賣方刊登")} title={L("Seller Listings", "賣方刊登")} subtitle={L("Discover available construction waste and recovered materials.", "探索可用的建築廢棄物及再生材料。")} actions={<div className="view-toggle"><button className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")}>GRID</button><button className={mode === "table" ? "active" : ""} onClick={() => setMode("table")}>TABLE</button></div>} />
    <section className="market-search-panel"><label><span>⌕</span><input placeholder={L("Search available materials...", "搜尋可用材料...")} onChange={(event) => setSearch(event.target.value)} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All materials</option><option>Concrete</option><option>Steel</option><option>Timber</option><option>Glass</option><option>Mixed</option><option>Metal</option></select><select><option>Any quantity</option><option>Under 50 t</option><option>50–200 t</option><option>Over 200 t</option></select><select><option>All locations</option><option>Hong Kong</option><option>Macau</option></select><select><option>Any availability</option><option>Available now</option><option>Upcoming</option></select><select><option>Any verification</option><option>Verified</option><option>Pending</option></select></section>
    <div className="listing-summary"><p><strong>{data.length}</strong> {L("material listings", "項材料刊登")} <span>·</span> {L("B2B resource availability", "B2B 資源供應")}</p>{filter !== "All materials" && <button className="filter-chip" onClick={() => setFilter("All materials")}>{filter} ×</button>}</div>
    {data.length ? mode === "grid" ? <section className="listing-grid">{data.map((item) => <article className="listing-card" key={item.id}><MaterialThumb tone={item.tone} large /><div className="listing-card-body"><div className="listing-card-top"><span className="listing-category">{item.category}</span><StatusBadge status={item.status} /></div><h2>{item.material}</h2><span className="listing-id">{item.id}</span><dl><div><dt>Quantity</dt><dd>{item.quantity}</dd></div><div><dt>Location</dt><dd>{item.location}</dd></div><div><dt>Available</dt><dd>{item.available}</dd></div></dl><div className="passport-strip"><span>DP</span><div><small>Digital Passport</small><PassportLink id={item.passportId} onOpen={openPassport} /></div></div><div className="seller-line"><div><small>SELLER / ORGANISATION</small><strong>{item.seller}</strong></div><button className="secondary-btn" onClick={() => navigate("listing-detail")}>{L("View Details", "查看詳情")} →</button></div></div></article>)}</section> : <section className="panel"><div className="table-scroll"><table><thead><tr><th>Listing</th><th>Material</th><th>Category</th><th>Quantity</th><th>Location</th><th>Availability</th><th>Passport</th><th>Status</th><th></th></tr></thead><tbody>{data.map((item) => <tr key={item.id}><td className="mono-id">{item.id}</td><td><strong>{item.material}</strong></td><td>{item.category}</td><td>{item.quantity}</td><td>{item.location}</td><td>{item.available}</td><td><PassportLink id={item.passportId} onOpen={openPassport} /></td><td><StatusBadge status={item.status} /></td><td><button className="text-btn" onClick={() => navigate("listing-detail")}>View →</button></td></tr>)}</tbody></table></div></section> : <EmptyState L={L} onClear={() => { setFilter("All materials"); setSearch(""); }} />}
  </>;
}

function ListingDetail({ L, navigate, openPassport }: { L:L; navigate:(view:View)=>void; openPassport:(id:string)=>void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview","Material Information","Source","Processing Information","Digital Passport","Seller Information"];
  return <><div className="breadcrumbs"><button onClick={() => navigate("listings")}>{L("Marketplace", "資源市場")}</button><span>/</span><button onClick={() => navigate("listings")}>{L("Seller Listings", "賣方刊登")}</button><span>/</span><strong>LST-HK-2026-0186</strong></div>
    <section className="panel listing-hero"><div className="material-gallery"><MaterialThumb tone="concrete" large /><div className="gallery-thumbs"><button className="active"><MaterialThumb tone="concrete" /></button><button><MaterialThumb tone="concrete-alt" /></button><button><MaterialThumb tone="aggregate" /></button></div></div><div className="listing-info"><div className="listing-title-row"><div><p className="eyebrow">LST-HK-2026-0186 · VERIFIED MATERIAL</p><h1>Recycled Concrete Aggregate</h1><p>Recovered construction material for qualified reuse applications.</p></div><StatusBadge status="Verified" /></div><dl className="listing-facts"><div><dt>Material Category</dt><dd>Concrete</dd></div><div><dt>Available Quantity</dt><dd>320 t</dd></div><div><dt>Current Location</dt><dd>EcoPark, Tuen Mun</dd></div><div><dt>Available From</dt><dd>20 Sep 2026</dd></div><div><dt>Seller / Organisation</dt><dd>Circular Materials Ltd</dd></div><div><dt>Digital Passport</dt><dd><StatusBadge status="Verified" /></dd></div></dl><button className="primary-btn passport-cta" onClick={() => openPassport("DPP-HK-2026-00428")}><span>DP</span>{L("View Digital Passport", "查看數碼護照")} <b>→</b></button></div></section>
    <section className="panel detail-tabs listing-tabs"><div className="tabs" role="tablist">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><div className="tab-content">{tab === "Overview" ? <div className="listing-overview"><div><PanelHead title={L("Material Overview", "材料總覽")} /><p>Processed recycled concrete aggregate associated with a verified material passport and recorded source project. Current availability and location are presented for B2B resource discovery.</p><dl className="structured-list"><div><dt>Source Project</dt><dd>Kai Tak Redevelopment</dd></div><div><dt>Processing Facility</dt><dd>EcoPark Processing Facility</dd></div><div><dt>Recorded Quantity</dt><dd>320 t</dd></div><div><dt>Availability</dt><dd>20 Sep 2026</dd></div></dl></div><div><PanelHead title={L("Connected Data Objects", "關聯資料物件")} /><div className="relationship-stack"><button onClick={() => openPassport("DPP-HK-2026-00428")}><span>DP</span><div><small>Digital Passport</small><strong>DPP-HK-2026-00428</strong></div><b>→</b></button><button onClick={() => navigate("crossborder-detail")}><span>CB</span><div><small>Cross-border Record</small><strong>CBT-HK-SZ-2026-0128</strong></div><b>→</b></button></div></div></div> : <ListingTab tab={tab} L={L} openPassport={openPassport} />}</div></section>
    <section className="panel traceability-panel"><PanelHead title={L("Material Traceability", "材料追溯")} subtitle={L("Source, processing and current location", "來源、處理及目前位置")} /><div className="trace-route"><div><span>01</span><small>SOURCE PROJECT</small><strong>Kai Tak Redevelopment</strong><p>Hong Kong · Generated 03 Sep</p></div><i>→</i><div><span>02</span><small>PROCESSING FACILITY</small><strong>EcoPark Processing Facility</strong><p>Tuen Mun · Processed 12 Sep</p></div><i>→</i><div><span>03</span><small>CURRENT LOCATION</small><strong>Tuen Mun Storage Yard</strong><p>Available from 20 Sep</p></div></div></section>
    <RelationRail navigate={navigate} active="marketplace" />
  </>;
}

function ListingTab({ tab, L, openPassport }: { tab:string; L:L; openPassport:(id:string)=>void }) {
  const rows: Record<string,[string,string][]> = {
    "Material Information":[["Material","Recycled Concrete Aggregate"],["Category","Concrete"],["Quantity","320 t"],["Current Location","EcoPark, Tuen Mun"]],
    "Source":[["Source Project","Kai Tak Redevelopment"],["Origin","Hong Kong"],["Generated","03 Sep 2026"],["Source Status","Recorded"]],
    "Processing Information":[["Facility","EcoPark Processing Facility"],["Recorded Date","12 Sep 2026"],["Organisation","Circular Materials Ltd"],["Record Status","Verified"]],
    "Digital Passport":[["Passport ID","DPP-HK-2026-00428"],["Verification","Verified"],["Lifecycle Stage","Processing"],["Last Updated","16 Sep 2026 · 10:42"]],
    "Seller Information":[["Organisation","Circular Materials Ltd"],["Listing ID","LST-HK-2026-0186"],["Location","Tuen Mun, Hong Kong"],["Availability","20 Sep 2026"]],
  };
  return <div className="tab-record"><div><p className="eyebrow">{tab.toUpperCase()}</p><h3>{L("Listing information", "刊登資料")}</h3><p>{L("Existing material and organisation fields are grouped for review.", "現有材料及機構欄位已分組顯示，方便審閱。")}</p>{tab === "Digital Passport" && <button className="text-btn tab-link" onClick={() => openPassport("DPP-HK-2026-00428")}>{L("Open passport preview", "開啟護照預覽")} →</button>}</div><dl className="structured-list wide">{rows[tab].map(([key,value]) => <div key={key}><dt>{key}</dt><dd className={value.startsWith("DPP") ? "mono-id" : ""}>{value}</dd></div>)}</dl></div>;
}

function RelationRail({ navigate, active }: { navigate:(view:View)=>void; active:"passport"|"movement"|"marketplace" }) {
  const nodes: [string,string,View,string][] = [["Material","Recycled Concrete Aggregate","passport-detail","MA"],["Passport","DPP-HK-2026-00428","passport-detail","DP"],["Movement","CBT-HK-SZ-2026-0128","crossborder-detail","CB"],["Marketplace","LST-HK-2026-0186","listing-detail","SL"]];
  return <section className="relationship-rail" aria-label="Connected material data">{nodes.map(([label,value,target,code], index) => <div key={label} className={label.toLowerCase() === active ? "active" : ""}><button onClick={() => navigate(target)}><span>{code}</span><small>{label}</small><strong>{value}</strong></button>{index < nodes.length - 1 && <i>→</i>}</div>)}</section>;
}

function Pagination({ L, count }: { L:L; count:number }) {
  return <div className="pagination"><p>{L("Showing", "顯示")} <strong>1–{count}</strong> {L("of", "共")} <strong>{count}</strong></p><div><button disabled>←</button><button className="active">1</button><button disabled>2</button><button disabled>3</button><button disabled>→</button></div></div>;
}

function RegisterPassportModal({ L, close, save }: { L:L; close:()=>void; save:()=>void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Register passport"><button className="modal-backdrop" onClick={close} aria-label="Close modal" /><form className="modal-card" onSubmit={(event) => { event.preventDefault(); save(); }}><div className="modal-head"><div><p className="eyebrow">DIGITAL PASSPORT</p><h2>{L("Register Passport", "登記數碼護照")}</h2><span>{L("Create a material identity record using the existing registration fields.", "使用現有登記欄位建立材料身份記錄。")}</span></div><button type="button" onClick={close}>×</button></div><div className="form-row"><label>Material Type<select required><option value="">Select material</option><option>Concrete</option><option>Steel</option><option>Timber</option><option>Glass</option><option>Mixed Waste</option></select></label><label>Material Name<input required placeholder="e.g. Recycled Concrete Aggregate" /></label></div><label>Source Project<input required placeholder="Project name" /></label><div className="form-row"><label>Quantity<input required placeholder="0" /></label><label>Unit<select><option>Metric tonnes</option></select></label></div><div className="form-row"><label>Current Location<input required placeholder="Facility or district" /></label><label>Lifecycle Stage<select><option>Generated</option><option>Collected</option><option>Sorted</option><option>Processing</option></select></label></div><div className="modal-note"><span>ID</span><p>{L("The Passport ID remains assigned by the existing platform workflow.", "護照 ID 仍由現有平台流程分配。")}</p></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={close}>{L("Cancel", "取消")}</button><button className="primary-btn">{L("Prepare Passport Draft", "建立護照草稿")}</button></div></form></div>;
}
