// Content-based listing ↔ demand scoring, ported unchanged from buildMatches() in the
// original app/CwPlatform.tsx. worker/test/matching.test.ts locks the behaviour in.
//
//   category match +40 (else +4) · same region +25 (else +12) · quantity fits +20 (else +6)
//   · buyer rating × 3 · capped at 100 · only scores ≥ MIN_SCORE are kept

import type { MatchDto } from "../../shared/api";

export const MIN_SCORE = 55;

const REGION_CODES: [string, string][] = [
  ["Hong Kong", "HK"], ["Macau", "MO"], ["Shenzhen", "SZ"], ["Dongguan", "DG"],
  ["Zhuhai", "ZH"], ["Foshan", "FS"], ["Guangzhou", "GZ"], ["Zhongshan", "ZS"],
];

export function regionCodeOf(location: string): string {
  return REGION_CODES.find(([name]) => location.includes(name))?.[1] ?? location;
}

export type MatchListing = MatchDto["listing"] & { location: string; quantityValue: number; quantityUnit: string };
export type MatchDemand = MatchDto["demand"] & { quantityValue: number; quantityUnit: string };
export type MatchCompany = { name: string; needs: string; rating: number };

const fmtQty = (value: number, unit: string) => `${value} ${unit}`;

export function scoreMatch(listing: MatchListing, demand: MatchDemand, company?: MatchCompany) {
  const reasons: string[] = [];
  let score = 0;

  if (listing.category.toLowerCase() === demand.category.toLowerCase()) {
    score += 40; reasons.push(`Category match: ${listing.category}`);
  } else {
    score += 4; reasons.push(`Nearby category: ${listing.category} vs ${demand.category}`);
  }

  const listingRegion = regionCodeOf(listing.location);
  const demandRegion = regionCodeOf(demand.region);
  if (listingRegion === demandRegion) { score += 25; reasons.push(`Region proximity: ${demand.region}`); }
  else { score += 12; reasons.push(`Cross-border reachable: ${listingRegion} → ${demandRegion}`); }

  const offered = fmtQty(listing.quantityValue, listing.quantityUnit);
  const wanted = fmtQty(demand.quantityValue, demand.quantityUnit);
  if (listing.quantityValue && demand.quantityValue) {
    if (listing.quantityValue <= demand.quantityValue) { score += 20; reasons.push(`Quantity fits: ${offered} ≤ ${wanted}`); }
    else { score += 6; reasons.push(`Quantity partial: ${offered} exceeds ${wanted}`); }
  }

  const rating = company?.rating ?? 4;
  score += Math.round(rating * 3);
  reasons.push(`Buyer rating: ${rating.toFixed(1)}/5`);
  if (company) reasons.push(`RAG · ${company.name} — ${company.needs}`);

  return { score: Math.min(100, score), reasons };
}

export function buildMatches(listings: MatchListing[], demands: MatchDemand[], companies: MatchCompany[]): Omit<MatchDto, "suggestedQuantity">[] {
  const byName = new Map(companies.map((company) => [company.name, company]));
  const matches: Omit<MatchDto, "suggestedQuantity">[] = [];
  for (const listing of listings) {
    for (const demand of demands) {
      const { score, reasons } = scoreMatch(listing, demand, byName.get(demand.company));
      if (score < MIN_SCORE) continue;
      matches.push({
        id: `MCH-${listing.id.slice(4)}-${demand.id.slice(4)}`,
        score,
        reasons,
        listing: { id: listing.id, material: listing.material, seller: listing.seller, nftTokenId: listing.nftTokenId, category: listing.category },
        demand: { id: demand.id, company: demand.company, industry: demand.industry, region: demand.region, category: demand.category },
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
