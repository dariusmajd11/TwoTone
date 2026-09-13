import { AuthError, authProvider } from "@/lib/aws/auth";
import { setSession } from "@/lib/session";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const session = await authProvider.login(email, password);
    await setSession(session);
    return Response.json({ userId: session.userId, email: session.email });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error("login failed", error);
    return Response.json({ error: "Could not sign in." }, { status: 500 });
  }
}
