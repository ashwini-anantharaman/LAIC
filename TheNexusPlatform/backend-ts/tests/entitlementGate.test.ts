/**
 * Slice 7/8 — entitlement gating (v0.4 §20). Disabling a platform module blocks
 * launching an offering that depends on it. Postgres mode; skips offline.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-entgate-"));
process.env.LOCAL_DATA_DIR = tempDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const RUN = Boolean(process.env.DATABASE_URL);

const { createApp } = await import("../src/app");
const { getDb, closeDb } = await import("../src/db/client");
const { organizations, profiles } = await import("../src/db/schema");

const app = createApp();
let orgId = "";
const email = `entgate_${Date.now()}@x.test`;

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

afterAll(async () => {
  if (RUN) {
    const db = getDb();
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    const p = await db.select().from(profiles).where(eq(profiles.email, email));
    if (p.length) await db.delete(profiles).where(eq(profiles.id, p[0].id));
    await closeDb();
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe.skipIf(!RUN)("entitlement gating (Postgres)", () => {
  it("blocks launch when the offering's module is disabled for the org", async () => {
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: "Ent Org", email, password: "password123" });
    const token = su.body.access_token;
    const me = await req("GET", "/api/platform/auth/me", undefined, token);
    orgId = me.body.memberships[0].org_id;

    const prog = await req("POST", `/api/platform/orgs/${orgId}/programs`, { name: "P", category: "edu", stage_type: "national" }, token);
    const off = await req("POST", `/api/programs/${prog.body.id}/offerings`, { name: "Coach App", offering_type: "app", approval_mode: "auto_approve", platform_module: "learning" }, token);
    const appRes = await req("POST", `/api/programs/${prog.body.id}/apps`, { app_name: "Ent App", offering_id: off.body.id, launch_url: "https://x.app" }, token);
    const appId = appRes.body.id;

    // Enabled by default (provisioning grants learning) → launch works.
    const ok = await req("GET", `/api/apps/${appId}/launch-context`, undefined, token);
    expect(ok.status).toBe(200);

    // Disable the learning module → launch is refused.
    const dis = await req("PUT", `/api/platform/orgs/${orgId}/entitlements/learning`, { status: "disabled" }, token);
    expect(dis.status).toBe(200);
    const blocked = await req("GET", `/api/apps/${appId}/launch-context`, undefined, token);
    expect(blocked.status).toBe(403);
  });
});
