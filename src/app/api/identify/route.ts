import { randomUUID } from "node:crypto";
import { imageStorage } from "@/lib/aws/storage";
import { userDatabase } from "@/lib/aws/users";
import { IdentificationError, garmentIdentifier } from "@/lib/identify";
import { buildMarketLinks } from "@/lib/marketplaces";
import { getSession } from "@/lib/session";
import type { IdentificationRecord } from "@/lib/types";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Claude rejects images whose base64 payload exceeds ~5MB, and base64 inflates
// bytes by about a third.
const MAX_BYTES = 3.5 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("image");

  if (!(file instanceof File)) {
    return Response.json({ error: "Attach a photo of the garment." }, { status: 400 });
  }
  if (!ACCEPTED.includes(file.type)) {
    return Response.json(
      { error: "Use a JPEG, PNG, WebP, or GIF image." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "That image is too large — keep it under 3.5MB." },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const session = await getSession();

    // Only signed-in visitors get their photo stored. Without an account there
    // is nowhere to show it again, so an upload would just be an orphan in the
    // bucket — paid for, unreachable, and never deleted. Anonymous visitors
    // still get a full result; it just is not kept.
    const stored = session ? await imageStorage.put(bytes, file.type) : null;

    const result = await garmentIdentifier.identify(
      bytes.toString("base64"),
      file.type,
    );

    const record: IdentificationRecord = {
      id: randomUUID(),
      userId: session?.userId ?? null,
      imageKey: stored?.key ?? null,
      imageUrl: stored?.url ?? null,
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
    console.error("identify failed", error);
    return Response.json(
      { error: "Could not identify that garment. Try another photo." },
      { status: 500 },
    );
  }
}
