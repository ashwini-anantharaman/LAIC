#!/usr/bin/env tsx
/**
 * Seed demo data for local development — mirrors the nexus_current.html prototype
 * so every screen has content while building the UI.
 *
 * Drives the real HTTP API (not the DB directly) so it doubles as an end-to-end
 * smoke test. Idempotent: re-running finds existing rows by slug/email and skips.
 *
 *   # backend must be running on :8000 with DATABASE_URL set
 *   BASE_URL=http://localhost:8000 npx tsx scripts/seedDemoData.ts
 *
 * Creates:
 *   - Org "Life in AI Center" (owner: ashvin@laic.org / demo-password-123)
 *   - Programs: Brain Bee (edu), MindAI Bee (edu), Bridge (game)
 *   - One offering per program (course / challenge / app)
 *   - A registered app for the Bridge app offering (prints its API key once)
 *   - A few registrations (admin-added) so the queue is populated
 */

const BASE = process.env.BASE_URL || "http://localhost:8000";
const OPERATOR = {
  email: process.env.SEED_ADMIN_EMAIL || "devteam@mindbrainai.nexus",
  password: process.env.SEED_ADMIN_PASSWORD || "L1FE1n@I123",
};
const OWNER = { email: "ashvin@laic.org", password: "demo-password-123", name: "Ashvin Kumar" };

type Json = Record<string, any>;

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: Json; appKey?: string } = {},
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.appKey) headers.Authorization = `Bearer ${opts.appKey}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: Json = {};
  try {
    json = (await res.json()) as Json;
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function login(email: string, password: string): Promise<string> {
  const r = await api("POST", "/api/platform/auth/login", { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.json)}`);
  return r.json.access_token as string;
}

/** Sign up an org owner, or log in if the account already exists. */
async function ensureOrgOwner(): Promise<{ token: string }> {
  const r = await api("POST", "/api/platform/auth/signup", {
    body: {
      signup_type: "org",
      org_name: "Life in AI Center",
      email: OWNER.email,
      password: OWNER.password,
      display_name: OWNER.name,
    },
  });
  if (r.status === 200) {
    console.log(`  ✓ created org owner ${OWNER.email}`);
    return { token: r.json.access_token as string };
  }
  // Already registered → log in.
  const token = await login(OWNER.email, OWNER.password);
  console.log(`  • org owner ${OWNER.email} already existed`);
  return { token };
}

async function findOrgByName(token: string, name: string): Promise<Json | null> {
  // Resolve via /auth/me memberships (robust to the demo-mode owner_id/profile-id
  // split that makes /orgs/mine unreliable in local dev).
  const r = await api("GET", "/api/platform/auth/me", { token });
  if (r.status !== 200) return null;
  const m = (r.json.memberships as Json[] | undefined)?.find?.((x) => x.org_name === name);
  return m ? { id: m.org_id, name: m.org_name } : null;
}

async function ensureProgram(
  token: string,
  orgId: string,
  spec: { name: string; category: "game" | "edu"; description: string },
): Promise<Json> {
  const list = await api("GET", `/api/platform/orgs/${orgId}/programs`, { token });
  const existing = (list.json as Json[] | undefined)?.find?.((p) => p.name === spec.name);
  if (existing) {
    console.log(`  • program "${spec.name}" already existed`);
    return existing;
  }
  const r = await api("POST", `/api/platform/orgs/${orgId}/programs`, { token, body: spec });
  if (r.status !== 200) throw new Error(`create program ${spec.name}: ${JSON.stringify(r.json)}`);
  console.log(`  ✓ program "${spec.name}"`);
  return r.json;
}

async function ensureOffering(
  token: string,
  programId: string,
  spec: Json,
): Promise<Json> {
  const list = await api("GET", `/api/programs/${programId}/offerings`, { token });
  const existing = (list.json as Json[] | undefined)?.find?.((o) => o.name === spec.name);
  if (existing) {
    console.log(`    • offering "${spec.name}" already existed`);
    return existing;
  }
  const r = await api("POST", `/api/programs/${programId}/offerings`, { token, body: spec });
  if (r.status !== 200) throw new Error(`create offering ${spec.name}: ${JSON.stringify(r.json)}`);
  console.log(`    ✓ offering "${spec.name}"`);
  return r.json;
}

async function main(): Promise<number> {
  console.log(`Seeding demo data against ${BASE}\n`);

  // Sanity: operator can log in (validates the backend + DB are up).
  await login(OPERATOR.email, OPERATOR.password);
  console.log(`  ✓ operator ${OPERATOR.email} can log in`);

  // Org + owner.
  const { token } = await ensureOrgOwner();
  const org = await findOrgByName(token, "Life in AI Center");
  if (!org) throw new Error("could not resolve the seeded org");
  const orgId = org.id as string;
  console.log(`  ✓ org "Life in AI Center" (${orgId})\n`);

  // Programs.
  console.log("Programs:");
  const brainBee = await ensureProgram(token, orgId, {
    name: "Brain Bee Program",
    category: "edu",
    description: "AI-enabled neuroscience learning that prepares students for the Brain Bee competition.",
  });
  const mindAi = await ensureProgram(token, orgId, {
    name: "MindAI Bee Program",
    category: "edu",
    description: "A regional AI literacy challenge combining a prep course with a multi-level competition.",
  });
  const bridge = await ensureProgram(token, orgId, {
    name: "Bridge Program",
    category: "game",
    description: "AI-assisted bridge coaching for independent coaches, clubs, and partner organizations.",
  });

  // Offerings.
  console.log("\nOfferings:");
  const bbCourse = await ensureOffering(token, brainBee.id, {
    name: "Brain Bee AI-Enabled Course 2026",
    offering_type: "course",
    registration_open: true,
    approval_mode: "auto_approve",
    platform_module: "learning",
    participant_label_singular: "student",
  });
  await ensureOffering(token, mindAi.id, {
    name: "MindAI Bee Bay Area Challenge 2026",
    offering_type: "challenge",
    registration_open: true,
    approval_mode: "manual_approve",
    platform_module: "learning",
    participant_label_singular: "participant",
  });
  const brApp = await ensureOffering(token, bridge.id, {
    name: "Bridge AI Coach App Pilot",
    offering_type: "app",
    registration_open: true,
    approval_mode: "auto_approve",
    platform_module: "coaching",
    participant_label_singular: "player",
    signup_fields: [
      { key: "name", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "level", label: "Bridge experience", type: "select", required: true },
    ],
  });

  // Registered app for the Bridge app offering.
  console.log("\nRegistered app:");
  const apps = await api("GET", `/api/programs/${bridge.id}/apps`, { token });
  let appRow = (apps.json as Json[] | undefined)?.find?.((a) => a.app_name === "Bridge AI Coach");
  if (!appRow) {
    const r = await api("POST", `/api/programs/${bridge.id}/apps`, {
      token,
      body: {
        app_name: "Bridge AI Coach",
        app_slug: "bridge-ai-coach",
        offering_id: brApp.id,
        allowed_identifiers: "email",
        launch_url: "http://localhost:5175",
      },
    });
    if (r.status !== 200) throw new Error(`create app: ${JSON.stringify(r.json)}`);
    appRow = r.json;
    if (r.json.api_key) console.log(`  ✓ app "Bridge AI Coach" — API KEY (shown once): ${r.json.api_key}`);
  } else {
    console.log(`  • app "Bridge AI Coach" already existed`);
  }

  // A few registrations on the Brain Bee course so the queue has content.
  console.log("\nRegistrations (admin-added):");
  const people = [
    { email: "priya@example.com", name: "Priya Sharma", age: 14 },
    { email: "sam@example.com", name: "Sam Ortiz", age: 15 },
  ];
  for (const p of people) {
    const r = await api("POST", `/api/offerings/${bbCourse.id}/registrations/admin-add`, {
      token,
      body: { email: p.email, name: p.name, age: p.age, participant_type: "learner" },
    });
    if (r.status === 200) console.log(`  ✓ ${p.name}`);
    else console.log(`  • ${p.name} skipped (${r.status})`);
  }

  console.log("\n✅ Demo data seeded.");
  console.log(`\n   Operator login : ${OPERATOR.email} / ${OPERATOR.password}`);
  console.log(`   Org admin login: ${OWNER.email} / ${OWNER.password}`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  process.exit(1);
});
