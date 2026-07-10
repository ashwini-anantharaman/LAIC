import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Point the store at an isolated temp dir BEFORE importing it.
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-tokens-"));
process.env.LOCAL_DATA_DIR = tempDir;

const store = await import("../src/platformLocalStore");

beforeAll(() => {
  process.env.LOCAL_DATA_DIR = tempDir;
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("hashApiKey (sha256 hex, byte-identical to Python hashlib)", () => {
  it("matches Python-generated vectors", () => {
    // python3 -c "import hashlib; print(hashlib.sha256('nxk_test-fixed-input'.encode()).hexdigest())"
    expect(store.hashApiKey("nxk_test-fixed-input")).toBe(
      "e680451cc45e6d81f53f00e2169c1771ec3ecec8433d880e5672e9cd2a99efb8",
    );
    expect(store.hashApiKey("hunter22")).toBe(
      "20d2fe5e369db54ec7090639a9dc30ec4d608604936239d39e2de07fda09eb0b",
    );
  });
});

describe("generateApiKey", () => {
  it("matches the Python format: nxk_ + 43-char base64url, sha256 hash, 12-char prefix", () => {
    const [raw, hash, prefix] = store.generateApiKey();
    expect(raw).toMatch(/^nxk_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(store.hashApiKey(raw));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(prefix.length).toBe(12);
  });
});

describe("launch tokens", () => {
  it("creates a 60s single-use token and consumes it exactly once", () => {
    const [row, raw] = store.localCreateLaunchToken("app-1", "user-1");
    expect(raw).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 bytes base64url
    expect(row.token_hash).toBe(store.hashApiKey(raw));
    expect(row.used_at).toBeNull();
    const ttlMs = new Date(row.expires_at).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(55_000);
    expect(ttlMs).toBeLessThanOrEqual(60_000);

    const consumed = store.localConsumeLaunchToken(raw);
    expect(consumed).not.toBeNull();
    expect(consumed!.used_at).not.toBeNull();

    // Second consume fails (single-use).
    expect(store.localConsumeLaunchToken(raw)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const [, raw] = store.localCreateLaunchToken("app-1", "user-1", -1);
    expect(store.localConsumeLaunchToken(raw)).toBeNull();
  });

  it("rejects unknown tokens", () => {
    expect(store.localConsumeLaunchToken("no-such-token")).toBeNull();
  });
});

describe("demo auth (token == user id, sha256 passwords)", () => {
  it("round-trips signup -> sign-in -> get-user", () => {
    const created = store.localAuthCreateUser("demo@example.com", "password123");
    const session = store.localAuthSignIn("Demo@Example.com", "password123");
    expect(session.id).toBe(created.id);
    expect(session.access_token).toBe(created.id);
    const user = store.localAuthGetUser(session.access_token);
    expect(user).toEqual({ id: created.id, email: "demo@example.com" });
  });

  it("rejects duplicate email with 409 and bad credentials with 401", () => {
    expect(() => store.localAuthCreateUser("demo@example.com", "other")).toThrowError(
      expect.objectContaining({ status: 409 }),
    );
    expect(() => store.localAuthSignIn("demo@example.com", "wrong")).toThrowError(
      expect.objectContaining({ status: 401 }),
    );
  });
});

describe("app registry key lifecycle", () => {
  it("create -> lookup by hash -> rotate -> revoke", () => {
    const [app, rawKey] = store.localCreateRegisteredApp("org-1", "prog-1", "Bridge App");
    expect(app.api_key_hash).toBe(store.hashApiKey(rawKey));
    expect(app.key_prefix).toBe(rawKey.slice(0, 12));
    expect(store.localGetRegisteredAppByHash(store.hashApiKey(rawKey))!.id).toBe(app.id);

    const [rotated, newKey] = store.localRotateAppApiKey(app.id);
    expect(newKey).not.toBe(rawKey);
    expect(rotated.api_key_hash).toBe(store.hashApiKey(newKey));
    expect(store.localGetRegisteredAppByHash(store.hashApiKey(rawKey))).toBeNull();

    const revoked = store.localRevokeApp(app.id);
    expect(revoked.status).toBe("revoked");
    expect(revoked.api_key_hash).toBeNull();
  });
});

describe("legacy teacher -> instructor migration", () => {
  it("normalizes role on membership insert", () => {
    const m = store.localAddMembership("org-1", "p-1", "teacher", null, "view");
    expect(m.role).toBe("instructor");
  });
});
