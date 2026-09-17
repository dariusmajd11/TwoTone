/**
 * Free-text garment search — the typed counterpart to dropping a photo.
 *
 * This file deliberately imports nothing from Node, so the footer input can
 * share `SEARCH_QUERY_MAX` with the route that enforces it. Hard-coding the
 * number in the markup is how `maxLength` quietly drifts from the real limit.
 */

/** Carries the HTTP status so the route does not map messages back to codes. */
export class SearchError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Two characters, because one is never a garment and rejecting it early costs
 * nothing — where a request costs a model call and several seconds.
 */
export const SEARCH_QUERY_MIN = 2;

/**
 * A search is a name or a short description, not a paragraph. The cap is here
 * so an accidental paste of an entire product page comes back as a sentence
 * someone can act on rather than a slow, expensive, and worse answer.
 */
export const SEARCH_QUERY_MAX = 120;

export function normalizeQuery(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new SearchError("Type what you are looking for.");
  }
  // Collapsing runs of whitespace matters more here than it looks: queries get
  // pasted out of listings and arrive with newlines and double spaces in them.
  const query = raw.trim().replace(/\s+/g, " ");
  if (query.length < SEARCH_QUERY_MIN) {
    throw new SearchError("Type what you are looking for.");
  }
  if (query.length > SEARCH_QUERY_MAX) {
    throw new SearchError(
      `Keep the search to ${SEARCH_QUERY_MAX} characters or fewer.`,
    );
  }
  return query;
}
