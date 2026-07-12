/**
 * Slice 10 — org-scoped users (v0.4 §3/§7.4, model: one login → many org profiles).
 *
 * The same auth credential in two orgs = two isolated `profiles` rows; each org
 * only sees its own; a different person can't see either. Postgres; skips offline.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { withUserContext, asPrivileged } from "../src/db/context";
import { provisionOrganization } from "../src/db/provisioning";
import { loadUser } from "../src/db/identityRepo";
import { organizations, profiles } from "../src/db/schema";

const RUN = dbEnabled();
const orgIds: string[] = [];

describe.skipIf(!RUN)("org-scoped users (one login → many org profiles)", () => {
  const authA = randomUUID(); // one person
  const authB = randomUUID(); // a different person
  const email = `person_${Date.now()}@x.io`;

  afterAll(async () => {
    if (!RUN) return;
    await asPrivileged(async (tx) => {
      for (const id of orgIds) await tx.delete(organizations).where(eq(organizations.id, id));
    });
    await closeDb();
  });

  it("the same login owning two orgs yields two isolated profiles", async () => {
    const a = await provisionOrganization({ name: `Scoped A ${Date.now()}`, owner: { userId: authA, email } });
    const cc = await provisionOrganization({ name: `Scoped C ${Date.now()}`, owner: { userId: authA, email } });
    const b = await provisionOrganization({ name: `Scoped B ${Date.now()}`, owner: { userId: authB, email } });
    orgIds.push(a.organizationId, cc.organizationId, b.organizationId);

    // authA has exactly two org-scoped profiles (org A, org C), distinct ids/orgs.
    const rows = await asPrivileged((tx) => tx.select().from(profiles).where(eq(profiles.authUserId, authA)));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(new Set(rows.map((r) => r.organizationId))).toEqual(new Set([a.organizationId, cc.organizationId]));
    // Same email is allowed across orgs (no global uniqueness).
    expect(rows.every((r) => r.email === email)).toBe(true);
  });

  it("loadUser(authA) returns memberships in both of that login's orgs, not others", async () => {
    const { memberships } = await loadUser(authA);
    const orgs = new Set(memberships.map((m) => m.org_id));
    expect(orgs.has(orgIds[0])).toBe(true); // org A
    expect(orgs.has(orgIds[1])).toBe(true); // org C
    expect(orgs.has(orgIds[2])).toBe(false); // org B (different person)
  });

  it("a different person can't see the first person's orgs or profiles (RLS)", async () => {
    await withUserContext(authB, async (tx) => {
      const orgsSeen = (await tx.select({ id: organizations.id }).from(organizations)).map((r) => r.id);
      expect(orgsSeen).toContain(orgIds[2]); // own org B
      expect(orgsSeen).not.toContain(orgIds[0]); // org A hidden
      expect(orgsSeen).not.toContain(orgIds[1]); // org C hidden

      // authA's profiles are invisible to person B.
      const seenProfiles = await tx.select().from(profiles).where(eq(profiles.authUserId, authA));
      expect(seenProfiles).toHaveLength(0);
    });
  });
});
