// M1 of the webview→native migration: /api/bridge/me and the credential
// contract of the bearer-capable API layer.
//
// The e2e server runs in STUB mode, where identity is the dev-user cookie and
// the Authorization header is deliberately ignored (getBridgeContext's stub
// branch never reads it) — so what this suite pins is the CONTRACT around the
// bearer path, not the bearer resolution itself (that needs a live Nexus and
// is exercised against the deployed stack):
//   • /api/bridge/me answers 404 with no credential, 200 with one
//   • the flags it serves match the catalogue's answers for the same user
//   • a bearer header on a stub server neither crashes nor grants anything
//   • CORS preflight is open (the native app's local web dev depends on it)

import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers";

test.describe("/api/bridge/me", () => {
  test("no credential → 404, never a 500", async ({ request }) => {
    const res = await request.get("/api/bridge/me");
    expect(res.status()).toBe(404);
  });

  test("a bearer header alone grants nothing in stub mode", async ({ request }) => {
    const res = await request.get("/api/bridge/me", {
      headers: { Authorization: "Bearer some-token", "x-program-id": "p-1" },
    });
    expect(res.status()).toBe(404);
  });

  test("OPTIONS preflight is open for the app's headers", async ({ request }) => {
    const res = await request.fetch("/api/bridge/me", { method: "OPTIONS" });
    expect(res.status()).toBe(204);
    expect(res.headers()["access-control-allow-origin"]).toBe("*");
    expect(res.headers()["access-control-allow-headers"]).toContain("authorization");
    expect(res.headers()["access-control-allow-headers"]).toContain("x-program-id");
  });

  test("signed in: flags arrive, shaped for the app", async ({ context, page }) => {
    await signInAs(context, "user_reviewer_rhea");
    // Cookie-jar request via the browser context, so the dev-user cookie rides.
    const res = await page.request.get("http://localhost:3105/api/bridge/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.nexusUserId).toBe("string");
    expect(Array.isArray(body.roles)).toBe(true);
    expect(typeof body.isCoach).toBe("boolean");
    // Every key the app gates on is present and boolean — an absent key would
    // silently fall back on every gate.
    for (const key of [
      "page.home",
      "page.play",
      "page.players",
      "page.library",
      "page.guide",
      "page.challenges",
      "library.resume",
      "table.undo",
      "challenge.create",
    ]) {
      expect(typeof body.features[key], `features["${key}"]`).toBe("boolean");
    }
    expect(typeof body.library.canCreate).toBe("boolean");
    expect(typeof body.library.programScope).toBe("boolean");
  });

  test("flags parity: what /me says matches what the page serves", async ({
    context,
    page,
  }) => {
    await signInAs(context, "user_reviewer_rhea");
    const res = await page.request.get("http://localhost:3105/api/bridge/me");
    const body = await res.json();
    // The /m library page 404s exactly when page.library is denied — the
    // flag and the page must agree for the same account.
    const pageRes = await page.request.get("http://localhost:3105/m/library");
    if (body.features["page.library"]) {
      expect(pageRes.status()).toBe(200);
    } else {
      expect(pageRes.status()).toBe(404);
    }
  });
});
