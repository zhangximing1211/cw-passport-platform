import { useState } from "react";
import { LISTING_CATEGORIES, LISTING_STATUSES, ORIGINS, type DemandDto, type ListingDto } from "../../shared/api";
import {
  createTrade, delistListing, exportCsv, formatDate, formatHash, formatHkd, formatHkDate, formatQuantity, getListing, getPassport,
  getPassportEvents, listDemands, listListings, listTrades, mintListing, publishListing,
} from "../../src/api/data";
import {
  Breadcrumbs, EmptyState, ErrorState, Facts, IdLink, LoadingState, MaterialThumb, ModalForm, PageHeader, Pagination, PanelHead, PassportLink,
  StatusBadge, useAction, useApiData, useApp, useModalForm,
} from "../ui";
import { DocumentsPanel } from "./documents";
import { HistoryList, RelationRail } from "./passports";

const PAGE_SIZE = 12;
const QUANTITY_RANGES: Record<string, { minQty?: number; maxQty?: number }> = { "": {}, lt50: { maxQty: 50 }, "50to200": { minQty: 50, maxQty: 200 }, gt200: { minQty: 200 } };
export const availableLabel = (listing: ListingDto, L: (en: string, zh: string) => string) =>
  listing.availableFrom ? formatDate(listing.availableFrom) : L("Available now", "現貨");

// ── List ────────────────────────────────────────────────────────────────────

export function SellerListings() {
  const { L, search, setSearch, version, go } = useApp();
  const [mode, setMode] = useState<"grid" | "table">("grid");
  const [filters, setFilters] = useState({ category: "", quantity: "", region: "", availability: "", status: "", showInactive: "" });
  const filterKey = JSON.stringify({ ...filters, q: search.trim() });
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const apiQuery = {
    q: search.trim(), category: filters.category, region: filters.region, availability: filters.availability, status: filters.status,
    active: filters.showInactive ? undefined : true, ...QUANTITY_RANGES[filters.quantity],
  };
  const result = useApiData(`listings|${filterKey}|${page}|${version}`, (signal) => listListings({ ...apiQuery, page, pageSize: PAGE_SIZE }, signal));
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const clear = () => { setFilters({ category: "", quantity: "", region: "", availability: "", status: "", showInactive: "" }); setSearch(""); };
  const open = (id: string) => go("listing-detail", id);

  return <>
    <PageHeader eyebrow={L("MARKETPLACE / SELLER LISTINGS", "資源市場／賣方刊登")} title={L("Seller Listings", "賣方刊登")} subtitle={L("Discover available construction waste and recovered materials.", "探索可用的建築廢棄物及再生材料。")}
      actions={<><button className="secondary-btn" onClick={() => exportCsv("listings", apiQuery)}>{L("Export", "匯出")}</button><div className="view-toggle"><button className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")}>GRID</button><button className={mode === "table" ? "active" : ""} onClick={() => setMode("table")}>TABLE</button></div></>} />
    <section className="market-search-panel">
      <label><span>⌕</span><input value={search} placeholder={L("Search available materials...", "搜尋可用材料...")} onChange={(event) => setSearch(event.target.value)} /></label>
      <select aria-label={L("Category", "類別")} value={filters.category} onChange={set("category")}><option value="">{L("All materials", "全部材料")}</option>{LISTING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <select aria-label={L("Quantity", "數量")} value={filters.quantity} onChange={set("quantity")}><option value="">{L("Any quantity", "任何數量")}</option><option value="lt50">{L("Under 50 t", "50 噸以下")}</option><option value="50to200">50–200 t</option><option value="gt200">{L("Over 200 t", "200 噸以上")}</option></select>
      <select aria-label={L("Location", "位置")} value={filters.region} onChange={set("region")}><option value="">{L("All locations", "全部地點")}</option>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</select>
      <select aria-label={L("Availability", "供貨時間")} value={filters.availability} onChange={set("availability")}><option value="">{L("Any availability", "任何時間")}</option><option value="now">{L("Available now", "現貨")}</option><option value="upcoming">{L("Upcoming", "即將供貨")}</option></select>
      <select aria-label={L("Verification", "驗證")} value={filters.status} onChange={set("status")}><option value="">{L("Any verification", "任何驗證狀態")}</option>{LISTING_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
    </section>
    <div className="listing-summary"><p><strong>{result.data?.total ?? "—"}</strong> {L("material listings", "項材料刊登")} <span>·</span> {L("B2B resource availability", "B2B 資源供應")}</p>
      <label className="check-label"><input type="checkbox" checked={!!filters.showInactive} onChange={(event) => setFilters((current) => ({ ...current, showInactive: event.target.checked ? "1" : "" }))} />{L("Include delisted", "包含已下架")}</label></div>
    {result.error ? <section className="panel"><ErrorState error={result.error} onRetry={result.reload} /></section>
      : !result.data ? <LoadingState />
      : result.data.items.length === 0 ? <section className="panel"><EmptyState action={<button className="secondary-btn" onClick={clear}>{L("Clear filters", "清除篩選")}</button>} /></section>
      : <>
        {mode === "grid" ? <section className={`listing-grid ${result.stale ? "is-stale" : ""}`}>{result.data.items.map((item) => <article className="listing-card" key={item.id}><MaterialThumb tone={item.tone} large /><div className="listing-card-body">
          <div className="listing-card-top"><span className="listing-category">{item.category}</span><StatusBadge status={item.mintStatus === "delisted" ? "delisted" : item.status} /></div>
          <h2>{item.material}</h2><span className="listing-id">{item.id}</span><span className={`nft-chip ${item.mintStatus}`}>◈ {item.nftTokenId}</span>
          <dl><div><dt>{L("Quantity", "數量")}</dt><dd>{formatQuantity(item.quantity)}</dd></div><div><dt>{L("Remaining", "剩餘")}</dt><dd>{item.available} {item.quantity.unit}</dd></div><div><dt>{L("Available", "供貨")}</dt><dd>{availableLabel(item, L)}</dd></div></dl>
          <div className="passport-strip"><span>DP</span><div><small>{L("Digital Passport", "數碼護照")}</small><PassportLink id={item.passportId} /></div></div>
          <div className="seller-line"><div><small>{L("SELLER / ORGANISATION", "賣方／機構")}</small><strong>{item.seller}</strong></div><button className="secondary-btn" onClick={() => open(item.id)}>{L("View Details", "查看詳情")} →</button></div>
        </div></article>)}</section>
          : <section className="panel"><div className={`table-scroll ${result.stale ? "is-stale" : ""}`}><table><thead><tr><th>{L("Listing", "刊登")}</th><th>{L("Material", "材料")}</th><th>{L("Category", "類別")}</th><th>{L("Quantity", "數量")}</th><th>{L("Remaining", "剩餘")}</th><th>{L("Location", "位置")}</th><th>{L("Availability", "供貨")}</th><th>{L("Passport", "護照")}</th><th>NFT</th><th /></tr></thead>
            <tbody>{result.data.items.map((item) => <tr key={item.id} onClick={() => open(item.id)}><td><IdLink id={item.id} onOpen={open} /></td><td><strong>{item.material}</strong></td><td>{item.category}</td><td>{formatQuantity(item.quantity)}</td><td>{item.available} {item.quantity.unit}</td><td>{item.location}</td><td>{availableLabel(item, L)}</td><td><PassportLink id={item.passportId} /></td><td><StatusBadge status={item.mintStatus} /></td><td><button className="text-btn" onClick={(event) => { event.stopPropagation(); open(item.id); }}>{L("View", "查看")} →</button></td></tr>)}</tbody></table></div></section>}
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.data.total} onPage={(next) => setPageState({ key: filterKey, page: next })} />
      </>}
  </>;
}

// ── Detail ──────────────────────────────────────────────────────────────────

export function ListingDetail({ id }: { id: string }) {
  const { L, version, go, refresh, isAdmin, user } = useApp();
  const [tab, setTab] = useState("Overview");
  const [trading, setTrading] = useState(false);
  const { busy, run } = useAction();
  const listing = useApiData(`listing|${id}|${version}`, (signal) => getListing(id, signal));
  const passportId = listing.data?.passportId;
  const passport = useApiData(passportId ? `listing-passport|${passportId}|${version}` : null, (signal) => getPassport(passportId!, signal));
  const events = useApiData(passportId ? `listing-events|${passportId}|${version}` : null, (signal) => getPassportEvents(passportId!, signal));
  const trades = useApiData(`listing-trades|${id}|${version}`, (signal) => listTrades({ listingId: id, pageSize: 50 }, signal));
  const myDemands = useApiData(`my-demands|${version}`, (signal) => listDemands(isAdmin ? { pageSize: 100 } : { mine: true, pageSize: 100 }, signal));

  const crumbs = [{ label: L("Marketplace", "資源市場"), onClick: () => go("listings") }, { label: L("Seller Listings", "賣方刊登"), onClick: () => go("listings") }, { label: id }];
  if (listing.error) return <><Breadcrumbs items={crumbs} /><section className="panel"><ErrorState error={listing.error} onRetry={listing.reload} /></section></>;
  if (!listing.data) return <LoadingState />;
  const l = listing.data;
  const mintStep = { draft: 0, minted: 1, listed: 2, delisted: 3 }[l.mintStatus];
  const passportCompleted = passport.data?.stage === "Completed";
  const canMint = l.viewer.canManage && mintStep < 2 && !passportCompleted;
  const ownCompany = user.company.trim().toLowerCase() === l.seller.trim().toLowerCase();
  const canTrade = l.mintStatus === "listed" && l.available > 0 && !passportCompleted && (myDemands.data?.items.length ?? 0) > 0 && (!ownCompany || isAdmin);
  const eventItems = events.data?.items ?? [];
  const processing = eventItems.filter((e) => e.stage === "Sorted" || e.stage === "Processing");
  const generated = eventItems.find((e) => e.stage === "Generated");

  const advanceMint = async () => {
    const done = await run(() => (mintStep === 0 ? mintListing(l.id) : publishListing(l.id)),
      mintStep === 0 ? L(`Minted ${l.nftTokenId} on-chain`, `已上鏈鑄造 ${l.nftTokenId}`) : L("Listing is now live on the platform", "刊登已上架平台"));
    if (done) refresh();
  };
  const delist = async () => {
    const reason = window.prompt(L("Reason for withdrawing this listing (optional):", "下架原因（選填）："));
    if (reason === null) return;
    if (await run(() => delistListing(l.id, reason || undefined), L("Listing withdrawn", "刊登已下架"))) refresh();
  };

  const mintStages = [
    { en: "Draft — ready to mint", zh: "待上鏈 — 準備鑄造" }, { en: "Minted on-chain", zh: "已上鏈鑄造" }, { en: "Listed on platform", zh: "已上架進平台" },
  ];
  const tabs: [string, string][] = [["Overview", "概覽"], ["Material Information", "材料資料"], ["Source", "來源"], ["Processing Information", "處理資料"], ["Digital Passport", "數碼護照"], ["Trades", "交易"], ["Documents", "文件"], ["History", "歷史"]];

  return <>
    <Breadcrumbs items={[...crumbs.slice(0, 2), { label: l.nftTokenId }]} />
    <section className="panel nft-passport">
      <div className="nft-head"><div><p className="eyebrow">NFT PASSPORT · ON-CHAIN MATERIAL IDENTITY</p><h2>{L("NFT Passport", "NFT 護照")}</h2><p>{L("Each seller listing is minted as an NFT passport — token ID, type and photo — recorded on-chain before entering the platform.", "每件賣家刊登都鑄造為 NFT 護照 — 含編號、類型與照片 — 上鏈後才進入平台。")}</p></div><StatusBadge status={l.mintStatus} /></div>
      <div className="nft-body">
        <div className="nft-photo"><MaterialThumb tone={l.tone} large /><span className="nft-token-label">TOKEN ID</span><span className="nft-token-id">{l.nftTokenId}</span></div>
        <div className="nft-facts">
          <dl className="listing-facts"><div><dt>{L("Token ID", "編號")}</dt><dd className="mono-id">{l.nftTokenId}</dd></div><div><dt>{L("Type", "類型")}</dt><dd>{l.nftType}</dd></div><div><dt>{L("Photo", "照片")}</dt><dd>{L("See Documents", "見文件")}</dd></div><div><dt>{L("Tx Hash", "交易哈希")}</dt><dd className="mono-id" title={l.txHash ?? ""}>{formatHash(l.txHash)}</dd></div></dl>
          <div className="mint-stages">{mintStages.map((stage, index) => <div className={`mint-stage ${index < mintStep ? "done" : index === mintStep ? "current" : ""}`} key={stage.en}><span>{index < mintStep ? "✓" : index + 1}</span><div><strong>{L(stage.en, stage.zh)}</strong></div>{index < mintStages.length - 1 && <i />}</div>)}</div>
          <div className="mint-actions">
            {canMint && <button className="primary-btn" onClick={advanceMint} disabled={busy}>{mintStep === 0 ? L("Mint to blockchain", "上鏈鑄造") : L("List on platform", "上架進平台")} →</button>}
            {l.mintStatus === "listed" && <span className="muted-note">{L("Live on the platform", "已在平台上架")}</span>}
            {l.mintStatus === "delisted" && <span className="muted-note">{passportCompleted ? L("Off the market: the material has been reused or sold out", "已下架：材料已再利用或售罄") : L("Off the market", "已下架")}</span>}
            {!l.viewer.canManage && mintStep < 2 && <span className="muted-note">{L("The seller mints and publishes this listing.", "由賣方鑄造及上架此刊登。")}</span>}
            {l.viewer.canManage && l.mintStatus !== "delisted" && <button className="secondary-btn danger" disabled={busy} onClick={delist}>{L("Withdraw listing", "下架")}</button>}
          </div>
        </div>
      </div>
    </section>
    <section className="panel listing-hero"><div className="material-gallery"><MaterialThumb tone={l.tone} large /><div className="gallery-thumbs"><button className="active"><MaterialThumb tone={l.tone} /></button><button><MaterialThumb tone="concrete-alt" /></button><button><MaterialThumb tone="aggregate" /></button></div></div>
      <div className="listing-info"><div className="listing-title-row"><div><p className="eyebrow">{l.id} · {l.status.toUpperCase()} MATERIAL</p><h1>{l.material}</h1><p>{L("Recovered construction material for qualified reuse applications.", "可供合資格再利用用途的回收建築材料。")}</p></div><StatusBadge status={l.status} /></div>
        <dl className="listing-facts"><div><dt>{L("Material Category", "材料類別")}</dt><dd>{l.category}</dd></div><div><dt>{L("Quantity", "數量")}</dt><dd>{formatQuantity(l.quantity)}</dd></div><div><dt>{L("Still available", "剩餘可售")}</dt><dd>{l.available} {l.quantity.unit}</dd></div><div><dt>{L("Current Location", "目前位置")}</dt><dd>{l.location}</dd></div><div><dt>{L("Available From", "供貨日期")}</dt><dd>{availableLabel(l, L)}</dd></div><div><dt>{L("Seller / Organisation", "賣方／機構")}</dt><dd>{l.seller}</dd></div></dl>
        <div className="action-bar">
          <button className="primary-btn passport-cta" onClick={() => go("passport-detail", l.passportId)}><span>DP</span>{L("View Digital Passport", "查看數碼護照")} <b>→</b></button>
          {canTrade && <button className="secondary-btn" onClick={() => setTrading(true)}>{L("Open a trade", "發起交易")}</button>}
          {l.mintStatus === "listed" && !canTrade && !ownCompany && myDemands.data?.items.length === 0 && <span className="muted-note">{L("Post a buyer demand first to trade.", "請先發布買方需求才能交易。")}</span>}
        </div>
      </div></section>
    <section className="panel detail-tabs listing-tabs"><div className="tabs" role="tablist">{tabs.map(([en, zh]) => <button key={en} role="tab" aria-selected={tab === en} className={tab === en ? "active" : ""} onClick={() => setTab(en)}>{L(en, zh)}</button>)}</div>
      <div className="tab-content">
        {tab === "Overview" && <div className="listing-overview"><div><PanelHead title={L("Material Overview", "材料總覽")} /><p className="muted-note">{L("Recovered material linked to a verified digital passport and its recorded source project.", "與已驗證數碼護照及其來源項目關聯的回收材料。")}</p>
          <Facts rows={[[L("Source Project", "來源項目"), passport.data?.project ?? "—"], [L("Origin", "來源地"), passport.data?.origin ?? "—"], [L("Recorded Quantity", "記錄數量"), formatQuantity(l.quantity)], [L("Availability", "供貨"), availableLabel(l, L)]]} /></div>
          <div><PanelHead title={L("Connected Data Objects", "關聯資料物件")} /><div className="relationship-stack">
            <button onClick={() => go("passport-detail", l.passportId)}><span>DP</span><div><small>{L("Digital Passport", "數碼護照")}</small><strong>{l.passportId}</strong></div><b>→</b></button>
            {l.transferId && <button onClick={() => go("crossborder-detail", l.transferId!)}><span>CB</span><div><small>{L("Cross-border Record", "跨境記錄")}</small><strong>{l.transferId}</strong></div><b>→</b></button>}
          </div></div></div>}
        {tab === "Material Information" && <Facts wide rows={[[L("Material", "材料"), l.material], [L("Category", "類別"), l.category], [L("Quantity", "數量"), formatQuantity(l.quantity)], [L("Still available", "剩餘可售"), `${l.available} ${l.quantity.unit}`], [L("Current Location", "目前位置"), l.location], [L("NFT type", "NFT 類型"), l.nftType]]} />}
        {tab === "Source" && <Facts wide rows={[[L("Source Project", "來源項目"), passport.data?.project ?? "—"], [L("Origin", "來源地"), passport.data?.origin ?? "—"], [L("Generated", "產生日期"), generated ? formatHkDate(generated.occurredAt) : "—"], [L("Generated by", "產生單位"), generated?.actor ?? "—"]]} />}
        {tab === "Processing Information" && (processing.length ? <Facts wide rows={processing.map((e) => [`${e.stage} · ${formatHkDate(e.occurredAt)}`, `${e.place} — ${e.actor}`] as [string, string])} /> : <EmptyState title={L("No processing recorded", "尚無處理記錄")} hint={L("Sorting and processing events of the passport appear here.", "護照的分揀及處理事件會顯示於此。")} />)}
        {tab === "Digital Passport" && <Facts wide rows={[[L("Passport ID", "護照編號"), l.passportId], [L("Verification", "驗證"), passport.data?.status ?? "—"], [L("Lifecycle Stage", "生命週期階段"), passport.data?.stage ?? "—"], [L("Last Updated", "最後更新"), passport.data ? formatHkDate(passport.data.updatedAt) : "—"]]} />}
        {tab === "Trades" && (trades.data?.items.length ? <div className="table-scroll"><table><thead><tr><th>Trade ID</th><th>{L("Buyer", "買方")}</th><th>{L("Quantity", "數量")}</th><th>{L("Price", "價格")}</th><th>{L("Status", "狀態")}</th><th>{L("Date", "日期")}</th></tr></thead><tbody>
          {trades.data.items.map((t) => <tr key={t.id}><td className="mono-id">{t.id}</td><td>{t.buyer}</td><td>{formatQuantity(t.quantity)}</td><td>{formatHkd(t.priceHkd)}</td><td><StatusBadge status={t.status} /></td><td>{formatDate(t.tradedOn)}</td></tr>)}
        </tbody></table></div> : <EmptyState title={L("No trades yet", "尚無交易")} hint={L("Trades opened on this listing appear here.", "此刊登的交易會顯示於此。")} />)}
        {tab === "Documents" && <DocumentsPanel ownerType="listing" ownerId={l.id} canUpload={l.viewer.canManage} defaultKind="Material Photo" subtitle={L("Photos and specifications shown to buyers", "向買方展示的照片及規格")} />}
        {tab === "History" && <HistoryList entityType="listing" entityId={l.id} />}
      </div></section>
    <section className="panel traceability-panel"><PanelHead title={L("Material Traceability", "材料追溯")} subtitle={L("Source, processing and current location", "來源、處理及目前位置")} /><div className="trace-route">
      <div><span>01</span><small>{L("SOURCE PROJECT", "來源項目")}</small><strong>{passport.data?.project ?? "—"}</strong><p>{passport.data?.origin ?? ""}{generated ? ` · ${L("Generated", "產生")} ${formatHkDate(generated.occurredAt)}` : ""}</p></div><i>→</i>
      <div><span>02</span><small>{L("PROCESSING", "處理")}</small><strong>{processing.at(-1)?.place ?? "—"}</strong><p>{processing.at(-1) ? `${processing.at(-1)!.actor} · ${formatHkDate(processing.at(-1)!.occurredAt)}` : L("Not recorded", "未記錄")}</p></div><i>→</i>
      <div><span>03</span><small>{L("CURRENT LOCATION", "目前位置")}</small><strong>{passport.data?.location ?? l.location}</strong><p>{availableLabel(l, L)}</p></div>
    </div></section>
    <RelationRail active="marketplace" material={l.material} passportId={l.passportId} transferId={l.transferId ?? undefined} listingId={l.id} />
    {trading && <TradeModal listing={l} demands={myDemands.data?.items ?? []} close={() => setTrading(false)} />}
  </>;
}

/** Buyer opens a trade on a listing against one of its demands. */
export function TradeModal({ listing, demands, demandId, suggestedQuantity, close }: {
  listing: Pick<ListingDto, "id" | "material" | "available" | "quantity" | "seller" | "nftTokenId">; demands: DemandDto[]; demandId?: string; suggestedQuantity?: number; close: () => void;
}) {
  const { L, refresh, notify } = useApp();
  const initialDemand = demands.find((d) => d.id === demandId) ?? demands[0];
  const initialQty = suggestedQuantity ?? Math.min(listing.available, initialDemand?.quantity.value ?? listing.available);
  const { bind, form, error, setError, busy, submit } = useModalForm({ demandId: initialDemand?.id ?? "", quantity: String(initialQty), price: "" });
  const save = async () => {
    const quantity = Number(form.quantity);
    const price = Math.round(Number(form.price));
    if (!form.demandId) return setError(L("Choose one of your demands.", "請選擇您的需求。"));
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(L("Quantity must be a positive number.", "數量必須為正數。"));
    if (!Number.isFinite(price) || price <= 0) return setError(L("Enter a price in HK$.", "請輸入港幣價格。"));
    let id = "";
    if (await submit(async () => { id = (await createTrade({ listingId: listing.id, demandId: form.demandId, quantityValue: quantity, priceHkd: price })).id; })) {
      close(); refresh(); notify(L(`Trade ${id} opened; the seller has been notified`, `交易 ${id} 已發起，已通知賣方`));
    }
  };
  return <ModalForm eyebrow={listing.nftTokenId} title={L("Open a Trade", "發起交易")} subtitle={L(`${listing.material} from ${listing.seller} · ${listing.available} ${listing.quantity.unit} still available`, `${listing.seller} 的 ${listing.material} · 剩餘 ${listing.available} ${listing.quantity.unit}`)} onClose={close} onSubmit={save} submitLabel={L("Open trade", "發起交易")} busy={busy} error={error}>
    <label>{L("For which demand", "對應需求")}<select required {...bind("demandId")}>{demands.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.company} · {d.category} · {formatQuantity(d.quantity)}</option>)}</select></label>
    <div className="form-row"><label>{L("Quantity (t)", "數量（公噸）")}<input required inputMode="decimal" {...bind("quantity")} /></label><label>{L("Total price (HK$)", "總價（港幣）")}<input required inputMode="numeric" {...bind("price")} placeholder="e.g. 30000" /></label></div>
    <div className="modal-note"><span>→</span><p>{L("The seller confirms delivery (the NFT moves to you on-chain) and then payment. Selling the last of a listing takes it off the market.", "賣方先確認交付（NFT 於鏈上轉移給您），再確認收款。售罄後刊登自動下架。")}</p></div>
  </ModalForm>;
}
