#!/usr/bin/env node
// Generates seed/demo.sql: deterministic mock data for local development and tests.
//
//   node scripts/generate-seed.mjs        (or: npm run db:gen-seed)
//
// The original hand-written demo records from app/CwPlatform.tsx are kept verbatim
// (the UI's detail pages still point at them); everything else is generated from a
// fixed PRNG seed, so re-running produces an identical file.

import { pbkdf2Sync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../seed/demo.sql", import.meta.url));
const TODAY = Date.UTC(2026, 8, 27); // 27 Sep 2026
const DAY = 86_400_000;

// ── Deterministic helpers ───────────────────────────────────────────────────

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260927);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (items) => items[Math.floor(rand() * items.length)];
const chance = (p) => rand() < p;
const weighted = (entries) => {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, w] of entries) { if ((roll -= w) < 0) return value; }
  return entries.at(-1)[0];
};
const hex = (len) => Array.from({ length: len }, () => Math.floor(rand() * 16).toString(16)).join("");
const pad = (n, len) => String(n).padStart(len, "0");
const iso = (ms) => new Date(ms).toISOString();
const isoDate = (ms) => iso(ms).slice(0, 10);
/** Round to the minute so timestamps look like recorded events. */
const minute = (ms) => Math.floor(ms / 60_000) * 60_000;

// ── Reference data ──────────────────────────────────────────────────────────

const MATERIALS = [
  // name, passport category, listing category, tone, NFT code, typical tonnage, HK$/t
  ["Recycled Concrete Aggregate", "Concrete", "Concrete", "concrete", "CON", [80, 420], 150],
  ["Crushed Concrete Rubble", "Concrete", "Concrete", "concrete-alt", "CON", [120, 600], 110],
  ["Structural Steel Sections", "Metal", "Steel", "steel", "STL", [20, 140], 1150],
  ["Rebar Offcuts", "Metal", "Steel", "steel", "STL", [10, 90], 980],
  ["Recovered Aluminium", "Metal", "Metal", "aluminium", "ALU", [5, 40], 3800],
  ["Reclaimed Timber", "Timber", "Timber", "timber", "TMB", [15, 80], 900],
  ["Timber Formwork Panels", "Timber", "Timber", "timber", "TMB", [10, 60], 650],
  ["Crushed Glass Aggregate", "Glass", "Glass", "glass", "GLS", [15, 70], 550],
  ["Glass Curtain Wall Cullet", "Glass", "Glass", "glass", "GLS", [10, 50], 600],
  ["Mixed Mineral Recovery", "Mixed Waste", "Mixed", "mixed", "MXD", [100, 500], 150],
  ["Brick and Tile Rubble", "Mixed Waste", "Mixed", "mixed-waste", "MXD", [60, 300], 120],
];
const MATERIAL_BY_NAME = Object.fromEntries(MATERIALS.map((m) => [m[0], m]));

const PROJECTS = {
  "Hong Kong": ["Kai Tak Redevelopment", "Central Harbour Works", "West Kowloon Site C", "Northern Metropolis A2", "Admiralty Office Renewal", "Tung Chung New Town Extension", "Hung Shui Kiu Development", "Anderson Road Quarry Housing", "Kwun Tong Action Area"],
  Macau: ["Taipa Civic Complex", "Cotai Transit Hub", "Coloane Housing Phase 2"],
};
const FACILITIES = {
  "Hong Kong": [["EcoPark, Tuen Mun", "Tuen Mun"], ["Yuen Long Sorting Facility", "Yuen Long"], ["Fanling Recovery Centre", "Fanling"], ["Kwai Tsing Yard", "Kwai Tsing"], ["Tseung Kwan O Fill Bank", "Tseung Kwan O"]],
  Macau: [["Macau Transfer Station", "Taipa"], ["Coloane Recycling Yard", "Coloane"]],
};
const BORDER_POINT = { "Hong Kong": "Shenzhen Bay Port", Macau: "Hengqin Port" };
const CONTRACTORS = ["Gammon Construction", "Hip Hing Engineering", "China State Construction", "Paul Y. Engineering", "Chun Wo Construction"];
const HAULIERS = ["GreenHaul Logistics", "Harbour Freight HK", "Pearl Delta Trucking"];
const SORTERS = ["EcoSort HK", "Delta Sorting Services", "Macau Circular Works"];
const DESTINATIONS = [["Shenzhen", "SZ"], ["Dongguan", "DG"], ["Zhuhai", "ZH"], ["Foshan", "FS"], ["Guangzhou", "GZ"], ["Zhongshan", "ZS"]];
const SELLERS = {
  "Hong Kong": ["Circular Materials Ltd", "Metro Reuse Co.", "TimberLoop Ltd", "NorthLoop Resources", "Urban Alloy Ltd", "GreenCycle Aggregates", "HarbourSteel Recovery"],
  Macau: ["Macau Circular Works", "Pearl Glass Recycling"],
};

// ── Hand-written demo records (from app/CwPlatform.tsx) ─────────────────────

const BASE_PASSPORTS = [
  ["DPP-HK-2026-00428", "Recycled Concrete Aggregate", "Concrete", "Kai Tak Redevelopment", 320, "EcoPark, Tuen Mun", "Hong Kong", "Processing", "Verified", "2026-09-03T01:00:00.000Z", "2026-09-16T02:42:00.000Z"],
  ["DPP-HK-2026-00417", "Structural Steel Sections", "Metal", "Central Harbour Works", 84, "Shenzhen Bay Port", "Hong Kong", "Cross-border", "Verified", "2026-09-01T02:00:00.000Z", "2026-09-16T01:18:00.000Z"],
  ["DPP-HK-2026-00396", "Reclaimed Timber", "Timber", "West Kowloon Site C", 46, "Yuen Long Sorting Facility", "Hong Kong", "Sorted", "Pending", "2026-08-28T03:00:00.000Z", "2026-09-15T09:36:00.000Z"],
  ["DPP-MO-2026-00381", "Crushed Glass Aggregate", "Glass", "Taipa Civic Complex", 38, "Macau Transfer Station", "Macau", "Collected", "Verified", "2026-08-25T01:30:00.000Z", "2026-09-14T07:08:00.000Z"],
  ["DPP-HK-2026-00372", "Mixed Mineral Recovery", "Mixed Waste", "Northern Metropolis A2", 216, "Fanling Recovery Centre", "Hong Kong", "Processing", "Processing", "2026-08-22T02:15:00.000Z", "2026-09-14T03:25:00.000Z"],
  ["DPP-HK-2026-00354", "Recovered Aluminium", "Metal", "Admiralty Office Renewal", 24, "Kwai Tsing Yard", "Hong Kong", "Completed", "Completed", "2026-08-18T06:40:00.000Z", "2026-09-13T08:52:00.000Z"],
];
const BASE_PASSPORT_EVENTS = {
  // The timeline shown on the Passport Details page (Hong Kong times converted to UTC).
  "DPP-HK-2026-00428": [
    ["Generated", "2026-09-03T01:00:00.000Z", "Kai Tak", "Gammon Construction"],
    ["Collected", "2026-09-05T02:30:00.000Z", "Kai Tak", "GreenHaul Logistics"],
    ["Sorted", "2026-09-07T06:10:00.000Z", "Tuen Mun", "EcoSort HK"],
    ["Processing", "2026-09-12T03:20:00.000Z", "EcoPark", "Circular Materials Ltd"],
  ],
};
const BASE_TRANSFERS = [
  ["CBT-HK-SZ-2026-0128", "DPP-HK-2026-00428", "Hong Kong", "Shenzhen", "2026-09-18", "Cleared", "In Transit", "Circular Materials Ltd"],
  ["CBT-HK-DG-2026-0119", "DPP-HK-2026-00417", "Hong Kong", "Dongguan", "2026-09-15", "Verified", "Completed", "Metro Reuse Co."],
  ["CBT-MO-ZH-2026-0042", "DPP-MO-2026-00381", "Macau", "Zhuhai", "2026-09-20", "Pending Review", "Preparing", "Macau Circular Works"],
  ["CBT-HK-SZ-2026-0113", "DPP-HK-2026-00372", "Hong Kong", "Shenzhen", "2026-09-12", "Verified", "Completed", "NorthLoop Resources"],
  ["CBT-HK-FS-2026-0108", "DPP-HK-2026-00354", "Hong Kong", "Foshan", "2026-09-10", "Cleared", "Completed", "Urban Alloy Ltd"],
];
const BASE_TRANSFER_EVENTS = {
  "CBT-HK-SZ-2026-0128": [
    ["Created", "2026-09-10T01:14:00.000Z", "Record initiated"],
    ["Documentation Submitted", "2026-09-12T08:20:00.000Z", "Submission complete"],
    ["Inspection", "2026-09-14T03:05:00.000Z", "Inspection recorded"],
    ["Customs / Compliance Review", "2026-09-16T06:28:00.000Z", "Review complete"],
    ["Cleared", "2026-09-17T01:42:00.000Z", "Transfer cleared"],
    ["Transport", "2026-09-18T00:30:00.000Z", "Currently in transit"],
  ],
};
const BASE_LISTINGS = [
  ["LST-HK-2026-0186", "DPP-HK-2026-00428", "CBT-HK-SZ-2026-0128", "Recycled Concrete Aggregate", "Concrete", 320, "Tuen Mun, Hong Kong", "2026-09-20", "Verified", "Circular Materials Ltd", "concrete", "NFT-CON-0186", "listed"],
  ["LST-HK-2026-0174", "DPP-HK-2026-00417", "CBT-HK-DG-2026-0119", "Structural Steel Sections", "Steel", 84, "Kwai Tsing, Hong Kong", null, "Verified", "Metro Reuse Co.", "steel", "NFT-STL-0174", "listed"],
  ["LST-HK-2026-0168", "DPP-HK-2026-00396", null, "Reclaimed Timber Beams", "Timber", 46, "Yuen Long, Hong Kong", "2026-09-25", "Pending", "TimberLoop Ltd", "timber", "NFT-TMB-0168", "minted"],
  ["LST-MO-2026-0062", "DPP-MO-2026-00381", "CBT-MO-ZH-2026-0042", "Crushed Glass Aggregate", "Glass", 38, "Taipa, Macau", "2026-09-28", "Verified", "Macau Circular Works", "glass", "NFT-GLS-0062", "listed"],
  ["LST-HK-2026-0152", "DPP-HK-2026-00372", null, "Mixed Mineral Recovery", "Mixed", 216, "Fanling, Hong Kong", "2026-09-22", "Processing", "NorthLoop Resources", "mixed", "NFT-MXD-0152", "draft"],
  ["LST-HK-2026-0149", "DPP-HK-2026-00354", "CBT-HK-FS-2026-0108", "Recovered Aluminium", "Metal", 24, "Kwai Tsing, Hong Kong", null, "Verified", "Urban Alloy Ltd", "aluminium", "NFT-ALU-0149", "minted"],
];
const COMPANIES = [
  ["Guangdong Road Base Co.", "Road construction / base layer", "Shenzhen", "SZ", "Recycled concrete aggregate for highway sub-base", "1,200 t/month", "3 completed cross-border transfers this quarter", 4.6],
  ["Pearl River Precast", "Precast concrete elements", "Dongguan", "DG", "Washed RCA for precast concrete mix", "800 t/month", "Recurring quarterly buyer", 4.8],
  ["Bamboo Bay Furniture", "Reclaimed timber furniture", "Zhuhai", "ZH", "Structural reclaimed timber beams", "150 t/month", "First-time buyer, proof-of-concept in progress", 4.1],
  ["South China Smelter", "Secondary metal smelting", "Foshan", "FS", "Recovered aluminium scrap for remelt", "300 t/month", "Long-term offtake agreement", 4.7],
  ["Harbour Glassworks", "Glass cullet processing", "Zhuhai", "ZH", "Crushed glass cullet for remelt", "220 t/month", "2 completed transfers", 4.4],
  ["Northern Metropolis Infill", "Land reclamation / engineered fill", "Hong Kong", "HK", "Mixed mineral recovery for engineered fill", "2,000 t/month", "High-volume public works buyer", 4.5],
  ["Canton Rebar Mills", "Steel re-rolling", "Guangzhou", "GZ", "Rebar offcuts and structural sections for re-rolling", "600 t/month", "Quarterly contract since 2025", 4.3],
  ["Zhongshan Eco Bricks", "Recycled masonry products", "Zhongshan", "ZS", "Brick and tile rubble for paving blocks", "400 t/month", "2 pilot orders delivered", 3.9],
  ["Lantau Landscape Works", "Landscape and park construction", "Hong Kong", "HK", "Reclaimed timber for boardwalks and furniture", "80 t/month", "Government framework contractor", 4.2],
  ["Macau Public Works Bureau Supplier", "Road maintenance", "Macau", "MO", "Recycled aggregate for road resurfacing", "350 t/month", "Annual tender winner 2026", 4.0],
  ["Delta Glass Fibre", "Glass fibre insulation", "Foshan", "FS", "Clean glass cullet for fibre production", "180 t/month", "New supplier onboarding", 3.8],
  ["Shenzhen Green Formwork", "Formwork rental and recycling", "Shenzhen", "SZ", "Timber formwork panels for reuse", "120 t/month", "Repeat buyer, 5 orders this year", 4.5],
];
const COMPANY_CONTACTS = ["procurement@gdroadbase.cn", "buyer@prprecast.cn", "timber@bamboobay.cn", "offtake@scsmelter.cn", "cullet@harbourglass.cn", "fill@nm-infill.hk", "scrap@cantonrebar.cn", "supply@zseco.cn", "materials@lantaulandscape.hk", "tender@mpw-supplier.mo", "cullet@deltafibre.cn", "reuse@szformwork.cn"];
const BASE_DEMANDS = [
  ["DMD-2026-0071", "Guangdong Road Base Co.", "Road Construction", "Shenzhen", "Concrete", 500, "2026-09-30"],
  ["DMD-2026-0068", "Pearl River Precast", "Precast Concrete", "Dongguan", "Concrete", 260, "2026-09-28"],
  ["DMD-2026-0064", "Bamboo Bay Furniture", "Furniture & Timber", "Zhuhai", "Timber", 60, "2026-10-05"],
  ["DMD-2026-0059", "South China Smelter", "Metal Recycling", "Foshan", "Metal", 40, "2026-10-02"],
  ["DMD-2026-0055", "Harbour Glassworks", "Glass Manufacturing", "Zhuhai", "Glass", 50, "2026-09-30"],
  ["DMD-2026-0051", "Northern Metropolis Infill", "Land Reclamation", "Hong Kong", "Mixed", 300, "2026-10-10"],
];
const EXTRA_DEMANDS = [
  ["Canton Rebar Mills", "Steel Re-rolling", "Guangzhou", "Steel", 150],
  ["Zhongshan Eco Bricks", "Masonry Products", "Zhongshan", "Mixed", 200],
  ["Lantau Landscape Works", "Landscape Construction", "Hong Kong", "Timber", 40],
  ["Macau Public Works Bureau Supplier", "Road Maintenance", "Macau", "Concrete", 180],
  ["Delta Glass Fibre", "Glass Fibre", "Foshan", "Glass", 90],
  ["Shenzhen Green Formwork", "Formwork Reuse", "Shenzhen", "Timber", 70],
  ["South China Smelter", "Metal Recycling", "Foshan", "Metal", 25],
  ["Guangdong Road Base Co.", "Road Construction", "Shenzhen", "Concrete", 800],
];
const BASE_TRADES = [
  ["TRD-2026-0031", "LST-HK-2026-0186", "DMD-2026-0071", "Guangdong Road Base Co.", "Circular Materials Ltd", 200, 30000, "Completed", "2026-09-22"],
  ["TRD-2026-0029", "LST-HK-2026-0174", "DMD-2026-0059", "South China Smelter", "Metro Reuse Co.", 84, 96000, "Completed", "2026-09-19"],
  ["TRD-2026-0027", "LST-MO-2026-0062", "DMD-2026-0055", "Harbour Glassworks", "Macau Circular Works", 30, 16500, "Settled", "2026-09-15"],
  ["TRD-2026-0024", "LST-HK-2026-0152", "DMD-2026-0051", "Northern Metropolis Infill", "NorthLoop Resources", 216, 32000, "In Progress", "2026-09-21"],
];

// ── Generation ──────────────────────────────────────────────────────────────

const STAGE_ORDER = ["Generated", "Collected", "Sorted", "Processing", "Cross-border", "Completed"];
const passports = BASE_PASSPORTS.map(([id, material, category, project, qty, location, origin, stage, status, createdAt, updatedAt]) =>
  ({ id, material, category, project, qty, location, origin, stage, status, createdAt, updatedAt }));
const passportEvents = [];

// 120 generated passports with sequence numbers spread from 00100 to 00470.
const baseSeqs = new Set(passports.map((p) => Number(p.id.slice(-5))));
const seqs = new Set();
while (seqs.size < 120) { const s = int(100, 470); if (!baseSeqs.has(s)) seqs.add(s); }
for (const seq of [...seqs].sort((a, b) => a - b)) {
  const origin = chance(0.82) ? "Hong Kong" : "Macau";
  const [material, category, , , , [minT, maxT]] = pick(MATERIALS);
  // Newer sequence numbers were created more recently: 01 Jun → 27 Sep 2026.
  const createdMs = minute(Date.UTC(2026, 5, 1) + ((seq - 100) / 370) * (TODAY - Date.UTC(2026, 5, 1)) + int(0, 20) * 3_600_000);
  const ageDays = (TODAY - createdMs) / DAY;
  const stage = ageDays > 60 ? weighted([["Completed", 6], ["Cross-border", 2], ["Processing", 1]])
    : ageDays > 25 ? weighted([["Completed", 3], ["Cross-border", 3], ["Processing", 3], ["Sorted", 1]])
    : weighted([["Generated", 2], ["Collected", 3], ["Sorted", 3], ["Processing", 3], ["Cross-border", 1]]);
  const status = stage === "Completed" ? "Completed" : weighted([["Verified", 11], ["Pending", 4], ["Processing", 5]]);
  const project = pick(PROJECTS[origin]);
  const [facility, district] = pick(FACILITIES[origin]);
  const location = stage === "Cross-border" ? BORDER_POINT[origin] : stage === "Generated" || stage === "Collected" ? `${project} site` : facility;
  const id = `DPP-${origin === "Macau" ? "MO" : "HK"}-2026-${pad(seq, 5)}`;

  // One event per stage reached, each a few days after the previous one.
  let at = createdMs;
  const reached = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(stage) + 1);
  reached.forEach((name, index) => {
    if (index > 0) at = minute(Math.min(at + int(1, 6) * DAY + int(0, 8) * 3_600_000, TODAY - int(1, 20) * 3_600_000));
    const place = index < 2 ? project : name === "Cross-border" ? BORDER_POINT[origin] : name === "Completed" ? pick(DESTINATIONS)[0] : district;
    const actor = name === "Generated" ? pick(CONTRACTORS) : name === "Collected" ? pick(HAULIERS) : name === "Sorted" ? pick(SORTERS) : pick(SELLERS[origin]);
    passportEvents.push({ passportId: id, stage: name, occurredAt: iso(at), place, actor });
  });
  passports.push({ id, material, category, project, qty: int(minT, maxT), location, origin, stage, status, createdAt: iso(createdMs), updatedAt: iso(at) });
}
for (const [passportId, events] of Object.entries(BASE_PASSPORT_EVENTS)) {
  for (const [stage, occurredAt, place, actor] of events) passportEvents.push({ passportId, stage, occurredAt, place, actor });
}
// Base passports without a hand-written timeline get a minimal one ending at their current stage.
for (const p of passports.slice(0, BASE_PASSPORTS.length)) {
  if (BASE_PASSPORT_EVENTS[p.id]) continue;
  const reached = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(p.stage) + 1);
  const start = Date.parse(p.createdAt), end = Date.parse(p.updatedAt);
  reached.forEach((stage, index) => passportEvents.push({
    passportId: p.id, stage, place: index < 2 ? p.project : p.location, actor: index === 0 ? pick(CONTRACTORS) : index === 1 ? pick(HAULIERS) : pick(SORTERS),
    occurredAt: iso(minute(reached.length === 1 ? start : start + ((end - start) * index) / (reached.length - 1))),
  }));
}

// Transfers: every generated passport that reached Cross-border, and most Completed ones.
const TRANSFER_NOTES = ["Record initiated", "Submission complete", "Inspection recorded", "Review complete", "Transfer cleared", "Currently in transit", "Receipt confirmed"];
const TRANSFER_STEPS = ["Created", "Documentation Submitted", "Inspection", "Customs / Compliance Review", "Cleared", "Transport", "Received"];
const transfers = BASE_TRANSFERS.map(([id, passportId, origin, destination, departureDate, compliance, status, organisation]) => {
  const p = passports.find((x) => x.id === passportId);
  return { id, passportId, material: p.material, origin, destination, qty: p.qty, departureDate, compliance, status, transportType: "Road Freight", organisation };
});
const transferEvents = [];
const usedTransferPassports = new Set(transfers.map((t) => t.passportId));
let transferSeq = 130;
for (const p of passports.slice(BASE_PASSPORTS.length)) {
  if (usedTransferPassports.has(p.id)) continue;
  if (!(p.stage === "Cross-border" || (p.stage === "Completed" && chance(0.7)))) continue;
  const [destination, code] = pick(DESTINATIONS);
  const status = p.stage === "Completed" ? "Completed" : chance(0.7) ? "In Transit" : "Preparing";
  const compliance = status === "Preparing" ? "Pending Review" : chance(0.5) ? "Cleared" : "Verified";
  const departureMs = Date.parse(p.updatedAt) - (status === "Completed" ? int(2, 6) * DAY : 0) + (status === "Preparing" ? int(2, 6) * DAY : 0);
  const id = `CBT-${p.origin === "Macau" ? "MO" : "HK"}-${code}-2026-${pad(transferSeq++, 4)}`;
  transfers.push({
    id, passportId: p.id, material: p.material, origin: p.origin, destination, qty: p.qty, departureDate: isoDate(departureMs), compliance, status,
    transportType: p.origin === "Macau" || chance(0.2) ? "River Barge" : "Road Freight", organisation: pick(SELLERS[p.origin]),
  });
  const stepsDone = status === "Preparing" ? int(1, 3) : status === "In Transit" ? 6 : 7;
  let at = departureMs - 8 * DAY;
  for (let i = 0; i < stepsDone; i++) {
    at = i === 5 ? departureMs : minute(at + int(1, 2) * DAY + int(0, 10) * 3_600_000);
    transferEvents.push({ transferId: id, step: TRANSFER_STEPS[i], occurredAt: iso(Math.min(at, TODAY)), note: TRANSFER_NOTES[i] });
  }
}
for (const t of transfers.slice(0, BASE_TRANSFERS.length)) {
  const events = BASE_TRANSFER_EVENTS[t.id];
  if (events) { for (const [step, occurredAt, note] of events) transferEvents.push({ transferId: t.id, step, occurredAt, note }); continue; }
  const stepsDone = t.status === "Preparing" ? 2 : t.status === "In Transit" ? 6 : 7;
  const dep = Date.parse(`${t.departureDate}T00:30:00.000Z`);
  for (let i = 0; i < stepsDone; i++) {
    transferEvents.push({ transferId: t.id, step: TRANSFER_STEPS[i], occurredAt: iso(dep + (i - 5) * DAY), note: TRANSFER_NOTES[i] });
  }
}

// Listings: about 75% of non-completed generated passports are listed on the marketplace.
const listings = BASE_LISTINGS.map(([id, passportId, transferId, material, category, qty, location, availableFrom, status, seller, tone, nftTokenId, mintStatus]) =>
  ({ id, passportId, transferId, material, category, qty, location, availableFrom, status, seller, tone, nftTokenId, nftType: material, mintStatus }));
const listedPassports = new Set(listings.map((l) => l.passportId));
let listingSeq = 190;
for (const p of passports.slice(BASE_PASSPORTS.length)) {
  if (listedPassports.has(p.id) || p.stage === "Completed" || p.stage === "Generated" || !chance(0.75)) continue;
  const [, , listingCategory, tone, nftCode] = MATERIAL_BY_NAME[p.material];
  const seq = listingSeq++;
  const region = p.origin === "Macau" ? "Macau" : "Hong Kong";
  const facility = FACILITIES[p.origin].find(([name]) => name === p.location);
  const mintStatus = p.status === "Verified" ? weighted([["listed", 6], ["minted", 3], ["draft", 1]]) : weighted([["draft", 3], ["minted", 1]]);
  listings.push({
    id: `LST-${p.origin === "Macau" ? "MO" : "HK"}-2026-${pad(seq, 4)}`, passportId: p.id,
    transferId: transfers.find((t) => t.passportId === p.id)?.id ?? null,
    material: p.material, category: listingCategory, qty: p.qty, location: `${facility ? facility[1] : pick(FACILITIES[p.origin])[1]}, ${region}`,
    availableFrom: chance(0.35) ? null : isoDate(TODAY + int(-3, 21) * DAY), status: p.status === "Pending" ? "Pending" : p.status === "Processing" ? "Processing" : "Verified",
    seller: pick(SELLERS[p.origin]), tone, nftTokenId: `NFT-${nftCode}-${pad(seq, 4)}`, nftType: p.material, mintStatus,
  });
}
for (const l of listings) l.txHash = l.mintStatus === "draft" ? null : `0x${hex(64)}`;

const demands = BASE_DEMANDS.map(([id, company, industry, region, category, qty, deadline]) => ({ id, company, industry, region, category, qty, deadline }));
EXTRA_DEMANDS.forEach(([company, industry, region, category, qty], index) => {
  demands.push({ id: `DMD-2026-${pad(72 + index * 3, 4)}`, company, industry, region, category, qty, deadline: isoDate(TODAY + int(4, 40) * DAY) });
});
for (const d of demands) d.contact = COMPANY_CONTACTS[COMPANIES.findIndex(([name]) => name === d.company)];

// Trades: pair verified listings with a demand in the same category.
const trades = BASE_TRADES.map(([id, listingId, demandId, buyer, seller, qty, priceHkd, status, tradedOn]) => ({ id, listingId, demandId, buyer, seller, qty, priceHkd, status, tradedOn }));
const tradedListings = new Set(trades.map((t) => t.listingId));
let tradeSeq = 32;
const openTransferPassports = new Set(transfers.filter((t) => t.status !== "Completed").map((t) => t.passportId));
for (const l of listings) {
  if (tradedListings.has(l.id) || l.mintStatus !== "listed" || openTransferPassports.has(l.passportId) || !chance(0.75)) continue;
  const demand = demands.find((d) => d.category === l.category && chance(0.7)) ?? demands.find((d) => d.category === l.category);
  if (!demand) continue;
  const unitPrice = MATERIAL_BY_NAME[l.material][6];
  const qty = Math.min(l.qty, demand.qty);
  trades.push({
    id: `TRD-2026-${pad(tradeSeq++, 4)}`, listingId: l.id, demandId: demand.id, buyer: demand.company, seller: l.seller, qty,
    priceHkd: Math.round((qty * unitPrice * (0.9 + rand() * 0.2)) / 100) * 100, status: weighted([["Completed", 4], ["Settled", 3], ["In Progress", 3]]),
    tradedOn: isoDate(TODAY - int(0, 45) * DAY),
  });
}
for (const t of trades) t.txHash = t.status === "In Progress" ? null : listings.find((l) => l.id === t.listingId).txHash ?? `0x${hex(64)}`;

// ── Business rules (same as worker/services/lifecycle.ts) ───────────────────
// A received transfer or a sold-out listing completes the passport; a completed passport's
// listings are delisted. Applied here so the seeded data obeys the rules the API enforces.
const passportById = new Map(passports.map((p) => [p.id, p]));
function completePassport(passport, atMs, place, actor) {
  if (passport.stage === "Completed") return;
  const last = Math.max(...passportEvents.filter((e) => e.passportId === passport.id).map((e) => Date.parse(e.occurredAt)), Date.parse(passport.createdAt));
  const occurredAt = iso(minute(Math.max(atMs, last + 3_600_000)));
  passportEvents.push({ passportId: passport.id, stage: "Completed", occurredAt, place, actor });
  Object.assign(passport, { stage: "Completed", status: "Completed", updatedAt: occurredAt });
}
for (const t of transfers) {
  if (t.status !== "Completed") continue;
  const received = transferEvents.find((e) => e.transferId === t.id && e.step === "Received");
  const passport = passportById.get(t.passportId);
  completePassport(passport, received ? Date.parse(received.occurredAt) : Date.parse(`${t.departureDate}T12:00:00.000Z`), t.destination, t.organisation);
  passport.location = t.destination;
}
for (const l of listings) {
  const sold = trades.filter((t) => t.listingId === l.id && (t.status === "Completed" || t.status === "Settled"));
  if (sold.reduce((sum, t) => sum + t.qty, 0) < l.qty) continue;
  const last = sold.at(-1);
  const region = demands.find((d) => d.id === last.demandId)?.region ?? last.buyer;
  completePassport(passportById.get(l.passportId), Date.parse(`${last.tradedOn}T08:00:00.000Z`), region, last.buyer);
}
for (const l of listings) {
  if (passportById.get(l.passportId).stage === "Completed") l.mintStatus = "delisted";
}

// ── Accounts (same PBKDF2 format as worker/lib/password.ts) ─────────────────
// Fixed salts keep the output reproducible; fine for public demo passwords.
function account(id, username, password, profile) {
  const salt = Buffer.from(hex(32), "hex");
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return { id, username, passwordHash: `pbkdf2-sha256$100000$${salt.toString("base64")}$${hash.toString("base64")}`, ...profile };
}
const users = [
  account("usr_demo", "demo", "demo1234", { email: "alex.leung@cwpassport.hk", company: "CW Passport", userType: "Regulatory Agency", role: "admin", contact: "Alex Leung", phone: "+852 5555 0100" }),
  account("usr_regulator", "regulator", "regulator1234", { email: "inspector@epd.gov.hk", company: "Environmental Protection Department", userType: "Regulatory Agency", role: "regulator", contact: "Karen Chan", phone: "+852 5555 0200" }),
  account("usr_seller", "seller", "seller1234", { email: "sales@circularmaterials.hk", company: "Circular Materials Ltd", userType: "Processing / Disposal Unit", role: "member", contact: "Daniel Ho", phone: "+852 5555 0300" }),
  account("usr_buyer", "buyer", "buyer1234", { email: "procurement@gdroadbase.cn", company: "Guangdong Road Base Co.", userType: "Other", role: "member", contact: "Li Wei", phone: "+86 755 5555 0400" }),
  // Signed up as a regulator; waits for an administrator to grant the role.
  account("usr_customs", "customs", "customs1234", { email: "officer@customs.gov.hk", company: "Customs and Excise Department", userType: "Regulatory Agency", role: "member", contact: "Sam Wong", phone: "+852 5555 0500" }),
];

// A few notifications so the bell has something to show.
const notifications = [
  { recipientRole: "admin", type: "user.regulator_requested", params: { username: "customs", company: "Customs and Excise Department" }, linkKind: "user", linkId: "usr_customs" },
  ...transfers.filter((t) => t.status === "Preparing" && transferEvents.filter((e) => e.transferId === t.id).length === 2).slice(0, 3)
    .map((t) => ({ recipientRole: "regulator", type: "transfer.awaiting_inspection", params: { transferId: t.id, organisation: t.organisation }, linkKind: "transfer", linkId: t.id })),
  { recipientCompany: "Circular Materials Ltd", type: "trade.completed", params: { tradeId: "TRD-2026-0031", seller: "Circular Materials Ltd" }, linkKind: "listing", linkId: "LST-HK-2026-0186" },
];

// ── SQL output ──────────────────────────────────────────────────────────────

const q = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
/** Multi-row INSERTs in chunks to stay well under D1's per-statement size limit. */
function insert(table, columns, rows, map) {
  const out = [];
  for (let i = 0; i < rows.length; i += 25) {
    const values = rows.slice(i, i + 25).map((row) => `(${map(row).map(q).join(", ")})`).join(", ");
    out.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values};`);
  }
  return out;
}

// ID counters continue after the highest seeded number (see worker/lib/ids.ts).
const maxSeq = (ids) => Math.max(...ids.map((id) => Number(id.split("-").at(-1))));
const sequences = [
  ["passport:2026", maxSeq(passports.map((p) => p.id))],
  ["transfer:2026", maxSeq(transfers.map((t) => t.id))],
  ["listing:2026", maxSeq(listings.map((l) => l.id))],
  ["trade:2026", maxSeq(trades.map((t) => t.id))],
  ["demand:2026", maxSeq(demands.map((d) => d.id))],
];

const sql = [
  "-- GENERATED by scripts/generate-seed.mjs. Do not edit by hand; edit the script and re-run it.",
  "-- Resets all business tables to the demo dataset. Registered users are kept; the demo user is re-created.",
  "-- Document rows are cleared but files already in local R2 are not (they become unreachable orphans).",
  "DELETE FROM notification_reads;", "DELETE FROM notifications;", "DELETE FROM login_attempts;", "DELETE FROM password_reset_tokens;",
  "DELETE FROM documents;", "DELETE FROM audit_logs;", "DELETE FROM id_sequences;",
  "DELETE FROM trades;", "DELETE FROM listings;", "DELETE FROM demands;", "DELETE FROM companies;",
  "DELETE FROM transfer_events;", "DELETE FROM transfers;", "DELETE FROM passport_events;", "DELETE FROM passports;",
  `DELETE FROM users WHERE id IN (${users.map((u) => q(u.id)).join(", ")});`,
  ...insert("users", ["id", "username", "email", "password_hash", "company", "user_type", "role", "contact", "phone"], users,
    (u) => [u.id, u.username, u.email, u.passwordHash, u.company, u.userType, u.role, u.contact, u.phone]),
  ...insert("id_sequences", ["name", "value"], sequences, (row) => row),
  ...insert("passports", ["id", "material", "category", "project", "quantity_value", "quantity_unit", "location", "origin", "stage", "status", "created_at", "updated_at"], passports,
    (p) => [p.id, p.material, p.category, p.project, p.qty, "t", p.location, p.origin, p.stage, p.status, p.createdAt, p.updatedAt]),
  ...insert("passport_events", ["passport_id", "stage", "occurred_at", "place", "actor"], passportEvents,
    (e) => [e.passportId, e.stage, e.occurredAt, e.place, e.actor]),
  ...insert("transfers", ["id", "passport_id", "material", "origin", "destination", "quantity_value", "quantity_unit", "departure_date", "compliance", "status", "transport_type", "organisation"], transfers,
    (t) => [t.id, t.passportId, t.material, t.origin, t.destination, t.qty, "t", t.departureDate, t.compliance, t.status, t.transportType, t.organisation]),
  ...insert("transfer_events", ["transfer_id", "step", "occurred_at", "note"], transferEvents,
    (e) => [e.transferId, e.step, e.occurredAt, e.note]),
  ...insert("companies", ["name", "industry", "region", "region_code", "needs", "capacity", "history", "rating"], COMPANIES, (c) => c),
  ...insert("demands", ["id", "company", "industry", "region", "category", "quantity_value", "quantity_unit", "deadline", "contact"], demands,
    (d) => [d.id, d.company, d.industry, d.region, d.category, d.qty, "t", d.deadline, d.contact]),
  ...insert("listings", ["id", "passport_id", "transfer_id", "material", "category", "quantity_value", "quantity_unit", "location", "available_from", "status", "seller", "tone", "nft_token_id", "nft_type", "mint_status", "tx_hash"], listings,
    (l) => [l.id, l.passportId, l.transferId, l.material, l.category, l.qty, "t", l.location, l.availableFrom, l.status, l.seller, l.tone, l.nftTokenId, l.nftType, l.mintStatus, l.txHash]),
  ...insert("notifications", ["recipient_user_id", "recipient_company", "recipient_role", "type", "params", "link_kind", "link_id"], notifications,
    (n) => [n.recipientUserId ?? null, n.recipientCompany ?? null, n.recipientRole ?? null, n.type, JSON.stringify(n.params), n.linkKind, n.linkId]),
  ...insert("trades", ["id", "listing_id", "demand_id", "buyer", "seller", "quantity_value", "quantity_unit", "price_hkd", "status", "tx_hash", "traded_on"], trades,
    (t) => [t.id, t.listingId, t.demandId, t.buyer, t.seller, t.qty, "t", t.priceHkd, t.status, t.txHash, t.tradedOn]),
];

writeFileSync(OUT, `${sql.join("\n")}\n`);
console.log(`Wrote ${OUT}`);
console.log(`  passports ${passports.length}, passport events ${passportEvents.length}, transfers ${transfers.length}, transfer events ${transferEvents.length}`);
console.log(`  listings ${listings.length} (${listings.filter((l) => l.mintStatus === "delisted").length} delisted), companies ${COMPANIES.length}, demands ${demands.length}, trades ${trades.length}`);
console.log(`  passports completed ${passports.filter((p) => p.stage === "Completed").length}, notifications ${notifications.length}`);
console.log(`  users: ${users.map((u) => `${u.username} (${u.role})`).join(", ")}`);
