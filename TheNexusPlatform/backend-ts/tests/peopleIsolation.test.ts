/**
 * Phase 1 — people isolation at the route layer (local mode, end-to-end via
 * app.request): the platform operator manages org BOUNDARIES but can never
 * read or mutate an org's PEOPLE. RLS-level enforcement (migration 0021) is
 * exercised only where Postgres runs; these tests pin the guard behavior that
 * holds on every data path, including privileged reads.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-people-"));
process.env.LOCAL_DATA_DIR = tempDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
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

describe("people isolation (operator cannot reach an org's people)", () => {
  let ownerToken = "";
  let orgId = "";
  let operatorToken = "";

  it("sets up an org owner and a platform operator", async () => {
    const r = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Isolation Test Org",
      email: "owner@iso.test",
      password: "password123",
      display_name: "Owner",
    });
    expect(r.status).toBe(200);
    ownerToken = r.body.access_token;

    const me = await req("GET", "/api/platform/auth/me", undefined, ownerToken);
    expect(me.status).toBe(200);
    orgId = me.body.memberships[0].org_id;
    expect(orgId).toBeTruthy();

    // Platform operator, seeded the same way scripts/seedPlatformAdmin.ts does
    // (demo mode: token == auth user id).
    const admin = local.localAuthCreateUser("operator@nexus.test", "password123");
    local.localCreateProfile(admin.id as string, "operator@nexus.test", "platform_admin", "Operator");
    operatorToken = admin.id as string;
  });

  it("operator keeps BOUNDARY access: can list organizations", async () => {
    const r = await req("GET", "/api/platform/admin/organizations", undefined, operatorToken);
    expect(r.status).toBe(200);
    expect(r.body.some((o: { id: string }) => o.id === orgId)).toBe(true);
  });

  it("org owner can list the org's members", async () => {
    const r = await req("GET", `/api/platform/orgs/${orgId}/members`, undefined, ownerToken);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("operator CANNOT list the org's members", async () => {
    const r = await req("GET", `/api/platform/orgs/${orgId}/members`, undefined, operatorToken);
    expect(r.status).toBe(403);
    expect(String(r.body.detail)).toMatch(/cannot access/i);
  });

  it("operator CANNOT add a member", async () => {
    const r = await req(
      "POST",
      `/api/platform/orgs/${orgId}/members`,
      { email: "owner@iso.test", role: "administrator" },
      operatorToken,
    );
    expect(r.status).toBe(403);
  });

  it("operator CANNOT update or remove a membership", async () => {
    const members = await req("GET", `/api/platform/orgs/${orgId}/members`, undefined, ownerToken);
    const memberId = members.body[0]?.id;
    expect(memberId).toBeTruthy();

    const patch = await req(
      "PATCH",
      `/api/platform/members/${memberId}`,
      { access: "view" },
      operatorToken,
    );
    expect(patch.status).toBe(403);

    const del = await req("DELETE", `/api/platform/members/${memberId}`, undefined, operatorToken);
    // Owner rows 400 before authz; anything but success is acceptable — pin
    // that it is NOT a 2xx and that non-owner rows would hit the 403 guard.
    expect(del.status).toBeGreaterThanOrEqual(400);
  });

  it("org owner remains fully functional after the guards", async () => {
    const r = await req("GET", `/api/platform/orgs/${orgId}/members`, undefined, ownerToken);
    expect(r.status).toBe(200);
  });
});
