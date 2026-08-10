import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-hook-"));
process.env.LOCAL_DATA_DIR = tempDir;
// EVERY one of these is set to "" and never `delete`d. `import "dotenv/config"`
// (via src/config.ts) loads backend-ts/.env, and dotenv only skips keys that are
// already DEFINED — so a deleted key is one dotenv happily refills. Deleting
// SUPABASE_URL therefore handed this local-mode flow the real cloud project.
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DATABASE_URL = "";
process.env.SUPABASE_DB_URL = "";

const { createApp } = await import("../src/app");

const app = createApp();

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown, token?: string) {
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

describe("offerings + hook flow (local mode)", () => {
  let ownerToken = "";
  let orgId = "";
  let programId = "";

  it("bootstraps an org + program", async () => {
    const signup = await call("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Hook Test Org",
      email: "hookowner@test.dev",
      password: "password123",
    });
    ownerToken = signup.body.access_token;
    const me = await call("GET", "/api/platform/auth/me", undefined, ownerToken);
    orgId = me.body.memberships[0].org_id;

    const program = await call(
      "POST",
      `/api/platform/orgs/${orgId}/programs`,
      { name: "Bridge Program", category: "game", class_names: ["Beginners"] },
      ownerToken,
    );
    expect(program.status).toBe(200);
    programId = program.body.id;
  });

  describe("manual approval offering", () => {
    let offeringId = "";
    let appId = "";
    let rawKey = "";

    it("creates and publishes a manual-approve offering", async () => {
      const create = await call(
        "POST",
        `/api/programs/${programId}/offerings`,
        {
          name: "Bridge Coach App",
          offering_type: "app",
          approval_mode: "manual_approve",
          platform_module: "coaching",
          registration_open: true,
        },
        ownerToken,
      );
      expect(create.status).toBe(200);
      expect(create.body.status).toBe("draft");
      offeringId = create.body.id;

      const publish = await call("POST", `/api/offerings/${offeringId}/publish`, undefined, ownerToken);
      expect(publish.status).toBe(200);
      expect(publish.body.status).toBe("open");
    });

    it("PATCH distinguishes null from absent (exclude_unset parity)", async () => {
      const patch = await call(
        "PATCH",
        `/api/offerings/${offeringId}`,
        { description: null },
        ownerToken,
      );
      expect(patch.status).toBe(200);
      // registration_open was NOT sent, so it must stay true.
      expect(patch.body.registration_open).toBe(true);
    });

    it("registers an app and returns the raw key exactly once", async () => {
      const create = await call(
        "POST",
        `/api/programs/${programId}/apps`,
        { app_name: "Bridge App", offering_id: offeringId, launch_url: "https://bridge.example" },
        ownerToken,
      );
      expect(create.status).toBe(200);
      expect(create.body.api_key).toMatch(/^nxk_[A-Za-z0-9_-]{43}$/);
      appId = create.body.id;
      rawKey = create.body.api_key;

      // A subsequent GET never re-exposes the key.
      const get = await call("GET", `/api/apps/${appId}`, undefined, ownerToken);
      expect(get.body.api_key).toBeUndefined();
      expect(get.body.key_prefix).toBe(rawKey.slice(0, 12));
    });

    it("serves signup fields to the app via API key", async () => {
      const app = await import("../src/platformLocalStore");
      // fetch fields with the raw key as bearer
      const res = await callWithKey("GET", `/api/hook/signup-fields?appSlug=bridge-app&offeringId=${offeringId}`, rawKey);
      expect(res.status).toBe(200);
      expect(res.body.fields.map((f: { key: string }) => f.key)).toEqual(["name", "age", "email"]);
      void app;
    });

    it("rejects a mismatched app slug with 403", async () => {
      const res = await callWithKey(
        "GET",
        `/api/hook/signup-fields?appSlug=wrong-slug&offeringId=${offeringId}`,
        rawKey,
      );
      expect(res.status).toBe(403);
    });

    it("accepts a hook registration into pending_review, then approves it", async () => {
      const reg = await callWithKey("POST", "/api/hook/registrations", rawKey, {
        offering_id: offeringId,
        email: "player@test.dev",
        name: "Player One",
        age: "15",
      });
      expect(reg.status).toBe(200);
      expect(reg.body.status).toBe("pending_review");
      expect(reg.body.registration_source).toBe("app_hook");
      expect(reg.body.age).toBe(15);
      const regId = reg.body.id;

      const queue = await call(
        "GET",
        `/api/offerings/${offeringId}/registrations?status=pending_review`,
        undefined,
        ownerToken,
      );
      expect(queue.body).toHaveLength(1);

      const approve = await call("POST", `/api/registrations/${regId}/approve`, undefined, ownerToken);
      expect(approve.status).toBe(200);
      expect(approve.body.status).toBe("approved");

      const participants = await call(
        "GET",
        `/api/offerings/${offeringId}/participants`,
        undefined,
        ownerToken,
      );
      expect(participants.body).toHaveLength(1);
      expect(participants.body[0].email).toBe("player@test.dev");
    });

    it("rejects a revoked API key with 401", async () => {
      await call("POST", `/api/apps/${appId}/revoke`, undefined, ownerToken);
      const res = await callWithKey("POST", "/api/hook/registrations", rawKey, {
        offering_id: offeringId,
        email: "late@test.dev",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("auto approval offering + launch context", () => {
    let offeringId = "";
    let appId = "";
    let rawKey = "";

    it("auto-approves a hook registration immediately", async () => {
      const create = await call(
        "POST",
        `/api/programs/${programId}/offerings`,
        {
          name: "Auto Course",
          offering_type: "course",
          approval_mode: "auto_approve",
          platform_module: "learning",
          registration_open: true,
        },
        ownerToken,
      );
      offeringId = create.body.id;
      await call("POST", `/api/offerings/${offeringId}/publish`, undefined, ownerToken);

      const appRes = await call(
        "POST",
        `/api/programs/${programId}/apps`,
        { app_name: "Auto App", offering_id: offeringId, launch_url: "https://auto.example" },
        ownerToken,
      );
      appId = appRes.body.id;
      rawKey = appRes.body.api_key;

      const reg = await callWithKey("POST", "/api/hook/registrations", rawKey, {
        offering_id: offeringId,
        email: "auto@test.dev",
        name: "Auto Learner",
      });
      expect(reg.status).toBe(200);
      expect(reg.body.status).toBe("approved");
    });

    it("mints a launch token gated by module entitlement", async () => {
      const ctx = await call("GET", `/api/apps/${appId}/launch-context`, undefined, ownerToken);
      expect(ctx.status).toBe(200);
      expect(ctx.body.launch_token).toBeTruthy();
      expect(ctx.body.context.organization_id).toBe(orgId);
      expect(ctx.body.context.offering_id).toBe(offeringId);

      // Exchange the launch token for a session (demo mode: token == user id).
      const exchange = await call("POST", "/api/platform/auth/launch-exchange", {
        launch_token: ctx.body.launch_token,
      });
      expect(exchange.status).toBe(200);
      expect(exchange.body.access_token).toBeTruthy();

      // Single-use: second exchange fails.
      const again = await call("POST", "/api/platform/auth/launch-exchange", {
        launch_token: ctx.body.launch_token,
      });
      expect(again.status).toBe(401);
    });

    it("blocks launch context when the module is disabled", async () => {
      await call(
        "PUT",
        `/api/platform/orgs/${orgId}/entitlements/learning`,
        { status: "disabled" },
        ownerToken,
      );
      const ctx = await call("GET", `/api/apps/${appId}/launch-context`, undefined, ownerToken);
      expect(ctx.status).toBe(403);
    });
  });
});

async function callWithKey(method: string, path: string, key: string, body?: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
