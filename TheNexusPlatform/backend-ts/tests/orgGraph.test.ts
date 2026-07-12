/**
 * Slice 11 — org-graph endpoints (relationships, affiliations, groups,
 * invitations, coach-add, bulk import). Postgres HTTP flow + cross-org isolation.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-graph-"));
process.env.LOCAL_DATA_DIR = tempDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const RUN = Boolean(process.env.DATABASE_URL);

const { createApp } = await import("../src/app");
const { getDb, closeDb } = await import("../src/db/client");
const { organizations, profiles } = await import("../src/db/schema");

const app = createApp();
const emails: string[] = [];
const orgIds: string[] = [];

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function signupOrg(name: string, email: string) {
  emails.push(email);
  const r = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: name, email, password: "password123" });
  const me = await req("GET", "/api/platform/auth/me", undefined, r.body.access_token);
  const orgId = me.body.memberships[0].org_id;
  orgIds.push(orgId);
  return { token: r.body.access_token as string, orgId };
}

afterAll(async () => {
  if (RUN) {
    const db = getDb();
    for (const id of orgIds) await db.delete(organizations).where(eq(organizations.id, id));
    for (const e of emails) { const p = await db.select().from(profiles).where(eq(profiles.email, e)); if (p.length) await db.delete(profiles).where(eq(profiles.id, p[0].id)); }
    await closeDb();
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe.skipIf(!RUN)("Slice 11 — org graph endpoints", () => {
  let A: { token: string; orgId: string }, B: { token: string; orgId: string };
  let programId = "", offeringId = "", groupId = "";

  it("sets up two orgs + a program/offering in A", async () => {
    A = await signupOrg("Graph Org A", `ga_${Date.now()}@x.test`);
    B = await signupOrg("Graph Org B", `gb_${Date.now()}@x.test`);
    programId = (await req("POST", `/api/platform/orgs/${A.orgId}/programs`, { name: "Bridge", category: "game" }, A.token)).body.id;
    offeringId = (await req("POST", `/api/programs/${programId}/offerings`, { name: "Coach App", offering_type: "app", approval_mode: "auto_approve" }, A.token)).body.id;
  });

  it("organization relationships: create, list, isolate", async () => {
    const cr = await req("POST", `/api/platform/orgs/${A.orgId}/relationships`, { target_organization_id: B.orgId, relationship_type: "partner" }, A.token);
    expect(cr.status).toBe(200);
    const list = await req("GET", `/api/platform/orgs/${A.orgId}/relationships`, undefined, A.token);
    expect(list.body).toHaveLength(1);
    // B's owner cannot list A's relationships.
    const cross = await req("GET", `/api/platform/orgs/${A.orgId}/relationships`, undefined, B.token);
    expect(cross.status).toBe(403);
  });

  it("program affiliations: add a coach org + an actor", async () => {
    const oa = await req("POST", `/api/platform/programs/${programId}/org-affiliations`, { organization_id: B.orgId, affiliation_type: "coach_org" }, A.token);
    expect(oa.status).toBe(200);
    const pa = await req("POST", `/api/platform/programs/${programId}/affiliations`, { subject_type: "organization", subject_id: B.orgId, affiliation_type: "coach_org" }, A.token);
    expect(pa.status).toBe(200);
    expect((await req("GET", `/api/platform/programs/${programId}/affiliations`, undefined, A.token)).body).toHaveLength(1);
  });

  it("groups: create, coach-add a learner, member appears", async () => {
    const g = await req("POST", `/api/platform/orgs/${A.orgId}/groups`, { name: "Tuesday Beginners", label: "class", program_id: programId, offering_id: offeringId }, A.token);
    expect(g.status).toBe(200);
    groupId = g.body.id;
    const ca = await req("POST", `/api/groups/${groupId}/participants/coach-add`, { email: "kid@x.test", name: "Kid" }, A.token);
    expect(ca.status).toBe(200);
    const parts = await req("GET", `/api/offerings/${offeringId}/participants`, undefined, A.token);
    expect(parts.body.length).toBeGreaterThan(0);
    // Isolation: B cannot see A's group.
    expect((await req("GET", `/api/platform/orgs/${A.orgId}/groups`, undefined, B.token)).status).toBe(403);
  });

  it("invitations: create link → accept creates membership", async () => {
    const inv = await req("POST", `/api/platform/orgs/${A.orgId}/invitations`, { email: "coach@x.test", role: "instructor", program_id: programId }, A.token);
    expect(inv.status).toBe(200);
    expect(inv.body.token).toBeTruthy();
    // A new person signs up (student type, no org) then accepts the invite.
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "student", email: `coach_${Date.now()}@x.test`, password: "password123" });
    emails.push(`coach_${Date.now()}@x.test`);
    const acc = await req("POST", `/api/platform/invitations/${inv.body.token}/accept`, { display_name: "Coach Z" }, su.body.access_token);
    expect(acc.status).toBe(200);
    const me = await req("GET", "/api/platform/auth/me", undefined, su.body.access_token);
    expect(me.body.memberships.some((m: { org_id: string }) => m.org_id === A.orgId)).toBe(true);
  });

  it("bulk import: N rows → N registrations", async () => {
    const r = await req("POST", `/api/offerings/${offeringId}/registrations/bulk-import`, { rows: [{ email: "b1@x.test", name: "B1" }, { email: "b2@x.test", name: "B2" }] }, A.token);
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(2);
  });
});
