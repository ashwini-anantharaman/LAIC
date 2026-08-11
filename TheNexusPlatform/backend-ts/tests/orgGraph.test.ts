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
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

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
  let programId = "", offeringId = "", groupId = "", orgAffId = "";

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
    // The accepter must be the invited email — an email-addressed invitation
    // may only be redeemed by its addressee (the absorption guard 409s others).
    const coachEmail = `coach_${Date.now()}@x.test`;
    const inv = await req("POST", `/api/platform/orgs/${A.orgId}/invitations`, { email: coachEmail, role: "instructor", program_id: programId }, A.token);
    expect(inv.status).toBe(200);
    expect(inv.body.token).toBeTruthy();
    // The invited person signs up (student type, no org) then accepts.
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "student", email: coachEmail, password: "password123" });
    emails.push(coachEmail);
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

  // ── Two-sided org-affiliation consent + cross-org program sharing ──────────
  it("cross-org sharing: B accepts the affiliation, then reads the shared program (same name)", async () => {
    // A invited B (coach_org) in the earlier test → it sits in B's inbox as pending.
    const inbox = await req("GET", `/api/platform/orgs/${B.orgId}/incoming-affiliations`, undefined, B.token);
    expect(inbox.status).toBe(200);
    const pending = inbox.body.find((x: { program_id: string }) => x.program_id === programId);
    expect(pending).toBeTruthy();
    expect(pending.status).toBe("invited");
    expect(pending.program_name).toBe("Bridge");
    expect(pending.from_organization_id).toBe(A.orgId);
    orgAffId = pending.id;

    // Nothing is shared until B accepts.
    expect((await req("GET", `/api/platform/orgs/${B.orgId}/affiliated-programs`, undefined, B.token)).body).toHaveLength(0);

    // B (the invited org) accepts — exercises the RLS policy from migration 0012.
    const acc = await req("PATCH", `/api/platform/org-affiliations/${orgAffId}`, { status: "active" }, B.token);
    expect(acc.status).toBe(200);
    expect(acc.body.status).toBe("active");

    // The program now appears for B under the SAME name, with its courses + students.
    const shared = await req("GET", `/api/platform/orgs/${B.orgId}/affiliated-programs`, undefined, B.token);
    expect(shared.body).toHaveLength(1);
    expect(shared.body[0].name).toBe("Bridge");
    expect(shared.body[0].owner_organization_id).toBe(A.orgId);
    const detail = await req("GET", `/api/platform/orgs/${B.orgId}/affiliated-programs/${programId}`, undefined, B.token);
    expect(detail.status).toBe(200);
    expect(detail.body.program.name).toBe("Bridge");
    expect(detail.body.offerings.length).toBeGreaterThan(0); // "Coach App"
    expect(detail.body.participants.length).toBeGreaterThan(0); // coach-added learner
  });

  it("an unrelated org can neither read nor accept the affiliation (403)", async () => {
    const C = await signupOrg("Graph Org C", `gc_${Date.now()}@x.test`);
    expect((await req("GET", `/api/platform/orgs/${C.orgId}/affiliated-programs/${programId}`, undefined, C.token)).status).toBe(403);
    expect((await req("PATCH", `/api/platform/org-affiliations/${orgAffId}`, { status: "archived" }, C.token)).status).toBe(403);
  });

  // ── Two-sided relationship consent + remove-for-both ───────────────────────
  it("relationship consent: B accepts, both see active, remove clears it for both", async () => {
    const bList = await req("GET", `/api/platform/orgs/${B.orgId}/relationships`, undefined, B.token);
    const rel = bList.body.find((x: { source_organization_id: string; target_organization_id: string }) =>
      x.source_organization_id === A.orgId && x.target_organization_id === B.orgId);
    expect(rel).toBeTruthy();
    expect(rel.status).toBe("proposed");

    // B (the target) accepts — RLS policy from migration 0013.
    const acc = await req("PATCH", `/api/platform/relationships/${rel.id}`, { status: "active" }, B.token);
    expect(acc.status).toBe(200);
    expect(acc.body.status).toBe("active");
    // A (the source) sees it active too.
    expect((await req("GET", `/api/platform/orgs/${A.orgId}/relationships`, undefined, A.token))
      .body.find((x: { id: string }) => x.id === rel.id).status).toBe("active");

    // Remove deletes the single shared row → gone for both.
    expect((await req("DELETE", `/api/platform/relationships/${rel.id}`, undefined, A.token)).status).toBe(200);
    expect((await req("GET", `/api/platform/orgs/${A.orgId}/relationships`, undefined, A.token))
      .body.find((x: { id: string }) => x.id === rel.id)).toBeUndefined();
    expect((await req("GET", `/api/platform/orgs/${B.orgId}/relationships`, undefined, B.token))
      .body.find((x: { id: string }) => x.id === rel.id)).toBeUndefined();
  });
});
