/**
 * Nexus launch handoff (Phase 5 of the Nexus integration).
 *
 * TheNexusPlatform's "Launch Bridge Platform" surface redirects here with a
 * single-use launch token (`?launch_token=…`, minted against the program's
 * bridge-platform registered app). We swap it for a real Nexus session token
 * (`POST /api/platform/auth/launch-exchange`), keep that in an httpOnly
 * cookie, and land the user in the app — `lib/nexus.ts` then presents the
 * cookie as the bearer token to `GET /api/platform/bridge/context`, which is
 * where Nexus decides whether this person's role grants Bridge (and as what).
 *
 * The token is single-use and short-lived; a replayed URL fails the exchange
 * and lands on /welcome.
 */
import { NextResponse } from "next/server";

import { NEXUS_EMBEDDED_COOKIE, NEXUS_PROGRAM_COOKIE, NEXUS_RETURN_COOKIE, NEXUS_TOKEN_COOKIE, safeProgramId, safeReturnUrl } from "../../../lib/nexusToken";

/** The externally visible origin — honors proxy headers (tunnels, Vercel),
 *  falling back to the request URL. Without this, redirects behind a proxy
 *  point at the internal host (e.g. localhost:3000) and dead-end. */
function externalOrigin(request: Request, url: URL): string {
  const first = (name: string) => (request.headers.get(name) ?? "").split(",")[0]!.trim();
  const host = first("x-forwarded-host") || url.host;
  const proto = first("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = externalOrigin(request, url);
  const launchToken = url.searchParams.get("launch_token");
  const baseUrl = process.env.NEXUS_API_BASE_URL;

  if (!launchToken || !baseUrl) {
    return NextResponse.redirect(new URL("/welcome?launch=missing", origin));
  }

  let accessToken: string | null = null;
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/platform/auth/launch-exchange`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launch_token: launchToken }),
      },
    );
    if (res.ok) {
      const body = (await res.json()) as { access_token?: string };
      accessToken = body.access_token ?? null;
    }
  } catch {
    accessToken = null;
  }

  if (!accessToken) {
    return NextResponse.redirect(new URL("/welcome?launch=failed", origin));
  }

  // Optional destination (?next=/m/library): a host app deep-links straight to
  // one page. Same-origin relative paths only — anything else falls back to
  // the default landing.
  const next = url.searchParams.get("next");
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/bridge/home";
  const response = NextResponse.redirect(new URL(destination, origin));
  // An EMBEDDED launch is a third-party context: the host app's page is one
  // site and this is another, so a Lax cookie is never sent back and the embed
  // bounces to /welcome forever. SameSite=None (which browsers only honour
  // over https) is what makes the app's iframe able to stay signed in.
  //
  // Only the embedded launch relaxes it. A normal, top-level launch keeps Lax,
  // which is the stronger default and all it needs. Browsers that block plain
  // third-party cookies outright (Safari, Firefox, Chrome-with-3PCD) accept a
  // PARTITIONED one (CHIPS): the cookie lives in a jar keyed to the host app's
  // site, which is exactly the isolation an embed wants anyway. Serving app
  // and platform from one registrable domain remains the fully-durable fix.
  const embedded = url.searchParams.get("embedded") === "1";
  const secure = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    sameSite: embedded && secure ? ("none" as const) : ("lax" as const),
    path: "/",
    secure,
    ...(embedded && secure ? { partitioned: true } : {}),
  };
  response.cookies.set(NEXUS_TOKEN_COOKIE, accessToken, cookieOpts);
  // The console's return address, when Nexus sent one — powers "Back to Nexus".
  const returnUrl = safeReturnUrl(url.searchParams.get("return_url"));
  if (returnUrl) response.cookies.set(NEXUS_RETURN_COOKIE, returnUrl, cookieOpts);
  // The launching program scopes /bridge/context for multi-program people.
  const programId = safeProgramId(url.searchParams.get("program_id"));
  if (programId) response.cookies.set(NEXUS_PROGRAM_COOKIE, programId, cookieOpts);
  // Embedded launch (host-app iframe): remember it so the shell hides its own
  // sign-out. A normal launch clears the flag.
  if (embedded) {
    response.cookies.set(NEXUS_EMBEDDED_COOKIE, "1", cookieOpts);
  } else {
    response.cookies.set(NEXUS_EMBEDDED_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  }
  return response;
}
