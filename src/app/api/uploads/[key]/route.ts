import { imageStorage } from "@/lib/aws/storage";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/uploads/[key]">,
) {
  const { key } = await context.params;
  const image = await imageStorage.get(decodeURIComponent(key));
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
