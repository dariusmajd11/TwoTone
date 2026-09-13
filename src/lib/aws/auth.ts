import { createHmac, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { backends, env } from "@/lib/env";
import type { AuthSession, User } from "@/lib/types";
import { cognitoClient } from "./clients";
import { readTable, writeTable } from "./local-store";
import { userDatabase } from "./users";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthProvider {
  register(email: string, password: string, displayName?: string): Promise<User>;
  login(email: string, password: string): Promise<AuthSession>;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CREDENTIALS = "credentials";

type LocalCredential = {
  userId: string;
  email: string;
  salt: string;
  hash: string;
};

/**
 * Mirrors the Cognito contract with local password storage so registration and
 * login work before an AWS account exists. Passwords are scrypt-hashed rather
 * than stored plainly, since dev databases have a habit of outliving their
 * intended lifetime.
 */
class LocalAuthProvider implements AuthProvider {
  async register(email: string, password: string, displayName?: string) {
    const normalized = email.toLowerCase();
    if (await userDatabase.getUserByEmail(normalized)) {
      throw new AuthError("An account with that email already exists.");
    }
    const user = await userDatabase.createUser({
      email: normalized,
      displayName: displayName ?? null,
    });
    const salt = randomUUID();
    const hash = (await scrypt(password, salt, 64)).toString("hex");
    const rows = await readTable<LocalCredential>(CREDENTIALS);
    rows.push({ userId: user.id, email: normalized, salt, hash });
    await writeTable(CREDENTIALS, rows);
    return user;
  }

  async login(email: string, password: string) {
    const normalized = email.toLowerCase();
    const rows = await readTable<LocalCredential>(CREDENTIALS);
    const credential = rows.find((r) => r.email === normalized);
    if (!credential) throw new AuthError("Incorrect email or password.");

    const candidate = await scrypt(password, credential.salt, 64);
    const expected = Buffer.from(credential.hash, "hex");
    if (
      candidate.length !== expected.length ||
      !timingSafeEqual(candidate, expected)
    ) {
      throw new AuthError("Incorrect email or password.");
    }

    return {
      userId: credential.userId,
      email: normalized,
      accessToken: randomUUID(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
  }
}

class CognitoAuthProvider implements AuthProvider {
  private secretHash(email: string): string | undefined {
    if (!env.cognitoClientSecret) return undefined;
    return createHmac("sha256", env.cognitoClientSecret)
      .update(email + env.cognitoClientId!)
      .digest("base64");
  }

  async register(email: string, password: string, displayName?: string) {
    const normalized = email.toLowerCase();
    const res = await cognitoClient().send(
      new SignUpCommand({
        ClientId: env.cognitoClientId!,
        SecretHash: this.secretHash(normalized),
        Username: normalized,
        Password: password,
        UserAttributes: [{ Name: "email", Value: normalized }],
      }),
    );
    // Cognito owns the credential; DynamoDB owns app-level profile data, keyed
    // by the Cognito sub so the two stay joinable.
    return userDatabase.createUser({
      id: res.UserSub,
      email: normalized,
      displayName: displayName ?? null,
    });
  }

  async login(email: string, password: string) {
    const normalized = email.toLowerCase();
    const res = await cognitoClient().send(
      new InitiateAuthCommand({
        ClientId: env.cognitoClientId!,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: normalized,
          PASSWORD: password,
          ...(this.secretHash(normalized)
            ? { SECRET_HASH: this.secretHash(normalized)! }
            : {}),
        },
      }),
    );
    const auth = res.AuthenticationResult;
    if (!auth?.AccessToken) throw new AuthError("Incorrect email or password.");

    const user = await userDatabase.getUserByEmail(normalized);
    if (!user) throw new AuthError("Account is missing a profile record.");

    return {
      userId: user.id,
      email: normalized,
      accessToken: auth.AccessToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
    };
  }
}

export const authProvider: AuthProvider =
  backends.auth === "cognito" ? new CognitoAuthProvider() : new LocalAuthProvider();
