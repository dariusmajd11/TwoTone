import { userDatabase } from "@/lib/aws/users";
import { getSession } from "@/lib/session";
import { normalizeProfile } from "@/lib/taste";
import { readJson } from "@/lib/wishlist-api";

/**
 * The taste profile behind the For You page.
 *
 * Kept out of `/api/auth/me` on purpose. That route runs on every page load and
 * its job is to say who you are; the profile is a much larger object that only
 * two screens need, and folding it in would put the whole catalogue of answers
 * on the wire for every visitor including the ones who never open either.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ taste: null });

  const taste = await userDatabase.getTaste(session.userId);
  return Response.json({ taste });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Sign in to save your taste." },
      { status: 401 },
    );
  }

  // Normalising rather than validating: the setup page can only produce
  // catalogue values, so anything else arriving here is either a stale client
  // or someone poking at the endpoint. Both are best served by keeping what
  // makes sense and dropping what does not, rather than a 400 nobody sees.
  const taste = normalizeProfile(await readJson(request));

  try {
    await userDatabase.saveTaste(session.userId, taste);
    return Response.json({ taste });
  } catch (error) {
    console.error("saving taste failed", error);
    return Response.json(
      { error: "Could not save your answers." },
      { status: 500 },
    );
  }
}
