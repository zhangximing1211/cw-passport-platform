import { useState } from "react";
import { USER_ROLES, type AdminUserDto, type UserRole } from "../../shared/api";
import { formatHkDateTime, listAudit, listUsers, updateUser } from "../../src/api/data";
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, PanelHead, StatusBadge, useAction, useApiData, useApp, type L, type View } from "../ui";
import { actionLabel } from "./passports";

const PAGE_SIZE = 20;
export const roleLabel = (role: UserRole, L: L) => ({ admin: L("Administrator", "管理員"), regulator: L("Regulator", "監管機構"), member: L("Member", "成員") })[role];

export function UsersView() {
  const { L, version, refresh, user: me } = useApp();
  const [filters, setFilters] = useState({ q: "", role: "", pending: "" });
  const [page, setPage] = useState(1);
  const { busy, run } = useAction();
  const query = { q: filters.q.trim(), role: filters.role, pending: filters.pending ? true : undefined, page, pageSize: PAGE_SIZE };
  const users = useApiData(`users|${JSON.stringify(query)}|${version}`, (signal) => listUsers(query, signal));
  const pending = useApiData(`users-pending|${version}`, (signal) => listUsers({ pending: true, pageSize: 1 }, signal));
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => { setFilters((f) => ({ ...f, [key]: event.target.value })); setPage(1); };

  const change = async (target: AdminUserDto, input: { role?: UserRole; disabled?: boolean }, message: string) => {
    if (await run(() => updateUser(target.id, input), message)) refresh();
  };

  return <>
    <PageHeader eyebrow={L("ADMINISTRATION / USERS", "管理／用戶")} title={L("User Management", "用戶管理")} subtitle={L("Grant the regulator role, change roles and disable accounts. Every change is audited.", "授予監管身份、變更角色及停用帳戶。每項變更均有審計記錄。")} />
    {(pending.data?.total ?? 0) > 0 && <p className="data-source-note">{L(`${pending.data!.total} account(s) signed up as a Regulatory Agency and are waiting for the regulator role.`, `${pending.data!.total} 個帳戶以監管機構身份註冊，正在等待授予監管身份。`)} <button className="text-btn" onClick={() => { setFilters({ q: "", role: "", pending: "1" }); setPage(1); }}>{L("Show them", "查看")} →</button></p>}
    <section className="panel records-panel">
      <div className="filter-toolbar">
        <label className="inline-search"><span>⌕</span><input value={filters.q} placeholder={L("Search username, email, company...", "搜尋帳戶、電郵、公司...")} onChange={set("q")} /></label>
        <select aria-label={L("Role", "角色")} value={filters.role} onChange={set("role")}><option value="">{L("All roles", "全部角色")}</option>{USER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, L)}</option>)}</select>
        <label className="check-label"><input type="checkbox" checked={!!filters.pending} onChange={(event) => { setFilters((f) => ({ ...f, pending: event.target.checked ? "1" : "" })); setPage(1); }} />{L("Waiting for regulator role", "等待監管身份")}</label>
      </div>
      {users.error ? <ErrorState error={users.error} onRetry={users.reload} /> : !users.data ? <LoadingState /> : users.data.items.length === 0 ? <EmptyState title={L("No users", "沒有用戶")} /> : <>
        <div className="table-scroll"><table><thead><tr><th>{L("User", "用戶")}</th><th>{L("Company", "公司")}</th><th>{L("User type", "用戶類型")}</th><th>{L("Role", "角色")}</th><th>{L("Status", "狀態")}</th><th>{L("Joined", "註冊時間")}</th><th>{L("Actions", "操作")}</th></tr></thead>
          <tbody>{users.data.items.map((u) => <tr key={u.id}>
            <td><strong>{u.username}</strong><small className="cell-sub">{u.email}{u.contact ? ` · ${u.contact}` : ""}</small></td><td>{u.company}</td>
            <td>{u.userType}{u.regulatorRequested && <><br /><StatusBadge status="Pending" label={L("Requests regulator role", "申請監管身份")} /></>}</td>
            <td><select aria-label={L("Role", "角色")} value={u.role} disabled={busy || u.id === me.id} onChange={(event) => change(u, { role: event.target.value as UserRole }, L(`${u.username} is now ${roleLabel(event.target.value as UserRole, L)}`, `${u.username} 已變更為${roleLabel(event.target.value as UserRole, L)}`))}>{USER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, L)}</option>)}</select></td>
            <td><StatusBadge status={u.disabled ? "disabled" : "Verified"} label={u.disabled ? L("Disabled", "已停用") : L("Active", "啟用")} /></td>
            <td>{formatHkDateTime(u.createdAt)}</td>
            <td><div className="table-actions">
              {u.regulatorRequested && <button className="mini-btn primary" disabled={busy} onClick={() => change(u, { role: "regulator" }, L(`Regulator role granted to ${u.username}`, `已授予 ${u.username} 監管身份`))}>{L("Grant regulator", "授予監管身份")}</button>}
              {u.id !== me.id && <button className="mini-btn" disabled={busy} onClick={() => change(u, { disabled: !u.disabled }, u.disabled ? L("Account enabled", "帳戶已啟用") : L("Account disabled and signed out", "帳戶已停用並登出"))}>{u.disabled ? L("Enable", "啟用") : L("Disable", "停用")}</button>}
            </div></td>
          </tr>)}</tbody></table></div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={users.data.total} onPage={setPage} />
      </>}
    </section>
  </>;
}

const ENTITY_VIEWS: Record<string, View> = { passport: "passport-detail", transfer: "crossborder-detail", listing: "listing-detail" };

export function AuditView() {
  const { L, version, go } = useApp();
  const [filters, setFilters] = useState({ entityType: "", entityId: "", action: "" });
  const [page, setPage] = useState(1);
  const query = { ...filters, entityId: filters.entityId.trim().toUpperCase(), page, pageSize: 30 };
  const log = useApiData(`audit|${JSON.stringify(query)}|${version}`, (signal) => listAudit(query, signal));
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => { setFilters((f) => ({ ...f, [key]: event.target.value })); setPage(1); };
  return <>
    <PageHeader eyebrow={L("ADMINISTRATION / AUDIT LOG", "管理／審計日誌")} title={L("Audit Log", "審計日誌")} subtitle={L("Every change on the platform: who, what, when. Written in the same transaction as the change.", "平台上的每項變更：誰、做了什麼、何時。與變更在同一交易中寫入。")} />
    <section className="panel records-panel">
      <div className="filter-toolbar">
        <select aria-label={L("Record type", "記錄類型")} value={filters.entityType} onChange={set("entityType")}><option value="">{L("All record types", "全部記錄類型")}</option>{["passport", "transfer", "listing", "trade", "demand", "company", "user"].map((t) => <option key={t}>{t}</option>)}</select>
        <label className="inline-search"><span>#</span><input value={filters.entityId} placeholder={L("Record ID, e.g. DPP-HK-2026-00428", "記錄編號，例如 DPP-HK-2026-00428")} onChange={set("entityId")} /></label>
        <select aria-label={L("Action", "操作")} value={filters.action} onChange={set("action")}><option value="">{L("All actions", "全部操作")}</option>{["passport.create", "passport.update", "passport.event", "passport.verify", "passport.delete", "transfer.create", "transfer.step", "transfer.cancel", "listing.create", "listing.mint", "listing.publish", "listing.delist", "trade.create", "trade.complete", "trade.settle", "trade.cancel", "document.upload", "document.delete", "demand.create", "demand.update", "demand.delete", "user.register", "user.admin_update"].map((a) => <option key={a} value={a}>{actionLabel(a, L)}</option>)}</select>
      </div>
      {log.error ? <ErrorState error={log.error} onRetry={log.reload} /> : !log.data ? <LoadingState /> : log.data.items.length === 0 ? <EmptyState title={L("No entries", "沒有記錄")} hint={L("Seeded demo data has no history; actions taken on the platform appear here.", "示範資料沒有歷史；平台上的操作會顯示於此。")} /> : <>
        <div className="table-scroll"><table><thead><tr><th>{L("When", "時間")}</th><th>{L("Action", "操作")}</th><th>{L("Record", "記錄")}</th><th>{L("By", "操作人")}</th><th>{L("Details", "詳情")}</th></tr></thead>
          <tbody>{log.data.items.map((entry) => <tr key={entry.id}><td>{formatHkDateTime(entry.createdAt)}</td><td>{actionLabel(entry.action, L)}</td>
            <td>{ENTITY_VIEWS[entry.entityType] ? <button className="id-link" onClick={() => go(ENTITY_VIEWS[entry.entityType], entry.entityId)}>{entry.entityId}</button> : <span className="mono-id">{entry.entityType} · {entry.entityId}</span>}</td>
            <td>{entry.user ? `${entry.user.username} · ${entry.user.company}` : "—"}</td>
            <td><code className="audit-details">{entry.details ? JSON.stringify(entry.details) : ""}</code></td></tr>)}</tbody></table></div>
        <Pagination page={page} pageSize={30} total={log.data.total} onPage={setPage} />
      </>}
    </section>
  </>;
}

export function AdminOnly({ children, allowRegulator = false }: { children: React.ReactNode; allowRegulator?: boolean }) {
  const { L, isAdmin, isRegulator } = useApp();
  if (isAdmin || (allowRegulator && isRegulator)) return <>{children}</>;
  return <section className="panel"><PanelHead title={L("Not available", "無法使用")} /><EmptyState title={L("Administrators only", "僅限管理員")} hint={L("This page needs a role your account does not have.", "此頁面需要您的帳戶沒有的角色。")} /></section>;
}
