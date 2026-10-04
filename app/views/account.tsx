import { useEffect, useRef, useState, type FormEvent } from "react";
import type { NotificationDto, NotificationType, UserDto, UserType } from "../../shared/api";
import { changePassword, login, register, requestPasswordReset, resetPassword, updateProfile } from "../../src/api/auth";
import { formatHkDateTime, listNotifications, markAllNotificationsRead, markNotificationRead } from "../../src/api/data";
import { errorMessage, ModalForm, useApiData, useApp, useModalForm, type L, type Lang, type View } from "../ui";
import { roleLabel } from "./admin";

// ── Profile & password ──────────────────────────────────────────────────────

export function ProfileModal({ close, onUpdated }: { close: () => void; onUpdated: (user: UserDto) => void }) {
  const { L, user, notify } = useApp();
  const profile = useModalForm({ email: user.email, contact: user.contact ?? "", phone: user.phone ?? "", current: "", next: "", confirm: "" });
  const save = async () => {
    const { form } = profile;
    if (form.next || form.current) {
      if (form.next.length < 8) return profile.setError(L("The new password needs at least 8 characters.", "新密碼至少需要 8 個字元。"));
      if (form.next !== form.confirm) return profile.setError(L("The new passwords do not match.", "兩次輸入的新密碼不一致。"));
    }
    const ok = await profile.submit(async () => {
      const { user: updated } = await updateProfile({ email: form.email, contact: form.contact, phone: form.phone });
      if (form.next) await changePassword(form.current, form.next);
      onUpdated(updated);
    });
    if (ok) { close(); notify(form.next ? L("Profile saved and password changed; other devices were signed out", "資料已儲存並已修改密碼，其他裝置已登出") : L("Profile saved", "個人資料已儲存")); }
  };
  return <ModalForm eyebrow={`${user.username} · ${roleLabel(user.role, L)}`} title={L("User Profile", "使用者資料")} subtitle={L(`${user.company} · ${user.userType}`, `${user.company} · ${user.userType}`)} onClose={close} onSubmit={save} submitLabel={L("Save", "儲存")} busy={profile.busy} error={profile.error}>
    <div className="form-row"><label>{L("Email", "電子郵件")}<input type="email" required {...profile.bind("email")} /></label><label>{L("Contact person", "聯絡人")}<input {...profile.bind("contact")} /></label></div>
    <label>{L("Phone", "電話")}<input {...profile.bind("phone")} /></label>
    <p className="form-section-label">{L("Change password (optional)", "修改密碼（選填）")}</p>
    <div className="form-row"><label>{L("Current password", "目前密碼")}<input type="password" autoComplete="current-password" {...profile.bind("current")} /></label><label>{L("New password", "新密碼")}<input type="password" autoComplete="new-password" {...profile.bind("next")} /></label></div>
    <label>{L("Confirm new password", "確認新密碼")}<input type="password" autoComplete="new-password" {...profile.bind("confirm")} /></label>
  </ModalForm>;
}

// ── Notifications ───────────────────────────────────────────────────────────

const NOTICE_TEXT: Record<NotificationType, (p: Record<string, string>, L: L) => string> = {
  "passport.verified": (p, L) => L(`Passport ${p.passportId} (${p.material}) was verified`, `護照 ${p.passportId}（${p.material}）已通過驗證`),
  "transfer.awaiting_inspection": (p, L) => L(`${p.transferId} from ${p.organisation} awaits inspection`, `${p.organisation} 的 ${p.transferId} 等待檢驗`),
  "transfer.cleared": (p, L) => L(`${p.transferId} was cleared by the regulator`, `${p.transferId} 已獲監管機構放行`),
  "transfer.received": (p, L) => L(`${p.transferId} was received in ${p.destination}`, `${p.transferId} 已於${p.destination}完成接收`),
  "trade.created": (p, L) => L(`${p.buyer} opened trade ${p.tradeId} on ${p.listingId}`, `${p.buyer} 對 ${p.listingId} 發起交易 ${p.tradeId}`),
  "trade.completed": (p, L) => L(`${p.seller} confirmed delivery of ${p.tradeId}`, `${p.seller} 已確認交付 ${p.tradeId}`),
  "trade.settled": (p, L) => L(`${p.seller} confirmed payment for ${p.tradeId}`, `${p.seller} 已確認收到 ${p.tradeId} 的款項`),
  "trade.cancelled": (p, L) => L(`Trade ${p.tradeId} was cancelled by ${p.by}`, `交易 ${p.tradeId} 已被 ${p.by} 取消`),
  "listing.sold_out": (p, L) => L(`${p.listingId} (${p.nftTokenId}) sold out and left the market`, `${p.listingId}（${p.nftTokenId}）已售罄並下架`),
  "user.regulator_requested": (p, L) => L(`${p.username} (${p.company}) requests the regulator role`, `${p.username}（${p.company}）申請監管身份`),
  "user.role_changed": (p, L) => L(`Your role is now: ${p.role}`, `您的角色已變更為：${p.role}`),
};
const LINK_VIEWS: Record<NonNullable<NotificationDto["link"]>["kind"], View> = {
  passport: "passport-detail", transfer: "crossborder-detail", listing: "listing-detail", trade: "match-trades", user: "users",
};

export function NotificationBell() {
  const { L, version, go, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const inbox = useApiData(`notifications|${version}`, listNotifications);
  // Close on Escape or a click anywhere outside the bell and its popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onClick = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);
  const unread = inbox.data?.unread ?? 0;
  const openNotice = async (notice: NotificationDto) => {
    setOpen(false);
    if (!notice.read) await markNotificationRead(notice.id).catch(() => undefined);
    if (notice.link) go(LINK_VIEWS[notice.link.kind], notice.link.kind === "user" || notice.link.kind === "trade" ? undefined : notice.link.id);
    refresh();
  };
  return <div className="notif-wrap" ref={wrap}>
    <button className="notif-button" aria-label={L(`Notifications, ${unread} unread`, `通知，${unread} 則未讀`)} onClick={() => { setOpen(!open); if (!open) inbox.reload(); }}>
      <span aria-hidden>🔔</span>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
    </button>
    {open && <div className="popover notif-popover" role="dialog" aria-label={L("Notifications", "通知")}>
      <div className="notif-head"><strong>{L("Notifications", "通知")}</strong>{unread > 0 && <button className="text-btn" onClick={async () => { await markAllNotificationsRead().catch(() => undefined); refresh(); }}>{L("Mark all read", "全部標為已讀")}</button>}</div>
      {!inbox.data ? <p className="muted-note">{L("Loading...", "載入中...")}</p> : inbox.data.items.length === 0 ? <p className="muted-note">{L("No notifications yet.", "尚無通知。")}</p> :
        <ul>{inbox.data.items.map((notice) => <li key={notice.id} className={notice.read ? "" : "unread"}><button onClick={() => openNotice(notice)}><span>{NOTICE_TEXT[notice.type](notice.params, L)}</span><small>{formatHkDateTime(notice.createdAt)}</small></button></li>)}</ul>}
    </div>}
  </div>;
}

// ── Sign-in, sign-up, password reset ────────────────────────────────────────

export type AuthView = "login" | "register" | "forgot" | "reset";

export function AuthScreen({ view, setView, lang, setLang, L, resetToken, onSuccess }: {
  view: AuthView; setView: (view: AuthView) => void; lang: Lang; setLang: (lang: Lang) => void; L: L; resetToken: string | null;
  onSuccess: (message: string, user: UserDto) => void;
}) {
  const [form, setForm] = useState({ username: "", password: "", email: "", confirm: "", company: "", userType: "", contact: "", phone: "", identifier: "" });
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordScore = [form.password.length >= 8, /[A-Z]/.test(form.password) && /[a-z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length;
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fail = (text: string) => setMessage({ text, ok: false });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(null);
    if (view === "register" || view === "reset") {
      if (view === "register" && (!form.username || !form.email || !form.company || !form.userType)) return fail(L("Complete all required fields.", "請填寫所有必填欄位。"));
      if (form.password.length < 8) return fail(L("Password must contain at least 8 characters.", "密碼長度至少為 8 個字元。"));
      if (form.password !== form.confirm) return fail(L("Passwords do not match.", "兩次輸入的密碼不一致。"));
    }
    setBusy(true);
    try {
      if (view === "login") {
        const { user } = await login(form.username, form.password);
        onSuccess(L("Welcome to the CW Passport workspace", "歡迎進入建廢數碼護照工作區"), user);
      }
      if (view === "register") {
        const { regulatorRequested } = await register({ username: form.username, email: form.email, password: form.password, company: form.company, userType: form.userType as UserType, contact: form.contact, phone: form.phone });
        setMessage({ ok: true, text: regulatorRequested
          ? L("Registration complete. Your regulator role will be active once an administrator approves it; you can sign in now.", "註冊完成。監管身份須由管理員審核後生效；您現在可以登入。")
          : L("Registration complete. You can now sign in.", "註冊完成，現在可以登入。") });
        window.setTimeout(() => setView("login"), regulatorRequested ? 2600 : 900);
      }
      if (view === "forgot") {
        await requestPasswordReset(form.identifier);
        setMessage({ ok: true, text: L("If an account matches, reset instructions will be sent to its email address.", "如帳戶存在，重設指示將發送至其電子郵件。") });
      }
      if (view === "reset" && resetToken) {
        await resetPassword(resetToken, form.password);
        window.history.replaceState(null, "", window.location.pathname);
        setMessage({ ok: true, text: L("Password updated. You can now sign in.", "密碼已更新，現在可以登入。") });
        window.setTimeout(() => setView("login"), 1200);
      }
    } catch (error) {
      fail(errorMessage(error, L));
    } finally {
      setBusy(false);
    }
  };
  const title = { login: L("Sign in to your workspace", "登入您的工作區"), register: L("Register an organisation account", "註冊機構帳戶"), forgot: L("Recover account access", "恢復帳戶存取權"), reset: L("Choose a new password", "設定新密碼") }[view];
  const intro = { login: L("Manage construction waste passports and material movements.", "管理建築廢棄物護照與材料流轉。"), register: L("Create an account for your company or organisation.", "為您的公司或機構建立帳戶。"), forgot: L("Enter your username or email to receive a reset link.", "輸入帳戶名稱或電子郵件以取得重設連結。"), reset: L("The link is valid for 30 minutes and can be used once.", "連結 30 分鐘內有效，只可使用一次。") }[view];
  const submitLabel = { login: <>{L("Sign in", "登入")} →</>, register: L("Register account", "註冊帳戶"), forgot: L("Send reset link", "發送重設連結"), reset: L("Set new password", "設定新密碼") }[view];
  const strength = <small className={`strength s${passwordScore}`}>{L(["Password strength", "Weak", "Fair", "Good", "Strong"][passwordScore], ["密碼強度", "弱", "一般", "良好", "強"][passwordScore])}</small>;

  return <main className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand"><span className="brand-mark"><i /><b>CW</b></span><div><strong>CW Passport</strong><small>Construction Waste Intelligence Platform</small></div></div>
      <div className="auth-copy"><p className="eyebrow">TRUSTED MATERIAL INFRASTRUCTURE</p><h1>{L("One material. One digital identity. ", "一種材料，一個數碼身份，")}<em>{L("A traceable lifecycle.", "一條可追溯生命週期。")}</em></h1><p>{L("Connect construction material identity, cross-border movement and B2B resource listings through one trusted data layer.", "以可信資料層連接建築材料身份、跨境流動與 B2B 資源刊登。")}</p></div>
      <div className="auth-flow"><div><span>01</span><strong>Material</strong><small>Identity</small></div><i>→</i><div><span>02</span><strong>Passport</strong><small>Verification</small></div><i>→</i><div><span>03</span><strong>Movement</strong><small>Traceability</small></div><i>→</i><div><span>04</span><strong>Marketplace</strong><small>Reuse</small></div></div>
      <p className="auth-foot">Digital Passport · Traceability · Cross-border Data · Circular Economy</p>
    </section>
    <section className="auth-panel">
      <div className="auth-lang"><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button><button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>繁中</button></div>
      <form className="auth-form" onSubmit={submit}>
        <p className="eyebrow">CW PASSPORT / SECURE ACCESS</p><h2>{title}</h2><p className="form-intro">{intro}</p>
        {message && <div className={`form-message ${message.ok ? "success" : "error"}`} role={message.ok ? "status" : "alert"}>{message.text}</div>}
        {view === "login" && <><label>{L("Username or email", "帳戶名稱或電子郵件")}<input value={form.username} onChange={(event) => update("username", event.target.value)} placeholder="demo" autoComplete="username" required /></label><label>{L("Password", "密碼")}<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="demo1234" autoComplete="current-password" required /></label><div className="form-between"><button type="button" className="text-btn" onClick={() => setView("register")}>{L("Register account", "註冊帳戶")}</button><button type="button" className="text-btn" onClick={() => setView("forgot")}>{L("Forgot password?", "忘記密碼？")}</button></div></>}
        {view === "register" && <><div className="form-row"><label>{L("Username", "帳戶名稱")}<input value={form.username} onChange={(event) => update("username", event.target.value)} required /></label><label>{L("Email", "電子郵件")}<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required /></label></div><div className="form-row"><label>{L("Password", "密碼")}<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required />{strength}</label><label>{L("Confirm password", "確認密碼")}<input type="password" value={form.confirm} onChange={(event) => update("confirm", event.target.value)} required /></label></div><label>{L("Company / Organisation", "企業／機構名稱")}<input value={form.company} onChange={(event) => update("company", event.target.value)} required /></label><div className="form-row"><label>{L("User type", "使用者類型")}<select value={form.userType} onChange={(event) => update("userType", event.target.value)} required><option value="">{L("Select type", "選擇類型")}</option><option>Construction Waste Generator</option><option>Transporter</option><option>Processing / Disposal Unit</option><option>Regulatory Agency</option><option>Other</option></select></label><label>{L("Contact person", "聯絡人")}<input value={form.contact} onChange={(event) => update("contact", event.target.value)} /></label></div><label>{L("Phone number", "手機號碼")}<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+852 0000 0000" /></label>{form.userType === "Regulatory Agency" && <p className="field-hint">{L("Regulator permissions are granted by a platform administrator after sign-up.", "監管權限須於註冊後由平台管理員授予。")}</p>}<button type="button" className="text-btn back-link" onClick={() => setView("login")}>← {L("Back to sign in", "返回登入")}</button></>}
        {view === "forgot" && <><label>{L("Username or email", "帳戶名稱或電子郵件")}<input value={form.identifier} onChange={(event) => update("identifier", event.target.value)} required /></label><p className="field-hint">{L("Development mode: the reset link is printed in the `npm run dev` terminal instead of being emailed.", "開發模式：重設連結會顯示在 `npm run dev` 終端機中，而非寄出電郵。")}</p><button type="button" className="text-btn back-link" onClick={() => setView("login")}>← {L("Back to sign in", "返回登入")}</button></>}
        {view === "reset" && <><label>{L("New password", "新密碼")}<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" required />{strength}</label><label>{L("Confirm new password", "確認新密碼")}<input type="password" value={form.confirm} onChange={(event) => update("confirm", event.target.value)} autoComplete="new-password" required /></label><button type="button" className="text-btn back-link" onClick={() => setView("login")}>← {L("Back to sign in", "返回登入")}</button></>}
        <button className="primary-btn full auth-submit" disabled={busy}>{busy ? L("Please wait...", "請稍候...") : submitLabel}</button>
        {view === "login" && <div className="demo-note"><span>DEMO</span><p>{L("Use demo / demo1234 (administrator). Also: regulator / regulator1234, seller / seller1234, buyer / buyer1234.", "使用 demo / demo1234（管理員）。另有：regulator / regulator1234、seller / seller1234、buyer / buyer1234。")}</p></div>}
      </form>
    </section>
  </main>;
}
