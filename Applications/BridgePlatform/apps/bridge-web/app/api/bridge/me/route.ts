// GET /api/bridge/me — the native app's bootstrap: who am I on the bridge
// platform and which surfaces may I use, resolved SERVER-SIDE.
//
// This is the JSON twin of the gating the /m layout and pages do per render
// (MOBILE_TAB_KEYS × canAccess, canCreateChallenge, the library flags). The
// catalogue itself never ships to a client, and the club-capability fallback
// logic (three cases, silence ≠ denial — see canCreateChallenge) stays here
// where it already lives; the app renders the answers, it re-derives nothing.
//
// AUTH: bearer (+ x-program-id) or the launch cookie — getBridgeContext()
// resolves both. CORS is open for the same reason as challenges/summary: the
// bearer path reads no cookies, so there is no ambient credential to ride.

import { canAccess } from "@bridge/access";
import { NextResponse } from "next/server";

import { canCreateChallenge, getCatalogue } from "@/lib/access";
import { apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { canCreateInLibrary, canSeeProgramLibrary } from "@/lib/libraryComponent";
import { isBridgeCoach } from "@/lib/nexus";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

/** Every catalogue key the app's screens gate on. One list, so a new native
 *  screen adds its key here and reads the flag — never the catalogue. */
const FEATURE_KEYS = [
  "page.home",
  "page.play",
  "page.players",
  "page.library",
  "page.guide",
  "page.challenges",
  "library.resume",
  "table.undo",
] as const;

export async function GET() {
  try {
    const context = await requireContext();
    const catalogue = await getCatalogue();

    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
      features[key] = canAccess(catalogue, key, context.roles);
    }
    // Not a plain catalogue key: the club's own app catalogue has the second
    // vote (see canCreateChallenge).
    features["challenge.create"] = await canCreateChallenge(context);

    const [libraryCanCreate, libraryProgramScope] = await Promise.all([
      canCreateInLibrary(context),
      canSeeProgramLibrary(context),
    ]);

    return NextResponse.json(
      {
        nexusUserId: context.nexusUserId,
        displayName: context.displayName ?? null,
        roles: context.roles,
        isAdmin: context.is_admin === true,
        isCoach: isBridgeCoach(context),
        features,
        library: { canCreate: libraryCanCreate, programScope: libraryProgramScope },
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
