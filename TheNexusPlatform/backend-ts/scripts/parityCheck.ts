#!/usr/bin/env tsx
/**
 * Side-by-side parity harness.
 *
 * Boots the Python FastAPI backend (uvicorn) and the TypeScript Hono backend,
 * each against its own isolated copy of a local-data snapshot, drives the full
 * v3 acceptance flow against BOTH, normalizes volatile values (ids, codes,
 * keys, tokens, timestamps), and diffs the two transcripts step by step.
 *
 * Usage:  npm run parity      (from backend-ts/)
 *
 * Requires: backend/.venv with FastAPI deps, and this package's deps installed.
 * Neither server is configured for Supabase here, so both run in demo/local mode.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _here = dirname(fileURLToPath(import.meta.url));
const REPO = join(_here, "..", "..");
const BACKEND = join(REPO, "backend");
const BACKEND_TS = join(REPO, "backend-ts");

const PY_PORT = 8009;
const TS_PORT = 8010;

interface Step {
  name: string;
  method: string;
  path: string;
  body?: unknown;
  // token/appkey selection: "owner" | "student" | "app:<capturedRawKeyVar>" | raw string
  auth?: string;
  // capture values from the response body into vars for later steps
  capture?: Record<string, string>; // varName -> json path (dot notation)
  expectStatus?: number;
}

// Placeholders resolved at request time from captured vars: {{varName}}
function interpolate(s: string, vars: Record<string, unknown>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

function getPath(obj: any, path: string): unknown {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// The scripted acceptance flow (mirrors the v3 doc's flows 4/5/6 + admin/audit).
const STEPS: Step[] = [
  {
    name: "signup org owner",
    method: "POST",
    path: "/api/platform/auth/signup",
    body: {
      signup_type: "org",
      org_name: "Parity Org",
      email: "parity-owner@test.dev",
      password: "password123",
      display_name: "Parity Owner",
    },
    capture: { ownerToken: "access_token" },
  },
  { name: "me", method: "GET", path: "/api/platform/auth/me", auth: "owner", capture: { orgId: "memberships.0.org_id" } },
  {
    name: "org setup",
    method: "PUT",
    path: "/api/platform/orgs/{{orgId}}/setup",
    auth: "owner",
    body: {
      has_challenge: true,
      challenge_name: "Parity Challenge",
      stage_types: ["national", "chapter"],
      permission_defaults: { administrator: { default_access: "edit" } },
      initial_stages: [{ stage_type: "national", name: "Nationals" }],
      programs: [{ name: "Parity Program", category: "game", class_names: ["Alpha"] }],
    },
  },
  { name: "list programs", method: "GET", path: "/api/platform/orgs/{{orgId}}/programs", auth: "owner", capture: { programId: "0.id" } },
  {
    name: "create offering",
    method: "POST",
    path: "/api/programs/{{programId}}/offerings",
    auth: "owner",
    body: { name: "Parity App", offering_type: "app", approval_mode: "auto_approve", platform_module: "coaching", registration_open: true },
    capture: { offeringId: "id" },
  },
  {
    name: "patch offering (null desc, keep reg open)",
    method: "PATCH",
    path: "/api/offerings/{{offeringId}}",
    auth: "owner",
    body: { description: null },
  },
  { name: "publish offering", method: "POST", path: "/api/offerings/{{offeringId}}/publish", auth: "owner" },
  {
    name: "register app",
    method: "POST",
    path: "/api/programs/{{programId}}/apps",
    auth: "owner",
    body: { app_name: "Parity Bridge App", offering_id: "{{offeringId}}", launch_url: "https://parity.example" },
    capture: { appKey: "api_key", appId: "id", appSlug: "app_slug" },
  },
  {
    name: "hook signup-fields",
    method: "GET",
    path: "/api/hook/signup-fields?appSlug={{appSlug}}&offeringId={{offeringId}}",
    auth: "app:appKey",
  },
  {
    name: "hook registration (auto-approve)",
    method: "POST",
    path: "/api/hook/registrations",
    auth: "app:appKey",
    body: { offering_id: "{{offeringId}}", email: "parity-player@test.dev", name: "Parity Player", age: "16" },
    capture: { regId: "id" },
  },
  { name: "list participants", method: "GET", path: "/api/offerings/{{offeringId}}/participants", auth: "owner" },
  { name: "launch-context", method: "GET", path: "/api/apps/{{appId}}/launch-context", auth: "owner", capture: { launchToken: "launch_token" } },
  { name: "launch-exchange", method: "POST", path: "/api/platform/auth/launch-exchange", body: { launch_token: "{{launchToken}}" } },
  { name: "dashboard", method: "GET", path: "/api/platform/dashboard?org_id={{orgId}}", auth: "owner" },
  { name: "list members", method: "GET", path: "/api/platform/orgs/{{orgId}}/members", auth: "owner" },
  { name: "audit", method: "GET", path: "/api/platform/orgs/{{orgId}}/audit", auth: "owner" },
  { name: "entitlements", method: "GET", path: "/api/platform/orgs/{{orgId}}/entitlements", auth: "owner" },
  { name: "disable nexus (400)", method: "PUT", path: "/api/platform/orgs/{{orgId}}/entitlements/nexus", auth: "owner", body: { status: "disabled" }, expectStatus: 400 },
  { name: "bad token (401)", method: "GET", path: "/api/platform/auth/me", auth: "raw:not-a-real-token", expectStatus: 401 },
  { name: "bad body (422)", method: "POST", path: "/api/platform/auth/signup", body: { signup_type: "org", email: "x", password: "short" }, expectStatus: 422 },
  { name: "unknown offering (404)", method: "GET", path: "/api/offerings/does-not-exist", auth: "owner", expectStatus: 404 },
];

// Volatile fields to blank out before comparison (values differ run-to-run).
const VOLATILE_KEYS = new Set([
  "id", "org_id", "organization_id", "program_id", "offering_id", "stage_node_id",
  "registered_app_id", "registration_id", "profile_id", "actor_user_id", "user_id",
  "scope_id", "target_id", "created_at", "updated_at", "registered_at", "reviewed_at",
  "expires_at", "starts_at", "ends_at", "access_token", "launch_token", "api_key",
  "key_prefix", "token_hash", "code", "redeem_url", "slug", "path", "app_slug",
  "actor_name", "challenge_id", "active_stage_id", "subject_id",
  "current_stage_node_id", "join_code_id",
]);

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = VOLATILE_KEYS.has(k) ? (v === null ? null : "<volatile>") : normalize(v);
    }
    return out;
  }
  return value;
}

async function runFlow(baseUrl: string): Promise<Array<{ name: string; status: number; body: unknown }>> {
  const vars: Record<string, unknown> = {};
  const transcript: Array<{ name: string; status: number; body: unknown }> = [];
  for (const step of STEPS) {
    const path = interpolate(step.path, vars);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (step.auth === "owner") headers.Authorization = `Bearer ${vars.ownerToken}`;
    else if (step.auth?.startsWith("app:")) headers.Authorization = `Bearer ${vars[step.auth.slice(4)]}`;
    else if (step.auth?.startsWith("raw:")) headers.Authorization = `Bearer ${step.auth.slice(4)}`;
    const bodyStr = step.body ? interpolate(JSON.stringify(step.body), vars) : undefined;
    const res = await fetch(baseUrl + path, { method: step.method, headers, body: bodyStr });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (step.capture && res.ok) {
      for (const [varName, jsonPath] of Object.entries(step.capture)) {
        vars[varName] = getPath(body, jsonPath);
      }
    }
    transcript.push({ name: step.name, status: res.status, body });
  }
  return transcript;
}

async function waitForHealth(baseUrl: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(baseUrl + "/health");
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${baseUrl} did not become healthy in ${timeoutMs}ms`);
}

function startServer(cmd: string, args: string[], cwd: string, env: Record<string, string>): ChildProcess {
  const proc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", () => {});
  proc.stderr?.on("data", () => {});
  return proc;
}

async function portInUse(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  // Guard against a leftover server on either port — connecting to a stale
  // process would silently produce misleading results.
  for (const port of [PY_PORT, TS_PORT]) {
    if (await portInUse(port)) {
      console.error(`Port ${port} is already serving. Kill the stale process first:`);
      console.error(`  lsof -ti:${port} | xargs kill -9`);
      return 1;
    }
  }

  const pyDir = mkdtempSync(join(tmpdir(), "parity-py-"));
  const tsDir = mkdtempSync(join(tmpdir(), "parity-ts-"));

  // Python backend reads .local_data relative to backend/ (Path(__file__).parent.parent).
  // It has no LOCAL_DATA_DIR override, so we set one via the same env the TS side uses
  // ONLY if the Python code respected it — it does not. Instead we run Python with an
  // empty backend/.local_data by pointing HOME? No — simplest correct approach: the
  // Python store path is fixed, so we temporarily rely on a clean run by giving each an
  // empty dir it CAN control. Python honors neither env; so we give Python its own copy
  // by symlinking is unsafe. Instead: Python uses backend/.local_data. To keep the real
  // data safe we back it up, use an empty dir, and restore after.
  const realLocal = join(BACKEND, ".local_data");
  const backupLocal = join(tmpdir(), `local_data_backup_${Date.now()}`);
  const fs = await import("node:fs");
  let backedUp = false;
  if (fs.existsSync(realLocal)) {
    fs.renameSync(realLocal, backupLocal);
    backedUp = true;
  }
  fs.mkdirSync(realLocal, { recursive: true });

  let py: ChildProcess | undefined;
  let ts: ChildProcess | undefined;
  try {
    py = startServer(
      join(BACKEND, ".venv", "bin", "python"),
      ["-m", "uvicorn", "app.main:app", "--port", String(PY_PORT), "--log-level", "warning"],
      BACKEND,
      {},
    );
    ts = startServer(
      "npx",
      ["tsx", "src/index.ts"],
      BACKEND_TS,
      { PORT: String(TS_PORT), LOCAL_DATA_DIR: tsDir },
    );

    await Promise.all([
      waitForHealth(`http://localhost:${PY_PORT}`),
      waitForHealth(`http://localhost:${TS_PORT}`),
    ]);

    const pyTranscript = await runFlow(`http://localhost:${PY_PORT}`);
    const tsTranscript = await runFlow(`http://localhost:${TS_PORT}`);

    let failures = 0;
    for (let i = 0; i < STEPS.length; i++) {
      const p = pyTranscript[i];
      const t = tsTranscript[i];
      const step = STEPS[i];
      const statusMatch = p.status === t.status;
      const expectMatch =
        step.expectStatus === undefined || (p.status === step.expectStatus && t.status === step.expectStatus);

      let pNorm: string;
      let tNorm: string;
      let bodyMatch: boolean;
      if (p.status === 422 && t.status === 422) {
        // Pydantic and Zod word validation messages differently and Pydantic
        // adds input/ctx fields. The frontends only consume detail[].msg, so
        // parity here means: detail is an array flagging the same field paths.
        const locs = (b: unknown): string =>
          JSON.stringify(
            (Array.isArray((b as any)?.detail) ? (b as any).detail : [])
              .map((d: any) => JSON.stringify(d.loc))
              .sort(),
          );
        pNorm = locs(p.body);
        tNorm = locs(t.body);
        bodyMatch = pNorm === tNorm;
      } else {
        pNorm = JSON.stringify(normalize(p.body));
        tNorm = JSON.stringify(normalize(t.body));
        bodyMatch = pNorm === tNorm;
      }

      if (statusMatch && bodyMatch && expectMatch) {
        console.log(`✓ [${i + 1}/${STEPS.length}] ${step.name}  (py=${p.status} ts=${t.status})`);
      } else {
        failures++;
        console.log(`✗ [${i + 1}/${STEPS.length}] ${step.name}`);
        console.log(`    status: py=${p.status} ts=${t.status}${expectMatch ? "" : ` (expected ${step.expectStatus})`}`);
        if (!bodyMatch) {
          console.log(`    py body: ${pNorm.slice(0, 400)}`);
          console.log(`    ts body: ${tNorm.slice(0, 400)}`);
        }
      }
    }

    console.log(`\n${failures === 0 ? "PARITY OK" : `PARITY FAILED (${failures} mismatch)`} — ${STEPS.length} steps`);
    return failures === 0 ? 0 : 1;
  } finally {
    py?.kill("SIGKILL");
    ts?.kill("SIGKILL");
    // Restore the real local data.
    if (fs.existsSync(realLocal)) fs.rmSync(realLocal, { recursive: true, force: true });
    if (backedUp) fs.renameSync(backupLocal, realLocal);
    rmSync(pyDir, { recursive: true, force: true });
    rmSync(tsDir, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code));
