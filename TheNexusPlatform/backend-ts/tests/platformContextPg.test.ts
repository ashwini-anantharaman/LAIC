/**
 * Phase 3 — the custom-role grant path, end-to-end on Postgres: a plain member
 * whose Team & Roles role grants `bridge: view` gets a learner context; a role
 * without the area is refused; grant levels map to platform roles (edit→coach,
 * learning edit→instructor). Uses the demo-auth tokens (token == user id) that
 * DB-mode runs on when Supabase auth isn't configured. Skips offline.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { asPrivileged } from "../src/db/context";
import { createDemoAuthUser } from "../src/db/demoAuthRepo";
import { addMembership, ensureOrgProfile } from "../src/db/identityRepo";
import * as graph from "../src/db/orgGraphRepo";
import { provisionOrganization } from "../src/db/provisioning";
import * as tenant from "../src/db/tenantRepo";
import { demoAuthUsers, organizations } from "../src/db/schema";

const RUN = dbEnabled();

const { createApp } = await import("../src/app");
const app = createApp();

const cleanupOrgIds: string[] = [];
const cleanupAuthIds: string[] = [];

afterAll(async () => {
  if (!RUN) return;
  await asPrivileged(async (tx) => {
    for (const id of cleanupOrgIds) await tx.delete(organizations).where(eq(organizations.id, id));
    for (const id of cleanupAuthIds) await tx.delete(demoAuthUsers).where(eq(demoAuthUsers.id, id));
  });
  await closeDb();
});

async function get(path: string, token: string) {
  const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe.skipIf(!RUN)("platform context — custom-role grants (Postgres)", () => {
  const run = Date.now();
  let orgId = "";
  let programId = "";
  let ownerToken = "";
  let learnerToken = "";
  let coachToken = "";
  let deniedToken = "";

  it("provisions an org, a program, and three role-assigned members", async () => {
    // Owner (real demo credential so their token works against the app).
    const owner = await createDemoAuthUser(`owner_${run}@ctxpg.test`, "password123");
    cleanupAuthIds.push(owner.id as string);
    ownerToken = owner.id as string;
    const provisioned = await provisionOrganization({
      name: `CtxPg Org ${run}`,
      owner: { userId: owner.id as string, email: owner.email as string },
    });
    orgId = provisioned.organizationId;
    cleanupOrgIds.push(orgId);

    const program = await tenant.createProgram(orgId, `CtxPg Program ${run}`, "game", {});
    programId = program.id as string;

    // Custom roles: one grants bridge:view + learning:edit, one grants only community.
    const bridgeRole = await graph.createProgramRole(orgId, programId, "Bridge Learner", {
      bridge: "view",
      learning: "edit",
    });
    const coachRole = await graph.createProgramRole(orgId, programId, "Bridge Coach", { bridge: "edit" });
    const communityRole = await graph.createProgramRole(orgId, programId, "Community Only", {
      community: "edit",
    });

    // Three members: credential → org profile → program membership → role assignment.
    async function member(email: string, roleId: string): Promise<string> {
      const cred = await createDemoAuthUser(email, "password123");
      cleanupAuthIds.push(cred.id as string);
      const profileId = await ensureOrgProfile(cred.id as string, orgId, { email, role: "student" });
      await addMembership(orgId, profileId, "instructor", null, "view", programId);
      await graph.setProgramRoleAssignment(orgId, programId, email, roleId);
      return cred.id as string;
    }
    learnerToken = await member(`learner_${run}@ctxpg.test`, bridgeRole.id as string);
    coachToken = await member(`coach_${run}@ctxpg.test`, coachRole.id as string);
    deniedToken = await member(`denied_${run}@ctxpg.test`, communityRole.id as string);
    expect(learnerToken && coachToken && deniedToken).toBeTruthy();
  });

  it("bridge:view maps to bridge_learner / learner", async () => {
    const r = await get(`/api/platform/bridge/context?program_id=${programId}`, learnerToken);
    expect(r.status).toBe(200);
    expect(r.body.roles).toEqual(["bridge_learner"]);
    expect(r.body.accessLevel).toBe("learner");
    expect(r.body.permissions).toEqual(["bridge:view"]);
    expect(r.body.programId).toBe("bridge_program");
    expect(r.body.role_name).toBe("Bridge Learner");
    // The identity is the ORG-SCOPED profile id, not the auth credential id.
    expect(r.body.nexusUserId).not.toBe(learnerToken);
  });

  it("bridge:edit maps to bridge_coach / coach", async () => {
    const r = await get(`/api/platform/bridge/context?program_id=${programId}`, coachToken);
    expect(r.status).toBe(200);
    expect(r.body.roles).toEqual(["bridge_coach"]);
    expect(r.body.accessLevel).toBe("coach");
  });

  it("learning:edit maps to learning_instructor; no learning grant → 403", async () => {
    const instructor = await get(`/api/platform/learning/context?program_id=${programId}`, learnerToken);
    expect(instructor.status).toBe(200);
    expect(instructor.body.roles).toEqual(["learning_instructor"]);
    expect(instructor.body.accessLevel).toBe("instructor");
    expect(instructor.body.programId).toBe(programId);

    const denied = await get(`/api/platform/learning/context?program_id=${programId}`, coachToken);
    expect(denied.status).toBe(403);
  });

  it("a role without the bridge area is refused (403)", async () => {
    const r = await get(`/api/platform/bridge/context?program_id=${programId}`, deniedToken);
    expect(r.status).toBe(403);
    expect(String(r.body.detail)).toMatch(/does not grant/i);
  });

  it("the org owner needs no custom role — admin everywhere", async () => {
    const r = await get(`/api/platform/bridge/context?program_id=${programId}`, ownerToken);
    expect(r.status).toBe(200);
    expect(r.body.roles).toEqual(["bridge_program_admin"]);
    expect(r.body.accessLevel).toBe("admin");
  });

  it("unpinned resolution finds the member's granting program", async () => {
    const r = await get("/api/platform/bridge/context", learnerToken);
    expect(r.status).toBe(200);
    expect(r.body.nexus_program_id).toBe(programId);
  });
});
