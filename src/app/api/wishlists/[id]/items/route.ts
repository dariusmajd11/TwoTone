import { userDatabase } from "@/lib/aws/users";
import { HISTORY_MAX_LIMIT } from "@/lib/history";
import { readJson, withWishlists } from "@/lib/wishlist-api";
import { addEntry, removeEntry, WishlistError } from "@/lib/wishlists";

export async function POST(
  request: Request,
  context: RouteContext<"/api/wishlists/[id]/items">,
) {
  const { id } = await context.params;
  const { recordId } = await readJson<{ recordId: unknown }>(request);

  return withWishlists(async (wishlists, userId) => {
    if (typeof recordId !== "string" || recordId.length === 0) {
      throw new WishlistError("Pick a piece to add.");
    }

    // A wishlist entry is only an id, so without this check the route would
    // happily store someone else's record id. Nothing would leak — the panel
    // resolves entries against the signed-in user's own history, so a foreign
    // id simply renders as nothing — but storing it at all is a bug waiting to
    // matter the moment resolution moves to the server.
    const history = await userDatabase.listIdentifications(
      userId,
      HISTORY_MAX_LIMIT,
    );
    if (!history.some((record) => record.id === recordId)) {
      throw new WishlistError("That piece is not in your history.", 404);
    }

    return addEntry(wishlists, id, recordId);
  });
}

/**
 * The id travels in the query string rather than a body because a `DELETE` with
 * a payload is poorly supported by caches and proxies, and unevenly implemented
 * by HTTP clients.
 */
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/wishlists/[id]/items">,
) {
  const { id } = await context.params;
  const recordId = new URL(request.url).searchParams.get("recordId");

  return withWishlists((wishlists) => {
    if (!recordId) throw new WishlistError("Pick a piece to remove.");
    return removeEntry(wishlists, id, recordId);
  });
}
