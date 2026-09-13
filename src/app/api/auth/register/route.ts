import { AuthError, authProvider } from "@/lib/aws/auth";

export async function POST(request: Request) {
  const { email, password, displayName } = await request.json();

  if (typeof email !== "string" || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const user = await authProvider.register(
      email,
      password,
      typeof displayName === "string" ? displayName : undefined,
    );
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("register failed", error);
    return Response.json({ error: "Could not create the account." }, { status: 500 });
  }
}
