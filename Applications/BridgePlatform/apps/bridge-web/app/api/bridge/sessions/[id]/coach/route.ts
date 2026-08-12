// GET /api/bridge/sessions/[id]/coach — the coach dock's payload for the
// native table, PRE-RENDERED through the same pure module the web dock draws
// from (components/table/play/coachContent), so the two docks can never
// phrase the same position differently. Computed from the seat the learner
// PLAYS FROM (takeover-aware, via the one resolver) — under a takeover the
// learner is declaring and wants real help, not "you're dummy, nothing to
// decide".
//
// Fetched by the app after event batches, debounced — it compiles the KB for
// the bid meanings, which is exactly why it must never sit in the felt's own
// render path. The on-demand endpoints (play-hint, play-why, event-qa) stay
// separate: they cost seconds and answer only when asked.

import { NextResponse, type NextRequest } from "next/server";

import { type CoachData } from "@/components/table/play/coachContent";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { originalHand } from "@/lib/benSeat";
import { bidMeaningReader } from "@/lib/bidMeanings";
import { lookingAt } from "@/lib/coach/looking";
import { thinkAid } from "@/lib/coach/think";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { loadTableView } from "@/lib/tableView";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;

    const loaded = await loadTableView(context, id);
    if (!loaded.ok) throw new AccessError("No such board");
    const { v } = loaded;
    if (!v.control["table.coach"]) throw new AccessError("No coach here");

    const { record, state } = v.view;
    // The seat they are PLAYING FROM, not the one they were dealt — one
    // definition, the same one the page uses.
    const coachSeat = v.declaringSeat ?? v.mySeat;
    const coachState = { ...state, dealer: record.board.dealer, vul: state.vul };
    const looking = lookingAt(coachState, coachSeat);
    const think = thinkAid(coachState, coachSeat);

    // Bid meanings, replayed from the compiled KB — folded into the history
    // rows exactly as the page folds them.
    const meanings = looking
      ? bidMeaningReader({ compiled: await sessionService().compiledFor(record) }).forAuction({
          boardRef: record.board.name,
          dealer: record.board.dealer,
          vul: state.vul,
          hands: {
            N: originalHand(state, "N"),
            E: originalHand(state, "E"),
            S: originalHand(state, "S"),
            W: originalHand(state, "W"),
          },
          auction: state.auction,
        })
      : [];
    const eventGroups = (looking?.eventGroups ?? []).map((g) => ({
      ...g,
      events: g.events.map((e) => {
        const m =
          e.kind === "call" && e.auctionIndex !== undefined ? meanings[e.auctionIndex] : undefined;
        return m ? { ...e, detail: `${m.label}${m.shows ? ` — ${m.shows}` : ""}` } : e;
      }),
    }));

    const phase: CoachData["phase"] = v.boardOver
      ? "other"
      : state.phase === "auction"
        ? "auction"
        : state.phase === "play"
          ? "play"
          : "other";
    // THE WEB DOCK'S OWN PAYLOAD, WHOLE (owner direction 2026-08-12: the
    // native table renders the ORIGINAL coach, pasted and rewired, never a
    // reduction) — exactly the CoachPanelData the page hands
    // <CoachDock data={quanCoach}/>: the one-line position, the flip-card
    // facts, the think scaffold with its known cards, the meaning-folded
    // history, and the ask context.
    return NextResponse.json(
      {
        title: "Coach",
        ...(looking ? { looking: looking.looking, facts: looking.facts } : {}),
        ...(eventGroups.length ? { eventGroups } : {}),
        ...(think ? { aid: think } : {}),
        ...(v.mySeat
          ? { ask: { sessionId: id, active: phase !== "other" && v.myTurn, phase } }
          : {}),
        placeholder: v.mySeat
          ? "Your coach's notes for this board will appear here."
          : "Take a seat to be coached — right now you're watching.",
        watcher: !looking,
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
