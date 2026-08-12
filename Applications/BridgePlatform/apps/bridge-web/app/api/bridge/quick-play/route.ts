// POST /api/bridge/quick-play — deal a fresh board immediately (you South
// against the house lineup) and return the sessionId. The JSON twin of
// app/m/quick-play/page.tsx, for the native app: same loads, same guards,
// same speed decisions (cached lineup on the critical path, audit after the
// response) — the answer is `{ sessionId }` instead of a redirect.
//
// 409 `no_lineup` when no knowledge base compiles: the app sends the player
// to the library, exactly as the page's redirect did.

import type { Seat } from "@bridge/events";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";

import { apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { ensureSeeds } from "@/lib/kb";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { resolveQuickPlayLineup } from "@/lib/quickPlay";
import { sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();

    const [, , lineup, programId] = await Promise.all([
      ensureSeeds(),
      assertAiAllowed(context),
      resolveQuickPlayLineup(context),
      nexusProgramIdOf(),
    ]);
    // No knowledge base compiles — nothing to play against.
    if (!lineup) {
      return NextResponse.json({ error: "no_lineup" }, { status: 409, headers: CORS });
    }
    // The cache is a shortcut, never a permission: re-check on the way out.
    await assertKbAllowed(context, lineup.kbId);

    const body = (await request.json().catch(() => ({}))) as { dealer?: string };
    const SEATS: Seat[] = ["N", "E", "S", "W"];
    const dealer: Seat = SEATS.includes(body.dealer as Seat) ? (body.dealer as Seat) : "N";

    const ai = SessionService.seatFromPlayer(lineup.house, lineup.compiled);
    const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
    seats.S = { kind: "human", nexusUserId: context.nexusUserId };

    // Named for the moment it was dealt, in the club's timezone — same
    // reasoning as the page (owner request 2026-08-06).
    const TZ = "America/Los_Angeles";
    const dealt = new Date();
    const boardName = `${dealt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })} · ${dealt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;

    const record = await sessionService().createSession({
      kbId: lineup.kbId,
      compiled: lineup.compiled,
      seats,
      seed: (Date.now() % 100_000) + 1,
      dealer,
      boardName,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: programId ?? undefined,
    });

    // After the response, not before it: the trail must be complete, but
    // nobody should wait on a log line to see their cards.
    after(async () => {
      try {
        await audit(context, "profile.update", "kb_session", record.sessionId, {
          kbId: lineup.kbId,
          quickPlay: true,
        });
      } catch (err) {
        console.error("quick-play: audit failed", err);
      }
    });

    return NextResponse.json({ sessionId: record.sessionId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
