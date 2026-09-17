import type { TasteProfile } from "./types";

/**
 * The taste profile: what the setup page asks, and the only vocabulary the
 * recommender is allowed to be told about.
 *
 * Answers are constrained to these lists rather than left as free text, for two
 * reasons. A stored value that is always one of a known set can be rendered,
 * counted and filtered without cleaning it first; and everything here is pasted
 * into a model prompt, so an open field would mean shipping arbitrary user text
 * into an instruction. The one free field, `notes`, is deliberately short and
 * clearly fenced where it is used.
 */

/**
 * Deliberately long, and deliberately not a top-40 list. Someone whose taste is
 * entirely Margiela and Lemaire is exactly the person this app is for, and if
 * their houses are missing from the first screen they will conclude the app is
 * not for them. Spread across archive, avant-garde, streetwear, Japanese,
 * Italian tailoring and contemporary so that most wardrobes find three or four.
 */
export const BRANDS = [
  "Acne Studios",
  "Adidas",
  "Alexander McQueen",
  "A.P.C.",
  "Aimé Leon Dore",
  "Balenciaga",
  "Bode",
  "Bottega Veneta",
  "Burberry",
  "Carhartt WIP",
  "Celine",
  "Comme des Garçons",
  "Dior",
  "Dries Van Noten",
  "Engineered Garments",
  "Fear of God",
  "Gucci",
  "Helmut Lang",
  "Hermès",
  "Issey Miyake",
  "Jacquemus",
  "JW Anderson",
  "Junya Watanabe",
  "Kapital",
  "Lemaire",
  "Levi's",
  "Loewe",
  "Maison Margiela",
  "Marni",
  "Miu Miu",
  "Needles",
  "New Balance",
  "Nike",
  "Our Legacy",
  "Patagonia",
  "Prada",
  "Raf Simons",
  "Ralph Lauren",
  "Rick Owens",
  "Saint Laurent",
  "Salomon",
  "Sacai",
  "Stone Island",
  "Stüssy",
  "Supreme",
  "The North Face",
  "Undercover",
  "Uniqlo",
  "Visvim",
  "Yohji Yamamoto",
] as const;

export const SILHOUETTES = [
  "Oversized",
  "Boxy",
  "Cropped",
  "Longline",
  "Tailored",
  "Deconstructed",
  "Draped",
  "Slim",
  "Relaxed",
  "Wide-leg",
  "Straight-leg",
  "Structured shoulder",
  "A-line",
  "Bias-cut",
] as const;

export const ACCESSORIES = [
  "Sneakers",
  "Boots",
  "Loafers",
  "Bags",
  "Belts",
  "Caps and hats",
  "Scarves",
  "Jewellery",
  "Sunglasses",
  "Watches",
  "Gloves",
  "Socks",
] as const;

export const ERAS = [
  "1960s–70s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "Current season",
] as const;

/**
 * Sizes are stored as the label the wearer would actually say, not as a
 * normalised number, because there is no honest conversion between a Japanese
 * 2, an Italian 48 and a US medium. The value here is a hint for the
 * recommender and a default for filtering listings, never a measurement.
 */
export const SIZES = {
  tops: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
  waist: ["26", "28", "30", "32", "34", "36", "38", "40"],
  shoes: ["6", "7", "8", "9", "10", "11", "12", "13"],
} as const;

export const NOTES_MAX = 280;

/** Keeps one answer set to known values, deduplicated, in catalogue order. */
function pick(raw: unknown, catalogue: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const chosen = new Set(raw.filter((v): v is string => typeof v === "string"));
  return catalogue.filter((option) => chosen.has(option));
}

function pickOne(raw: unknown, catalogue: readonly string[]): string | null {
  return typeof raw === "string" && catalogue.includes(raw) ? raw : null;
}

/**
 * Turns whatever the client posted into a profile, discarding anything not in
 * the catalogues. Never throws: a malformed field means "nothing selected",
 * which is a legitimate answer anyway, and the one field that can carry
 * arbitrary text is truncated rather than rejected.
 */
export function normalizeProfile(raw: unknown): TasteProfile {
  const body = (raw ?? {}) as Record<string, unknown>;
  const sizes = (body.sizes ?? {}) as Record<string, unknown>;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  return {
    brands: pick(body.brands, BRANDS),
    silhouettes: pick(body.silhouettes, SILHOUETTES),
    accessories: pick(body.accessories, ACCESSORIES),
    eras: pick(body.eras, ERAS),
    sizes: {
      tops: pickOne(sizes.tops, SIZES.tops),
      waist: pickOne(sizes.waist, SIZES.waist),
      shoes: pickOne(sizes.shoes, SIZES.shoes),
    },
    notes: notes ? notes.slice(0, NOTES_MAX) : null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Whether a profile says enough to recommend from.
 *
 * Brands alone are enough and silhouettes alone are enough, but a profile with
 * nothing but a shoe size is not — the recommender would be inventing a taste
 * rather than reading one, and the page is better off asking again.
 */
export function profileIsUsable(profile: TasteProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.brands.length > 0 ||
    profile.silhouettes.length > 0 ||
    profile.accessories.length > 0
  );
}
