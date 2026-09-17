import { randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { backends, env } from "@/lib/env";
import type {
  IdentificationRecord,
  TasteProfile,
  User,
  Wishlist,
} from "@/lib/types";
import { dynamoClient } from "./clients";
import { readTable, writeTable } from "./local-store";

export interface UserDatabase {
  createUser(input: { id?: string; email: string; displayName?: string | null }): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  saveIdentification(record: IdentificationRecord): Promise<void>;
  listIdentifications(userId: string, limit?: number): Promise<IdentificationRecord[]>;
  listWishlists(userId: string): Promise<Wishlist[]>;
  /** Replaces the whole set — see the note on `StoredUser` for why. */
  saveWishlists(userId: string, wishlists: Wishlist[]): Promise<void>;
  getTaste(userId: string): Promise<TasteProfile | null>;
  saveTaste(userId: string, taste: TasteProfile): Promise<void>;
}

const USERS = "users";
const HISTORY = "history";

/**
 * Wishlists hang off the user row instead of living in a table of their own.
 *
 * A third table would be the textbook answer, but it would also mean another
 * DynamoDB table to provision, another env var, and another IAM statement — for
 * data that is always read as a complete set, always scoped to exactly one user,
 * and measured in kilobytes. Keeping it on the row makes a read free (it comes
 * back with the user) and a write a single conditional update.
 *
 * The cost is that saving is read-modify-write over the whole set, so two tabs
 * editing lists at the same moment will have one overwrite the other. For a
 * personal archive that is an acceptable trade; if lists ever become shared,
 * this is the thing that has to change first.
 */
type StoredUser = User & { wishlists?: Wishlist[]; taste?: TasteProfile };

/**
 * Narrows a stored row to the public shape. Without this the wishlist blob
 * would ride along in `/api/auth/me` on every page load, which is both wasted
 * bytes and a `User` object that does not match its own type.
 */
function toUser(row: StoredUser): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}

class LocalUserDatabase implements UserDatabase {
  async createUser(input: { id?: string; email: string; displayName?: string | null }) {
    const users = await readTable<User>(USERS);
    const user: User = {
      id: input.id ?? randomUUID(),
      email: input.email.toLowerCase(),
      displayName: input.displayName ?? null,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeTable(USERS, users);
    return user;
  }

  async getUserById(id: string) {
    const users = await readTable<StoredUser>(USERS);
    const found = users.find((u) => u.id === id);
    return found ? toUser(found) : null;
  }

  async getUserByEmail(email: string) {
    const users = await readTable<StoredUser>(USERS);
    const found = users.find((u) => u.email === email.toLowerCase());
    return found ? toUser(found) : null;
  }

  async saveIdentification(record: IdentificationRecord) {
    const rows = await readTable<IdentificationRecord>(HISTORY);
    rows.push(record);
    await writeTable(HISTORY, rows);
  }

  async listIdentifications(userId: string, limit = 25) {
    const rows = await readTable<IdentificationRecord>(HISTORY);
    return rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listWishlists(userId: string) {
    const users = await readTable<StoredUser>(USERS);
    return users.find((u) => u.id === userId)?.wishlists ?? [];
  }

  async saveWishlists(userId: string, wishlists: Wishlist[]) {
    const users = await readTable<StoredUser>(USERS);
    const next = users.map((u) => (u.id === userId ? { ...u, wishlists } : u));
    await writeTable(USERS, next);
  }

  async getTaste(userId: string) {
    const users = await readTable<StoredUser>(USERS);
    return users.find((u) => u.id === userId)?.taste ?? null;
  }

  async saveTaste(userId: string, taste: TasteProfile) {
    const users = await readTable<StoredUser>(USERS);
    const next = users.map((u) => (u.id === userId ? { ...u, taste } : u));
    await writeTable(USERS, next);
  }
}

class DynamoUserDatabase implements UserDatabase {
  async createUser(input: { id?: string; email: string; displayName?: string | null }) {
    const user: User = {
      id: input.id ?? randomUUID(),
      email: input.email.toLowerCase(),
      displayName: input.displayName ?? null,
      createdAt: new Date().toISOString(),
    };
    await dynamoClient().send(
      new PutCommand({
        TableName: env.dynamoUsersTable!,
        Item: user,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );
    return user;
  }

  async getUserById(id: string) {
    const res = await dynamoClient().send(
      new GetCommand({ TableName: env.dynamoUsersTable!, Key: { id } }),
    );
    const row = res.Item as StoredUser | undefined;
    return row ? toUser(row) : null;
  }

  async getUserByEmail(email: string) {
    // Requires a global secondary index named `email-index` on the users table.
    const res = await dynamoClient().send(
      new QueryCommand({
        TableName: env.dynamoUsersTable!,
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email.toLowerCase() },
        Limit: 1,
      }),
    );
    const row = res.Items?.[0] as StoredUser | undefined;
    return row ? toUser(row) : null;
  }

  async saveIdentification(record: IdentificationRecord) {
    await dynamoClient().send(
      new PutCommand({ TableName: env.dynamoHistoryTable!, Item: record }),
    );
  }

  async listIdentifications(userId: string, limit = 25) {
    // History table is keyed (userId, createdAt) so newest-first is a reverse scan.
    const res = await dynamoClient().send(
      new QueryCommand({
        TableName: env.dynamoHistoryTable!,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items as IdentificationRecord[] | undefined) ?? [];
  }

  async listWishlists(userId: string) {
    const res = await dynamoClient().send(
      new GetCommand({
        TableName: env.dynamoUsersTable!,
        Key: { id: userId },
        // The user row also carries an email and a display name that nothing
        // here needs; projecting keeps the read down to the one attribute.
        ProjectionExpression: "wishlists",
      }),
    );
    return ((res.Item as StoredUser | undefined)?.wishlists) ?? [];
  }

  /**
   * Re-puts the whole row rather than setting the one attribute, because the
   * deployed `twotone-app` IAM policy grants `GetItem`, `PutItem` and `Query`
   * but *not* `UpdateItem` — a `SET wishlists = :w` update fails closed with
   * AccessDenied, which would have surfaced as a 500 the first time anyone made
   * a list. Widening the policy is the tidier fix; this works with what is
   * already deployed.
   *
   * The read has to be unprojected: anything left out here would be dropped
   * from the row by the put that follows.
   */
  async saveWishlists(userId: string, wishlists: Wishlist[]) {
    const res = await dynamoClient().send(
      new GetCommand({ TableName: env.dynamoUsersTable!, Key: { id: userId } }),
    );
    const row = res.Item as StoredUser | undefined;
    if (!row) {
      throw new Error(`No user ${userId} to save wishlists against.`);
    }

    await dynamoClient().send(
      new PutCommand({
        TableName: env.dynamoUsersTable!,
        Item: { ...row, wishlists },
        // Guards the gap between the read above and this write: if the account
        // was deleted in between, a plain put would resurrect it as a row that
        // holds nothing but lists.
        ConditionExpression: "attribute_exists(id)",
      }),
    );
  }

  async getTaste(userId: string) {
    const res = await dynamoClient().send(
      new GetCommand({
        TableName: env.dynamoUsersTable!,
        Key: { id: userId },
        ProjectionExpression: "taste",
      }),
    );
    return ((res.Item as StoredUser | undefined)?.taste) ?? null;
  }

  /**
   * Same read-modify-write as `saveWishlists`, and for the same reason: the
   * deployed policy has `PutItem` but not `UpdateItem`, so the row is re-put
   * whole. The read must stay unprojected — an attribute left out of it would
   * be deleted from the row by the put that follows, and the attribute most
   * likely to be left out is the wishlist set.
   */
  async saveTaste(userId: string, taste: TasteProfile) {
    const res = await dynamoClient().send(
      new GetCommand({ TableName: env.dynamoUsersTable!, Key: { id: userId } }),
    );
    const row = res.Item as StoredUser | undefined;
    if (!row) {
      throw new Error(`No user ${userId} to save a taste profile against.`);
    }

    await dynamoClient().send(
      new PutCommand({
        TableName: env.dynamoUsersTable!,
        Item: { ...row, taste },
        ConditionExpression: "attribute_exists(id)",
      }),
    );
  }
}

export const userDatabase: UserDatabase =
  backends.database === "dynamodb"
    ? new DynamoUserDatabase()
    : new LocalUserDatabase();
