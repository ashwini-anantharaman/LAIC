/**
 * Vercel serverless entry for the Nexus backend.
 *
 * The whole Hono app (routes + RLS request context) is served from a single
 * Node serverless function; `vercel.json` rewrites every path here. We run on
 * the NODE runtime (not Edge) because the data path uses postgres.js over TCP
 * and other Node APIs the Edge runtime can't provide.
 *
 * Deploy prerequisites (set in the Vercel project's Environment Variables):
 *   - DATABASE_URL  → the Supabase **transaction pooler** (port 6543), NOT the
 *     session pooler; serverless opens many short-lived connections.
 *   - DB_PREPARE=false  → transaction-mode pooling can't carry prepared
 *     statements across pooled connections.
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (the legacy service_role JWT),
 *     BRIDGE_PLATFORM_URL, LEARNING_PLATFORM_URL, FRONTEND_ORIGIN.
 *   - NEXUS_ENABLE_DEV_LOGIN must be UNSET (never in a deployed env).
 */
import { handle } from "@hono/node-server/vercel";

import { createApp } from "../src/app";

// Use the Node-server Vercel adapter (not `hono/vercel`, which is the Next.js
// route-handler adapter): this is a standalone `@vercel/node` function with a
// default export, so it receives Node req/res and this adapter bridges them to
// Hono's fetch handler. Vercel's Node runtime otherwise auto-parses the request
// body and breaks that bridge — NODEJS_HELPERS=0 (set on the project env)
// disables it so POST/PUT bodies reach the routes intact.
export default handle(createApp());
