import { randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { backends, env } from "@/lib/env";
import type { IdentificationRecord, User } from "@/lib/types";
import { dynamoClient } from "./clients";
import { readTable, writeTable } from "./local-store";

export interface UserDatabase {
  createUser(input: { id?: string; email: string; displayName?: string | null }): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  saveIdentification(record: IdentificationRecord): Promise<void>;
  listIdentifications(userId: string, limit?: number): Promise<IdentificationRecord[]>;
}

const USERS = "users";
const HISTORY = "history";

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
    const users = await readTable<User>(USERS);
    return users.find((u) => u.id === id) ?? null;
  }

  async getUserByEmail(email: string) {
    const users = await readTable<User>(USERS);
    return users.find((u) => u.email === email.toLowerCase()) ?? null;
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
    return (res.Item as User | undefined) ?? null;
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
    return (res.Items?.[0] as User | undefined) ?? null;
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
}

export const userDatabase: UserDatabase =
  backends.database === "dynamodb"
    ? new DynamoUserDatabase()
    : new LocalUserDatabase();
