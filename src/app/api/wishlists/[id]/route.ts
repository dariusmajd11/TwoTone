import { readJson, withWishlists } from "@/lib/wishlist-api";
import { deleteWishlist, renameWishlist } from "@/lib/wishlists";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/wishlists/[id]">,
) {
  const { id } = await context.params;
  const { name } = await readJson<{ name: unknown }>(request);
  return withWishlists((wishlists) => renameWishlist(wishlists, id, name));
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/wishlists/[id]">,
) {
  const { id } = await context.params;
  return withWishlists((wishlists) => deleteWishlist(wishlists, id));
}
