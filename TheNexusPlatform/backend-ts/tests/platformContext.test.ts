/**
 * Phase 3 — platform context endpoints (local mode, end-to-end via app.request).
 * `GET /api/platform/{bridge,learning}/context` is the access authority the
 * external platforms call: program admins get full contexts, the operator is
 * refused, a disabled feature refuses everyone, and the Bridge response matches
 * the NexusBridgeContext contract shape (programId literal "bridge_program").
 * Custom-role grant paths need the DB (role assignments) — covered by the PG
 * suite in platformContextPg.test.ts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-ctx-"));
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

describe("platform context endpoints (Phase 3, local mode)", () => {
  let ownerToken = "";
  let orgId = "";
  let programId = "";
  let noBridgeProgramId = "";
  let operatorToken = "";

  it("sets up an org, two programs (one without bridge), and an operator", async () => {
    const signup = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Context Test Org",
      email: "owner@ctx.test",
      password: "password123",
    });
    expect(signup.status).toBe(200);
    ownerToken = signup.body.access_token;
    const me = await req("GET", "/api/platform/auth/me", undefined, ownerToken);
    orgId = me.body.memberships[0].org_id;

    const p1 = await req(
      "POST",
      `/api/platform/orgs/${orgId}/programs`,
      { name: "Bridge Enabled Program", category: "game", class_names: ["A"] },
      ownerToken,
    );
    expect(p1.status).toBe(200);
    programId = p1.body.id;

    const p2 = await req(
      "POST",
      `/api/platform/orgs/${orgId}/programs`,
      {
        name: "No Bridge Program",
        category: "game",
        class_names: ["B"],
        features: { bridge: false, learning: false },
      },
      ownerToken,
    );
    expect(p2.status).toBe(200);
    noBridgeProgramId = p2.body.id;

    const admin = local.localAuthCreateUser("operator@ctx.test", "password123");
    local.localCreateProfile(admin.id as string, "operator@ctx.test", "platform_admin", "Operator");
    operatorToken = admin.id as string;
  });

  it("grants the org admin a Bridge context matching the contract shape", async () => {
    const r = await req(
      "GET",
      `/api/platform/bridge/context?program_id=${programId}`,
      undefined,
      ownerToken,
    );
    expect(r.status).toBe(200);
    // NexusBridgeContext contract (Bridge's HttpNexusClient asserts these).
    expect(typeof r.body.nexusUserId).toBe("string");
    expect(r.body.programId).toBe("bridge_program");
    expect(typeof r.body.appId).toBe("string");
    expect(Array.isArray(r.body.roles)).toBe(true);
    expect(Array.isArray(r.body.permissions)).toBe(true);
    expect(typeof r.body.accessLevel).toBe("string");
    // Mapping: program/org admin → bridge_program_admin.
    expect(r.body.roles).toEqual(["bridge_program_admin"]);
    expect(r.body.accessLevel).toBe("admin");
    expect(r.body.laicOrgId).toBe(orgId);
    expect(r.body.nexus_program_id).toBe(programId);
  });

  it("grants the org admin a Learning context (real program id)", async () => {
    const r = await req(
      "GET",
      `/api/platform/learning/context?program_id=${programId}`,
      undefined,
      ownerToken,
    );
    expect(r.status).toBe(200);
    expect(r.body.programId).toBe(programId);
    expect(r.body.roles).toEqual(["administrator"]);
    expect(r.body.accessLevel).toBe("administrator");
  });

  it("resolves without a pinned program (first granting program wins)", async () => {
    const r = await req("GET", "/api/platform/bridge/context", undefined, ownerToken);
    expect(r.status).toBe(200);
    expect(r.body.nexus_program_id).toBe(programId); // the enabled one, not the disabled one
  });

  it("403s when the program's feature is disabled — even for the admin", async () => {
    const bridge = await req(
      "GET",
      `/api/platform/bridge/context?program_id=${noBridgeProgramId}`,
      undefined,
      ownerToken,
    );
    expect(bridge.status).toBe(403);
    expect(String(bridge.body.detail)).toMatch(/not enabled/i);

    const learning = await req(
      "GET",
      `/api/platform/learning/context?program_id=${noBridgeProgramId}`,
      undefined,
      ownerToken,
    );
    expect(learning.status).toBe(403);
  });

  it("refuses the platform operator (403)", async () => {
    const r = await req(
      "GET",
      `/api/platform/bridge/context?program_id=${programId}`,
      undefined,
      operatorToken,
    );
    expect(r.status).toBe(403);
    expect(String(r.body.detail)).toMatch(/operator/i);
  });

  it("401s without a token and 404s an unknown program", async () => {
    const anon = await req("GET", "/api/platform/bridge/context");
    expect(anon.status).toBe(401);

    const missing = await req(
      "GET",
      "/api/platform/bridge/context?program_id=00000000-0000-0000-0000-000000000000",
      undefined,
      ownerToken,
    );
    expect(missing.status).toBe(404);
  });
});
