import { useState } from "react";
import { REGIONS, LISTING_CATEGORIES, type CompanyDto, type DemandDto, type DemandInput, type MatchDto, type Region, type TradeDto } from "../../shared/api";
import {
  cancelTrade, completeTrade, createDemand, deleteDemand, exportCsv, formatDate, formatHash, formatHkd, formatQuantity, getCompany,
  getListing, getMarketplaceSummary, listDemands, listMatches, listTrades, saveCompany, settleTrade, todayIso, updateDemand,
} from "../../src/api/data";
import {
  EmptyState, ErrorState, IdLink, LoadingState, ModalForm, PageHeader, Pagination, PanelHead, StatusBadge, useAction, useApiData, useApp, useModalForm,
} from "../ui";
import { TradeModal } from "./marketplace";

const PAGE_SIZE = 20;

// ── Match & Trades ──────────────────────────────────────────────────────────

export function MatchTradesView() {
  const { L, version, go, isAdmin } = useApp();
  const [tradeFilter, setTradeFilter] = useState({ status: "", mine: "" });
  const [page, setPage] = useState(1);
  const [trading, setTrading] = useState<MatchDto | null>(null);
  const summary = useApiData(`summary|${version}`, getMarketplaceSummary);
  const matches = useApiData(`matches|${version}`, (signal) => listMatches({ limit: 8 }, signal));
  const tradeQuery = { status: tradeFilter.status, mine: tradeFilter.mine ? true : undefined, page, pageSize: PAGE_SIZE };
  const trades = useApiData(`trades|${JSON.stringify(tradeQuery)}|${version}`, (signal) => listTrades(tradeQuery, signal));
  const myDemands = useApiData(`my-demands|${version}`, (signal) => listDemands(isAdmin ? { pageSize: 100 } : { mine: true, pageSize: 100 }, signal));
  const tradeListing = useApiData(trading ? `trade-listing|${trading.listing.id}|${version}` : null, (signal) => getListing(trading!.listing.id, signal));
  const s = summary.data;
  const myDemandIds = new Set((myDemands.data?.items ?? []).map((d) => d.id));

  const kpis: [string, string, string, string][] = [
    [L("NFT Passports Minted", "已鑄造 NFT 護照"), s ? String(s.minted) : "—", s ? L(`of ${s.listings} listings`, `共 ${s.listings} 項刊登`) : "", "NF"],
    [L("Active AI Matches", "有效撮合"), s ? String(s.matches) : "—", s ? L(`avg ${s.avgScore}% score`, `平均 ${s.avgScore} 分`) : "", "MC"],
    [L("Buyer Demands", "買方需求"), s ? String(s.demands) : "—", L("live demand sources", "有效需求來源"), "DM"],
    [L("Completed Trades", "已完成交易"), s ? String(s.settled) : "—", s ? L(`of ${s.trades} records`, `共 ${s.trades} 筆記錄`) : "", "TR"],
  ];

  return <>
    <PageHeader eyebrow={L("AI MATCHING / TRADE DESK", "AI 撮合／交易台")} title={L("Match & Trades", "撮合與交易")}
      subtitle={L("The matching engine pairs seller NFT passports with buyer demand; buyers open trades from a match and sellers confirm delivery and payment.", "撮合引擎將賣家 NFT 護照與買方需求配對；買方由撮合結果發起交易，賣方確認交付及收款。")}
      actions={<button className="secondary-btn" onClick={() => go("demands")}>{L("Buyer demands", "買方需求")} →</button>} />
    <section className="kpi-grid four" aria-label="Match and trade metrics">{kpis.map(([label, value, hint, code]) => <article className="kpi-card" key={code}><div className="kpi-top"><span className="mini-icon">{code}</span><span className="trend">live</span></div><strong>{value}</strong><p>{label}</p><small>{hint}</small></article>)}</section>
    {s && <section className="panel insight-panel"><PanelHead title={L("Demand Data Summary", "需求數據匯總")} subtitle={L("Buyer demand concentration by category and region", "按品類與地區的買方需求分佈")} />
      <div className="insight-split">
        <div><p className="insight-label">{L("Top categories", "熱門品類")}</p>{s.topCategories.map((c) => <div className="bar-row" key={c.name}><p>{c.name}</p><div className="bar"><i style={{ width: `${(c.count / (s.topCategories[0]?.count || 1)) * 100}%` }} /></div><strong>{c.count}</strong></div>)}</div>
        <div><p className="insight-label">{L("Top regions", "熱門地區")}</p>{s.topRegions.map((r) => <div className="bar-row" key={r.name}><p>{r.name}</p><div className="bar"><i style={{ width: `${(r.count / (s.topRegions[0]?.count || 1)) * 100}%` }} /></div><strong>{r.count}</strong></div>)}</div>
      </div></section>}
    <section className="panel match-design-panel">
      <PanelHead title={L("How Matching Works", "撮合如何運作")} subtitle={L("Rule-based scoring over category, region, quantity and buyer rating, with the buyer's profile as evidence", "按品類、地區、數量及買方評級評分，並以買方檔案作為依據")} action={<span className="alert-count">{s?.matches ?? "—"} {L("matches", "項撮合")}</span>} />
      <div className="match-pipeline">
        <div className="pipeline-stage"><span className="pipeline-num">01</span><div><strong>{L("Scoring", "評分")}</strong><p>{L("Live listings × buyer demands, scored on category, region, quantity and rating.", "在售刊登 × 買方需求，按品類、地區、數量及評級評分。")}</p></div></div><i>→</i>
        <div className="pipeline-stage"><span className="pipeline-num">02</span><div><strong>{L("Evidence", "依據")}</strong><p>{L("Each match cites the buyer company's procurement needs from its profile.", "每條撮合引用買方公司檔案中的採購需求。")}</p></div></div>
      </div>
      <div className="score-key"><span>+40</span>{L("category", "品類")}<span>+25</span>{L("region", "地區")}<span>+20</span>{L("quantity", "數量")}<span>+15</span>{L("rating", "評級")}</div>
      {matches.error ? <ErrorState error={matches.error} onRetry={matches.reload} /> : !matches.data ? <LoadingState compact /> : <div className="match-list">{matches.data.items.map((match) => <div className="match-row" key={match.id}>
        <div className="match-score"><strong>{match.score}</strong><small>match</small></div>
        <div className="match-pair">
          <div className="match-side"><span className="match-tag sell">NFT</span><div><small>SELLER · {match.listing.seller}</small><strong>{match.listing.material}</strong><IdLink className="mono-id" id={match.listing.nftTokenId} onOpen={() => go("listing-detail", match.listing.id)} /></div></div><b>↔</b>
          <div className="match-side"><span className="match-tag buy">BUY</span><div><small>BUYER · {match.demand.company}</small><strong>{match.demand.industry}</strong><span className="mono-id">{match.demand.region} · {match.demand.id}</span></div></div>
        </div>
        <ul className="match-reasons">{match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {myDemandIds.has(match.demand.id) && match.suggestedQuantity > 0 && <button className="secondary-btn compact match-action" onClick={() => setTrading(match)}>{L(`Trade ${match.suggestedQuantity} t`, `交易 ${match.suggestedQuantity} 噸`)}</button>}
      </div>)}</div>}
    </section>
    <section className="panel trade-panel">
      <PanelHead title={L("Buyer & Seller Transaction Records", "買賣雙方交易記錄")} subtitle={L("Buyers open trades; sellers confirm delivery, then payment", "買方發起交易；賣方確認交付，再確認收款")} action={<button className="secondary-btn compact" onClick={() => exportCsv("trades", { status: tradeFilter.status, mine: tradeFilter.mine ? true : undefined })}>{L("Export", "匯出")}</button>} />
      <div className="filter-toolbar">
        <select aria-label={L("Status", "狀態")} value={tradeFilter.status} onChange={(event) => { setTradeFilter((f) => ({ ...f, status: event.target.value })); setPage(1); }}><option value="">{L("All statuses", "全部狀態")}</option>{["In Progress", "Completed", "Settled", "Cancelled"].map((v) => <option key={v}>{v}</option>)}</select>
        <label className="check-label"><input type="checkbox" checked={!!tradeFilter.mine} onChange={(event) => { setTradeFilter((f) => ({ ...f, mine: event.target.checked ? "1" : "" })); setPage(1); }} />{L("Only my company's trades", "只顯示本公司的交易")}</label>
      </div>
      {trades.error ? <ErrorState error={trades.error} onRetry={trades.reload} /> : !trades.data ? <LoadingState compact /> : trades.data.items.length === 0 ? <EmptyState title={L("No trades", "沒有交易")} /> : <>
        <div className={`table-scroll ${trades.stale ? "is-stale" : ""}`}><table><thead><tr><th>Trade ID</th><th>{L("NFT / Listing", "NFT／刊登")}</th><th>{L("Buyer", "買方")}</th><th>{L("Seller", "賣方")}</th><th>{L("Quantity", "數量")}</th><th>{L("Price", "價格")}</th><th>{L("Status", "狀態")}</th><th>Tx Hash</th><th>{L("Date", "日期")}</th><th>{L("Actions", "操作")}</th></tr></thead>
          <tbody>{trades.data.items.map((trade) => <tr key={trade.id} onClick={() => go("listing-detail", trade.listingId)}><td className="mono-id">{trade.id}</td><td><IdLink id={trade.nftTokenId} onOpen={() => go("listing-detail", trade.listingId)} /></td><td><strong>{trade.buyer}</strong></td><td>{trade.seller}</td><td><strong>{formatQuantity(trade.quantity)}</strong></td><td>{formatHkd(trade.priceHkd)}</td><td><StatusBadge status={trade.status} /></td><td className="mono-id" title={trade.txHash ?? ""}>{formatHash(trade.txHash)}</td><td>{formatDate(trade.tradedOn)}</td><td onClick={(event) => event.stopPropagation()}><TradeActions trade={trade} /></td></tr>)}</tbody></table></div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={trades.data.total} onPage={setPage} />
      </>}
    </section>
    {trading && tradeListing.data && <TradeModal listing={tradeListing.data} demands={myDemands.data?.items ?? []} demandId={trading.demand.id} suggestedQuantity={Math.min(trading.suggestedQuantity, tradeListing.data.available)} close={() => setTrading(null)} />}
  </>;
}

function TradeActions({ trade }: { trade: TradeDto }) {
  const { L, refresh } = useApp();
  const { busy, run } = useAction();
  const act = async (fn: () => Promise<unknown>, message: string) => { if (await run(fn, message)) refresh(); };
  const cancel = async () => {
    const reason = window.prompt(L("Reason for cancelling this trade (optional):", "取消交易的原因（選填）："));
    if (reason === null) return;
    await act(() => cancelTrade(trade.id, reason || undefined), L("Trade cancelled", "交易已取消"));
  };
  const { isSeller, isBuyer } = trade.viewer;
  return <div className="table-actions">
    {isSeller && trade.status === "In Progress" && <button className="mini-btn primary" disabled={busy} onClick={() => act(() => completeTrade(trade.id), L("Delivery confirmed; NFT transferred", "已確認交付，NFT 已轉移"))}>{L("Confirm delivery", "確認交付")}</button>}
    {isSeller && trade.status === "Completed" && <button className="mini-btn primary" disabled={busy} onClick={() => act(() => settleTrade(trade.id), L("Payment confirmed", "已確認收款"))}>{L("Confirm payment", "確認收款")}</button>}
    {(isSeller || isBuyer) && trade.status === "In Progress" && <button className="mini-btn" disabled={busy} onClick={cancel}>{L("Cancel", "取消")}</button>}
    {!(isSeller || isBuyer) || trade.status === "Settled" || trade.status === "Cancelled" ? <span className="muted-note">—</span> : null}
  </div>;
}

// ── Buyer demands & company profile ─────────────────────────────────────────

const REGION_NAMES = Object.keys(REGIONS) as Region[];

export function DemandsView() {
  const { L, version, user, isAdmin, refresh } = useApp();
  const [filters, setFilters] = useState({ category: "", region: "", mine: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DemandDto | "new" | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const { busy, run } = useAction();
  const query = { ...filters, mine: filters.mine ? true : undefined, page, pageSize: PAGE_SIZE };
  const demands = useApiData(`demands|${JSON.stringify(query)}|${version}`, (signal) => listDemands(query, signal));
  const profile = useApiData(`company|${user.company}|${version}`, (signal) => getCompany(user.company, signal));
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => { setFilters((current) => ({ ...current, [key]: event.target.value })); setPage(1); };

  const remove = async (demand: DemandDto) => {
    if (!window.confirm(L(`Delete demand ${demand.id}?`, `確定刪除需求 ${demand.id}？`))) return;
    if (await run(() => deleteDemand(demand.id).then(() => true), L("Demand deleted", "需求已刪除"))) refresh();
  };

  return <>
    <PageHeader eyebrow={L("MARKETPLACE / BUYER DEMANDS", "資源市場／買方需求")} title={L("Buyer Demands", "買方需求")}
      subtitle={L("What buyers need: every demand is matched against the live listings.", "買方的材料需求：每項需求都會與在售刊登進行撮合。")}
      actions={<><button className="secondary-btn" onClick={() => exportCsv("demands", { category: filters.category, region: filters.region })}>{L("Export", "匯出")}</button><button className="primary-btn" onClick={() => setEditing("new")}>+ {L("Post a demand", "發布需求")}</button></>} />
    <section className="panel company-card"><PanelHead title={L(`Company profile · ${user.company}`, `公司檔案 · ${user.company}`)} subtitle={L("The matching engine cites this profile as evidence to sellers.", "撮合引擎會以此檔案作為向賣方說明的依據。")} action={<button className="secondary-btn compact" onClick={() => setEditingProfile(true)}>{profile.data ? L("Edit profile", "編輯檔案") : L("Create profile", "建立檔案")}</button>} />
      {profile.data ? <dl className="structured-list"><div><dt>{L("Industry", "行業")}</dt><dd>{profile.data.industry}</dd></div><div><dt>{L("Region", "地區")}</dt><dd>{profile.data.region}</dd></div><div><dt>{L("Procurement needs", "採購需求")}</dt><dd>{profile.data.needs}</dd></div><div><dt>{L("Capacity", "處理能力")}</dt><dd>{profile.data.capacity}</dd></div><div><dt>{L("History", "歷史")}</dt><dd>{profile.data.history}</dd></div><div><dt>{L("Buyer rating", "買方評級")}</dt><dd>{profile.data.rating.toFixed(1)} / 5</dd></div></dl>
        : profile.loading ? <LoadingState compact /> : <p className="muted-note">{L("No profile yet. It is created automatically with your first demand, or create it now.", "尚未有檔案。發布第一項需求時會自動建立，也可以現在建立。")}</p>}
    </section>
    <section className="panel records-panel"><PanelHead title={L("Demands", "需求列表")} subtitle={L("Newest first", "最新優先")} />
      <div className="filter-toolbar">
        <select aria-label={L("Category", "類別")} value={filters.category} onChange={set("category")}><option value="">{L("All categories", "全部類別")}</option>{LISTING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label={L("Region", "地區")} value={filters.region} onChange={set("region")}><option value="">{L("All regions", "全部地區")}</option>{REGION_NAMES.map((r) => <option key={r}>{r}</option>)}</select>
        <label className="check-label"><input type="checkbox" checked={!!filters.mine} onChange={(event) => { setFilters((f) => ({ ...f, mine: event.target.checked ? "1" : "" })); setPage(1); }} />{L("Only my company's", "只顯示本公司")}</label>
      </div>
      {demands.error ? <ErrorState error={demands.error} onRetry={demands.reload} /> : !demands.data ? <LoadingState compact /> : demands.data.items.length === 0 ? <EmptyState title={L("No demands", "沒有需求")} /> : <>
        <div className="table-scroll"><table><thead><tr><th>ID</th><th>{L("Company", "公司")}</th><th>{L("Industry", "行業")}</th><th>{L("Region", "地區")}</th><th>{L("Category", "類別")}</th><th>{L("Quantity", "數量")}</th><th>{L("Deadline", "截止日期")}</th><th>{L("Contact", "聯絡")}</th><th>{L("Actions", "操作")}</th></tr></thead>
          <tbody>{demands.data.items.map((d) => <tr key={d.id}><td className="mono-id">{d.id}</td><td><strong>{d.company}</strong></td><td>{d.industry}</td><td>{d.region}</td><td>{d.category}</td><td>{formatQuantity(d.quantity)}</td><td>{d.deadline < todayIso() ? <StatusBadge status="Cancelled" label={L(`Expired ${formatDate(d.deadline)}`, `已過期 ${formatDate(d.deadline)}`)} /> : formatDate(d.deadline)}</td><td>{d.contact}</td>
            <td>{d.viewer.canManage ? <div className="table-actions"><button className="mini-btn" onClick={() => setEditing(d)}>{L("Edit", "修改")}</button><button className="mini-btn" disabled={busy} onClick={() => remove(d)}>{L("Delete", "刪除")}</button></div> : <span className="muted-note">—</span>}</td></tr>)}</tbody></table></div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={demands.data.total} onPage={setPage} />
      </>}
    </section>
    {editing && <DemandModal demand={editing === "new" ? null : editing} allowCompany={isAdmin} close={() => setEditing(null)} />}
    {editingProfile && <CompanyModal name={user.company} profile={profile.data ?? null} close={() => setEditingProfile(false)} />}
  </>;
}

function DemandModal({ demand, allowCompany, close }: { demand: DemandDto | null; allowCompany: boolean; close: () => void }) {
  const { L, user, refresh, notify } = useApp();
  const { bind, form, error, setError, busy, submit } = useModalForm({
    company: demand?.company ?? user.company, industry: demand?.industry ?? "", region: demand?.region ?? "Hong Kong", category: demand?.category ?? "Concrete",
    quantity: demand ? String(demand.quantity.value) : "", deadline: demand?.deadline ?? "", contact: demand?.contact ?? user.email,
  });
  const save = async () => {
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(L("Quantity must be a positive number.", "數量必須為正數。"));
    const input: DemandInput = {
      industry: form.industry, region: form.region as Region, category: form.category as DemandInput["category"], quantity: { value: quantity, unit: "t" }, deadline: form.deadline, contact: form.contact,
      ...(allowCompany && !demand && form.company !== user.company ? { company: form.company } : {}),
    };
    if (await submit(() => (demand ? updateDemand(demand.id, input) : createDemand(input)))) {
      close(); refresh(); notify(demand ? L("Demand updated", "需求已更新") : L("Demand posted; matches are recalculated", "需求已發布，撮合結果已更新"));
    }
  };
  return <ModalForm eyebrow={demand?.id ?? "BUYER DEMAND"} title={demand ? L("Edit Demand", "修改需求") : L("Post a Demand", "發布需求")} subtitle={L("Sellers see matching demands on the trade desk.", "賣方會在交易台看到相符的需求。")} onClose={close} onSubmit={save} submitLabel={demand ? L("Save changes", "儲存修改") : L("Post demand", "發布需求")} busy={busy} error={error}>
    {allowCompany && !demand && <label>{L("Company (administrators may post for another company)", "公司（管理員可代其他公司發布）")}<input required {...bind("company")} /></label>}
    <div className="form-row"><label>{L("Industry", "行業")}<input required minLength={2} {...bind("industry")} placeholder="e.g. Road Construction" /></label><label>{L("Region", "地區")}<select {...bind("region")}>{REGION_NAMES.map((r) => <option key={r}>{r}</option>)}</select></label></div>
    <div className="form-row"><label>{L("Material category", "材料類別")}<select {...bind("category")}>{LISTING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>{L("Quantity (t)", "數量（公噸）")}<input required inputMode="decimal" {...bind("quantity")} /></label></div>
    <div className="form-row"><label>{L("Deadline", "截止日期")}<input type="date" required min={todayIso()} {...bind("deadline")} /></label><label>{L("Contact email", "聯絡電郵")}<input type="email" required {...bind("contact")} /></label></div>
  </ModalForm>;
}

function CompanyModal({ name, profile, close }: { name: string; profile: CompanyDto | null; close: () => void }) {
  const { L, refresh, notify } = useApp();
  const { bind, form, busy, error, submit } = useModalForm({
    industry: profile?.industry ?? "", region: profile?.region ?? "Hong Kong", needs: profile?.needs ?? "", capacity: profile?.capacity ?? "", history: profile?.history ?? "",
  });
  const save = async () => {
    if (await submit(() => saveCompany(name, { ...form, region: form.region as Region }))) { close(); refresh(); notify(L("Company profile saved", "公司檔案已儲存")); }
  };
  return <ModalForm eyebrow={name} title={L("Company Profile", "公司檔案")} subtitle={L("Used as evidence in match reasons. Ratings are set by administrators.", "作為撮合理由的依據。評級由管理員設定。")} onClose={close} onSubmit={save} submitLabel={L("Save profile", "儲存檔案")} busy={busy} error={error}>
    <div className="form-row"><label>{L("Industry", "行業")}<input required minLength={2} {...bind("industry")} /></label><label>{L("Region", "地區")}<select {...bind("region")}>{REGION_NAMES.map((r) => <option key={r}>{r}</option>)}</select></label></div>
    <label>{L("Procurement needs", "採購需求")}<textarea required minLength={2} maxLength={300} rows={3} {...bind("needs")} placeholder={L("e.g. Recycled concrete aggregate for highway sub-base", "例如：用於公路底基層的再生混凝土骨料")} /></label>
    <div className="form-row"><label>{L("Capacity", "處理能力")}<input required {...bind("capacity")} placeholder="e.g. 800 t/month" /></label><label>{L("History", "交易歷史")}<input required {...bind("history")} placeholder={L("e.g. Recurring quarterly buyer", "例如：每季固定採購")} /></label></div>
  </ModalForm>;
}
