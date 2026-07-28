// The new table page (2026-07-25), built on the reusable <PlayTable/> component
// from the "Play Table" design. The old /bridge/table/[sessionId] page now
// redirects here.
//
// This page's only job is to load the session and hand the board to the
// component — no layout lives here, which is what keeps the component reusable
// (see /bridge/table2/demo for three of them on one page).

import { legalCalls, legalPlays, resultLabel, scoreBoard } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LivePlayTable } from "@/components/table/play/LivePlayTable";
import { SeatsPanel } from "@/components/table/play/SeatsPanel";
import { AutoAdvance } from "@/components/table/AutoAdvance";
import { benAvailable } from "@/lib/benSeat";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

export default async function PlayTablePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ hands?: string; bboAuction?: string; paused?: string; saved?: string; error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { hands: handsParam, bboAuction, paused, saved, error } = await searchParams;

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    notFound();
  }
  const { record, state, actingSeat, actingIsHuman } = view;

  const mySeat =
    (Object.entries(record.seats) as [Seat, (typeof record.seats)[Seat]][]).find(
      ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
    )?.[0] ?? null;

  const dummy =
    state.phase !== "auction" && state.contract
      ? (({ N: "S", S: "N", E: "W", W: "E" }) as Record<Seat, Seat>)[state.contract.declarer]
      : null;

  const showAll = handsParam === "all" || (handsParam !== "mine" && !mySeat);
  // Dummy spreads only after the opening lead — real-bridge timing.
  const leadMade = state.tricks.length > 0 && (state.tricks[0]?.plays.length ?? 0) > 0;
  const canSee = (seat: Seat) =>
    showAll || seat === mySeat || (seat === dummy && leadMade) || state.phase === "complete";

  const myTurn =
    actingIsHuman &&
    record.seats[actingSeat].kind === "human" &&
    (record.seats[actingSeat] as { nexusUserId: string }).nexusUserId === context.nexusUserId;

  const score = scoreBoard(state);
  const seatName = (seat: Seat) => {
    const c = record.seats[seat];
    return c.kind === "human" ? (c.nexusUserId === context.nexusUserId ? "you" : "human") : c.label;
  };

  // Fellows get the seat-swap panel in the rail — same swapSeatAction and
  // fork semantics as always, plus BEN as a seatable character when the
  // server has BEN_ENDPOINT configured.
  const isFellow = canAccessAdminArea(context);
  const roster = isFellow ? await kbStore().listPlayersForKb(record.kbId) : [];
  const seatsPanel = isFellow ? (
    <SeatsPanel
      sessionId={sessionId}
      seatLabels={{ N: seatName("N"), E: seatName("E"), S: seatName("S"), W: seatName("W") }}
      roster={[...roster]
        .sort((a, b) =>
          a.validationStatus === b.validationStatus
            ? a.name.localeCompare(b.name)
            : a.validationStatus === "valid"
              ? -1
              : 1,
        )
        .map((p) => ({ playerId: p.playerId, name: p.name, validationStatus: p.validationStatus }))}
      benOffered={benAvailable()}
    />
  ) : null;

  // The board card in the rail is sized for a number; "seeded-26105" is not
  // one, so show its trailing digits and keep the full name in the tooltip.
  const boardNumber = /(\d+)\s*$/.exec(record.board.name)?.[1] ?? record.board.name;

  return (
    <div className="mx-auto w-full max-w-[1040px]">
      {error && (
        <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved to the library.{" "}
          <Link
            href={`/bridge/library?kind=${saved}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            Open the {saved} shelf →
          </Link>
        </p>
      )}
      {/* The advance control sits ABOVE the table, not inside it: the table box
          is sized to the design's 1040x590 and anything sharing that box pushes
          the felt down and clips South's hand. */}
      <div className="mb-2 flex items-center gap-2">
        <AutoAdvance
          key={paused ?? "run"}
          sessionId={sessionId}
          active={!actingIsHuman && state.phase !== "complete"}
          seq={record.events.length}
          complete={state.phase === "complete"}
        />
      </div>
      <div
        className="overflow-hidden rounded-lg"
        style={{ height: "min(590px, calc(100vh - 7rem))" }}
      >
        <LivePlayTable
          sessionId={sessionId}
          state={{ ...state, dealer: record.board.dealer, vul: state.vul }}
          seats={{
            N: { name: seatName("N"), tag: dummy === "N" ? "dummy" : "" },
            E: { name: seatName("E"), tag: dummy === "E" ? "dummy" : "" },
            S: { name: seatName("S"), tag: dummy === "S" ? "dummy" : "" },
            W: { name: seatName("W"), tag: dummy === "W" ? "dummy" : "" },
          }}
          visible={{ N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") }}
          mySeat={mySeat}
          legalCalls={state.phase === "auction" && myTurn ? [...legalCalls(state.auction, state.turn)] : []}
          legalPlays={state.phase === "play" && myTurn ? legalPlays(state, state.turn) : []}
          myTurn={myTurn}
          boardLabel={boardNumber}
          auctionDisplay={bboAuction === "seats" ? "seats" : "box"}
          resultLine={score ? resultLabel(score) : ""}
          resultScore={score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : ""}
          railExtra={seatsPanel}
        />
      </div>
    </div>
  );
}
