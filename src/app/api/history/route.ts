import { userDatabase } from "@/lib/aws/users";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in to see your history." }, { status: 401 });
  }

  const records = await userDatabase.listIdentifications(session.userId);
  return Response.json({ records });
}
