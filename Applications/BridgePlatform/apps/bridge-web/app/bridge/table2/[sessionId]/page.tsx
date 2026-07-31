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
import { undoAction } from "@/app/bridge/table/actions";
import { HandViewer } from "@/components/table/play/HandViewer";
import { LivePlayTable } from "@/components/table/play/LivePlayTable";
import { SeatsPanel } from "@/components/table/play/SeatsPanel";
import { AutoAdvance } from "@/components/table/AutoAdvance";
import { benAvailable, originalHand } from "@/lib/benSeat";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

export default async function PlayTablePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ hands?: string; bboAuction?: string; speed?: string; confirm?: string; view?: string; paused?: string; saved?: string; error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { hands: handsParam, bboAuction, speed, confirm, view: viewParam, paused, saved, error } = await searchParams;
  const handsView = viewParam === "hands";

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
  // Identity strips (SeatPlate design): humans petrol, robots a distinct color
  // per seat — that's what tells two BENs at one table apart.
  const ROBOT_STRIPS: Record<Seat, string> = { N: "#e0813a", E: "#8e5bc4", S: "#3aa0e0", W: "#3ab77a" };
  const seatStrip = (seat: Seat) =>
    record.seats[seat].kind === "human" ? "#12525e" : ROBOT_STRIPS[seat];

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

  // ☰ settings menu (SettingsMenu design): each row navigates with one param
  // changed — the app's convention for table toggles. `paused` is kept so a
  // settings change doesn't remount AutoAdvance and surprise-pause the table.
  const beatMs = speed === "fast" ? 350 : speed === "slow" ? 1500 : 750;
  const confirmBids = confirm === "1";
  const settingsHref = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const current = { hands: handsParam, bboAuction, speed, confirm, view: viewParam, paused };
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/bridge/table2/${sessionId}?${s}` : `/bridge/table2/${sessionId}`;
  };
  const settings = [
    {
      label: "Show all four hands",
      value: showAll ? "On" : "Off",
      href: settingsHref({ hands: showAll ? "mine" : "all" }),
    },
    {
      label: "Auction display",
      value: bboAuction === "seats" ? "At seats" : "Centre box",
      href: settingsHref({ bboAuction: bboAuction === "seats" ? undefined : "seats" }),
    },
    {
      label: "Robot speed",
      value: speed === "fast" ? "Fast" : speed === "slow" ? "Slow" : "Normal",
      href: settingsHref({ speed: speed === "slow" ? "fast" : speed === "fast" ? undefined : "slow" }),
    },
    {
      label: "Confirm bids",
      value: confirmBids ? "On" : "Off",
      href: settingsHref({ confirm: confirmBids ? undefined : "1" }),
    },
    // The verification workbench (decisions rail, fix-at-the-table, deal
    // editor) lives behind the ☰ so nothing sits outside the canvas.
    ...(isFellow
      ? [{ label: "Verification workbench", value: "→", href: `/bridge/table/${sessionId}?legacy=1` }]
      : []),
  ];

  // Play controls live INSIDE the canvas: ▶/❚❚ and step as rail chips
  // (AutoAdvance's rail variant), undo beside them. Same key semantics as
  // before — an undo remounts the controls paused.
  // Boards RUN by default now (the design's pause-first control); ?paused is
  // the exception an undo sets so the table comes back held.
  const controlsAt = (s: number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 * s }}>
      <AutoAdvance
        key={paused ?? "run"}
        sessionId={sessionId}
        active={!actingIsHuman && state.phase !== "complete"}
        seq={record.events.length}
        complete={state.phase === "complete"}
        beatMs={beatMs}
        initialPaused={Boolean(paused)}
        variant="rail"
        railScale={s}
      />
      {record.events.length > 0 && state.phase !== "complete" && (
        <form action={undoAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            aria-label="undo"
            title="Undo the last decision — comes back paused"
            style={{ width: 100 * s, height: 26 * s, background: "#acc5c5", border: `${2 * s}px solid #f2f4f4`, borderRadius: 7 * s, color: "#000", fontSize: 13 * s, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
          >
            ↩ undo
          </button>
        </form>
      )}
    </div>
  );

  // The hand-record view (HandViewer design): all four panels big, the full
  // auction, and honest info panels. Mid-play it shows the REMAINING cards
  // (and respects visibility); a completed board shows the original deal.
  const complete = state.phase === "complete";
  const viewerHands = complete
    ? { N: originalHand(state, "N"), E: originalHand(state, "E"), S: originalHand(state, "S"), W: originalHand(state, "W") }
    : state.hands;
  const contractText = state.contract
    ? `${state.contract.level}${({ S: "♠", H: "♥", D: "♦", C: "♣", N: "NT" } as Record<string, string>)[state.contract.strain]}${state.contract.doubled === 1 ? "X" : state.contract.doubled === 2 ? "XX" : ""} by ${state.contract.declarer}`
    : state.phase === "auction"
      ? "Auction in progress"
      : "Passed out";
  const handViewer = (
    <HandViewer
      boardLabel={boardNumber}
      dealer={record.board.dealer}
      vul={state.vul}
      hands={viewerHands}
      names={{ N: seatName("N"), E: seatName("E"), S: seatName("S"), W: seatName("W") }}
      visible={{ N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") }}
      auction={state.auction}
      highlightSeat={complete ? (state.contract?.declarer ?? null) : state.turn}
      info={[
        { label: `NS · ${seatName("N")} & ${seatName("S")}`, value: `${state.trickCount.NS} tricks` },
        { label: `EW · ${seatName("E")} & ${seatName("W")}`, value: `${state.trickCount.EW} tricks` },
      ]}
      result={[
        { label: contractText, value: score ? `${resultLabel(score)} · ${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : "" },
      ]}
      nav={
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
          <Link
            href={settingsHref({ view: undefined })}
            style={{ width: 261, height: 64, background: "#acc5c5", border: "3px solid #f2f4f4", borderRadius: 10, color: "#000", fontSize: 30, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
          >
            ⟵ table
          </Link>
          {controlsAt(1.9)}
        </div>
      }
    />
  );

  return (
    <div className="mx-auto w-full">
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
      {/* Every control lives INSIDE the canvas — rail chips on the table, the
          nav cell on the hand viewer. Nothing floats above the design. */}
      <div
        className="overflow-hidden rounded-lg"
        style={{ height: "calc(100vh - 5.5rem)" }}
      >
        {handsView ? (
          handViewer
        ) : (
          <LivePlayTable
            sessionId={sessionId}
            state={{ ...state, dealer: record.board.dealer, vul: state.vul }}
            seats={{
              N: { name: seatName("N"), tag: dummy === "N" ? "dummy" : "", strip: seatStrip("N") },
              E: { name: seatName("E"), tag: dummy === "E" ? "dummy" : "", strip: seatStrip("E") },
              S: { name: seatName("S"), tag: dummy === "S" ? "dummy" : "", strip: seatStrip("S") },
              W: { name: seatName("W"), tag: dummy === "W" ? "dummy" : "", strip: seatStrip("W") },
            }}
            visible={{ N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") }}
            mySeat={mySeat}
            legalCalls={state.phase === "auction" && myTurn ? [...legalCalls(state.auction, state.turn)] : []}
            legalPlays={state.phase === "play" && myTurn ? legalPlays(state, state.turn) : []}
            myTurn={myTurn}
            boardLabel={boardNumber}
            auctionDisplay={bboAuction === "seats" ? "seats" : "box"}
            confirmBids={confirmBids}
            resultLine={score ? resultLabel(score) : ""}
            resultScore={score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : ""}
            controlsExtra={controlsAt(1)}
            controlsExtraNarrow={controlsAt(1.5)}
            railExtra={seatsPanel}
            settings={settings}
            viewHref={{ label: "Hands", href: settingsHref({ view: "hands" }) }}
          />
        )}
      </div>
    </div>
  );
}
