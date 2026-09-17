import { randomUUID } from "node:crypto";
import { userDatabase } from "@/lib/aws/users";
import { IdentificationError, garmentIdentifier } from "@/lib/identify";
import { buildMarketLinks } from "@/lib/marketplaces";
import { SearchError, normalizeQuery } from "@/lib/search";
import { getSession } from "@/lib/session";
import type { IdentificationRecord } from "@/lib/types";

/**
 * Text search. The sibling `/api/identify` takes a photo; this takes a
 * sentence. Both end at the same `IdentificationRecord`, which is why a
 * searched piece lands in history and can be saved to a wishlist with no
 * special handling anywhere downstream.
 *
 * There is no S3 write here — a search has no image to keep. That leaves
 * `imageKey`/`imageUrl` null on the record, which the row and the card already
 * handle, since signed-out photo results have always been storage-free too.
 */
export async function POST(request: Request) {
  let query: string;
  try {
    const body = await request.json().catch(() => ({}));
    query = normalizeQuery((body as { query?: unknown }).query);
  } catch (error) {
    if (error instanceof SearchError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  try {
    const result = await garmentIdentifier.describe(query);
    const session = await getSession();

    const record: IdentificationRecord = {
      id: randomUUID(),
      userId: session?.userId ?? null,
      imageKey: null,
      imageUrl: null,
      result,
      marketLinks: buildMarketLinks(result),
      createdAt: new Date().toISOString(),
    };

    if (record.userId) await userDatabase.saveIdentification(record);

    return Response.json({ record });
  } catch (error) {
    if (error instanceof IdentificationError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("search failed", error);
    return Response.json(
      { error: "Could not look that up. Try describing it differently." },
      { status: 500 },
    );
  }
}
