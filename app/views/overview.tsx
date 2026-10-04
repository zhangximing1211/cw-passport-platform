import { PASSPORT_STAGES, type AlertCode } from "../../shared/api";
import { formatHkDateTime, formatQuantity, formatTonnes, getMaterialStats, getOverviewStats, listPassports, listTransfers } from "../../src/api/data";
import { EmptyState, ErrorState, IdLink, LoadingState, MaterialThumb, PageHeader, PanelHead, PassportLink, StatusBadge, toneOf, useApiData, useApp, type L, type View } from "../ui";

const trendLabel = (trend: number | null) => trend === null ? "—" : `${trend < 0 ? "−" : "+"}${Math.abs(trend).toFixed(1)}%`;
const trendArrow = (trend: string) => trend === "—" ? "" : trend.startsWith("−") ? "↘" : "↗";
const DONUT_COLORS = ["#227c69", "#557b91", "#a77d54", "#70a8ae", "#89969e", "#c3cbd0"];

const ALERTS: Record<AlertCode, { code: string; target: View; text: (n: number, L: L) => string }> = {
  TRANSFERS_PENDING_REVIEW: { code: "CB", target: "compliance", text: (n, L) => L(`${n} cross-border records pending compliance review`, `${n} 項跨境記錄待合規審核`) },
  PASSPORTS_PENDING: { code: "PD", target: "passport-registry", text: (n, L) => L(`${n} passports awaiting verification`, `${n} 本護照待驗證`) },
  LISTINGS_PENDING: { code: "SL", target: "listings", text: (n, L) => L(`${n} listings awaiting verification`, `${n} 項刊登待驗證`) },
  LISTINGS_UNMINTED: { code: "NF", target: "listings", text: (n, L) => L(`${n} listings not yet minted on-chain`, `${n} 項刊登尚未上鏈鑄造`) },
};
const PRIORITY_ZH = { High: "高優先", Medium: "中優先", Low: "低優先" } as const;

export function Overview({ days }: { days: number }) {
  const { L, version, go } = useApp();
  const stats = useApiData(`overview|${days}|${version}`, (signal) => getOverviewStats(days, signal));
  const recent = useApiData(`recent-passports|${version}`, (signal) => listPassports({ sort: "updated_desc", pageSize: 5 }, signal));
  const recentTransfers = useApiData(`recent-transfers|${version}`, (signal) => listTransfers({ pageSize: 4 }, signal));
  const s = stats.data;
  const periodLabel = days === 365 ? L("vs the previous year", "與上一年比較") : L(`vs the previous ${days} days`, `與前 ${days} 日比較`);

  if (stats.error) return <section className="panel"><ErrorState error={stats.error} onRetry={stats.reload} /></section>;
  if (!s) return <LoadingState />;

  const kpis: [string, string, string, string, View][] = [
    [L("Total Digital Passports", "數碼護照總數"), s.kpis.passports.value.toLocaleString("en-US"), trendLabel(s.kpis.passports.trend), "DP", "passport-registry"],
    [L("Active Material Batches", "活躍材料批次"), s.kpis.activeBatches.value.toLocaleString("en-US"), trendLabel(s.kpis.activeBatches.trend), "MB", "materials"],
    [L("Cross-border Records", "跨境記錄"), s.kpis.transfers.value.toLocaleString("en-US"), trendLabel(s.kpis.transfers.trend), "CB", "crossborder"],
    [L("Active Seller Listings", "在售刊登"), s.kpis.listings.value.toLocaleString("en-US"), trendLabel(s.kpis.listings.trend), "SL", "listings"],
    [L("Total Material Volume", "材料總量"), formatTonnes(s.kpis.volumeTonnes.value), trendLabel(s.kpis.volumeTonnes.trend), "TV", "materials"],
  ];
  const distribution: [string, number][] = [
    ...s.distribution.slice(0, 5).map((d) => [d.category, d.share] as [string, number]),
    ...(s.distribution.length > 5 ? [["Other", s.distribution.slice(5).reduce((sum, d) => sum + d.share, 0)] as [string, number]] : []),
  ];
  let cumulative = 0;
  const donut = `conic-gradient(${distribution.map(([, share], i) => `${DONUT_COLORS[i]} ${cumulative}% ${(cumulative += share)}%`).join(",")})`;
  const flowTargets: View[] = ["passport-registry", "passport-registry", "passport-registry", "crossborder", "listings"];

  return <>
    <PageHeader eyebrow={L("WORKSPACE / OVERVIEW", "工作區／平台總覽")} title={L("Construction Waste Intelligence Overview", "建築廢棄物智慧總覽")} subtitle={L("Monitor material passports, cross-border movement and marketplace activity.", "監察材料護照、跨境流動與資源刊登活動。")}
      actions={<div className="network-status"><span />{L("Trends", "趨勢")} <strong>{periodLabel}</strong></div>} />
    <section className="kpi-grid" aria-label="Key metrics">{kpis.map(([label, value, trend, code, target]) => <button className="kpi-card" key={code} onClick={() => go(target)}><div className="kpi-top"><span className="mini-icon">{code}</span><span className={trend.startsWith("−") ? "trend down" : "trend"}>{trendArrow(trend)} {trend}</span></div><strong>{value}</strong><p>{label}</p><small>{trend === "—" ? L("Current total", "目前總數") : L("New records " + periodLabel, "新增記錄" + periodLabel)}</small></button>)}</section>
    <section className="panel flow-panel"><PanelHead title={L("Material Flow Overview", "材料流動總覽")} subtitle={L("Lifecycle status across the construction material network", "建築材料網絡的全生命週期狀態")} action={<button className="text-btn" onClick={() => go("materials")}>{L("View material records", "查看材料記錄")} →</button>} />
      <div className="flow">{s.flow.map((step, index) => <button className="flow-step" key={step.name} onClick={() => go(flowTargets[index])}><div className="flow-line"><span className={`flow-dot ${index < 3 ? "complete" : index === 3 ? "current" : ""}`}>{index + 1}</span>{index < s.flow.length - 1 && <i />}</div><h3>{step.name}</h3><strong>{step.count.toLocaleString("en-US")}</strong><small>{formatTonnes(step.tonnes)}</small></button>)}</div></section>
    <section className="overview-split"><article className="panel recent-panel"><PanelHead title={L("Recent Digital Passports", "最近數碼護照")} subtitle={L("Latest material identity activity", "最新材料身份活動")} action={<button className="text-btn" onClick={() => go("passport-registry")}>{L("Open registry", "開啟登記冊")} →</button>} />
      {recent.data ? <div className="table-scroll"><table><thead><tr><th>Passport ID</th><th>{L("Material", "材料")}</th><th>{L("Source", "來源")}</th><th>{L("Quantity", "數量")}</th><th>{L("Stage", "階段")}</th><th>{L("Status", "狀態")}</th><th>{L("Updated", "更新")}</th></tr></thead>
        <tbody>{recent.data.items.map((item) => <tr key={item.id} onClick={() => go("passport-detail", item.id)}><td><PassportLink id={item.id} /></td><td><strong>{item.material}</strong></td><td>{item.project}</td><td>{formatQuantity(item.quantity)}</td><td>{item.stage}</td><td><StatusBadge status={item.status} /></td><td>{formatHkDateTime(item.updatedAt).split(" · ")[1]}</td></tr>)}</tbody></table></div> : <LoadingState compact />}</article>
      <article className="panel activity-panel"><PanelHead title={L("Cross-border Activity", "跨境活動")} subtitle={L("Recent jurisdiction movements", "最近跨司法管轄區流動")} action={<button className="text-btn" onClick={() => go("crossborder")}>{L("All transfers", "全部轉運")} →</button>} />
        {recentTransfers.data?.items.map((item) => <button className="route-row" key={item.id} onClick={() => go("crossborder-detail", item.id)}><span className="route-code">{item.origin === "Macau" ? "MO" : "HK"}</span><div><strong>{item.origin} <b>→</b> {item.destination}</strong><small>{item.material} · {formatQuantity(item.quantity)}</small></div><StatusBadge status={item.status} /></button>) ?? <LoadingState compact />}</article>
    </section>
    <section className="overview-lower"><article className="panel distribution-panel"><PanelHead title={L("Material Distribution", "材料分佈")} subtitle={L("Registered volume by category", "按類別統計已登記材料量")} />
      <div className="distribution-content"><div className="donut" role="img" style={{ background: donut }} aria-label={distribution.map(([name, share]) => `${name} ${Math.round(share)}%`).join(", ")}><div><strong>{(s.kpis.volumeTonnes.value / 1000).toFixed(1)}k</strong><small>tonnes</small></div></div>
        <div className="legend">{distribution.map(([name, share], index) => <div key={name}><span className={`c${index + 1}`} /><p>{name}</p><strong>{Math.round(share)}%</strong></div>)}</div></div></article>
      <article className="panel alerts-panel"><PanelHead title={L("System & Compliance Alerts", "系統及合規提示")} subtitle={L("Prioritised items requiring attention", "需要處理的優先事項")} action={<span className="alert-count">{s.alerts.length} {L("open", "項待處理")}</span>} />
        {s.alerts.length === 0 ? <p className="muted-note">{L("Nothing needs attention.", "目前沒有待處理事項。")}</p> : s.alerts.map((alert) => {
          const meta = ALERTS[alert.code];
          return <div className="alert-row" key={alert.code}><span className={`alert-icon p-${alert.priority.toLowerCase()}`}>{meta.code}</span><div><strong>{meta.text(alert.count, L)}</strong><small>{L(`${alert.priority} priority`, PRIORITY_ZH[alert.priority])}</small></div><button onClick={() => go(meta.target)}>{L("Review", "查看")} →</button></div>;
        })}</article>
    </section>
  </>;
}

// ── Material records ────────────────────────────────────────────────────────

export function MaterialRecords() {
  const { L, version, go, setSearch } = useApp();
  const stats = useApiData(`materials|${version}`, getMaterialStats);
  const open = (material: string) => { setSearch(material); go("passport-registry"); };
  return <>
    <PageHeader eyebrow={L("DIGITAL PASSPORT / MATERIAL RECORDS", "數碼護照／材料記錄")} title={L("Material Records", "材料記錄")} subtitle={L("Registered material by type: batches, tonnage and where each batch is in its lifecycle.", "按材料類型統計：批次數、噸數及各批次所處的生命週期階段。")} />
    <section className="panel records-panel">
      {stats.error ? <ErrorState error={stats.error} onRetry={stats.reload} /> : !stats.data ? <LoadingState /> : stats.data.items.length === 0 ? <EmptyState title={L("No material registered", "尚未登記材料")} /> :
        <div className="table-scroll"><table><thead><tr><th>{L("Material", "材料")}</th><th>{L("Category", "類別")}</th><th>{L("Passports", "護照數")}</th><th>{L("Tonnes", "噸數")}</th>{PASSPORT_STAGES.map((stage) => <th key={stage}>{stage}</th>)}</tr></thead>
          <tbody>{stats.data.items.map((item) => <tr key={`${item.category}|${item.material}`} onClick={() => open(item.material)}>
            <td><div className="material-cell"><MaterialThumb tone={toneOf(item.category)} /><IdLink id={item.material} onOpen={open} /></div></td><td>{item.category}</td><td><strong>{item.passports}</strong></td><td>{formatTonnes(item.tonnes)}</td>
            {PASSPORT_STAGES.map((stage) => <td key={stage}>{item.byStage[stage] ?? <span className="muted-note">·</span>}</td>)}
          </tr>)}</tbody></table></div>}
      <p className="muted-note table-foot">{L("Select a material to open its passports in the registry.", "點選材料可在登記冊中查看其護照。")}</p>
    </section>
  </>;
}
