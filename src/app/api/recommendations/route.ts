import { userDatabase } from "@/lib/aws/users";
import { recommendationsAreLive, recommender } from "@/lib/recommend";
import { getSession } from "@/lib/session";
import { profileIsUsable } from "@/lib/taste";
import type { Recommendation } from "@/lib/types";

/**
 * Recommendations are the most expensive thing in the app to produce — a full
 * model call with thinking — and the least likely to change between two page
 * loads, since the input is a profile the wearer edits perhaps twice a year.
 * Without a cache, opening the home page twice costs twice.
 *
 * Keyed by the profile's own `updatedAt`, so saving new answers invalidates the
 * entry by definition rather than by remembering to clear it.
 *
 * In-memory, which on a serverless deployment means per warm instance: a cold
 * start pays again, and two instances can each hold a copy. That is the right
 * trade for a cache whose miss costs one API call and whose staleness costs
 * nothing — a shared cache would mean provisioning something to share it in.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map<
  string,
  { at: number; recommendations: Recommendation[] }
>();

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Sign in to see recommendations." },
      { status: 401 },
    );
  }

  const taste = await userDatabase.getTaste(session.userId);
  if (!profileIsUsable(taste)) {
    // Not an error: a new account legitimately has nothing to recommend from,
    // and the home page uses this to invite them into the setup page.
    return Response.json({ recommendations: [], needsSetup: true, live: recommendationsAreLive });
  }

  const key = `${session.userId}:${taste!.updatedAt}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json({
      recommendations: hit.recommendations,
      needsSetup: false,
      live: recommendationsAreLive,
    });
  }

  try {
    const recommendations = await recommender.suggest(taste!);
    // Stale keys are dropped rather than left to accumulate: the entry a user
    // had before they edited their profile can never be read again.
    for (const existing of cache.keys()) {
      if (existing.startsWith(`${session.userId}:`)) cache.delete(existing);
    }
    cache.set(key, { at: Date.now(), recommendations });

    return Response.json({
      recommendations,
      needsSetup: false,
      live: recommendationsAreLive,
    });
  } catch (error) {
    console.error("recommendations failed", error);
    return Response.json(
      { error: "Could not put together a feed right now." },
      { status: 502 },
    );
  }
}
