/**
 * Org-scoped identity (Phase 2, supersedes Slice 10's "one login → many org
 * profiles"). The owner-locked model: identity lives INSIDE an org's space and
 * never links across orgs — one credential belongs to at most ONE organization
 * (a person in two orgs is two accounts). `ensureOrgProfile` enforces this at
 * the single point a person enters an org. RLS isolation between two different
 * people's orgs still holds. Postgres; skips offline.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { withUserContext, asPrivileged } from "../src/db/context";
import { provisionOrganization } from "../src/db/provisioning";
import { createProfile, loadUser } from "../src/db/identityRepo";
import { HttpError } from "../src/httpError";
import { organizations, orgMemberships, profiles } from "../src/db/schema";

const RUN = dbEnabled();
const orgIds: string[] = [];
const opAuth = randomUUID(); // platform operator (org-less profile)

describe.skipIf(!RUN)("org-scoped identity (one credential, one org)", () => {
  const authA = randomUUID(); // one person
  const authB = randomUUID(); // a different person
  const email = `person_${Date.now()}@x.io`;

  afterAll(async () => {
    if (!RUN) return;
    await asPrivileged(async (tx) => {
      for (const id of orgIds) await tx.delete(organizations).where(eq(organizations.id, id));
      await tx.delete(profiles).where(eq(profiles.authUserId, opAuth));
    });
    await closeDb();
  });

  it("a credential gets exactly one org-scoped profile in its org", async () => {
    const a = await provisionOrganization({ name: `Scoped A ${Date.now()}`, owner: { userId: authA, email } });
    const b = await provisionOrganization({ name: `Scoped B ${Date.now()}`, owner: { userId: authB, email } });
    orgIds.push(a.organizationId, b.organizationId);

    const rows = await asPrivileged((tx) => tx.select().from(profiles).where(eq(profiles.authUserId, authA)));
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(a.organizationId);
    // Same email is allowed across orgs — they are two different people/accounts.
    expect(rows[0].email).toBe(email);
  });

  it("REFUSES the same credential entering a second organization (409)", async () => {
    let failure: unknown = null;
    try {
      const c = await provisionOrganization({ name: `Scoped C ${Date.now()}`, owner: { userId: authA, email } });
      orgIds.push(c.organizationId); // cleanup if the invariant regressed
    } catch (exc) {
      failure = exc;
    }
    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).status).toBe(409);
    expect(String((failure as HttpError).detail)).toMatch(/another organization/i);

    // Still exactly one profile — nothing was half-created.
    const rows = await asPrivileged((tx) => tx.select().from(profiles).where(eq(profiles.authUserId, authA)));
    expect(rows).toHaveLength(1);
  });

  it("loadUser(authA) returns memberships only in that person's own org", async () => {
    const { memberships } = await loadUser(authA);
    const orgs = new Set(memberships.map((m) => m.org_id));
    expect(orgs.has(orgIds[0])).toBe(true); // own org A
    expect(orgs.has(orgIds[1])).toBe(false); // org B (different person)
  });

  it("a different person can't see the first person's org or profile (RLS)", async () => {
    await withUserContext(authB, async (tx) => {
      const orgsSeen = (await tx.select({ id: organizations.id }).from(organizations)).map((r) => r.id);
      expect(orgsSeen).toContain(orgIds[1]); // own org B
      expect(orgsSeen).not.toContain(orgIds[0]); // org A hidden

      // authA's profile is invisible to person B.
      const seenProfiles = await tx.select().from(profiles).where(eq(profiles.authUserId, authA));
      expect(seenProfiles).toHaveLength(0);
    });
  });

  it("the platform operator reads ZERO people under RLS, boundary stays visible (0021)", async () => {
    await createProfile(opAuth, `op_${Date.now()}@nexus.io`, "platform_admin", "Operator");
    await withUserContext(opAuth, async (tx) => {
      // People tables: the strict predicate has no platform-role bypass.
      const seenProfiles = await tx.select().from(profiles).where(eq(profiles.organizationId, orgIds[0]));
      expect(seenProfiles).toHaveLength(0);
      const seenMemberships = await tx.select().from(orgMemberships).where(eq(orgMemberships.orgId, orgIds[0]));
      expect(seenMemberships).toHaveLength(0);
      // Boundary: the organization record itself remains operator-visible.
      const orgs = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgIds[0]));
      expect(orgs).toHaveLength(1);
    });
  });
});
