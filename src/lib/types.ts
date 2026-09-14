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

export type AuthSession = {
  userId: string;
  email: string;
  /** Cognito access token once AWS is wired up; opaque local token before that. */
  accessToken: string;
  expiresAt: number;
};
