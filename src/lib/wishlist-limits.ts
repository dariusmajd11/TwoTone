/**
 * Separate from `wishlists.ts` only so client code can import these.
 * `wishlists.ts` reaches for `node:crypto`, and a `"use client"` component that
 * imports it would break the build — but the panel still needs the name limit
 * to set `maxLength` on the rename field, and hard-coding 60 in the markup is
 * how that quietly drifts from the value the server enforces.
 *
 * The caps exist because every list a user owns is stored inside their user
 * record, and DynamoDB refuses an item over 400KB. An entry is roughly 80
 * bytes, so 20 × 100 leaves the record two orders of magnitude clear of the
 * ceiling — these limits are here to make hitting one a readable sentence
 * rather than a `ValidationException` from the SDK at some unpredictable point
 * much later.
 */
export const WISHLIST_NAME_MAX = 60;
export const MAX_WISHLISTS = 20;
export const MAX_ENTRIES_PER_WISHLIST = 100;
