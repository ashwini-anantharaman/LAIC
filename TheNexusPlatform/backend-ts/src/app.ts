import { Hono } from "hono";
import { cors } from "hono/cors";

import { getSettings } from "./config";
import { HttpError } from "./httpError";
import { bridgeRouter } from "./routes/bridge";
import { platformRouter } from "./routes/platform";

/** Build the Hono app. Mirrors the FastAPI `app` in the Python backend. */
export function createApp(): Hono {
  const settings = getSettings();

  const app = new Hono();

  const extraOrigins = (settings.extraCorsOrigins || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = new Set([settings.frontendOrigin, ...extraOrigins]);
  // Local dev ports + any Vercel preview/production deployment.
  const vercelRe = /^https:\/\/.*\.vercel\.app$/;
  const localhostRe = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return settings.frontendOrigin;
        if (allowed.has(origin) || vercelRe.test(origin) || localhostRe.test(origin)) {
          return origin;
        }
        return null;
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["*"],
    }),
  );

  app.route("/api/platform/bridge", bridgeRouter);
  app.route("/api/platform", platformRouter);

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
    return c.json({ detail: "Internal Server Error" }, 500);
  });

  return app;
}
