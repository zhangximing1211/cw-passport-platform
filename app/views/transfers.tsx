import { useState } from "react";
import {
  COMPLIANCE_STATUSES, DESTINATIONS, ORIGINS, REGULATORY_STEPS, TRANSFER_STATUSES, TRANSFER_STEPS,
  type TransferDetailDto, type TransferDto, type TransferStep,
} from "../../shared/api";
import {
  advanceTransfer, cancelTransfer, exportCsv, formatDate, formatHkDateTime, formatQuantity, formatTonnes, getTransfer, getTransferStats,
  listListings, listTransfers,
} from "../../src/api/data";
import {
  Breadcrumbs, EmptyState, ErrorState, IdLink, LoadingState, ModalForm, PageHeader, Pagination, PanelHead, PassportLink, StatusBadge,
  useAction, useApiData, useApp, useModalForm, type L,
} from "../ui";
import { DocumentsPanel } from "./documents";
import { HistoryList, RelationRail } from "./passports";

const PAGE_SIZE = 20;

const STEP_ZH: Record<TransferStep, string> = {
  "Created": "建立", "Documentation Submitted": "提交文件", "Inspection": "檢驗", "Customs / Compliance Review": "海關／合規審核",
  "Cleared": "放行", "Transport": "運輸", "Received": "接收",
};
export const stepLabel = (step: TransferStep, L: L) => L(step, STEP_ZH[step]);
const isRegulatoryStep = (step: TransferStep) => (REGULATORY_STEPS as readonly string[]).includes(step);
const nextStepOf = (t: TransferDto) => (t.status === "Cancelled" ? undefined : TRANSFER_STEPS[t.stepsCompleted]);
const regionCode = (place: string) => place === "Macau" ? "MO" : place === "Hong Kong" ? "HK" : (DESTINATIONS as Record<string, string>)[place] ?? place.slice(0, 2).toUpperCase();

// ── List ────────────────────────────────────────────────────────────────────

export function CrossborderList() {
  const { L, search, setSearch, version, go } = useApp();
  const [filters, setFilters] = useState({ status: "", compliance: "", origin: "", destination: "" });
  const filterKey = JSON.stringify({ ...filters, q: search.trim() });
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const stats = useApiData(`transfer-stats|${version}`, getTransferStats);
  const query = { ...filters, q: search.trim(), page, pageSize: PAGE_SIZE };
  const result = useApiData(`transfers|${filterKey}|${page}|${version}`, (signal) => listTransfers(query, signal));
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const active = Object.entries(filters).filter(([, value]) => value);
  const s = stats.data;
  const featured = s?.featured;

  const kpis: [string, string, string][] = [
    [L("Cross-border Transfers", "跨境轉運"), s ? String(s.total) : "—", "CB"],
    [L("Total Volume", "總量"), s ? formatTonnes(s.volumeTonnes) : "—", "TV"],
    [L("Pending Records", "待處理記錄"), s ? String(s.pending) : "—", "PR"],
    [L("Completed Transfers", "已完成轉運"), s ? String(s.completed) : "—", "CT"],
  ];

  return <>
    <PageHeader eyebrow={L("CROSS-BORDER DATA / TRANSFERS", "跨境資料／轉運")} title={L("Cross-border Material Data", "跨境材料資料")}
      subtitle={L("Track construction waste movements across jurisdictions.", "追蹤建築廢棄材料在不同司法管轄區之間的流動。")}
      actions={<button className="secondary-btn" onClick={() => exportCsv("transfers", { ...filters, q: search.trim() })}>{L("Export records", "匯出記錄")}</button>} />
    <section className="kpi-grid four">{kpis.map(([label, value, code]) => <article className="kpi-card" key={code}><div className="kpi-top"><span className="mini-icon">{code}</span>{code === "PR" && s ? <span className="trend">{s.inTransit} {L("in transit", "運輸中")}</span> : null}</div><strong>{value}</strong><p>{label}</p><small>{L("Excluding cancelled transfers", "不含已取消的轉運")}</small></article>)}</section>
    {featured && <section className="panel route-panel">
      <PanelHead title={featured.status === "In Transit" ? L("Material Route in Transit", "運輸中的材料路線") : L("Latest Material Route", "最新材料路線")} subtitle={`${featured.id} · ${featured.material} · ${formatQuantity(featured.quantity)}`} action={<StatusBadge status={featured.compliance} />} />
      <div className="route-visual">
        <button onClick={() => go("crossborder-detail", featured.id)}><span className="port-code">{regionCode(featured.origin)}</span><div><small>{L("ORIGIN", "起運地")}</small><strong>{featured.origin}</strong><p>{L("Departure", "出發")} · {formatDate(featured.departureDate)}</p></div></button>
        <div className="route-connector"><span>{featured.transportType}</span><i><b /></i><em>{featured.compliance}</em></div>
        <button onClick={() => go("crossborder-detail", featured.id)}><span className={`port-code ${featured.status === "In Transit" ? "current" : ""}`}>{featured.origin === "Macau" ? "HQ" : "SB"}</span><div><small>{L("BORDER / PORT", "口岸")}</small><strong>{featured.origin === "Macau" ? "Hengqin Port" : "Shenzhen Bay Port"}</strong><p>{featured.events.some((e) => e.step === "Inspection") ? L("Inspection · Recorded", "檢驗 · 已記錄") : L("Inspection · Pending", "檢驗 · 待處理")}</p></div></button>
        <div className="route-connector"><span>{featured.events.at(-1) ? formatHkDateTime(featured.events.at(-1)!.occurredAt) : ""}</span><i><b /></i><em>{featured.status}</em></div>
        <button onClick={() => go("crossborder-detail", featured.id)}><span className={`port-code ${featured.status === "Completed" ? "" : "muted"}`}>{regionCode(featured.destination)}</span><div><small>{L("DESTINATION", "目的地")}</small><strong>{featured.destination}</strong><p>{featured.status === "Completed" ? L("Receiving record · Done", "接收記錄 · 已完成") : L("Receiving record · Pending", "接收記錄 · 待處理")}</p></div></button>
      </div>
    </section>}
    <section className="panel records-panel"><PanelHead title={L("Cross-border Records", "跨境記錄")} subtitle={L("Material movements and compliance states", "材料流動及合規狀態")} />
      <div className="filter-toolbar">
        <label className="inline-search"><span>⌕</span><input value={search} placeholder={L("Search transfer records...", "搜尋轉運記錄...")} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label={L("Status", "狀態")} value={filters.status} onChange={set("status")}><option value="">{L("All statuses", "全部狀態")}</option>{TRANSFER_STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
        <select aria-label={L("Compliance", "合規")} value={filters.compliance} onChange={set("compliance")}><option value="">{L("All compliance", "全部合規狀態")}</option>{COMPLIANCE_STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
        <select aria-label={L("Origin", "起運地")} value={filters.origin} onChange={set("origin")}><option value="">{L("All origins", "全部起運地")}</option>{ORIGINS.map((v) => <option key={v}>{v}</option>)}</select>
        <select aria-label={L("Destination", "目的地")} value={filters.destination} onChange={set("destination")}><option value="">{L("All destinations", "全部目的地")}</option>{Object.keys(DESTINATIONS).map((v) => <option key={v}>{v}</option>)}</select>
        {active.map(([key, value]) => <button key={key} className="filter-chip" onClick={() => setFilters((current) => ({ ...current, [key]: "" }))}>{value} ×</button>)}
      </div>
      {result.error ? <ErrorState error={result.error} onRetry={result.reload} />
        : !result.data ? <LoadingState />
        : result.data.items.length === 0 ? <EmptyState />
        : <><TransferTable items={result.data.items} stale={result.stale} /><Pagination page={page} pageSize={PAGE_SIZE} total={result.data.total} onPage={(next) => setPageState({ key: filterKey, page: next })} /></>}
    </section>
  </>;
}

function TransferTable({ items, stale = false, withNextStep = false }: { items: TransferDto[]; stale?: boolean; withNextStep?: boolean }) {
  const { L, go } = useApp();
  return <div className={`table-scroll ${stale ? "is-stale" : ""}`}><table><thead><tr><th>Transfer ID</th><th>Passport ID</th><th>{L("Material", "材料")}</th><th>{L("Origin", "起運地")}</th><th>{L("Destination", "目的地")}</th><th>{L("Quantity", "數量")}</th><th>{L("Departure", "出發")}</th><th>{L("Compliance", "合規")}</th><th>{withNextStep ? L("Next Step", "下一步") : L("Transfer Status", "轉運狀態")}</th></tr></thead>
    <tbody>{items.map((item) => {
      const next = nextStepOf(item);
      return <tr key={item.id} onClick={() => go("crossborder-detail", item.id)}>
        <td><IdLink className="transfer-link" id={item.id} onOpen={(id) => go("crossborder-detail", id)} /></td><td><PassportLink id={item.passportId} /></td>
        <td><strong>{item.material}</strong></td><td>{item.origin}</td><td>{item.destination}</td><td><strong>{formatQuantity(item.quantity)}</strong></td><td>{formatDate(item.departureDate)}</td>
        <td><StatusBadge status={item.compliance} /></td>
        <td>{withNextStep ? (next ? <StatusBadge status="Pending" label={stepLabel(next, L)} /> : "—") : <StatusBadge status={item.status} />}</td>
      </tr>;
    })}</tbody></table></div>;
}

// ── Compliance queue (regulators) ───────────────────────────────────────────

export function ComplianceQueue() {
  const { L, version, isRegulator } = useApp();
  const [page, setPage] = useState(1);
  const queue = useApiData(`compliance-queue|${page}|${version}`, (signal) => listTransfers({ queue: "regulatory", page, pageSize: PAGE_SIZE }, signal));
  const pendingReview = useApiData(`compliance-pending|${version}`, (signal) => listTransfers({ compliance: "Pending Review", status: "Preparing", pageSize: 1 }, signal));
  return <>
    <PageHeader eyebrow={L("CROSS-BORDER DATA / COMPLIANCE", "跨境資料／合規")} title={L("Compliance Queue", "合規待辦")}
      subtitle={L("Transfers whose next step is an inspection, compliance review or clearance by a regulator.", "下一步需要由監管機構檢驗、合規審核或放行的轉運。")} />
    {!isRegulator && <p className="data-source-note">{L("You can follow these transfers, but only regulators can record the next step. Administrators grant the regulator role.", "您可以查看這些轉運，但只有監管機構可以記錄下一步。監管身份由管理員授予。")}</p>}
    <section className="kpi-grid four">
      <article className="kpi-card"><div className="kpi-top"><span className="mini-icon">RQ</span></div><strong>{queue.data?.total ?? "—"}</strong><p>{L("Awaiting a regulator", "等待監管機構處理")}</p><small>{L("Inspection, review or clearance", "檢驗、審核或放行")}</small></article>
      <article className="kpi-card"><div className="kpi-top"><span className="mini-icon">PR</span></div><strong>{pendingReview.data?.total ?? "—"}</strong><p>{L("Pending review, still preparing", "待審核、準備中")}</p><small>{L("Includes transfers still collecting documents", "包括仍在準備文件的轉運")}</small></article>
    </section>
    <section className="panel records-panel"><PanelHead title={L("Transfers awaiting a regulator", "等待監管機構處理的轉運")} subtitle={L("Open a transfer to review its documents and record the step.", "開啟轉運以審閱文件並記錄步驟。")} />
      {queue.error ? <ErrorState error={queue.error} onRetry={queue.reload} />
        : !queue.data ? <LoadingState />
        : queue.data.items.length === 0 ? <EmptyState title={L("Nothing waiting", "沒有待辦事項")} hint={L("New submissions will appear here.", "新提交的文件會顯示於此。")} />
        : <><TransferTable items={queue.data.items} withNextStep /><Pagination page={page} pageSize={PAGE_SIZE} total={queue.data.total} onPage={setPage} /></>}
    </section>
  </>;
}

// ── Detail ──────────────────────────────────────────────────────────────────

export function CrossborderDetail({ id }: { id: string }) {
  const { L, version, go, refresh } = useApp();
  const [advancing, setAdvancing] = useState(false);
  const { busy, run } = useAction();
  const transfer = useApiData(`transfer|${id}|${version}`, (signal) => getTransfer(id, signal));
  const listing = useApiData(transfer.data ? `transfer-listing|${transfer.data.passportId}|${version}` : null, (signal) => listListings({ passportId: transfer.data!.passportId, pageSize: 1 }, signal));

  const crumbs = [{ label: L("Cross-border Data", "跨境資料"), onClick: () => go("crossborder") }, { label: L("Transfer Records", "轉運記錄"), onClick: () => go("crossborder") }, { label: id }];
  if (transfer.error) return <><Breadcrumbs items={crumbs} /><section className="panel"><ErrorState error={transfer.error} onRetry={transfer.reload} /></section></>;
  if (!transfer.data) return <LoadingState />;
  const t = transfer.data;
  const next = nextStepOf(t);
  const mayAdvance = !!next && (isRegulatoryStep(next) ? t.viewer.canRegulate : t.viewer.canManage);
  const steps = TRANSFER_STEPS.map((step, index) => {
    const event = t.events[index];
    const state = event ? (index === t.events.length - 1 && t.status !== "Completed" ? "current" : "done") : "next";
    return { step, event, state };
  });

  const cancel = async () => {
    const reason = window.prompt(L("Reason for cancelling this transfer (optional):", "取消此轉運的原因（選填）："));
    if (reason === null) return;
    if (await run(() => cancelTransfer(t.id, reason || undefined), L("Transfer cancelled", "轉運已取消"))) refresh();
  };

  return <>
    <Breadcrumbs items={crumbs} />
    <section className="panel transfer-hero"><div><p className="eyebrow">CROSS-BORDER TRANSFER</p><div className="title-with-status"><h1>{t.id}</h1><StatusBadge status={t.status} /></div><div className="hero-route"><span>{t.origin}</span><i><b /></i><span>{t.destination}</span></div>
      <div className="action-bar">
        {mayAdvance && <button className="primary-btn" onClick={() => setAdvancing(true)}>{L(`Record: ${next}`, `記錄：${STEP_ZH[next!]}`)}</button>}
        {next && !mayAdvance && t.status !== "Cancelled" && <span className="muted-note">{isRegulatoryStep(next) ? L(`Next: ${next} — recorded by a regulator`, `下一步：${STEP_ZH[next]}（由監管機構記錄）`) : L(`Next: ${next} — recorded by ${t.organisation}`, `下一步：${STEP_ZH[next]}（由 ${t.organisation} 記錄）`)}</span>}
        {t.viewer.canManage && t.status === "Preparing" && <button className="secondary-btn danger" disabled={busy} onClick={cancel}>{L("Cancel transfer", "取消轉運")}</button>}
      </div></div>
      <dl><div><dt>{L("Material", "材料")}</dt><dd>{t.material}</dd></div><div><dt>{L("Quantity", "數量")}</dt><dd>{formatQuantity(t.quantity)}</dd></div><div><dt>{L("Associated Passport", "關聯護照")}</dt><dd><PassportLink id={t.passportId} /></dd></div><div><dt>{L("Organisation", "機構")}</dt><dd>{t.organisation}</dd></div><div><dt>{L("Transfer Date", "轉運日期")}</dt><dd>{formatDate(t.departureDate)}</dd></div><div><dt>{L("Compliance", "合規")}</dt><dd><StatusBadge status={t.compliance} /></dd></div></dl>
    </section>
    <section className="transfer-layout"><article className="panel vertical-timeline-panel"><PanelHead title={L("Transfer Timeline", "轉運時間線")} subtitle={L("Recorded events from creation to receipt", "由建立至接收的已記錄事件")} />
      <div className="vertical-timeline">{steps.map(({ step, event, state }, index) => <div className={`timeline-event ${state}`} key={step}><div className="event-track"><span>{state === "done" ? "✓" : index + 1}</span>{index < steps.length - 1 && <i />}</div>
        <div><h3>{stepLabel(step, L)}</h3><strong>{event ? formatHkDateTime(event.occurredAt) : t.status === "Cancelled" ? L("Cancelled", "已取消") : L("Pending", "待處理")}</strong><p>{event?.note ?? (isRegulatoryStep(step) ? L("Recorded by a regulator", "由監管機構記錄") : "")}</p></div>
        {state === "current" && <StatusBadge status={t.status} />}</div>)}</div>
    </article><aside className="transfer-side">
      <section className="panel"><PanelHead title={L("Transfer Summary", "轉運摘要")} /><dl className="detail-list">
        <div><dt>{L("Origin", "起運地")}</dt><dd>{t.origin}</dd></div><div><dt>{L("Destination", "目的地")}</dt><dd>{t.destination}</dd></div>
        <div><dt>{L("Transport Type", "運輸方式")}</dt><dd>{t.transportType}</dd></div><div><dt>{L("Material Volume", "材料量")}</dt><dd>{formatQuantity(t.quantity)}</dd></div>
        <div><dt>{L("Passport ID", "護照編號")}</dt><dd><PassportLink id={t.passportId} /></dd></div><div><dt>{L("Steps completed", "已完成步驟")}</dt><dd>{t.stepsCompleted} / {TRANSFER_STEPS.length}</dd></div>
      </dl></section>
      <section className="panel compliance-panel"><DocumentsPanel ownerType="transfer" ownerId={t.id} canUpload={(t.viewer.canManage || t.viewer.canRegulate) && t.status !== "Cancelled"} defaultKind="Transfer Document" title={L("Compliance Documents", "合規文件")} subtitle={L("Declarations, transfer documents, inspection reports and receiving certificates", "申報、轉運文件、檢驗報告及收貨證明")} /></section>
    </aside></section>
    <section className="panel detail-tabs"><div className="tab-content"><PanelHead title={L("Change History", "變更記錄")} /><HistoryList entityType="transfer" entityId={t.id} /></div></section>
    <RelationRail active="movement" material={t.material} passportId={t.passportId} transferId={t.id} listingId={listing.data?.items[0]?.id} />
    {advancing && next && <AdvanceStepModal transfer={t} step={next} close={() => setAdvancing(false)} />}
  </>;
}

function AdvanceStepModal({ transfer, step, close }: { transfer: TransferDetailDto; step: TransferStep; close: () => void }) {
  const { L, refresh, notify } = useApp();
  const { bind, form, error, busy, submit } = useModalForm({ note: "", occurredAt: "" });
  const lastAt = transfer.events.at(-1)?.occurredAt;
  const save = async () => {
    const ok = await submit(() => advanceTransfer(transfer.id, { step, note: form.note || undefined, occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined }));
    if (ok) { close(); refresh(); notify(L(`${step} recorded`, `已記錄：${STEP_ZH[step]}`)); }
  };
  const effect: Partial<Record<TransferStep, [string, string]>> = {
    "Documentation Submitted": ["Regulators are notified that the transfer awaits inspection.", "監管機構將收到待檢驗通知。"],
    "Customs / Compliance Review": ["Compliance becomes Verified.", "合規狀態變為已核實。"],
    "Cleared": ["Compliance becomes Cleared and the organisation is notified.", "合規狀態變為已放行，並通知轉運機構。"],
    "Transport": ["The transfer goes In Transit; the passport moves to the border and enters the Cross-border stage.", "轉運變為運輸中；護照位置更新為口岸並進入跨境階段。"],
    "Received": ["The transfer completes; the passport is completed at the destination and its listings leave the market.", "轉運完成；護照於目的地完成，其刊登將下架。"],
  };
  return <ModalForm eyebrow={transfer.id} title={L(`Record: ${step}`, `記錄：${STEP_ZH[step]}`)} subtitle={L(`Step ${transfer.stepsCompleted + 1} of 7`, `第 ${transfer.stepsCompleted + 1} 步，共 7 步`)} onClose={close} onSubmit={save} submitLabel={L("Record step", "記錄步驟")} busy={busy} error={error}>
    <div className="form-row"><label>{L("Note (optional)", "備註（選填）")}<input maxLength={200} {...bind("note")} placeholder={L("e.g. Inspection report attached", "例如：已附檢驗報告")} /></label>
      <label>{L("When (optional)", "時間（選填）")}<input type="datetime-local" {...bind("occurredAt")} min={lastAt?.slice(0, 16)} max={new Date().toISOString().slice(0, 16)} /></label></div>
    {effect[step] && <div className="modal-note"><span>→</span><p>{L(...effect[step]!)}</p></div>}
  </ModalForm>;
}
