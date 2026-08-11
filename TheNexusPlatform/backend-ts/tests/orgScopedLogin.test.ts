/**
 * Phase 2 — org-scoped identity at the door (local mode, end-to-end via
 * app.request). An org portal passes its slug at login and the session is
 * scoped to that org: no account there → no entry; the platform operator can
 * never sign in through an org's portal; bare (slug-less) login keeps working
 * for the operator gate and back-compat.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-orglogin-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DATABASE_URL = "";
process.env.SUPABASE_DB_URL = "";

const { createApp } = await import("../src/app");
const local = await import("../src/platformLocalStore");

const app = createApp();

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("org-scoped login (Phase 2)", () => {
  let slugA = "";
  let slugB = "";
  let orgAId = "";

  it("sets up two orgs and a platform operator", async () => {
    const a = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Portal Org A",
      email: "owner-a@portal.test",
      password: "password123",
    });
    expect(a.status).toBe(200);
    const b = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Portal Org B",
      email: "owner-b@portal.test",
      password: "password123",
    });
    expect(b.status).toBe(200);

    // Slugs via the dev org directory (enabled in local mode).
    const orgs = await req("GET", "/api/platform/dev/orgs");
    expect(orgs.status).toBe(200);
    const orgA = orgs.body.find((o: { name: string }) => o.name === "Portal Org A");
    const orgB = orgs.body.find((o: { name: string }) => o.name === "Portal Org B");
    slugA = orgA.slug;
    slugB = orgB.slug;
    orgAId = orgA.id;

    const admin = local.localAuthCreateUser("operator@orglogin.test", "password123");
    local.localCreateProfile(admin.id as string, "operator@orglogin.test", "platform_admin", "Operator");
  });

  it("portal login with the right slug scopes the session to that org", async () => {
    const r = await req("POST", "/api/platform/auth/login", {
      email: "owner-a@portal.test",
      password: "password123",
      org_slug: slugA,
    });
    expect(r.status).toBe(200);
    expect(r.body.org_id).toBe(orgAId);
    expect(r.body.org_slug).toBe(slugA);
  });

  it("refuses a portal login where the person has no account (403)", async () => {
    const r = await req("POST", "/api/platform/auth/login", {
      email: "owner-a@portal.test",
      password: "password123",
      org_slug: slugB,
    });
    expect(r.status).toBe(403);
    expect(String(r.body.detail)).toMatch(/no account/i);
  });

  it("refuses the platform operator at any org portal (403)", async () => {
    const r = await req("POST", "/api/platform/auth/login", {
      email: "operator@orglogin.test",
      password: "password123",
      org_slug: slugA,
    });
    expect(r.status).toBe(403);
    expect(String(r.body.detail)).toMatch(/operator gate/i);
  });

  it("404s an unknown portal slug", async () => {
    const r = await req("POST", "/api/platform/auth/login", {
      email: "owner-a@portal.test",
      password: "password123",
      org_slug: "no-such-org",
    });
    expect(r.status).toBe(404);
  });

  it("bare login (no slug) still works — the operator gate path", async () => {
    const r = await req("POST", "/api/platform/auth/login", {
      email: "operator@orglogin.test",
      password: "password123",
    });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("platform_admin");
  });

  it("/auth/me membership summaries carry the org-scoped person id", async () => {
    const login = await req("POST", "/api/platform/auth/login", {
      email: "owner-a@portal.test",
      password: "password123",
      org_slug: slugA,
    });
    const me = await req("GET", "/api/platform/auth/me", undefined, login.body.access_token);
    expect(me.status).toBe(200);
    expect(me.body.memberships.length).toBeGreaterThan(0);
    // The canonical within-org identity for platform contexts (bridge/learning).
    expect(me.body.memberships[0].profile_id).toBeTruthy();
  });
});
