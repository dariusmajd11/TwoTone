import { backends, env } from "./env";
import type { Listing } from "./types";

/**
 * Live marketplace listings — the photo/price/size grid under a result.
 *
 * Only eBay is here, and that is not an oversight. Of the seven marketplaces
 * TwoTone links to, eBay is the only one with a public, self-serve search API.
 * Grailed, Depop, Vestiaire, The RealReal, SSENSE and Farfetch have none; the
 * only way to list their inventory is scraping, which breaks their terms and
 * breaks for real the first time they change their markup. Those six keep the
 * search links they have always had, which never go stale because they resolve
 * at click time.
 */
export interface ListingSource {
  search(query: string): Promise<Listing[]>;
}

/** eBay caps `q` at 100 characters and rejects longer queries outright. */
const EBAY_QUERY_MAX = 100;

/**
 * How many listings the grid shows, and therefore how many items get hydrated
 * for their size.
 *
 * The number is a call-budget decision. The Browse API allows 5,000 calls a day
 * on the default tier, and a grid costs one search plus one detail call per
 * item shown. At eight that is nine calls per result, or roughly 550 searches a
 * day; at the API's maximum of 200 it would be 24 a day.
 */
const LISTING_COUNT = 8;

/**
 * Overridable so `EBAY_API_BASE=https://api.sandbox.ebay.com` points the whole
 * integration at eBay's sandbox — the credentials, the paths and the payloads
 * are identical there, only the host differs.
 */
const EBAY_API_BASE = env.ebayApiBase;
const EBAY_OAUTH_URL = `${EBAY_API_BASE}/identity/v1/oauth2/token`;
/** Stays on the production host: it is an identifier, not an address. */
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_BROWSE_URL = `${EBAY_API_BASE}/buy/browse/v1`;

/** Only the fields actually read — the real payload is far larger. */
type EbayItemSummary = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  /** eBay sends the amount as a decimal *string*, not a number. */
  price?: { value?: string; currency?: string };
  condition?: string;
};

type EbayAspect = { name?: string; value?: string; values?: string[] };

/**
 * Sizes as sellers write them in titles: "Size L", "Sz 32", "US 10.5", "XXL".
 * Used only when the item's real size aspect could not be fetched.
 *
 * Deliberately conservative — a bare "10" in a title is far more likely to be
 * part of a model name than a size, so a number only counts when something
 * marks it as a measurement.
 */
const SIZE_FROM_TITLE = [
  // An explicit marker is the most trustworthy signal, so it is tried first.
  /\b(?:size|sz)\.?\s*:?\s*((?:us|uk|eu|it|fr|jp)\s*)?(\d{1,2}(?:\.5)?|\d{2}\s*x\s*\d{2}|x{0,2}[sml]\b|one\s*size)/i,
  /\b((?:us|uk|eu|it|fr|jp)\s*\d{1,2}(?:\.5)?)\b/i,
  // Waist × inseam. Unambiguous enough to match unmarked, which matters
  // because denim titles almost never spell out the word "size".
  /\b(\d{2}\s*x\s*\d{2})\b/i,
  /\b(one\s*size)\b/i,
  /\b(xxxl|xxl|xl|xxs|xs|3xl|2xl)\b/i,
];

export function sizeFromTitle(title: string): string | null {
  for (const pattern of SIZE_FROM_TITLE) {
    const match = pattern.exec(title);
    if (match) {
      const value = (match[1] ?? "") + (match[2] ?? "");
      const cleaned = value.trim().replace(/\s+/g, " ");
      if (cleaned) return cleaned.toUpperCase();
    }
  }
  return null;
}

/**
 * Picks the garment size out of an item's aspects.
 *
 * "Size Type" is excluded on purpose: it holds values like "Regular" and
 * "Plus", and matching it loosely would put "Regular" in the size column of
 * every listing that has one.
 */
export function sizeFromAspects(aspects: EbayAspect[]): string | null {
  const value = (aspect: EbayAspect) =>
    aspect.value ?? aspect.values?.[0] ?? null;

  const exact = aspects.find((a) => a.name?.toLowerCase() === "size");
  if (exact) return value(exact);

  const named = aspects.find((a) => {
    const name = a.name?.toLowerCase() ?? "";
    return name.endsWith(" size") || name === "us shoe size";
  });
  return named ? value(named) : null;
}

class EbayListingSource implements ListingSource {
  /**
   * Application tokens last two hours, so one is reused across requests rather
   * than minted per search — on a warm serverless instance that turns two round
   * trips into one for every call but the first.
   */
  private token: { value: string; expiresAt: number } | null = null;

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const basic = Buffer.from(
      `${env.ebayClientId}:${env.ebayClientSecret}`,
    ).toString("base64");

    const res = await fetch(EBAY_OAUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: EBAY_SCOPE,
      }),
    });

    if (!res.ok) {
      throw new Error(`eBay auth failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    // Expire a minute early so a token cannot go stale mid-flight.
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": env.ebayMarketplaceId,
    };
  }

  /**
   * The size is not in the search response — eBay's `itemSummaries` has no
   * aspects at all — so it takes a second call per item. Best effort by design:
   * a failed or rate-limited detail call falls back to the size in the title
   * rather than emptying the column or failing the whole grid.
   */
  private async size(
    item: EbayItemSummary,
    token: string,
  ): Promise<string | null> {
    const fallback = sizeFromTitle(item.title ?? "");
    if (!item.itemId) return fallback;

    try {
      const res = await fetch(
        `${EBAY_BROWSE_URL}/item/${encodeURIComponent(item.itemId)}`,
        { headers: this.headers(token) },
      );
      if (!res.ok) return fallback;
      const data = (await res.json()) as { localizedAspects?: EbayAspect[] };
      return sizeFromAspects(data.localizedAspects ?? []) ?? fallback;
    } catch {
      return fallback;
    }
  }

  async search(query: string): Promise<Listing[]> {
    const token = await this.accessToken();

    const url = new URL(`${EBAY_BROWSE_URL}/item_summary/search`);
    url.searchParams.set("q", query.slice(0, EBAY_QUERY_MAX));
    url.searchParams.set("limit", String(LISTING_COUNT));
    // Auctions are excluded by default; including them is what makes this a
    // picture of the secondhand market rather than of fixed-price resellers.
    url.searchParams.set("filter", "buyingOptions:{AUCTION|FIXED_PRICE}");

    const res = await fetch(url, { headers: this.headers(token) });
    if (!res.ok) {
      throw new Error(`eBay search failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
    const items = (data.itemSummaries ?? []).filter(
      (item) => item.itemId && item.itemWebUrl && item.title,
    );

    // Sequential hydration would add eight round trips to a page that already
    // waits on the model.
    const sizes = await Promise.all(items.map((item) => this.size(item, token)));

    return items.map((item, index) => {
      const amount = Number.parseFloat(item.price?.value ?? "");
      return {
        id: item.itemId!,
        marketplace: "eBay",
        title: item.title!,
        url: item.itemWebUrl!,
        price: Number.isFinite(amount)
          ? { amount, currency: item.price?.currency ?? "USD" }
          : null,
        size: sizes[index],
        condition: item.condition ?? null,
      };
    });
  }
}

/**
 * Renders the grid without eBay credentials so the layout is developable, and
 * follows the same rule as the mock identifier: it must be impossible to
 * mistake for real data. Prices are round, and every link goes to a genuine
 * eBay search for the query rather than to a fabricated listing URL — a dead
 * link that looks real is worse than an obvious sample.
 */
class MockListingSource implements ListingSource {
  async search(query: string): Promise<Listing[]> {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
    const sizes = ["S", "M", "L", "XL"];

    return Array.from({ length: 4 }, (_, index) => ({
      id: `sample-${index}`,
      marketplace: "Sample",
      title: `${query} — sample listing ${index + 1}`,
      url,
      price: { amount: 100 * (index + 1), currency: "USD" },
      size: sizes[index],
      condition: index % 2 === 0 ? "Used" : "New",
    }));
  }
}

/** No marketplace configured: the grid renders nothing rather than something made up. */
class NoListingSource implements ListingSource {
  async search(): Promise<Listing[]> {
    return [];
  }
}

export const listingSource: ListingSource =
  backends.listings === "ebay"
    ? new EbayListingSource()
    : backends.listings === "mock"
      ? new MockListingSource()
      : new NoListingSource();

export const listingsAreLive = backends.listings === "ebay";
