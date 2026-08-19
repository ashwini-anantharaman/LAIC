// POST /api/bridge/sessions/:id/author-assist — the studio's advisor strip
// (curated v2, owner design 2026-08-18). For the decision in front of the
// coach it answers with what the machines think:
//
//   auction → BEN's bid with candidates and explanations (~1.5s warm; absent
//             when BEN_ENDPOINT isn't configured — the strip hides itself);
//   play    → DDS trick counts for every legal card (the same oracle the
//             robots play by). BEN's /play is NOT consulted here: its full
//             simulations run 20-45s, which is a robot's patience, not an
//             advisor's.
//
// Owlee's hint-ladder drafting stays with the play-hint route the rail
// already calls — one generator, not two.
//
// The studio's door only: an authoring sitting the caller is seated in.
// Anything else reads as not-found.

import type { Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { benAvailable, createBenTableClient } from "@/lib/benSeat";
import { auctionToCtx, handToPbn, vulToBen } from "@/lib/benchmark";
import { livePlayState } from "@/lib/coach/cardVerdicts";
import { scoreEveryCard } from "@/lib/coach/ddsOracle";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { studioAccess } from "@/lib/studioSession";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

// BEN /bid is quick; a stuck endpoint must not hold the studio hostage.
const BEN_ADVICE_TIMEOUT_MS = 15_000;

export const maxDuration = 30;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const { record, state, actingSeat } = await sessionService().view(id);

    // The studio's door: an authoring sitting with this caller seated in it.
    // (It used to demand all four chairs be theirs — the shape the studio had
    // for one day. lib/studioSession.ts still answers yes to those.)
    if (!studioAccess(record, context.nexusUserId).studio)
      throw new AccessError("Not an authoring session");

    if (state.phase === "auction") {
      if (!benAvailable()) return NextResponse.json({ phase: "auction", ben: null }, { headers: CORS });
      try {
        const result = await createBenTableClient({ timeoutMs: BEN_ADVICE_TIMEOUT_MS }).bid({
          hand: handToPbn(state.hands[actingSeat as Seat]),
          seat: actingSeat,
          dealer: state.dealer,
          vul: vulToBen(state.vul),
          ctx: auctionToCtx(state.auction),
        });
        return NextResponse.json(
          {
            phase: "auction",
            seat: actingSeat,
            ben: {
              bid: result.bid,
              candidates: result.candidates.map((c) => ({
                call: c.call,
                score: c.insta_score,
                explanation: c.explanation,
              })),
            },
          },
          { headers: CORS },
        );
      } catch {
        // BEN down mid-session — the strip shows nothing rather than an error.
        return NextResponse.json({ phase: "auction", ben: null }, { headers: CORS });
      }
    }

    if (state.phase === "play") {
      const live = livePlayState(state, actingSeat as Seat, actingSeat as Seat);
      const scores = live ? await scoreEveryCard(live) : undefined;
      return NextResponse.json(
        {
          phase: "play",
          seat: actingSeat,
          dds: scores?.length
            ? {
                cards: [...scores]
                  .sort((a, b) => b.tricks - a.tricks)
                  .map((s) => ({ card: s.card, tricks: s.tricks })),
              }
            : null,
        },
        { headers: CORS },
      );
    }

    return NextResponse.json({ phase: state.phase }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
