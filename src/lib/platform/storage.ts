/**
 * File storage abstraction. Default driver = local disk (STORAGE_DIR, default ./uploads) which needs a
 * persistent volume in production. A cloud driver (S3/R2) can implement the same interface.
 * Files are never served from a public path — only through authenticated, tenant-checked routes.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StorageDriver { name: string; isConfigured(): boolean; put(companyId: string, data: Buffer): Promise<string>; get(key: string): Promise<Buffer>; remove(key: string): Promise<void> }

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./uploads");
const KEY = /^[a-z0-9]+\/[a-f0-9-]{36}$/i; // companyId/uuid — blocks path traversal

export const diskStorage: StorageDriver = {
  name: "disk",
  isConfigured: () => true,
  async put(companyId, data) {
    if (!/^[a-z0-9]+$/i.test(companyId)) throw new Error("bad company id");
    const key = `${companyId}/${randomUUID()}`;
    await mkdir(path.join(root(), companyId), { recursive: true });
    await writeFile(path.join(root(), key), data, { flag: "wx" });
    return key;
  },
  async get(key) { if (!KEY.test(key)) throw new Error("bad key"); return readFile(path.join(root(), key)); },
  async remove(key) { if (!KEY.test(key)) return; await unlink(path.join(root(), key)).catch(() => undefined); },
};

export function getStorage(): StorageDriver | null {
  const p = process.env.STORAGE_PROVIDER ?? "disk";
  return p === "disk" ? diskStorage : null; // "s3" etc. not implemented in this build
}

export const MAX_UPLOAD = 5 * 1024 * 1024;
const SIGNATURES: [string, number[]][] = [["application/pdf", [0x25, 0x50, 0x44, 0x46]], ["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]], ["image/webp", [0x52, 0x49, 0x46, 0x46]]];

/** Detect the real type from magic bytes — the client-declared MIME type is never trusted. */
export function sniffMime(buf: Buffer): string | null {
  for (const [mime, sig] of SIGNATURES) if (sig.every((b, i) => buf[i] === b)) return mime;
  return null;
}
export const safeFileName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";
