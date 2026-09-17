/**
 * The History tab shows a recent slice, but the wishlist picker has to offer
 * everything you have identified — and the wishlist itself stores ids, which
 * are resolved against whatever history the client holds. Both of those want a
 * much wider window than the tab does, hence the query parameter.
 *
 * The ceiling is not decoration: `listIdentifications` maps to a DynamoDB query
 * whose `Limit` is also its page size, so an uncapped value read straight from
 * the URL would let anyone with a session ask for an arbitrarily large read.
 */
export const HISTORY_DEFAULT_LIMIT = 25;
export const HISTORY_MAX_LIMIT = 200;

export function parseHistoryLimit(raw: string | null): number {
  if (raw === null) return HISTORY_DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return HISTORY_DEFAULT_LIMIT;
  return Math.min(parsed, HISTORY_MAX_LIMIT);
}
