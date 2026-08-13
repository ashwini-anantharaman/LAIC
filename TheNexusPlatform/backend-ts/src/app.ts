import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";

import { getSettings } from "./config";
import { HttpError } from "./httpError";
import { verifyToken } from "./auth";
import { dbEnabled } from "./db/client";
import { runWithRequestContext } from "./db/requestContext";
import { friendsRouter } from "./routes/friends";
import { gameRouter } from "./routes/game";
import { hookRouter } from "./routes/hook";
import { offeringsRouter } from "./routes/offerings";
import { platformRouter } from "./routes/platform";
import { publicRouter } from "./routes/publicContent";

/** Best-effort: resolve the bearer token to a user id for the request context. */
async function _resolveUserId(c: Context): Promise<string | null> {
  const h = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!h) return null;
  const parts = h.split(/\s+/);
  if (parts.length !== 2 || !/^bearer$/i.test(parts[0]) || !parts[1]) return null;
  try {
    const u = await verifyToken(parts[1]);
    return u.id;
  } catch {
    return null; // app-key (hook) tokens, expired/invalid → no user context
  }
}

// Org id from the URL, for the tenant door's residency routing. Middleware runs
// before route matching, so parse the one canonical pattern (`/orgs/:org_id`)
// from the raw path. Routes that reach an org another way (e.g. via a program
// lookup) run with orgId=null → shared pool, which is correct while every org
// is `shared`; dedicated routing for those paths lands with the provisioning flow.
const ORG_PATH_RE = /\/orgs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
function _resolveOrgId(c: Context): string | null {
  const m = ORG_PATH_RE.exec(c.req.path);
  return m ? m[1] : null;
}

/** Build the Hono app. Mirrors the FastAPI `app` in backend/app/main.py. */
export function createApp(): Hono {
  const settings = getSettings();

  const app = new Hono();

  const extraOrigins = (settings.extraCorsOrigins || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = new Set([settings.frontendOrigin, ...extraOrigins]);
  // Local dev ports + any Vercel preview/production deployment + Cloudflare
  // quick tunnels (session-scoped phone testing — see bridge-coach-app).
  const vercelRe = /^https:\/\/.*\.vercel\.app$/;
  const localhostRe = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
  const trycloudflareRe = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
  // Phone on same Wi‑Fi hitting Mac LAN IP (mobile org app :5181 / CS :5173).
  const lanRe = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return settings.frontendOrigin;
        if (
          allowed.has(origin) ||
          vercelRe.test(origin) ||
          localhostRe.test(origin) ||
          trycloudflareRe.test(origin) ||
          lanRe.test(origin)
        ) {
          return origin;
        }
        return null;
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["*"],
    }),
  );

  // Bind the request user + org into AsyncLocalStorage so the Postgres data path
  // runs tenant queries under RLS on the org's datastore (the tenant door). Only
  // in DB mode — avoids an extra token verification per request when the legacy
  // path is in use.
  if (dbEnabled()) {
    app.use("*", async (c, next) =>
      runWithRequestContext({ userId: await _resolveUserId(c), orgId: _resolveOrgId(c) }, () => next()),
    );
  }

  // Phase 1 guardrail: without DATABASE_URL, a configured Supabase project makes
  // the legacy supabase-js data path active — it connects with the service-role
  // key, which BYPASSES Row Level Security entirely. Tolerated for the legacy
  // deploy shape, but it must never be mistaken for an isolated configuration.
  if (!dbEnabled() && settings.supabaseEnabled) {
    console.warn(
      "[nexus] WARNING: running on the legacy supabase-js data path (service-role key, " +
        "RLS BYPASSED). Set DATABASE_URL to use the canonical Postgres path where " +
        "row-level isolation is enforced.",
    );
  }

  // More specific prefixes first; offerings mounts at the bare /api prefix.
  // Mounted BEFORE the bare /api router, and deliberately unauthenticated —
  // see routes/publicContent.ts for what keeps that safe.
  app.route("/api/public", publicRouter);
  app.route("/api/platform", platformRouter);
  // Friends are person-to-person, not club-scoped — its own router for that reason.
  app.route("/api/friends", friendsRouter);
  app.route("/api/hook", hookRouter);
  app.route("/api/game", gameRouter);
  app.route("/api", offeringsRouter);

  app.get("/health", (c) =>
    c.json({
      ok: true,
      claude_model: settings.claudeModel,
      supabase: settings.supabaseEnabled,
    }),
  );

  // FastAPI-compatible error envelope: `{ "detail": ... }`.
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ detail: err.detail }, err.status as 400);
    }
    console.error(err);
    // In local/dev (no Supabase configured) surface the real message so failures
    // are debuggable; production keeps the opaque message (no internal leakage).
    const devMode = !getSettings().supabaseEnabled;
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ detail: devMode ? `Internal Server Error: ${msg}` : "Internal Server Error" }, 500);
  });

  // Keep the FastAPI envelope on unknown routes too (Hono defaults to text).
  app.notFound((c) => c.json({ detail: "Not Found" }, 404));

  return app;
}
