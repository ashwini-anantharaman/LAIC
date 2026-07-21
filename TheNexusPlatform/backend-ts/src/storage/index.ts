/**
 * Object storage — Nexus v0.4 §15/§17 (Slice 12).
 *
 * Portable, org-scoped storage behind one interface. Provider SDK calls live
 * ONLY here (portability rule #3, mirroring lib/auth). Two implementations:
 *  - S3-compatible (real S3 or Supabase Storage's S3 endpoint) when S3_BUCKET is
 *    set — standard S3 API, no provider-specific helpers (rule #2).
 *  - Local filesystem fallback for dev/offline.
 *
 * Every key is prefixed with the caller's org (`orgs/{orgId}/…`), and the orgId
 * is always supplied server-side from the request context — one org can't read
 * or write another's prefix (the storage analogue of RLS).
 */
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { getSettings } from "../config";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** A browser-usable URL for the object (served route for FS, S3 URL for S3). */
  url(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  /** Read back (used by the FS serve route; S3 serves directly and returns null). */
  get(key: string): Promise<StoredObject | null>;
}

/** Org-scoped key. Always call with a server-resolved orgId. */
export function orgKey(orgId: string, path: string): string {
  return `orgs/${orgId}/${path.replace(/^\/+/, "")}`;
}

const EXT_CT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml",
};

function ctForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return EXT_CT[ext] ?? "application/octet-stream";
}

// ── Filesystem adapter (dev/offline) ────────────────────────────────────────
class FsStorage implements StorageAdapter {
  private root: string;
  constructor(root: string) { this.root = root; }

  private safe(key: string): string {
    const full = normalize(join(this.root, key));
    if (!full.startsWith(normalize(this.root))) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, body: Buffer): Promise<void> {
    const full = this.safe(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  async url(key: string): Promise<string> {
    return `/api/platform/storage/${key}`;
  }
  async delete(key: string): Promise<void> {
    await rm(this.safe(key), { force: true });
  }
  async get(key: string): Promise<StoredObject | null> {
    try {
      const body = await readFile(this.safe(key));
      return { body, contentType: ctForKey(key) };
    } catch {
      return null;
    }
  }
}

// ── S3-compatible adapter (prod) — aws-sdk imported lazily ──────────────────
class S3Storage implements StorageAdapter {
  private cfg = getSettings();
  private clientPromise: Promise<unknown> | null = null;

  private async client(): Promise<{ s3: any; S3: any; presign: any }> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const S3 = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const s3 = new S3.S3Client({
          region: this.cfg.s3Region,
          endpoint: this.cfg.s3Endpoint || undefined,
          forcePathStyle: Boolean(this.cfg.s3Endpoint),
          credentials: this.cfg.s3AccessKeyId
            ? { accessKeyId: this.cfg.s3AccessKeyId, secretAccessKey: this.cfg.s3SecretAccessKey }
            : undefined,
        });
        return { s3, S3, presign: getSignedUrl };
      })();
    }
    return this.clientPromise as Promise<{ s3: any; S3: any; presign: any }>;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { s3, S3 } = await this.client();
    await s3.send(new S3.PutObjectCommand({ Bucket: this.cfg.s3Bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async url(key: string): Promise<string> {
    const { s3, S3, presign } = await this.client();
    return presign(s3, new S3.GetObjectCommand({ Bucket: this.cfg.s3Bucket, Key: key }), { expiresIn: 3600 });
  }
  async delete(key: string): Promise<void> {
    const { s3, S3 } = await this.client();
    await s3.send(new S3.DeleteObjectCommand({ Bucket: this.cfg.s3Bucket, Key: key }));
  }
  async get(): Promise<StoredObject | null> {
    return null; // S3 objects are served by their own URL, not proxied.
  }
}

// ── Postgres adapter — the serverless default ────────────────────────────────
// Vercel's filesystem is read-only/ephemeral, so small assets (logos, ≤1MB)
// live in the shared database as base64 and are proxied by the serve route.
class DbStorage implements StorageAdapter {
  private async db() {
    const { getDb, schema } = await import("../db/client");
    return { db: getDb(), files: schema.storedFiles };
  }
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { db, files } = await this.db();
    await db
      .insert(files)
      .values({ key, contentType, data: body.toString("base64") })
      .onConflictDoUpdate({ target: files.key, set: { contentType, data: body.toString("base64") } });
  }
  async url(key: string): Promise<string> {
    return `/api/platform/storage/${key}`;
  }
  async delete(key: string): Promise<void> {
    const { db, files } = await this.db();
    const { eq } = await import("drizzle-orm");
    await db.delete(files).where(eq(files.key, key));
  }
  async get(key: string): Promise<StoredObject | null> {
    const { db, files } = await this.db();
    const { eq } = await import("drizzle-orm");
    const r = await db.select().from(files).where(eq(files.key, key)).limit(1);
    if (!r.length) return null;
    return { body: Buffer.from(r[0].data, "base64"), contentType: r[0].contentType };
  }
}

let _adapter: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;
  const s = getSettings();
  _adapter = s.storageS3Enabled ? new S3Storage() : s.databaseUrl ? new DbStorage() : new FsStorage(s.storageDir);
  return _adapter;
}

/** Test/reset hook. */
export function _resetStorage(): void {
  _adapter = null;
}
