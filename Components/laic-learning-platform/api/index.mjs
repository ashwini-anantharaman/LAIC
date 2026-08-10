/**
 * Vercel serverless entry for the Content Studio API (laic-ashwini-cs-api).
 * All /api/* routes rewrite here (see vercel.api.json); the shared handler
 * in server/index.mjs does its own routing, CORS, and SSE streaming.
 */
export { handler as default } from '../server/index.mjs';
