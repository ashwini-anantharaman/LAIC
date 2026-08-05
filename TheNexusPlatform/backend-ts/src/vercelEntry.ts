/**
 * Vercel serverless entrypoint. Bundled to api/index.mjs by `npm run
 * build:vercel`; vercel.json rewrites every path here. Local dev keeps using
 * src/index.ts (@hono/node-server on :8000).
 *
 * Per-method web-handler exports (not a default (req, res) handler): Vercel's
 * Node runtime pre-reads the body on Node-style handlers, which starves
 * c.req.json() — the web-handler form passes an untouched fetch Request.
 */
import { createApp } from "./app";

const app = createApp();

const handler = (request: Request) => app.fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
