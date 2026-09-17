import { userDatabase } from "@/lib/aws/users";
import { getSession } from "@/lib/session";
import type { Wishlist } from "@/lib/types";
import { WishlistError } from "@/lib/wishlists";

/**
 * Every wishlist route is the same five steps: authenticate, read the set,
 * transform it, write it back, hand the new set to the client. Only the
 * transform differs, so it is the only thing a route has to supply.
 *
 * Responding with the *whole* set after any change — rather than just the list
 * that was touched — is what lets the panel replace its state wholesale instead
 * of patching it. Client and server cannot drift if the client never computes
 * the new state itself.
 */
export async function withWishlists(
  mutate: (
    wishlists: Wishlist[],
    userId: string,
  ) => Wishlist[] | Promise<Wishlist[]>,
): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Sign in to keep a wishlist." },
      { status: 401 },
    );
  }

  const current = await userDatabase.listWishlists(session.userId);

  try {
    const next = await mutate(current, session.userId);
    // The mutators return the array they were given when a request asks for
    // state that already holds — adding a piece twice, say. Identity means
    // nothing changed, so there is nothing to write.
    if (next !== current) {
      await userDatabase.saveWishlists(session.userId, next);
    }
    return Response.json({ wishlists: next });
  } catch (error) {
    if (error instanceof WishlistError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("wishlist update failed", error);
    return Response.json(
      { error: "Could not update the list." },
      { status: 500 },
    );
  }
}

/** Route bodies arrive untyped and can be absent or malformed entirely. */
export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}
