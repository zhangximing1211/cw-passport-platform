import { useState } from "react";
import {
  DESTINATIONS, INITIAL_STAGES, LISTING_CATEGORIES, MANUAL_STAGES, ORIGINS, PASSPORT_CATEGORIES, PASSPORT_STAGES, PASSPORT_STATUSES, TRANSPORT_TYPES,
  type CreateListingInput, type CreatePassportInput, type CreateTransferInput, type Destination, type PassportDetailDto, type PassportDto,
  type PassportEventDto, type PassportStage, type RecordPassportEventInput,
} from "../../shared/api";
import {
  createListing, createPassport, createTransfer, deletePassport, exportCsv, formatDate, formatHkDate, formatHkDateTime, formatQuantity,
  getPassport, getPassportEvents, getPassportFacets, listAudit, listListings, listPassports, listTransfers, recordPassportEvent,
  todayIso, updatePassport, verifyPassport,
} from "../../src/api/data";
import {
  Breadcrumbs, EmptyState, ErrorState, Facts, IdLink, LoadingState, MaterialThumb, ModalForm, PageHeader, Pagination, PanelHead,
  StatusBadge, toneOf, useAction, useApiData, useApp, useModalForm, type L,
} from "../ui";
import { DocumentsPanel } from "./documents";

const PAGE_SIZE = 20;

// ── Registry ────────────────────────────────────────────────────────────────

export function PassportRegistry() {
  const { L, search, setSearch, version, openPassport, go } = useApp();
  const [filters, setFilters] = useState({ category: "", project: "", status: "", origin: "", sort: "id_desc" });
  const filterKey = JSON.stringify({ ...filters, q: search.trim() });
  // Page resets to 1 whenever the filters or search change.
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const [registering, setRegistering] = useState(false);

  const facets = useApiData(`facets|${version}`, getPassportFacets);
  const query = { ...filters, q: search.trim(), page, pageSize: PAGE_SIZE };
  const result = useApiData(`passports|${filterKey}|${page}|${version}`, (signal) => listPassports(query, signal));
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const active = Object.entries(filters).filter(([key, value]) => key !== "sort" && value);

  return <>
    <PageHeader eyebrow={L("DIGITAL PASSPORT / REGISTRY", "數碼護照／登記冊")} title={L("Digital Passport Registry", "數碼護照登記冊")}
      subtitle={L("Manage and track digital identities for construction waste materials.", "管理及追蹤建築廢棄材料的數碼身份。")}
      actions={<><button className="secondary-btn" onClick={() => exportCsv("passports", { ...filters, q: search.trim() })}>{L("Export", "匯出")}</button><button className="primary-btn" onClick={() => setRegistering(true)}>+ {L("Register Passport", "登記護照")}</button></>} />
    <section className="panel registry-panel">
      <div className="filter-toolbar">
        <label className="inline-search"><span>⌕</span><input value={search} placeholder={L("Search registry...", "搜尋登記冊...")} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label={L("Material filter", "材料篩選")} value={filters.category} onChange={set("category")}><option value="">{L("All materials", "全部材料")}</option>{PASSPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label={L("Project filter", "項目篩選")} value={filters.project} onChange={set("project")}><option value="">{L("All projects", "全部項目")}</option>{facets.data?.projects.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label={L("Status filter", "狀態篩選")} value={filters.status} onChange={set("status")}><option value="">{L("All statuses", "全部狀態")}</option>{PASSPORT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label={L("Origin filter", "來源地篩選")} value={filters.origin} onChange={set("origin")}><option value="">{L("All locations", "全部地點")}</option>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</select>
        <select aria-label={L("Sort", "排序")} value={filters.sort} onChange={set("sort")}>
          <option value="id_desc">{L("Newest ID", "編號由新至舊")}</option><option value="id_asc">{L("ID A→Z", "編號 A→Z")}</option><option value="updated_desc">{L("Recently updated", "最近更新")}</option>
        </select>
        {active.map(([key, value]) => <button key={key} className="filter-chip" onClick={() => setFilters((current) => ({ ...current, [key]: "" }))}>{value} ×</button>)}
      </div>
      {result.error ? <ErrorState error={result.error} onRetry={result.reload} />
        : !result.data ? <LoadingState />
        : result.data.items.length === 0 ? <EmptyState action={<button className="secondary-btn" onClick={() => { setFilters({ category: "", project: "", status: "", origin: "", sort: "id_desc" }); setSearch(""); }}>{L("Clear filters", "清除篩選")}</button>} />
        : <>
          <div className={`table-scroll registry-table ${result.stale ? "is-stale" : ""}`}><table><thead><tr><th>Passport ID</th><th>{L("Material", "材料")}</th><th>{L("Category", "類別")}</th><th>{L("Source Project", "來源項目")}</th><th>{L("Quantity", "數量")}</th><th>{L("Current Location", "目前位置")}</th><th>{L("Lifecycle Stage", "生命週期階段")}</th><th>{L("Verification", "驗證")}</th><th>{L("Last Updated", "最後更新")}</th></tr></thead>
            <tbody>{result.data.items.map((item) => <tr key={item.id} tabIndex={0} onClick={() => openPassport(item.id)} onDoubleClick={() => go("passport-detail", item.id)} onKeyDown={(event) => { if (event.key === "Enter") go("passport-detail", item.id); }}>
              <td><IdLink id={item.id} onOpen={(id) => go("passport-detail", id)} /></td>
              <td><div className="material-cell"><MaterialThumb tone={toneOf(item.category)} /><strong>{item.material}</strong></div></td>
              <td>{item.category}</td><td>{item.project}</td><td><strong>{formatQuantity(item.quantity)}</strong></td><td>{item.location}</td>
              <td><span className="stage-label"><i />{item.stage}</span></td><td><StatusBadge status={item.status} /></td><td>{formatHkDateTime(item.updatedAt)}</td>
            </tr>)}</tbody></table></div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.data.total} onPage={(next) => setPageState({ key: filterKey, page: next })} />
        </>}
    </section>
    {registering && <RegisterPassportModal close={() => setRegistering(false)} />}
  </>;
}

// ── Detail ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<PassportStage, [string, string]> = {
  Generated: ["Generated", "產生"], Collected: ["Collected", "收集"], Sorted: ["Sorted", "分揀"],
  Processing: ["Processed", "處理"], "Cross-border": ["Cross-border Transfer", "跨境轉運"], Completed: ["Reuse / Buyer", "再利用／買方"],
};

type Step = { name: string; date: string; place: string; actor: string; state: "done" | "current" | "next" };

/** Recorded events become done/current steps; stages not reached yet are listed as upcoming. */
function passportTimeline(events: PassportEventDto[], L: L): Step[] {
  const reached: Step[] = events.map((event, index) => ({
    name: L(...STAGE_LABELS[event.stage]), date: formatHkDate(event.occurredAt), place: event.place, actor: event.actor,
    state: index === events.length - 1 && event.stage !== "Completed" ? "current" : "done",
  }));
  const lastStage = events.at(-1)?.stage;
  const upcoming: Step[] = PASSPORT_STAGES.slice(lastStage ? PASSPORT_STAGES.indexOf(lastStage) + 1 : 0)
    .map((stage) => ({ name: L(...STAGE_LABELS[stage]), date: L("Not started", "未開始"), place: "—", actor: "—", state: "next" }));
  return [...reached, ...upcoming];
}

type PassportModal = "edit" | "event" | "transfer" | "listing" | null;

export function PassportDetail({ id }: { id: string }) {
  const { L, version, go, refresh, isAdmin } = useApp();
  const [tab, setTab] = useState("Overview");
  const [modal, setModal] = useState<PassportModal>(null);
  const { busy, run } = useAction();
  const passport = useApiData(`passport|${id}|${version}`, (signal) => getPassport(id, signal));
  const events = useApiData(`passport-events|${id}|${version}`, (signal) => getPassportEvents(id, signal));
  const transfers = useApiData(`passport-transfers|${id}|${version}`, (signal) => listTransfers({ passportId: id, pageSize: 50 }, signal));
  const listings = useApiData(`passport-listings|${id}|${version}`, (signal) => listListings({ passportId: id, pageSize: 20 }, signal));

  if (passport.error) return <><Breadcrumbs items={[{ label: L("Digital Passport", "數碼護照"), onClick: () => go("passport-registry") }, { label: id }]} /><section className="panel"><ErrorState error={passport.error} onRetry={passport.reload} /></section></>;
  // Detail views are keyed by id, so while a refresh loads, the previous data is the same record.
  if (!passport.data) return <LoadingState />;
  const p = passport.data;
  const eventItems = events.data?.items ?? [];
  const transferItems = transfers.data?.items ?? [];
  const listingItems = listings.data?.items ?? [];
  const openTransfer = transferItems.find((t) => t.status === "Preparing" || t.status === "In Transit");
  const liveListing = listingItems.find((l) => l.mintStatus !== "delisted");
  const timeline = passportTimeline(eventItems, L);
  const current = timeline.find((step) => step.state === "current")?.name ?? (p.stage === "Completed" ? L("Reuse / Buyer", "再利用／買方") : p.stage);
  const { canManage, canRegulate } = p.viewer;

  const can = {
    event: canManage && p.stage !== "Completed",
    verify: canRegulate && (p.status === "Pending" || p.status === "Processing"),
    edit: canManage && p.status !== "Completed" && (p.status === "Pending" || isAdmin),
    remove: canManage && p.status === "Pending" && !transferItems.length && !listingItems.length,
    transfer: canManage && p.status === "Verified" && (p.stage === "Sorted" || p.stage === "Processing") && !openTransfer,
    list: canManage && p.status === "Verified" && p.stage !== "Completed" && !liveListing,
  };

  const verify = async () => { if (await run(() => verifyPassport(p.id), L("Passport verified", "護照已驗證"))) refresh(); };
  const remove = async () => {
    if (!window.confirm(L(`Delete passport ${p.id}? This cannot be undone.`, `確定刪除護照 ${p.id}？此操作無法復原。`))) return;
    if (await run(() => deletePassport(p.id).then(() => true), L("Passport deleted", "護照已刪除"))) { refresh(); go("passport-registry"); }
  };

  const tabs: [string, string][] = [["Overview", "概覽"], ["Material Data", "材料數據"], ["Source", "來源"], ["Processing", "處理"], ["Transport", "運輸"], ["Cross-border", "跨境"], ["Documents", "文件"], ["History", "歷史"]];
  const eventsAt = (...stages: PassportStage[]) => eventItems.filter((e) => stages.includes(e.stage));

  return <>
    <Breadcrumbs items={[{ label: L("Digital Passport", "數碼護照"), onClick: () => go("passport-registry") }, { label: L("Registry", "登記冊"), onClick: () => go("passport-registry") }, { label: p.id }]} />
    <section className="panel passport-identity"><div className="identity-main"><MaterialThumb tone={toneOf(p.category)} large /><div>
      <p className="eyebrow">DIGITAL MATERIAL IDENTITY</p>
      <div className="title-with-status"><h1>{p.material}</h1><StatusBadge status={p.status} /></div>
      <span className="mono-id large-id">{p.id}</span>
      <div className="identity-meta">
        <span><small>{L("Category", "類別")}</small><strong>{p.category}</strong></span>
        <span><small>{L("Quantity", "數量")}</small><strong>{formatQuantity(p.quantity)}</strong></span>
        <span><small>{L("Source Project", "來源項目")}</small><strong>{p.project}</strong></span>
        <span><small>{L("Origin", "來源地")}</small><strong>{p.origin}</strong></span>
        <span><small>{L("Current Location", "目前位置")}</small><strong>{p.location}</strong></span>
        <span><small>{L("Last Updated", "最後更新")}</small><strong>{formatHkDateTime(p.updatedAt)}</strong></span>
      </div>
      {Object.values(can).some(Boolean) && <div className="action-bar">
        {can.event && <button className="primary-btn" onClick={() => setModal("event")}>{L("Record lifecycle event", "記錄生命週期事件")}</button>}
        {can.verify && <button className="primary-btn" disabled={busy} onClick={verify}>{L("Verify passport", "驗證護照")}</button>}
        {can.transfer && <button className="secondary-btn" onClick={() => setModal("transfer")}>{L("Start cross-border transfer", "建立跨境轉運")}</button>}
        {can.list && <button className="secondary-btn" onClick={() => setModal("listing")}>{L("List on marketplace", "刊登至資源市場")}</button>}
        {can.edit && <button className="secondary-btn" onClick={() => setModal("edit")}>{L("Edit", "修改")}</button>}
        {can.remove && <button className="secondary-btn danger" disabled={busy} onClick={remove}>{L("Delete", "刪除")}</button>}
      </div>}
    </div></div>
      <div className={`credential-panel ${p.status === "Verified" || p.status === "Completed" ? "" : "unverified"}`}><div className="credential-seal"><span>{p.status === "Verified" || p.status === "Completed" ? "✓" : "…"}</span></div>
        <p>{p.status === "Verified" || p.status === "Completed" ? L("VERIFIED DIGITAL PASSPORT", "已驗證數碼護照") : L("AWAITING VERIFICATION", "等待驗證")}</p>
        <strong>{p.id}</strong><small>{L(`Created ${formatHkDate(p.createdAt)}`, `建立於 ${formatHkDate(p.createdAt)}`)}</small></div>
    </section>

    <section className="panel lifecycle-panel"><PanelHead title={L("Traceable Lifecycle", "可追溯生命週期")} subtitle={L("Material events from generation to reuse", "由產生到再利用的材料事件")} action={<span className="current-stage"><i />{L(`Current: ${current}`, `目前：${current}`)}</span>} />
      {events.data ? <div className="lifecycle">{timeline.map((step, index) => <div className={`life-step ${step.state}`} key={`${step.name}-${index}`}><div className="life-track"><span>{step.state === "done" ? "✓" : index + 1}</span>{index < timeline.length - 1 && <i />}</div><div><h3>{step.name}</h3><strong>{step.date}</strong><small>{step.place}</small><small>{step.actor}</small></div></div>)}</div> : <LoadingState compact />}
    </section>

    <section className="panel detail-tabs"><div className="tabs" role="tablist">{tabs.map(([en, zh]) => <button role="tab" aria-selected={tab === en} className={tab === en ? "active" : ""} onClick={() => setTab(en)} key={en}>{L(en, zh)}</button>)}</div>
      <div className="tab-content">
        {tab === "Overview" && <div className="detail-grid">
          <div><PanelHead title={L("Material Profile", "材料檔案")} /><Facts rows={[
            [L("Material category", "材料類別"), p.category], [L("Declared quantity", "申報數量"), formatQuantity(p.quantity)],
            [L("Source project", "來源項目"), p.project], [L("Origin jurisdiction", "來源司法管轄區"), p.origin],
            [L("Current stage", "目前階段"), <StatusBadge key="s" status={p.stage} />], [L("Verification", "驗證"), <StatusBadge key="v" status={p.status} />],
          ]} /></div>
          <div><PanelHead title={L("Connected Records", "關聯記錄")} /><div className="relationship-stack">
            {transferItems.map((t) => <button key={t.id} onClick={() => go("crossborder-detail", t.id)}><span>CB</span><div><small>{L("Cross-border Record", "跨境記錄")} · {t.status}</small><strong>{t.id}</strong></div><b>→</b></button>)}
            {listingItems.map((l) => <button key={l.id} onClick={() => go("listing-detail", l.id)}><span>SL</span><div><small>{L("Seller Listing", "賣方刊登")} · {l.mintStatus}</small><strong>{l.id}</strong></div><b>→</b></button>)}
            {!transferItems.length && !listingItems.length && <p className="muted-note">{L("No transfers or listings yet.", "尚未有轉運或刊登。")}</p>}
          </div></div>
        </div>}
        {tab === "Material Data" && <TabRecord eyebrow={tab} title={L("Structured passport information", "結構化護照資料")} rows={[
          [L("Material name", "材料名稱"), p.material], [L("Category", "類別"), p.category], [L("Quantity", "數量"), formatQuantity(p.quantity)],
          [L("Record unit", "記錄單位"), L("Metric tonnes", "公噸")], [L("Passport ID", "護照編號"), p.id], [L("Verification", "驗證"), p.status],
        ]} />}
        {tab === "Source" && <TabRecord eyebrow={tab} title={L("Where the material came from", "材料來源")} rows={[
          [L("Source project", "來源項目"), p.project], [L("Origin", "來源地"), p.origin],
          [L("Generated", "產生日期"), eventsAt("Generated")[0] ? formatHkDate(eventsAt("Generated")[0].occurredAt) : L("Registered at a later stage", "於較後階段登記")],
          [L("Registered", "登記日期"), formatHkDateTime(p.createdAt)], [L("Generated by", "產生單位"), eventsAt("Generated")[0]?.actor ?? "—"],
        ]} />}
        {tab === "Processing" && <EventTable events={eventsAt("Sorted", "Processing")} empty={L("No sorting or processing recorded yet.", "尚未記錄分揀或處理。")} />}
        {tab === "Transport" && <EventTable events={eventsAt("Collected", "Cross-border")} empty={L("No collection or transport recorded yet.", "尚未記錄收集或運輸。")} />}
        {tab === "Cross-border" && (transferItems.length ? <div className="table-scroll"><table><thead><tr><th>Transfer ID</th><th>{L("Route", "路線")}</th><th>{L("Quantity", "數量")}</th><th>{L("Departure", "出發")}</th><th>{L("Compliance", "合規")}</th><th>{L("Status", "狀態")}</th></tr></thead><tbody>
          {transferItems.map((t) => <tr key={t.id} onClick={() => go("crossborder-detail", t.id)}><td><IdLink id={t.id} onOpen={(tid) => go("crossborder-detail", tid)} /></td><td>{t.origin} → {t.destination}</td><td>{formatQuantity(t.quantity)}</td><td>{formatDate(t.departureDate)}</td><td><StatusBadge status={t.compliance} /></td><td><StatusBadge status={t.status} /></td></tr>)}
        </tbody></table></div> : <EmptyState title={L("No cross-border transfers", "尚無跨境轉運")} hint={can.transfer ? L("Use “Start cross-border transfer” above.", "可使用上方「建立跨境轉運」。") : L("This material has not crossed a border.", "此材料尚未跨境。")} />)}
        {tab === "Documents" && <DocumentsPanel ownerType="passport" ownerId={p.id} canUpload={canManage || canRegulate} defaultKind="Processing Record" />}
        {tab === "History" && <HistoryList entityType="passport" entityId={p.id} />}
      </div>
    </section>
    <RelationRail active="passport" material={p.material} passportId={p.id} transferId={transferItems[0]?.id} listingId={listingItems[0]?.id} />

    {modal === "edit" && <EditPassportModal passport={p} close={() => setModal(null)} />}
    {modal === "event" && <RecordEventModal passport={p} lastEventAt={eventItems.at(-1)?.occurredAt} close={() => setModal(null)} />}
    {modal === "transfer" && <CreateTransferModal passport={p} close={() => setModal(null)} />}
    {modal === "listing" && <CreateListingModal passport={p} close={() => setModal(null)} />}
  </>;
}

function TabRecord({ eyebrow, title, rows }: { eyebrow: string; title: string; rows: [string, string][] }) {
  const { L } = useApp();
  return <div className="tab-record"><div><p className="eyebrow">{eyebrow.toUpperCase()}</p><h3>{title}</h3><p>{L("Values come from the passport record and its lifecycle events.", "資料來自護照記錄及其生命週期事件。")}</p></div><Facts wide rows={rows} /></div>;
}

function EventTable({ events, empty }: { events: PassportEventDto[]; empty: string }) {
  const { L } = useApp();
  if (!events.length) return <EmptyState title={empty} hint={L("Events appear here as they are recorded.", "事件記錄後會顯示於此。")} />;
  return <div className="table-scroll"><table><thead><tr><th>{L("Stage", "階段")}</th><th>{L("Date", "日期")}</th><th>{L("Place", "地點")}</th><th>{L("Recorded by", "記錄單位")}</th></tr></thead>
    <tbody>{events.map((e, i) => <tr key={`${e.stage}-${i}`}><td><StatusBadge status={e.stage} /></td><td>{formatHkDateTime(e.occurredAt)}</td><td>{e.place}</td><td>{e.actor}</td></tr>)}</tbody></table></div>;
}

const ACTION_LABELS: Record<string, [string, string]> = {
  "passport.create": ["Passport registered", "登記護照"], "passport.update": ["Passport edited", "修改護照"], "passport.event": ["Lifecycle event recorded", "記錄生命週期事件"],
  "passport.verify": ["Passport verified", "驗證護照"], "passport.delete": ["Passport deleted", "刪除護照"],
  "transfer.create": ["Transfer created", "建立轉運"], "transfer.step": ["Transfer step recorded", "記錄轉運步驟"], "transfer.cancel": ["Transfer cancelled", "取消轉運"],
  "listing.create": ["Listing created", "建立刊登"], "listing.mint": ["NFT minted", "鑄造 NFT"], "listing.publish": ["Listing published", "上架刊登"], "listing.delist": ["Listing withdrawn", "下架刊登"],
  "trade.create": ["Trade opened", "發起交易"], "trade.complete": ["Trade completed", "完成交易"], "trade.settle": ["Trade settled", "結算交易"], "trade.cancel": ["Trade cancelled", "取消交易"],
  "document.upload": ["Document uploaded", "上傳文件"], "document.delete": ["Document deleted", "刪除文件"],
  "demand.create": ["Demand posted", "發布需求"], "demand.update": ["Demand edited", "修改需求"], "demand.delete": ["Demand deleted", "刪除需求"],
  "company.create": ["Company profile created", "建立公司檔案"], "company.update": ["Company profile updated", "更新公司檔案"],
  "user.register": ["Account registered", "註冊帳戶"], "user.admin_update": ["Account changed by administrator", "管理員修改帳戶"], "user.update_profile": ["Profile updated", "更新個人資料"],
  "user.change_password": ["Password changed", "修改密碼"], "user.password_reset": ["Password reset", "重設密碼"],
};
export const actionLabel = (action: string, L: L) => ACTION_LABELS[action] ? L(...ACTION_LABELS[action]) : action;

/** One record's audit trail (who did what, when). */
export function HistoryList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { L, version } = useApp();
  const history = useApiData(`history|${entityType}|${entityId}|${version}`, (signal) => listAudit({ entityType, entityId, pageSize: 50 }, signal));
  if (history.error) return <ErrorState error={history.error} onRetry={history.reload} />;
  if (!history.data) return <LoadingState compact />;
  if (!history.data.items.length) return <EmptyState title={L("No recorded changes", "尚無變更記錄")} hint={L("Seeded demo records have no change history; new actions appear here.", "示範資料沒有變更記錄，新的操作會顯示於此。")} />;
  return <div className="table-scroll"><table><thead><tr><th>{L("When", "時間")}</th><th>{L("Action", "操作")}</th><th>{L("By", "操作人")}</th></tr></thead>
    <tbody>{history.data.items.map((entry) => <tr key={entry.id}><td>{formatHkDateTime(entry.createdAt)}</td><td>{actionLabel(entry.action, L)}</td><td>{entry.user ? `${entry.user.username} · ${entry.user.company}` : "—"}</td></tr>)}</tbody></table></div>;
}

/** Material → Passport → Movement → Marketplace, each linking to its record. */
export function RelationRail({ active, material, passportId, transferId, listingId }: { active: "passport" | "movement" | "marketplace"; material: string; passportId: string; transferId?: string; listingId?: string }) {
  const { L, go } = useApp();
  const nodes: { key: string; label: string; value: string; code: string; onClick?: () => void }[] = [
    { key: "material", label: L("Material", "材料"), value: material, code: "MA", onClick: () => go("passport-detail", passportId) },
    { key: "passport", label: L("Passport", "護照"), value: passportId, code: "DP", onClick: () => go("passport-detail", passportId) },
    { key: "movement", label: L("Movement", "流轉"), value: transferId ?? "—", code: "CB", onClick: transferId ? () => go("crossborder-detail", transferId) : undefined },
    { key: "marketplace", label: L("Marketplace", "市場"), value: listingId ?? "—", code: "SL", onClick: listingId ? () => go("listing-detail", listingId) : undefined },
  ];
  return <section className="relationship-rail" aria-label="Connected material data">{nodes.map((node, index) => <div key={node.key} className={node.key === active ? "active" : ""}>
    <button disabled={!node.onClick} onClick={node.onClick}><span>{node.code}</span><small>{node.label}</small><strong>{node.value}</strong></button>{index < nodes.length - 1 && <i>→</i>}
  </div>)}</section>;
}

// ── Forms ───────────────────────────────────────────────────────────────────

export function RegisterPassportModal({ close }: { close: () => void }) {
  const { L, go, refresh, notify } = useApp();
  const { bind, form, error, setError, busy, submit } = useModalForm({ category: "", material: "", project: "", quantity: "", location: "", origin: "Hong Kong", stage: "Generated" });
  const save = async () => {
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(L("Quantity must be a positive number.", "數量必須為正數。"));
    let created: PassportDto | undefined;
    const ok = await submit(async () => {
      created = await createPassport({
        category: form.category as CreatePassportInput["category"], material: form.material, project: form.project,
        quantity: { value: quantity, unit: "t" }, location: form.location, origin: form.origin as CreatePassportInput["origin"], stage: form.stage as CreatePassportInput["stage"],
      });
    });
    if (ok && created) { close(); refresh(); notify(L(`Passport ${created.id} registered`, `護照 ${created.id} 已登記`)); go("passport-detail", created.id); }
  };
  return <ModalForm eyebrow="DIGITAL PASSPORT" title={L("Register Passport", "登記數碼護照")} subtitle={L("Create a material identity record.", "建立材料身份記錄。")} onClose={close} onSubmit={save} submitLabel={L("Register Passport", "登記護照")} busy={busy} error={error}>
    <div className="form-row"><label>{L("Material Type", "材料類別")}<select required {...bind("category")}><option value="">{L("Select material", "選擇材料")}</option>{PASSPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>{L("Material Name", "材料名稱")}<input required minLength={2} {...bind("material")} placeholder="e.g. Recycled Concrete Aggregate" /></label></div>
    <div className="form-row"><label>{L("Source Project", "來源項目")}<input required minLength={2} {...bind("project")} placeholder={L("Project name", "項目名稱")} /></label><label>{L("Origin", "來源地")}<select {...bind("origin")}>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</select></label></div>
    <div className="form-row"><label>{L("Quantity (t)", "數量（公噸）")}<input required inputMode="decimal" {...bind("quantity")} placeholder="0" /></label><label>{L("Lifecycle Stage", "生命週期階段")}<select {...bind("stage")}>{INITIAL_STAGES.map((s) => <option key={s}>{s}</option>)}</select></label></div>
    <label>{L("Current Location", "目前位置")}<input required minLength={2} {...bind("location")} placeholder={L("Facility or district", "設施或地區")} /></label>
    <div className="modal-note"><span>ID</span><p>{L("The Passport ID is assigned by the platform. New passports stay Pending until a regulator verifies them.", "護照 ID 由平台分配。新護照在監管機構驗證前為待驗證狀態。")}</p></div>
  </ModalForm>;
}

function EditPassportModal({ passport, close }: { passport: PassportDetailDto; close: () => void }) {
  const { L, refresh, notify } = useApp();
  const { bind, form, error, setError, busy, submit } = useModalForm({ category: passport.category, material: passport.material, project: passport.project, quantity: String(passport.quantity.value), location: passport.location });
  const save = async () => {
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(L("Quantity must be a positive number.", "數量必須為正數。"));
    if (await submit(() => updatePassport(passport.id, { category: form.category as CreatePassportInput["category"], material: form.material, project: form.project, quantity: { value: quantity, unit: "t" }, location: form.location }))) {
      close(); refresh(); notify(L("Passport updated", "護照已更新"));
    }
  };
  return <ModalForm eyebrow={passport.id} title={L("Edit Passport", "修改護照")} subtitle={L("Every change is recorded in the passport's history.", "每項修改都會記錄在護照歷史中。")} onClose={close} onSubmit={save} submitLabel={L("Save changes", "儲存修改")} busy={busy} error={error}>
    <div className="form-row"><label>{L("Material Type", "材料類別")}<select {...bind("category")}>{PASSPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>{L("Material Name", "材料名稱")}<input required minLength={2} {...bind("material")} /></label></div>
    <div className="form-row"><label>{L("Source Project", "來源項目")}<input required minLength={2} {...bind("project")} /></label><label>{L("Quantity (t)", "數量（公噸）")}<input required inputMode="decimal" {...bind("quantity")} /></label></div>
    <label>{L("Current Location", "目前位置")}<input required minLength={2} {...bind("location")} /></label>
  </ModalForm>;
}

const STAGE_ZH: Record<string, string> = { Collected: "收集", Sorted: "分揀", Processing: "處理", Completed: "完成（再利用）" };

function RecordEventModal({ passport, lastEventAt, close }: { passport: PassportDetailDto; lastEventAt?: string; close: () => void }) {
  const { L, user, refresh, notify } = useApp();
  const options = MANUAL_STAGES.filter((stage) => PASSPORT_STAGES.indexOf(stage) > PASSPORT_STAGES.indexOf(passport.stage));
  const { bind, form, error, busy, submit } = useModalForm({ stage: options[0] ?? "Completed", place: passport.location, actor: user.company, occurredAt: "", location: "" });
  const save = async () => {
    const input: RecordPassportEventInput = {
      stage: form.stage as RecordPassportEventInput["stage"], place: form.place, actor: form.actor || undefined,
      occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined, location: form.location || undefined,
    };
    if (await submit(() => recordPassportEvent(passport.id, input))) { close(); refresh(); notify(L("Lifecycle event recorded", "生命週期事件已記錄")); }
  };
  return <ModalForm eyebrow={passport.id} title={L("Record Lifecycle Event", "記錄生命週期事件")} subtitle={L(`Current stage: ${passport.stage}. Stages only move forward; cross-border comes from a transfer.`, `目前階段：${passport.stage}。階段只能向前推進；跨境階段由轉運產生。`)} onClose={close} onSubmit={save} submitLabel={L("Record event", "記錄事件")} busy={busy} error={error}>
    <div className="form-row"><label>{L("New stage", "新階段")}<select {...bind("stage")}>{options.map((s) => <option key={s} value={s}>{L(s, STAGE_ZH[s])}</option>)}</select></label>
      <label>{L("When (optional)", "時間（選填）")}<input type="datetime-local" {...bind("occurredAt")} max={new Date().toISOString().slice(0, 16)} min={lastEventAt?.slice(0, 16)} /></label></div>
    <div className="form-row"><label>{L("Place", "地點")}<input required {...bind("place")} /></label><label>{L("Recorded by", "記錄單位")}<input {...bind("actor")} /></label></div>
    <label>{L("New current location (optional)", "新的目前位置（選填）")}<input {...bind("location")} placeholder={passport.location} /></label>
    {form.stage === "Completed" && <div className="modal-note"><span>!</span><p>{L("Completing the lifecycle marks the material as reused and takes its listings off the market.", "完成生命週期表示材料已再利用，其刊登將自動下架。")}</p></div>}
  </ModalForm>;
}

function CreateTransferModal({ passport, close }: { passport: PassportDetailDto; close: () => void }) {
  const { L, go, refresh, notify } = useApp();
  const { bind, form, error, setError, busy, submit } = useModalForm({ destination: "Shenzhen", departureDate: todayIso(), transportType: "Road Freight", quantity: String(passport.quantity.value) });
  const save = async () => {
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(L("Quantity must be a positive number.", "數量必須為正數。"));
    let id = "";
    const ok = await submit(async () => {
      id = (await createTransfer({ passportId: passport.id, destination: form.destination as Destination, departureDate: form.departureDate, transportType: form.transportType as CreateTransferInput["transportType"], quantityValue: quantity })).id;
    });
    if (ok) { close(); refresh(); notify(L(`Transfer ${id} created`, `轉運 ${id} 已建立`)); go("crossborder-detail", id); }
  };
  return <ModalForm eyebrow={passport.id} title={L("Start Cross-border Transfer", "建立跨境轉運")} subtitle={L(`${passport.material} · ${formatQuantity(passport.quantity)} from ${passport.origin}`, `${passport.material} · ${formatQuantity(passport.quantity)}，由${passport.origin}出發`)} onClose={close} onSubmit={save} submitLabel={L("Create transfer", "建立轉運")} busy={busy} error={error}>
    <div className="form-row"><label>{L("Destination", "目的地")}<select {...bind("destination")}>{Object.keys(DESTINATIONS).map((d) => <option key={d}>{d}</option>)}</select></label><label>{L("Departure date", "出發日期")}<input type="date" required min={todayIso()} {...bind("departureDate")} /></label></div>
    <div className="form-row"><label>{L("Transport type", "運輸方式")}<select {...bind("transportType")}>{TRANSPORT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label>{L("Quantity (t)", "數量（公噸）")}<input required inputMode="decimal" {...bind("quantity")} /></label></div>
    <div className="modal-note"><span>7</span><p>{L("The transfer then runs through seven steps. Upload the transfer documents before submitting them; inspection, compliance review and clearance are recorded by a regulator.", "轉運之後依序經過七個步驟。提交文件前須先上傳文件；檢驗、合規審核及放行由監管機構記錄。")}</p></div>
  </ModalForm>;
}

const DEFAULT_LISTING_CATEGORY: Record<string, string> = { Concrete: "Concrete", Metal: "Metal", Timber: "Timber", Glass: "Glass", "Mixed Waste": "Mixed" };

function CreateListingModal({ passport, close }: { passport: PassportDetailDto; close: () => void }) {
  const { L, go, refresh, notify } = useApp();
  const { bind, form, error, setError, busy, submit } = useModalForm({ category: DEFAULT_LISTING_CATEGORY[passport.category] ?? "Mixed", quantity: String(passport.quantity.value), location: `${passport.location}, ${passport.origin}`, availableFrom: "" });
  const save = async () => {
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(L("Quantity must be a positive number.", "數量必須為正數。"));
    let id = "";
    const ok = await submit(async () => {
      id = (await createListing({ passportId: passport.id, category: form.category as CreateListingInput["category"], quantityValue: quantity, location: form.location, availableFrom: form.availableFrom || null })).id;
    });
    if (ok) { close(); refresh(); notify(L(`Listing ${id} created as a draft`, `刊登 ${id} 已建立為草稿`)); go("listing-detail", id); }
  };
  return <ModalForm eyebrow={passport.id} title={L("List on Marketplace", "刊登至資源市場")} subtitle={L("The listing starts as a draft; mint and publish it from the listing page.", "刊登先建立為草稿，再於刊登頁面鑄造並上架。")} onClose={close} onSubmit={save} submitLabel={L("Create listing", "建立刊登")} busy={busy} error={error}>
    <div className="form-row"><label>{L("Marketplace category", "市場類別")}<select {...bind("category")}>{LISTING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>{L("Quantity (t)", "數量（公噸）")}<input required inputMode="decimal" {...bind("quantity")} /></label></div>
    <div className="form-row"><label>{L("Location shown to buyers", "顯示給買方的位置")}<input required minLength={2} {...bind("location")} /></label><label>{L("Available from (empty = now)", "可供貨日期（留空＝現貨）")}<input type="date" {...bind("availableFrom")} /></label></div>
  </ModalForm>;
}
