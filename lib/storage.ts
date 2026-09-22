import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Where photos live.
 *
 * Two methods, on purpose. Local disk is right for a single yard on a single
 * server, and moving to S3 or R2 later means replacing this file and nothing else.
 */

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const UPLOADS = path.join(DATA_DIR, "uploads");

export interface StoredPhoto {
  id: string;
  filename: string;
  bytes: number;
  uploadedAt: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

export async function save(file: File): Promise<StoredPhoto> {
  const extension = EXTENSIONS[file.type] ?? path.extname(file.name).toLowerCase() ?? ".jpg";
  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const filename = id + extension;

  await fs.mkdir(UPLOADS, { recursive: true });
  await fs.writeFile(path.join(UPLOADS, filename), Buffer.from(await file.arrayBuffer()));

  return { id, filename, bytes: file.size, uploadedAt: new Date().toISOString() };
}

/** The URL the browser fetches a photo from. Photos live outside `public/` because
 *  they are yard data, not assets — they are served by a route, not the file server. */
export function url(filename: string): string {
  return `/api/photos/${encodeURIComponent(filename)}`;
}

export async function list(): Promise<StoredPhoto[]> {
  let names: string[];
  try {
    names = await fs.readdir(UPLOADS);
  } catch {
    return [];
  }

  const photos = await Promise.all(
    names.map(async (filename) => {
      const stat = await fs.stat(path.join(UPLOADS, filename));
      return {
        id: path.parse(filename).name,
        filename,
        bytes: stat.size,
        uploadedAt: stat.mtime.toISOString(),
      };
    }),
  );
  return photos.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function read(filename: string): Promise<Buffer | null> {
  // The filename comes from a URL, so it is untrusted: anything with a path
  // separator in it is refused rather than resolved.
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  try {
    return await fs.readFile(path.join(UPLOADS, filename));
  } catch {
    return null;
  }
}

/** Deletes a stored photo. A file that is already gone is not an error. */
export async function remove(filename: string): Promise<void> {
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    throw new Error(`refusing to delete outside the store: ${filename}`);
  }
  await fs.rm(path.join(UPLOADS, filename), { force: true });
}

export const contentType = (filename: string): string =>
  Object.entries(EXTENSIONS).find(([, ext]) => filename.endsWith(ext))?.[0] ?? "application/octet-stream";
