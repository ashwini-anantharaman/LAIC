// CORS for the bearer-auth API routes the native club app calls.
//
// Wildcard origin is deliberate and safe by the same argument the challenges
// summary route (this file's origin) documents: the bearer path never reads
// cookies, so there is no ambient credential for a foreign origin to ride —
// the route answers only for the token it was explicitly handed. The deployed
// app web build reaches these routes same-origin through its vercel.json
// proxy anyway; CORS is for local web dev and direct-origin callers.
//
// Usage in a route:
//   export const OPTIONS = corsOptions("GET");
//   ...
//   return NextResponse.json(body, { headers: corsHeaders("GET") });
//   } catch (e) { return withCors(apiError(e), "GET"); }

import { NextResponse } from "next/server";

export function corsHeaders(...methods: string[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    "Access-Control-Allow-Headers": "authorization, x-program-id, content-type",
  };
}

/** The route's OPTIONS export — preflight for the methods it serves. */
export function corsOptions(...methods: string[]) {
  return async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders(...methods) });
  };
}

/** Stamp CORS onto an existing response (the apiError catch path). */
export function withCors(res: NextResponse, ...methods: string[]): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(...methods))) res.headers.set(k, v);
  return res;
}
