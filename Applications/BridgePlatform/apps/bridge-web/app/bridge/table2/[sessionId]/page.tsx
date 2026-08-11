// The new table page (2026-07-25), built on the reusable <PlayTable/> component
// from the "Play Table" design. The old /bridge/table/[sessionId] page now
// redirects here.
//
// This page's only job is to load the session and hand the board to the
// component — no layout lives here, which is what keeps the component reusable
// (see /bridge/table2/demo for three of them on one page).

import { legalCalls, legalPlays, resultLabel, scoreBoard } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { undoAction } from "@/app/bridge/table/actions";
import { HandViewer } from "@bridge/table-ui";
import { LivePlayTable } from "@/components/table/play/LivePlayTable";
import { SeatsPanel } from "@/components/table/play/SeatsPanel";
import { AutoAdvance } from "@/components/table/AutoAdvance";
import { nextSkin, resolveSkin, skinLabel } from "@bridge/table-config";
import { requireFeature } from "@/lib/access";
import { getAppearance } from "@/lib/appearance";
import { benAvailable, originalHand } from "@/lib/benSeat";
import { kbStore } from "@/lib/kb";
import { libraryKindLabel } from "@/lib/libraryLabels";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { lookingAt } from "@/lib/coach/looking";
import { thinkAid } from "@/lib/coach/think";
import type { CoachData } from "@/components/table/play/coachContent";
import { patchAppearanceAction } from "./actions";
import { ChallengeTableChrome } from "./ChallengeTableChrome";
import { applyControlOverrides } from "./challengeControls";
import { challengeTableContext, practiceIsBiddingOnly, tableControlAccess } from "./challengeTable";

// COACH (phase-2 transplant, owner decision 2 — "his engine, our shell"). His
// old-path table carried the coach as a felt fab + rising sheet; that UI is
// gone. His ENGINE — lib/coach's looking (facts) and think (scaffold) layers,
// plus the on-demand /api/bridge/play-hint advice — is composed HERE and handed
// to OUR CoachPanel region under the phone-tier table (packages/bridge-table-ui).
// Gated by table.coach (mirror-today: all roles). His design kept coaching to
// the phone tier only ("the desktop platform's table doesn't carry coaching;
// coaching is the app's surface"), which is exactly what our shell reserves —
// so there is no wide/stacked coach placement, by his intent. His bid-meaning
// explanations (bidMeanings/auctionMeanings) and BEN's candidates read are NOT
// wired: our @bridge/table-ui table has no bid-meaning slots to feed — follow-up.

export default async function PlayTablePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ hands?: string; bboAuction?: string; speed?: string; confirm?: string; view?: string; paused?: string; saved?: string; error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.play");
  // The viewer's saved skin & layout — resolved once here and threaded to the
  // table. Fails open to the built-in look inside getAppearance.
  const appearance = await getAppearance(context.nexusUserId);
  const resolvedAppearance = {
    ...resolveSkin(appearance.skin, appearance.overrides),
    handLayout: appearance.handLayout,
    bidPad: appearance.bidPad,
    centreFrame: appearance.centreFrame,
    fanSpread: appearance.fanSpread,
    fanRadius: appearance.fanRadius,
  };
  const { sessionId } = await params;
  const { hands: handsParam, bboAuction, speed, confirm, view: viewParam, paused, saved, error } = await searchParams;

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    notFound();
  }
  const { record, state, actingSeat, actingIsHuman } = view;

  // CHALLENGE BRANCH (spec ADDENDUM A4). Null for every ordinary table, and
  // null again if the challenge store is unreachable — normal play is never
  // disturbed by anything below. This is also where a finished challenge board
  // is frozen into its play record.
  const challenge = await challengeTableContext(view, context);

  // BIDDING-ONLY (owner, 2026-08-10): the board ends when the auction ends.
  // The engine still moves to `play` and puts the opening leader on turn, but
  // in this format that phase belongs to nobody — so from here down the board
  // is treated as FINISHED. Derived from the challenge's format and the phase,
  // never from the freeze: a freeze that failed to store must not leave the
  // robots free to start playing the board out.
  //
  // A PRACTICE REPLAY IS THE SAME BOARD. It carries no chrome, so the format
  // does not arrive on `challenge`; it comes off the session's own stamp
  // instead. The alternative — cards in practice on a board the challenge
  // never asked anyone to play — would be a different exercise wearing the
  // same deal.
  const biddingOnly = challenge ? challenge.biddingOnly : await practiceIsBiddingOnly(view);
  const auctionWasTheBoard = biddingOnly && state.phase !== "auction";
  /** The board has nothing left to do — either phase, either format. */
  const boardOver = state.phase === "complete" || auctionWasTheBoard;

  // Access catalogue first, then the board's controlOverrides laid OVER it in
  // BOTH directions (spec §7): a control the creator hid is ABSENT from the
  // toolbar and the ☰, a control they force-showed is present even where the
  // catalogue denies it. Every gate below reads the resolved answer, so there
  // is exactly one place the two layers meet.
  const control = applyControlOverrides(
    await tableControlAccess(context),
    challenge?.board.controlOverrides,
  );
  const canSeatsPanel = control["table.seats_panel"];
  const canBenSeat = control["table.ben_seat"];
  const canWorkbenchLink = control["table.workbench_link"];
  const canUndo = control["table.undo"];
  const canStepControls = control["table.step_controls"];
  const canSettingsMenu = control["table.settings_menu"];
  const canHandsView = control["table.hands_view"];
  const canSkinSettings = control["table.skin_settings"];
  const canSkinsPage = control["page.skins"];
  const canCoach = control["table.coach"];

  // Denied the hands-record view: the ?view=hands param is treated as absent.
  const handsView = viewParam === "hands" && canHandsView;

  const mySeat =
    (Object.entries(record.seats) as [Seat, (typeof record.seats)[Seat]][]).find(
      ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
    )?.[0] ?? null;

  const dummy =
    state.phase !== "auction" && state.contract
      ? (({ N: "S", S: "N", E: "W", W: "E" }) as Record<Seat, Seat>)[state.contract.declarer]
      : null;

  // At a challenge board the Hands control governs the CAPABILITY, not just the
  // record view: hidden means unreachable, so ?hands=all is refused too and the
  // ☰ row below is absent. Ordinary tables keep their existing behaviour.
  const canSeeAllHands = !challenge || canHandsView;
  const showAll = (handsParam === "all" || (handsParam !== "mine" && !mySeat)) && canSeeAllHands;
  // Dummy spreads only after the opening lead — real-bridge timing.
  const leadMade = state.tricks.length > 0 && (state.tricks[0]?.plays.length ?? 0) > 0;
  // A finished board is face-up — and a bidding-only board is finished the
  // moment the auction is, so the four hands open then, exactly as they would
  // after the thirteenth trick.
  const canSee = (seat: Seat) =>
    showAll || seat === mySeat || (seat === dummy && leadMade) || boardOver;

  const myTurn =
    !boardOver &&
    actingIsHuman &&
    record.seats[actingSeat].kind === "human" &&
    (record.seats[actingSeat] as { nexusUserId: string }).nexusUserId === context.nexusUserId;

  // The coach panel is live again (owner, 2026-08-06): gated by table.coach.
  const showCoach = canCoach;
  // The coach payload (his engine): the facts layer (looking) and the reasoning
  // scaffold (think), computed from THIS learner's seat. Both are null for a
  // watcher — nobody's hand to reason from — and the panel then shows its honest
  // empty state. The on-demand "What should I play?" advice is fetched
  // client-side. dealer/vul mirror what the table itself is handed. While parked,
  // `showCoach` is false so this expensive build is skipped entirely.
  const coachState = { ...state, dealer: record.board.dealer, vul: state.vul };
  const coachData: CoachData | undefined = showCoach
    ? {
        // A finished board asks nothing, so the coach offers no question —
        // including a bidding-only board, which never has a card to play.
        phase: boardOver
          ? "other"
          : state.phase === "auction"
            ? "auction"
            : state.phase === "play"
              ? "play"
              : "other",
        active: myTurn,
        looking: lookingAt(coachState, mySeat),
        think: thinkAid(coachState, mySeat),
      }
    : undefined;

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

  // The seat-swap panel in the rail — same swapSeatAction and fork semantics
  // as always, plus BEN as a seatable character when the server has
  // BEN_ENDPOINT configured and the catalogue permits BEN seating.
  const roster = canSeatsPanel ? await kbStore().listPlayersForKb(record.kbId) : [];
  const seatsPanel = canSeatsPanel ? (
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
      benOffered={benAvailable() && canBenSeat}
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
    ...(canSeeAllHands
      ? [
          {
            label: "Show all four hands",
            value: showAll ? "On" : "Off",
            href: settingsHref({ hands: showAll ? "mine" : "all" }),
          },
        ]
      : []),
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
    // Appearance quick-toggles (skins design). Each persists per-user via a
    // bound server action; the menu stays open across the re-render. Gated on
    // table.skin_settings.
    ...(canSkinSettings
      ? [
          {
            label: "Skin",
            value: skinLabel(appearance.skin),
            action: patchAppearanceAction.bind(null, sessionId, { skin: nextSkin(appearance.skin) }),
          },
          {
            label: "Hand layout",
            value: appearance.handLayout === "fan" ? "Fan" : "Row",
            action: patchAppearanceAction.bind(null, sessionId, {
              handLayout: appearance.handLayout === "fan" ? "row" : "fan",
            }),
          },
          {
            label: "Bid pad",
            value: appearance.bidPad === "columns" ? "Suit columns" : "Level grid",
            action: patchAppearanceAction.bind(null, sessionId, {
              bidPad: appearance.bidPad === "columns" ? "grid" : "columns",
            }),
          },
          {
            label: "Centre frame",
            value: appearance.centreFrame ? "On" : "Off",
            action: patchAppearanceAction.bind(null, sessionId, {
              centreFrame: !appearance.centreFrame,
            }),
          },
        ]
      : []),
    ...(canSkinsPage
      ? [{ label: "Appearance", value: "→", href: "/bridge/skins" }]
      : []),
    // The verification workbench (decisions rail, fix-at-the-table, deal
    // editor) lives behind the ☰ so nothing sits outside the canvas.
    ...(canWorkbenchLink
      ? [{ label: "Verification workbench", value: "→", href: `/bridge/table/${sessionId}?legacy=1` }]
      : []),
  ];

  // Play controls live INSIDE the canvas: ▶/❚❚ and step as rail chips
  // (AutoAdvance's rail variant), undo beside them. Same key semantics as
  // before — an undo remounts the controls paused.
  // Boards RUN by default now (the design's pause-first control); ?paused is
  // the exception an undo sets so the table comes back held.
  // Toolbar transport: Pause/Play · ▶ step · ↩ Undo, one row in the bottom bar.
  const controlsAt = (s: number) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7 * s }}>
      <AutoAdvance
        key={paused ?? "run"}
        sessionId={sessionId}
        // `boardOver`, not the phase: on a bidding-only board the robots must
        // not step past the last pass, or they would play out a board nobody
        // is scored on and burn BEN calls doing it.
        active={!actingIsHuman && !boardOver}
        seq={record.events.length}
        complete={boardOver}
        beatMs={beatMs}
        initialPaused={Boolean(paused)}
        variant="rail"
        railScale={s}
        // The session's own stamp, not the chrome: a practice replay wears an
        // ordinary table but still faces the no-fallback challenge BEN, so it
        // needs the same thinking/retry honesty.
        strictBen={Boolean(record.challenge)}
      />
      {/* Undo is off by default in challenges, but a creator may force it on.
          It still stops at the end of the board — on a bidding-only board that
          is the end of the auction, whose last pass is already frozen. */}
      {canUndo && record.events.length > 0 && !boardOver && (
        <form action={undoAction} style={{ display: "flex" }}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            aria-label="undo"
            title="Take back the last decision — comes back paused"
            style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", height: 30 * s, padding: `0 ${12 * s}px`, border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, background: "rgba(255,255,255,.10)", color: "#eef4f1", fontSize: 13 * s, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" }}
          >
            ↩ Undo
          </button>
        </form>
      )}
    </div>
  );

  // The hand-record view (HandViewer design): all four panels big, the full
  // auction, and honest info panels. Mid-play it shows the REMAINING cards
  // (and respects visibility); a completed board shows the original deal.
  const complete = boardOver;
  const viewerHands = complete
    ? { N: originalHand(state, "N"), E: originalHand(state, "E"), S: originalHand(state, "S"), W: originalHand(state, "W") }
    : state.hands;
  const contractText = state.contract
    ? `${state.contract.level}${({ S: "♠", H: "♥", D: "♦", C: "♣", N: "NT" } as Record<string, string>)[state.contract.strain]}${state.contract.doubled === 1 ? "X" : state.contract.doubled === 2 ? "XX" : ""} by ${state.contract.declarer}`
    : state.phase === "auction"
      ? "Auction in progress"
      : "Passed out";

  // THE RESULT CARD on a bidding-only board. There is no score and no trick
  // tally, so the card leads with the contract that was reached and says why
  // nothing follows it — rather than printing "NS 0 · EW 0", which would read
  // as a board played badly instead of a board never played.
  const resultLine = score ? resultLabel(score) : auctionWasTheBoard ? contractText : "";
  const resultScore = score
    ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}`
    : "";
  const resultDetail = auctionWasTheBoard
    ? "Bidding only · the auction was the board"
    : undefined;

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
          {canStepControls && controlsAt(1.9)}
        </div>
      }
    />
  );

  const table = handsView ? (
    handViewer
  ) : (
    <LivePlayTable
      sessionId={sessionId}
      // The table is shown a COMPLETE board once the auction was the board:
      // PlayTable derives all its "is there anything left to do" chrome from
      // the phase, so this is what puts the result card on the felt, folds the
      // bid tray away, drops the turn highlight and stops any card lifting to
      // a tap. It is not a fiction — in this format the board really is over.
      state={{
        ...state,
        ...(auctionWasTheBoard ? { phase: "complete" as const } : {}),
        dealer: record.board.dealer,
        vul: state.vul,
      }}
      seats={{
        N: { name: seatName("N"), tag: dummy === "N" ? "dummy" : "", strip: seatStrip("N"), human: record.seats.N.kind === "human" },
        E: { name: seatName("E"), tag: dummy === "E" ? "dummy" : "", strip: seatStrip("E"), human: record.seats.E.kind === "human" },
        S: { name: seatName("S"), tag: dummy === "S" ? "dummy" : "", strip: seatStrip("S"), human: record.seats.S.kind === "human" },
        W: { name: seatName("W"), tag: dummy === "W" ? "dummy" : "", strip: seatStrip("W"), human: record.seats.W.kind === "human" },
      }}
      visible={{ N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") }}
      mySeat={mySeat}
      legalCalls={state.phase === "auction" && myTurn ? [...legalCalls(state.auction, state.turn)] : []}
      legalPlays={state.phase === "play" && myTurn ? legalPlays(state, state.turn) : []}
      myTurn={myTurn}
      boardLabel={boardNumber}
      auctionDisplay={bboAuction === "seats" ? "seats" : "box"}
      confirmBids={confirmBids}
      resultLine={resultLine}
      resultScore={resultScore}
      resultDetail={resultDetail}
      // A finished challenge board draws its way onward ON the canvas — the
      // result card in the centre, not a band stacked around the table.
      completedAction={
        challenge?.done
          ? { label: `${challenge.onward.label} \u2192`, href: challenge.onward.href }
          : undefined
      }
      completedNote={challenge?.done ? challenge.onward.note : undefined}
      controlsExtra={canStepControls ? controlsAt(1) : undefined}
      controlsExtraNarrow={canStepControls ? controlsAt(1.5) : undefined}
      railExtra={seatsPanel}
      settings={canSettingsMenu ? settings : undefined}
      viewHref={canHandsView ? { label: "Hands", href: settingsHref({ view: "hands" }) } : undefined}
      appearance={resolvedAppearance}
      showCoach={showCoach}
      coach={coachData}
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
            Open the {libraryKindLabel(saved)} shelf →
          </Link>
        </p>
      )}
      {/* Every control lives INSIDE the canvas — rail chips on the table, the
          nav cell on the hand viewer. Nothing floats above the design. */}
      <div
        className="overflow-hidden rounded-lg"
        style={{ height: "calc(100vh - 5.5rem)" }}
      >
        {/* A challenge board wears the strip above the table's top toolbar and
            carries the standings as an overlay over the felt (spec A4). The
            table itself is the SAME component either way — the chrome wraps it,
            it never forks it, and the strip's 40px comes out of the band budget
            because PlayTable measures the box the chrome leaves it. */}
        {challenge ? (
          <ChallengeTableChrome
            strip={challenge.strip}
            standings={challenge.standings}
            boards={challenge.boards}
            subtitle={challenge.subtitle}
          >
            {table}
          </ChallengeTableChrome>
        ) : (
          table
        )}
      </div>
    </div>
  );
}
