// GET /api/bridge/sessions/[id]/view — the native table's bootstrap: what
// the table2 page composes, as JSON, through THE SAME resolver
// (lib/tableView.ts), so the page and the app cannot disagree about policy.
// Resolving a view also fires the completion side effects (assignment
// delivery; the challenge freeze inside challengeTableContext) — a board
// looked at through this door completes exactly like one looked at on the web.
//
// ?hands=all|mine mirrors the page's toggle. HANDS ARE MASKED by the
// resolver's visibility answer — a hidden seat ships as an empty array, in
// `state.hands` and `dealtHands` both. The client's local fold only needs its
// own cards (legality) and the visible ones (display); a phase transition
// that opens a hand (the lead, a takeover, the end) refetches this view.
//
// The challenge context is serialized WITHOUT the board's pack — those are
// the four hands; the strip/standings/onward chrome is what the client draws.

import type { Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { canUse } from "@/lib/access";
import { benAvailable } from "@/lib/benSeat";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { kbStore } from "@/lib/kb";
import { loadTableView } from "@/lib/tableView";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.play"))) throw new AccessError("No access");
    const { id } = await params;
    const hands = request.nextUrl.searchParams.get("hands") ?? undefined;

    const loaded = await loadTableView(context, id, { hands });
    if (!loaded.ok) throw new AccessError("No such board");
    const { v } = loaded;
    const { record, state, actingSeat, actingIsHuman } = v.view;

    const mask = (handsBySeat: Record<Seat, unknown[]>) =>
      Object.fromEntries(
        (["N", "E", "S", "W"] as Seat[]).map((seat) => [
          seat,
          v.visible[seat] ? handsBySeat[seat] : [],
        ]),
      );

    // The dealt distribution (not the mid-play remainder), masked — what the
    // client seeds its local fold with.
    const { seededDeal } = await import("@bridge/engine");
    const dealt = record.board.hands ?? seededDeal(record.board.seed);

    // The seat-swap roster, only when the panel is permitted — folded into
    // the bootstrap so the sheet opens without a second request.
    const roster = v.control["table.seats_panel"]
      ? (await kbStore().listPlayersForKb(record.kbId))
          .sort((a, b) =>
            a.validationStatus === b.validationStatus
              ? a.name.localeCompare(b.name)
              : a.validationStatus === "valid"
                ? -1
                : 1,
          )
          .map((p) => ({ playerId: p.playerId, name: p.name, validationStatus: p.validationStatus }))
      : [];

    return NextResponse.json(
      {
        session: {
          sessionId: record.sessionId,
          status: record.status,
          kbId: record.kbId,
          // A challenge sitting faces the no-fallback BEN — the step loop's
          // retry honesty keys on this, chrome or not (practice replays too).
          strictBen: Boolean(record.challenge),
        },
        board: {
          name: record.board.name,
          number: v.boardNumber,
          dealer: record.board.dealer,
          vul: record.board.vul,
        },
        headSeq: v.headSeq,
        state: { ...state, hands: mask(state.hands) },
        dealtHands: mask(dealt as Record<Seat, unknown[]>),
        actingSeat,
        actingIsHuman,
        playedOut: v.playedOut,
        biddingOnly: v.biddingOnly,
        auctionWasTheBoard: v.auctionWasTheBoard,
        boardOver: v.boardOver,
        mySeat: v.mySeat,
        dummy: v.dummy,
        takeover: v.takeover,
        declaringSeat: v.declaringSeat,
        myTurn: v.myTurn,
        canSeeAllHands: v.canSeeAllHands,
        showAll: v.showAll,
        visible: v.visible,
        control: v.control,
        appearance: v.appearance,
        seats: v.seats,
        seatNames: v.seatNames,
        roster,
        // BEN as a seatable character — endpoint configured AND permitted.
        benOffered: benAvailable() && v.control["table.ben_seat"],
        challenge: v.challenge
          ? {
              challengeId: v.challenge.challengeId,
              boardNo: v.challenge.boardNo,
              biddingOnly: v.challenge.biddingOnly,
              strip: v.challenge.strip,
              standings: v.challenge.standings,
              boards: v.challenge.boards,
              subtitle: v.challenge.subtitle,
              done: v.challenge.done,
              onward: v.challenge.onward,
            }
          : null,
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
