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
import { handle } from "hono/vercel";

import { createApp } from "../src/app";

export const config = { runtime: "nodejs" };

export default handle(createApp());
