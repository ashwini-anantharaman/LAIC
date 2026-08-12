/**
 * POST /api/platform/auth/refresh — the session refresh flow (M1 of the
 * app's webview→native migration).
 *
 * Demo mode has NO refresh flow (its opaque tokens don't expire): login must
 * return no refresh_token, and the endpoint answers 404 so clients fall back
 * to their old expiry behavior. The Supabase path (rotation, 401 on a spent
 * token) needs a live Supabase and is covered by the deployed-stack check,
 * not unit tests — what's pinned here is the CONTRACT the app relies on:
 * absence of refresh_token means "no refresh flow", and the endpoint never
 * 500s on garbage.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-refresh-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DATABASE_URL = "";
process.env.SUPABASE_DB_URL = "";

const { createApp } = await import("../src/app");

const app = createApp();

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function req(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("auth refresh (demo mode)", () => {
  it("login returns a session WITHOUT refresh fields in demo mode", async () => {
    const signup = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Refresh Test Org",
      email: "owner@refresh.test",
      password: "password123",
    });
    expect(signup.status).toBe(200);

    const login = await req("POST", "/api/platform/auth/login", {
      email: "owner@refresh.test",
      password: "password123",
    });
    expect(login.status).toBe(200);
    expect(login.body.access_token).toBeTruthy();
    // Demo tokens don't expire — absence tells the client "no refresh flow".
    expect(login.body.refresh_token).toBeUndefined();
    expect(login.body.expires_at).toBeUndefined();
  });

  it("refresh without a token is a 400", async () => {
    const res = await req("POST", "/api/platform/auth/refresh", {});
    expect(res.status).toBe(400);
  });

  it("refresh with a garbage body is a 400, never a 500", async () => {
    const raw = await app.request("/api/platform/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(raw.status).toBe(400);
  });

  it("refresh is a 404 in demo mode (no refresh flow)", async () => {
    const res = await req("POST", "/api/platform/auth/refresh", {
      refresh_token: "anything",
    });
    expect(res.status).toBe(404);
  });
});
