import { describe, expect, it } from "vitest";
import { buildMatches, regionCodeOf, scoreMatch, type MatchDemand, type MatchListing } from "../services/matching";

// Records copied from the original front-end constants; the expected scores are what
// the original buildMatches() in app/CwPlatform.tsx produced for them.
const concreteListing: MatchListing = {
  id: "LST-HK-2026-0186", material: "Recycled Concrete Aggregate", seller: "Circular Materials Ltd", nftTokenId: "NFT-CON-0186",
  category: "Concrete", location: "Tuen Mun, Hong Kong", quantityValue: 320, quantityUnit: "t",
};
const roadBase: MatchDemand = {
  id: "DMD-2026-0071", company: "Guangdong Road Base Co.", industry: "Road Construction", region: "Shenzhen",
  category: "Concrete", quantityValue: 500, quantityUnit: "t",
};
const infill: MatchDemand = {
  id: "DMD-2026-0051", company: "Northern Metropolis Infill", industry: "Land Reclamation", region: "Hong Kong",
  category: "Mixed", quantityValue: 300, quantityUnit: "t",
};
const roadBaseCompany = { name: "Guangdong Road Base Co.", needs: "Recycled concrete aggregate for highway sub-base", rating: 4.6 };

describe("matching", () => {
  it("maps locations to region codes", () => {
    expect(regionCodeOf("Tuen Mun, Hong Kong")).toBe("HK");
    expect(regionCodeOf("Taipa, Macau")).toBe("MO");
    expect(regionCodeOf("Guangzhou")).toBe("GZ");
    expect(regionCodeOf("Atlantis")).toBe("Atlantis");
  });

  it("scores category + cross-border + quantity fit + rating like the original", () => {
    const { score, reasons } = scoreMatch(concreteListing, roadBase, roadBaseCompany);
    expect(score).toBe(40 + 12 + 20 + 14);
    expect(reasons).toEqual([
      "Category match: Concrete",
      "Cross-border reachable: HK → SZ",
      "Quantity fits: 320 t ≤ 500 t",
      "Buyer rating: 4.6/5",
      "RAG · Guangdong Road Base Co. — Recycled concrete aggregate for highway sub-base",
    ]);
  });

  it("falls back to a 4.0 rating when the buyer is not in the knowledge base", () => {
    const { score } = scoreMatch(concreteListing, { ...roadBase, company: "Unknown Co." });
    expect(score).toBe(40 + 12 + 20 + 12);
  });

  it("drops pairs below the threshold and sorts by score", () => {
    // Concrete vs Mixed in the same region: 4 + 25 + 6 (320 > 300) + 12 = 47 → dropped.
    const matches = buildMatches([concreteListing], [infill, roadBase], [roadBaseCompany]);
    expect(matches.map((m) => m.id)).toEqual(["MCH-HK-2026-0186-2026-0071"]);
  });
});
