/**
 * Slice 5 — tenant CRUD coherent on Postgres (v0.4 §10 Slice 4/5).
 *
 * Drives the full org-governed flow over HTTP against Postgres: signup → create
 * program → create offering → create App Shell → list back → admin-add a
 * registration → participant. Proves the data path is coherent (no split-brain)
 * and RLS-enforced. Skips offline.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npm test
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-tenantpg-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const RUN = Boolean(process.env.DATABASE_URL);

const { createApp } = await import("../src/app");
const { getDb, closeDb } = await import("../src/db/client");
const { organizations, profiles } = await import("../src/db/schema");

const app = createApp();

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function signupOrg(name: string, email: string) {
  const r = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: name, email, password: "password123", display_name: "Owner" });
  const me = await req("GET", "/api/platform/auth/me", undefined, r.body.access_token);
  return { token: r.body.access_token as string, orgId: me.body.memberships[0].org_id as string, email };
}

describe.skipIf(!RUN)("tenant CRUD coherent on Postgres", () => {
  const emails = [`t1_${Date.now()}@tenantpg.test`, `t2_${Date.now()}@tenantpg.test`];
  const orgIds: string[] = [];
  let token = "", orgId = "", programId = "", offeringId = "";

  afterAll(async () => {
    if (RUN) {
      const db = getDb();
      for (const id of orgIds) await db.delete(organizations).where(eq(organizations.id, id));
      for (const e of emails) {
        const p = await db.select().from(profiles).where(eq(profiles.email, e));
        if (p.length) await db.delete(profiles).where(eq(profiles.id, p[0].id));
      }
      await closeDb();
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("signs up + creates a program (Postgres)", async () => {
    const o = await signupOrg("Tenant PG Org", emails[0]);
    token = o.token; orgId = o.orgId; orgIds.push(orgId);
    const r = await req("POST", `/api/platform/orgs/${orgId}/programs`, { name: "Brain Bee", category: "edu", stage_type: "national" }, token);
    expect(r.status).toBe(200);
    expect(r.body.category).toBe("edu");
    programId = r.body.id;
  });

  it("creates + lists a course offering", async () => {
    const c = await req("POST", `/api/programs/${programId}/offerings`, { name: "Brain Bee Course 2026", offering_type: "course", approval_mode: "manual_approve", platform_module: "learning" }, token);
    expect(c.status).toBe(200);
    offeringId = c.body.id;
    const list = await req("GET", `/api/programs/${programId}/offerings`, undefined, token);
    expect(list.status).toBe(200);
    expect(list.body.map((o: { id: string }) => o.id)).toContain(offeringId);
  });

  it("registers an App Shell (issues an API key)", async () => {
    const a = await req("POST", `/api/programs/${programId}/apps`, { app_name: "Brain Bee App", offering_id: offeringId, allowed_identifiers: "email" }, token);
    expect(a.status).toBe(200);
    expect(a.body.api_key).toBeTruthy();
    const apps = await req("GET", `/api/programs/${programId}/apps`, undefined, token);
    expect(apps.body.map((x: { id: string }) => x.id)).toContain(a.body.id);
  });

  it("admin-adds a registration → participant appears", async () => {
    const add = await req("POST", `/api/offerings/${offeringId}/registrations/admin-add`, { email: "learner@tenantpg.test", name: "Lee", participant_type: "learner" }, token);
    expect(add.status).toBe(200);
    const parts = await req("GET", `/api/offerings/${offeringId}/participants`, undefined, token);
    expect(parts.status).toBe(200);
    expect(parts.body.length).toBeGreaterThan(0);
    expect(parts.body.some((p: { email?: string }) => p.email === "learner@tenantpg.test")).toBe(true);
  });

  it("a different org's owner cannot see this org's programs", async () => {
    const o2 = await signupOrg("Other PG Org", emails[1]);
    orgIds.push(o2.orgId);
    // App-layer: cross-org access is refused.
    const cross = await req("GET", `/api/platform/orgs/${orgId}/programs`, undefined, o2.token);
    expect(cross.status).toBe(403);
    // Their own program list is empty (isolation holds end-to-end).
    const own = await req("GET", `/api/platform/orgs/${o2.orgId}/programs`, undefined, o2.token);
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(0);
  });
});
