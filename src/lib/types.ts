export type ProductionStatus =
  | "in-production"
  | "discontinued"
  | "seasonal-archive"
  | "unknown";

export type MarketLink = {
  marketplace: string;
  market: "new" | "used";
  url: string;
};

/**
 * One real item for sale on a marketplace, as opposed to a `MarketLink`, which
 * is only a search URL. The distinction matters: a link is always safe to show
 * because it cannot go stale, while a listing is a claim about a specific item
 * at a specific price that may already be sold.
 *
 * Every field except `id`, `marketplace`, `title` and `url` is nullable, because
 * marketplace search results genuinely omit them — a listing with no stated
 * size is common, and rendering "unknown" is honest where inventing a value
 * would not be.
 *
 * No image field: the listing rows are text, so a photo URL would be carried
 * across the API and down through the tree for nobody to read.
 */
export type Listing = {
  id: string;
  marketplace: string;
  title: string;
  /** The listing's own page, not a search — this is what a click opens. */
  url: string;
  price: { amount: number; currency: string } | null;
  /** As the seller stated it. Null when the listing does not say. */
  size: string | null;
  condition: string | null;
};

export type GarmentIdentification = {
  /** Best-guess item name, e.g. "Nylon Cargo Parka". */
  name: string;
  brand: string;
  /** Null when the model cannot commit to a brand. */
  brandConfidence: "high" | "medium" | "low";
  /** Release year, or the start year of the season the piece is from. */
  year: number | null;
  /** e.g. "Fall/Winter 2003" — null when not a runway piece. */
  season: string | null;
  category: string;
  colors: string[];
  materials: string[];
  productionStatus: ProductionStatus;
  /** One paragraph a human would actually want to read. */
  description: string;
  /** Distinguishing features the model used to make the call. */
  identifyingDetails: string[];
  estimatedRetailUsd: number | null;
  estimatedResaleUsd: { low: number; high: number } | null;
  /** Terms that work well when pasted into a resale site's search box. */
  searchTerms: string[];
  /** Set when the model is not confident enough to be useful. */
  caveat: string | null;
};

export type IdentificationRecord = {
  id: string;
  userId: string | null;
  /**
   * Null for signed-out visitors. Their photo is identified in memory and never
   * stored, since there is no account to show it in later — keeping it would
   * leave an object nothing can reach.
   */
  imageKey: string | null;
  imageUrl: string | null;
  result: GarmentIdentification;
  marketLinks: MarketLink[];
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

/**
 * A wishlist holds *references* to identifications, not copies of them.
 *
 * Copying the record in would make each list self-contained, but it would also
 * mean the same piece saved to two lists is stored twice and can drift — and
 * these live inside the user record, which DynamoDB caps at 400KB. A record is
 * a couple of KB, so snapshots would put a hard ceiling somewhere around a
 * hundred saves. Storing ids keeps the user record small no matter how much
 * someone saves, and the piece is resolved against their history on read.
 */
export type WishlistEntry = {
  /** `IdentificationRecord.id`, always one belonging to the same user. */
  recordId: string;
  addedAt: string;
};

export type Wishlist = {
  id: string;
  name: string;
  /** Most recently added first, which is the order the panel renders. */
  entries: WishlistEntry[];
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  userId: string;
  email: string;
  /** Cognito access token once AWS is wired up; opaque local token before that. */
  accessToken: string;
  expiresAt: number;
};

/**
 * What the wearer told the setup page about their taste.
 *
 * Every array holds values from the catalogues in `lib/taste.ts` and nothing
 * else, so the profile can be rendered or fed to the recommender without being
 * sanitised again at the point of use. `notes` is the single free field and is
 * length-capped where it is parsed.
 */
export type TasteProfile = {
  brands: string[];
  silhouettes: string[];
  accessories: string[];
  eras: string[];
  /** As the wearer would say it — "M", "32", "10". Null where unanswered. */
  sizes: { tops: string | null; waist: string | null; shoes: string | null };
  notes: string | null;
  updatedAt: string;
};

/**
 * One suggested piece on the For You page.
 *
 * Close to `GarmentIdentification` but not the same type, and the difference is
 * the point: an identification is a claim about a garment someone actually has
 * in front of them, while this is a suggestion about one they might like. It
 * carries no confidence, no identifying details and no production status,
 * because there is no object to be confident about.
 *
 * No size field either. A size belongs to a listing, not to a design — the
 * sizes a piece can be bought in today are whatever sellers happen to have, so
 * they come from the listings table once a recommendation is opened.
 */
export type Recommendation = {
  id: string;
  brand: string;
  name: string;
  /** One line. The For You page is a column of these, so length is the enemy. */
  description: string;
  category: string;
  /** Why this was picked, in the wearer's own vocabulary. */
  reason: string;
  estimatedResaleUsd: { low: number; high: number } | null;
  /** Feeds the search box when the row is opened. */
  searchTerms: string[];
};
