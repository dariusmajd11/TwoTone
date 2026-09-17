import { readJson, withWishlists } from "@/lib/wishlist-api";
import { createWishlist } from "@/lib/wishlists";

/** The identity transform: read the set, change nothing, write nothing. */
export async function GET() {
  return withWishlists((wishlists) => wishlists);
}

export async function POST(request: Request) {
  const { name } = await readJson<{ name: unknown }>(request);
  return withWishlists((wishlists) => createWishlist(wishlists, name));
}
