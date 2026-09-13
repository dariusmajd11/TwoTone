import { userDatabase } from "@/lib/aws/users";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ user: null });

  const user = await userDatabase.getUserById(session.userId);
  return Response.json({ user });
}
