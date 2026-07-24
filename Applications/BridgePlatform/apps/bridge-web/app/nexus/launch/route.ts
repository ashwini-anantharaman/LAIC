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

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const launchToken = url.searchParams.get("launch_token");
  const baseUrl = process.env.NEXUS_API_BASE_URL;

  if (!launchToken || !baseUrl) {
    return NextResponse.redirect(new URL("/welcome?launch=missing", url));
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
    return NextResponse.redirect(new URL("/welcome?launch=failed", url));
  }

  const response = NextResponse.redirect(new URL("/bridge/home", url));
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  } as const;
  response.cookies.set(NEXUS_TOKEN_COOKIE, accessToken, cookieOpts);
  // The console's return address, when Nexus sent one — powers "Back to Nexus".
  const returnUrl = safeReturnUrl(url.searchParams.get("return_url"));
  if (returnUrl) response.cookies.set(NEXUS_RETURN_COOKIE, returnUrl, cookieOpts);
  // The launching program scopes /bridge/context for multi-program people.
  const programId = safeProgramId(url.searchParams.get("program_id"));
  if (programId) response.cookies.set(NEXUS_PROGRAM_COOKIE, programId, cookieOpts);
  // Embedded launch (host-app iframe): remember it so the shell hides its own
  // sign-out. A normal launch clears the flag.
  if (url.searchParams.get("embedded") === "1") {
    response.cookies.set(NEXUS_EMBEDDED_COOKIE, "1", cookieOpts);
  } else {
    response.cookies.set(NEXUS_EMBEDDED_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  }
  return response;
}
