import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { backends, env } from "@/lib/env";
import { s3Client } from "./clients";

export type StoredImage = {
  key: string;
  /** Something an <img> tag can render directly. */
  url: string;
};

export interface ImageStorage {
  put(bytes: Buffer, contentType: string): Promise<StoredImage>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

const LOCAL_ROOT = path.join(process.cwd(), ".twotone-data", "uploads");

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

class LocalImageStorage implements ImageStorage {
  async put(bytes: Buffer, contentType: string): Promise<StoredImage> {
    const key = `${randomUUID()}.${extensionFor(contentType)}`;
    await mkdir(LOCAL_ROOT, { recursive: true });
    await writeFile(path.join(LOCAL_ROOT, key), bytes);
    return { key, url: `/api/uploads/${key}` };
  }

  async get(key: string) {
    // Guard against `../` traversal reaching outside the upload directory.
    const target = path.resolve(LOCAL_ROOT, key);
    if (!target.startsWith(path.resolve(LOCAL_ROOT) + path.sep)) return null;
    try {
      const bytes = await readFile(target);
      return { bytes, contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }
}

class S3ImageStorage implements ImageStorage {
  async put(bytes: Buffer, contentType: string): Promise<StoredImage> {
    const key = `uploads/${randomUUID()}.${extensionFor(contentType)}`;
    await s3Client().send(
      new PutObjectCommand({
        Bucket: env.s3Bucket!,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return { key, url: `/api/uploads/${encodeURIComponent(key)}` };
  }

  async get(key: string) {
    try {
      const res = await s3Client().send(
        new GetObjectCommand({ Bucket: env.s3Bucket!, Key: key }),
      );
      const bytes = Buffer.from(await res.Body!.transformToByteArray());
      return { bytes, contentType: res.ContentType ?? contentTypeFor(key) };
    } catch {
      return null;
    }
  }
}

export const imageStorage: ImageStorage =
  backends.storage === "s3" ? new S3ImageStorage() : new LocalImageStorage();
