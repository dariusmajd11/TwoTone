import type { GarmentIdentification, MarketLink } from "./types";

type Marketplace = {
  name: string;
  market: "new" | "used";
  search: (query: string) => string;
};

const MARKETPLACES: Marketplace[] = [
  {
    name: "Grailed",
    market: "used",
    search: (q) => `https://www.grailed.com/shop?query=${encodeURIComponent(q)}`,
  },
  {
    name: "eBay",
    market: "used",
    search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  },
  {
    name: "Vestiaire Collective",
    market: "used",
    search: (q) =>
      `https://www.vestiairecollective.com/search/?q=${encodeURIComponent(q)}`,
  },
  {
    name: "Depop",
    market: "used",
    search: (q) => `https://www.depop.com/search/?q=${encodeURIComponent(q)}`,
  },
  {
    name: "The RealReal",
    market: "used",
    search: (q) =>
      `https://www.therealreal.com/search?keywords=${encodeURIComponent(q)}`,
  },
  {
    name: "SSENSE",
    market: "new",
    search: (q) => `https://www.ssense.com/en-us/men?q=${encodeURIComponent(q)}`,
  },
  {
    name: "Farfetch",
    market: "new",
    search: (q) =>
      `https://www.farfetch.com/shopping/search/items.aspx?q=${encodeURIComponent(q)}`,
  },
];

/**
 * Deep links into each marketplace's search rather than a specific listing —
 * listing URLs go dead as items sell, but a search stays useful over time.
 */
export function buildMarketLinks(result: GarmentIdentification): MarketLink[] {
  const query =
    result.searchTerms[0] ?? `${result.brand} ${result.name}`.trim();
  if (!query) return [];

  const stillSold = result.productionStatus === "in-production";
  return MARKETPLACES.filter((m) => m.market === "used" || stillSold).map((m) => ({
    marketplace: m.name,
    market: m.market,
    url: m.search(query),
  }));
}
