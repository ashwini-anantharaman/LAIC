/**
 * Slice 12 — org-scoped storage (v0.4 §15/§17). FS adapter unit round-trip +
 * org-key isolation, and the logo-upload HTTP flow. Runs offline (no cloud).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-storage-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.STORAGE_DIR = join(tempDir, "storage");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.DATABASE_URL = ""; // FS storage + local mode ("" not delete — dotenv would repopulate)
process.env.SUPABASE_DB_URL = "";
delete process.env.S3_BUCKET; // force FS adapter

const { getStorage, orgKey, _resetStorage } = await import("../src/storage");
const { createApp } = await import("../src/app");
const app = createApp();

beforeAll(() => _resetStorage());
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"); // tiny PNG header

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("storage adapter (filesystem)", () => {
  it("round-trips an org-scoped object and isolates by org key", async () => {
    const s = getStorage();
    const keyA = orgKey("org-A", "logo.png");
    const keyB = orgKey("org-B", "logo.png");
    await s.put(keyA, PNG, "image/png");

    const got = await s.get(keyA);
    expect(got?.body.equals(PNG)).toBe(true);
    expect(got?.contentType).toBe("image/png");
    expect(keyA).toBe("orgs/org-A/logo.png");
    // A different org's key doesn't resolve to A's object.
    expect(await s.get(keyB)).toBeNull();

    await s.delete(keyA);
    expect(await s.get(keyA)).toBeNull();
  });

  it("rejects a path-traversal key", async () => {
    await expect(getStorage().put("../escape.png", PNG, "image/png")).rejects.toThrow();
  });
});

describe("logo upload (HTTP, local mode)", () => {
  it("stores the logo, sets the org theme logo_url, and serves it back", async () => {
    const email = `logo_${Date.now()}@x.test`;
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: "Logo Org", email, password: "password123" });
    const token = su.body.access_token;
    const me = await req("GET", "/api/platform/auth/me", undefined, token);
    const orgId = me.body.memberships[0].org_id;

    const up = await req("POST", `/api/platform/orgs/${orgId}/logo`, { data: PNG.toString("base64"), content_type: "image/png" }, token);
    expect(up.status).toBe(200);
    expect(up.body.logo_url).toContain(`/api/platform/storage/orgs/${orgId}/logo.png`);

    // The served route returns the bytes.
    const res = await app.request(up.body.logo_url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const served = Buffer.from(await res.arrayBuffer());
    expect(served.equals(PNG)).toBe(true);
  });

  it("rejects a non-image and an oversized upload", async () => {
    const email = `logo2_${Date.now()}@x.test`;
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: "Logo Org 2", email, password: "password123" });
    const token = su.body.access_token;
    const orgId = (await req("GET", "/api/platform/auth/me", undefined, token)).body.memberships[0].org_id;

    const bad = await req("POST", `/api/platform/orgs/${orgId}/logo`, { data: Buffer.from("x").toString("base64"), content_type: "application/pdf" }, token);
    expect(bad.status).toBe(422);
    const big = await req("POST", `/api/platform/orgs/${orgId}/logo`, { data: Buffer.alloc(1_048_577, 1).toString("base64"), content_type: "image/png" }, token);
    expect(big.status).toBe(413);
  });
});
