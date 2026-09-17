import { listingSource, listingsAreLive } from "@/lib/listings";
import { SearchError, normalizeQuery } from "@/lib/search";

/**
 * Live listings for a query, fetched by the card after it renders rather than
 * folded into `/api/identify`.
 *
 * Two reasons it is its own request. Identification already takes the better
 * part of twenty seconds, and holding the answer back until a marketplace also
 * replies would make the slowest part slower. More importantly it isolates the
 * failure: eBay being down, rate-limited, or misconfigured costs you the grid,
 * not the identification you actually asked for.
 */
export async function GET(request: Request) {
  let query: string;
  try {
    query = normalizeQuery(new URL(request.url).searchParams.get("q"));
  } catch (error) {
    if (error instanceof SearchError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  try {
    const listings = await listingSource.search(query);
    return Response.json({ listings, live: listingsAreLive });
  } catch (error) {
    console.error("listing search failed", error);
    return Response.json(
      { error: "Could not reach the marketplace." },
      { status: 502 },
    );
  }
}
