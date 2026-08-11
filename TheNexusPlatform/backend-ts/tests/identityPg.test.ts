/**
 * Slice 4 — Identity through Nexus, Postgres mode (v0.4 §10 Slice 3).
 *
 * Runs the real HTTP flow (signup → login → /auth/me) against Postgres when
 * DATABASE_URL is set, proving org onboarding now goes through provisioning and
 * identity is resolved from the DB. Skips offline so `npm test` stays green.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npm test
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

// Local auth store (credentials) in a temp dir; DATABASE_URL (from env) drives data.
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-idpg-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const RUN = Boolean(process.env.DATABASE_URL);

const { createApp } = await import("../src/app");
const { getDb, closeDb } = await import("../src/db/client");
const { organizations, profiles, auditEvents } = await import("../src/db/schema");

const app = createApp();

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe.skipIf(!RUN)("identity through Nexus (Postgres mode)", () => {
  const email = `owner_${Date.now()}@idpg.test`;
  let token = "";
  let orgId = "";

  afterAll(async () => {
    if (RUN && orgId) {
      const db = getDb();
      await db.delete(organizations).where(eq(organizations.id, orgId));
      const p = await db.select().from(profiles).where(eq(profiles.email, email));
      if (p.length) await db.delete(profiles).where(eq(profiles.id, p[0].id));
      await closeDb();
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("org signup provisions through the canonical path", async () => {
    const r = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org", org_name: "Identity PG Org", email, password: "password123", display_name: "Owner",
    });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("org_admin");
    expect(r.body.access_token).toBeTruthy();
    token = r.body.access_token;

    // Verify it landed in Postgres via provisioning (org + provisioned audit).
    const db = getDb();
    const orgs = await db.select().from(organizations).where(eq(organizations.slug, "identity-pg-org"));
    expect(orgs.length).toBeGreaterThan(0);
    orgId = orgs[0].id;
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.organizationId, orgId));
    expect(audits.some((a) => a.action === "organization.provisioned")).toBe(true);
  });

  it("/auth/me resolves identity + owner membership from the DB", async () => {
    const r = await req("GET", "/api/platform/auth/me", undefined, token);
    expect(r.status).toBe(200);
    expect(r.body.email).toBe(email);
    expect(r.body.memberships).toHaveLength(1);
    expect(r.body.memberships[0].role).toBe("owner");
    expect(r.body.memberships[0].org_name).toBe("Identity PG Org");
    expect(r.body.memberships[0].org_id).toBe(orgId);
  });

  it("login round-trips through Nexus auth + DB identity", async () => {
    const r = await req("POST", "/api/platform/auth/login", { email, password: "password123" });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("org_admin");
    expect(r.body.access_token).toBeTruthy();
  });
});
