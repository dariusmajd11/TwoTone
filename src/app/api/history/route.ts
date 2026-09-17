import { userDatabase } from "@/lib/aws/users";
import { parseHistoryLimit } from "@/lib/history";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in to see your history." }, { status: 401 });
  }

  const limit = parseHistoryLimit(
    new URL(request.url).searchParams.get("limit"),
  );
  const records = await userDatabase.listIdentifications(session.userId, limit);
  return Response.json({ records });
}
