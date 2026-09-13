import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), ".twotone-data");

/**
 * Stand-in for DynamoDB while the project runs without an AWS account.
 * Writes to disk so a dev-server restart does not wipe test accounts.
 */
export async function readTable<T>(table: string): Promise<T[]> {
  try {
    const raw = await readFile(path.join(ROOT, `${table}.json`), "utf8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export async function writeTable<T>(table: string, rows: T[]): Promise<void> {
  await mkdir(ROOT, { recursive: true });
  await writeFile(
    path.join(ROOT, `${table}.json`),
    JSON.stringify(rows, null, 2),
    "utf8",
  );
}
