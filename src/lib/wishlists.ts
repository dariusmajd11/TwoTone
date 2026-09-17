import { randomUUID } from "node:crypto";
import type { Wishlist } from "./types";
import {
  MAX_ENTRIES_PER_WISHLIST,
  MAX_WISHLISTS,
  WISHLIST_NAME_MAX,
} from "./wishlist-limits";

/** Carries the HTTP status so route handlers do not have to map messages back to codes. */
export class WishlistError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Collapses runs of whitespace as well as trimming, so "Winter   coats" and
 * "Winter coats" cannot coexist as two lists that look identical in the chip row.
 */
export function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new WishlistError("Give the list a name.");
  }
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    throw new WishlistError("Give the list a name.");
  }
  if (name.length > WISHLIST_NAME_MAX) {
    throw new WishlistError(
      `Keep the name to ${WISHLIST_NAME_MAX} characters or fewer.`,
    );
  }
  return name;
}

function find(wishlists: Wishlist[], id: string): Wishlist {
  const found = wishlists.find((list) => list.id === id);
  if (!found) throw new WishlistError("That list no longer exists.", 404);
  return found;
}

/**
 * Two lists with the same name are rejected because the name is the only thing
 * telling them apart in the UI — there is no second line to disambiguate on.
 * `ignoreId` lets a rename keep its own name (re-casing it, say) without the
 * list colliding with itself.
 */
function assertNameFree(wishlists: Wishlist[], name: string, ignoreId?: string) {
  const taken = wishlists.some(
    (list) =>
      list.id !== ignoreId &&
      list.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new WishlistError("You already have a list with that name.");
}

export function createWishlist(wishlists: Wishlist[], rawName: unknown): Wishlist[] {
  if (wishlists.length >= MAX_WISHLISTS) {
    throw new WishlistError(`You can keep up to ${MAX_WISHLISTS} lists.`);
  }
  const name = normalizeName(rawName);
  assertNameFree(wishlists, name);

  const now = new Date().toISOString();
  // Appended rather than prepended so existing chips keep their position when a
  // new list is made — nothing under the cursor moves.
  return [
    ...wishlists,
    { id: randomUUID(), name, entries: [], createdAt: now, updatedAt: now },
  ];
}

export function renameWishlist(
  wishlists: Wishlist[],
  id: string,
  rawName: unknown,
): Wishlist[] {
  const list = find(wishlists, id);
  const name = normalizeName(rawName);
  assertNameFree(wishlists, name, id);

  return wishlists.map((entry) =>
    entry.id === list.id
      ? { ...entry, name, updatedAt: new Date().toISOString() }
      : entry,
  );
}

export function deleteWishlist(wishlists: Wishlist[], id: string): Wishlist[] {
  find(wishlists, id);
  return wishlists.filter((list) => list.id !== id);
}

export function addEntry(
  wishlists: Wishlist[],
  id: string,
  recordId: string,
): Wishlist[] {
  const list = find(wishlists, id);

  // Adding something twice is a no-op rather than an error: the request already
  // describes the state the caller wants, and a duplicate click should not
  // produce a red message.
  if (list.entries.some((entry) => entry.recordId === recordId)) {
    return wishlists;
  }
  if (list.entries.length >= MAX_ENTRIES_PER_WISHLIST) {
    throw new WishlistError(
      `A list holds up to ${MAX_ENTRIES_PER_WISHLIST} pieces. Start another one.`,
    );
  }

  const now = new Date().toISOString();
  return wishlists.map((entry) =>
    entry.id === list.id
      ? {
          ...entry,
          entries: [{ recordId, addedAt: now }, ...entry.entries],
          updatedAt: now,
        }
      : entry,
  );
}

export function removeEntry(
  wishlists: Wishlist[],
  id: string,
  recordId: string,
): Wishlist[] {
  const list = find(wishlists, id);
  return wishlists.map((entry) =>
    entry.id === list.id
      ? {
          ...entry,
          entries: entry.entries.filter((item) => item.recordId !== recordId),
          updatedAt: new Date().toISOString(),
        }
      : entry,
  );
}
