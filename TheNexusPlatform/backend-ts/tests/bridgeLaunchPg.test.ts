/**
 * Phase 5 — the Bridge launch handoff, end-to-end on Postgres:
 * "Launch Bridge Platform" mints a single-use token against the program's
 * bridge-platform app (whose launch_url comes from BRIDGE_PLATFORM_URL),
 * the token exchanges for a session token exactly once, and that session
 * fetches a valid /bridge/context. Skips offline.
 */
// Settings are cached at first read — pin the env BEFORE importing app modules.
process.env.BRIDGE_PLATFORM_URL = "http://bridge.local:3000/";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { asPrivileged } from "../src/db/context";
import { createDemoAuthUser } from "../src/db/demoAuthRepo";
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

describe.skipIf(!RUN)("bridge launch handoff (Phase 5, Postgres)", () => {
  const run = Date.now();
  let ownerToken = "";
  let programId = "";
  let launchToken = "";
  let sessionToken = "";

  it("provisions an org + program", async () => {
    const owner = await createDemoAuthUser(`launcher_${run}@bridge.test`, "password123");
    cleanupAuthIds.push(owner.id as string);
    ownerToken = owner.id as string;
    const provisioned = await provisionOrganization({
      name: `Launch Org ${run}`,
      owner: { userId: owner.id as string, email: owner.email as string },
    });
    cleanupOrgIds.push(provisioned.organizationId);
    const program = await tenant.createProgram(provisioned.organizationId, `Launch Program ${run}`, "game", {});
    programId = program.id as string;
  });

  it("launch mints a token and carries the configured launch_url", async () => {
    const r = await req("POST", `/api/programs/${programId}/bridge-platform/launch`, {}, ownerToken);
    expect(r.status).toBe(200);
    // Trailing slash in env is trimmed; entry route appended.
    expect(r.body.launch_url).toBe("http://bridge.local:3000/nexus/launch");
    expect(r.body.launch_token).toBeTruthy();
    expect(r.body.context.program_id).toBe(programId);
    launchToken = r.body.launch_token;
  });

  it("the launch token exchanges for a working session — exactly once", async () => {
    const ex = await req("POST", "/api/platform/auth/launch-exchange", { launch_token: launchToken });
    expect(ex.status).toBe(200);
    expect(ex.body.access_token).toBeTruthy();
    sessionToken = ex.body.access_token;

    const replay = await req("POST", "/api/platform/auth/launch-exchange", { launch_token: launchToken });
    expect(replay.status).toBe(401);
  });

  it("the exchanged session fetches a valid bridge context (what bridge-web does)", async () => {
    const r = await req(
      "GET",
      `/api/platform/bridge/context?program_id=${programId}`,
      undefined,
      sessionToken,
    );
    expect(r.status).toBe(200);
    expect(r.body.programId).toBe("bridge_program");
    expect(r.body.roles).toEqual(["bridge_program_admin"]);
    expect(r.body.appId).toBe(`bridge-platform-${programId.slice(0, 8)}`);
    // Platforms render this instead of the raw org-scoped profile id.
    expect(r.body.displayName).toBeTruthy();
    expect(r.body.displayName).not.toBe(r.body.nexusUserId);
  });
});
