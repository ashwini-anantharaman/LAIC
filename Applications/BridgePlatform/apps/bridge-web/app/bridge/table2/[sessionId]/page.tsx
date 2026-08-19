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
import { EmbedTableState } from "@/components/mobile/EmbedTableState";
import { LivePlayTable } from "@/components/table/play/LivePlayTable";
import { SeatsPanel } from "@/components/table/play/SeatsPanel";
import { AutoAdvance } from "@/components/table/AutoAdvance";
import { nextSkin, resolveSkin, skinLabel } from "@bridge/table-config";
import { SkinsClient } from "@/app/bridge/skins/SkinsClient";
import { requireFeature } from "@/lib/access";
import { benAvailable, originalHand } from "@/lib/benSeat";
import { kbStore } from "@/lib/kb";
import { libraryKindLabel } from "@/lib/libraryLabels";
import { getBridgeContext, isEmbeddedLaunch } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { loadTableView } from "@/lib/tableView";
import { lookingAt } from "@/lib/coach/looking";
import { boardTakeaway } from "@/lib/coach/takeaway";
import { thinkAid } from "@/lib/coach/think";
import { bidMeaningReader } from "@/lib/bidMeanings";
import type { CoachData } from "@/components/table/play/coachContent";
import { CoachDock, type CoachPanelData } from "@/components/table/play/CoachPanel";
import { patchAppearanceAction, saveTableAppearanceAction } from "./actions";
import { ChallengeTableChrome } from "./ChallengeTableChrome";
import { gradeBiddingPuzzle, gradePlayPuzzle, puzzleKind } from "@bridge/challenges";

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
  searchParams: Promise<{ hands?: string; bboAuction?: string; bars?: string; speed?: string; view?: string; paused?: string; saved?: string; error?: string; from?: string; coach?: string; appearance?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId: sessionIdParam } = await params;
  const sessionId = sessionIdParam;
  const { hands: handsParam, bboAuction, bars, speed, view: viewParam, paused, saved, error, from, coach: coachParam, appearance: appearanceParam } = await searchParams;
  // ?bars=off strips the edge toolbars so the felt can be judged (or embedded)
  // without them. A LOOK, not a permission: every control they carry is still
  // reachable from the ☰ menu, so this hides chrome, it never removes ability.
  const showToolbars = bars !== "off";

  // WHAT THIS TABLE IS TO THIS VIEWER — lib/tableView.ts, THE one resolver
  // (GET /api/bridge/sessions/[id]/view reads the same one, so the page and
  // the native app's table can never disagree about policy). It owns the
  // parallel loads, the completion delivery, the challenge branch (incl. the
  // freeze), bidding-only completion, the takeover, and every visibility and
  // control answer this page renders.
  const [, embedded, loaded] = await Promise.all([
    requireFeature(context, "page.play"),
    // Inside the coach app's WebView the host owns the frame and the table
    // renders its phone tier; on the desktop platform it keeps the wide view.
    isEmbeddedLaunch(),
    loadTableView(context, sessionIdParam, { hands: handsParam }),
  ]);

  if (!loaded.ok) {
    // EMBEDDED, a bare 404 is a dead end inside the host app's frame — and a
    // gone session is an ordinary event there (a discarded board tapped from
    // a list that hadn't refreshed yet). Land somewhere the app recognizes:
    // it watches for boardGone=1 and closes the screen.
    if (embedded) redirect("/m/home?boardGone=1");
    notFound();
  }
  const { v } = loaded;
  const {
    view,
    playedOut,
    auctionWasTheBoard,
    boardOver,
    challenge,
    control,
    appearance,
    mySeat,
    dummy,
    takeover,
    declaringSeat,
    myTurn,
    canSeeAllHands,
    showAll,
    visible,
    boardNumber,
    seatNames,
  } = v;
  const { record, state, actingSeat, actingIsHuman } = view;
  const canSee = (seat: Seat) => visible[seat];
  const seatName = (seat: Seat) => seatNames[seat];
  const plate = (seat: Seat) => v.seats[seat];

  const resolvedAppearance = {
    ...resolveSkin(appearance.skin, appearance.overrides),
    handLayout: appearance.handLayout,
    bidPad: appearance.bidPad,
    centreFrame: appearance.centreFrame,
    fanSpread: appearance.fanSpread,
    fanRadius: appearance.fanRadius,
    suitGroups: appearance.suitGroups,
    cardLift: appearance.cardLift,
  };

  const canSeatsPanel = control["table.seats_panel"];
  const canBenSeat = control["table.ben_seat"];
  const canWorkbenchLink = control["table.workbench_link"];
  const canUndo = control["table.undo"];
  const canStepControls = control["table.step_controls"];
  const canSettingsMenu = control["table.settings_menu"];
  const canHandsView = control["table.hands_view"];
  const canSkinSettings = control["table.skin_settings"];
  const canCoach = control["table.coach"];

  // Denied the hands-record view: the ?view=hands param is treated as absent —
  // UNLESS the board is complete AND unchallenged. The gate exists so a live
  // viewer can't peek, and a finished ordinary board has nothing left to hide
  // (canSee below already opens every hand); My Games' "View board" links
  // straight here. A CHALLENGE board keeps the gate even when complete — its
  // controlOverrides govern the capability itself.
  const handsView = viewParam === "hands" && (canHandsView || (playedOut && !challenge));

  // The coach panel is live again (owner, 2026-08-06): gated by table.coach —
  // and the LEARNER can now switch it off for a sitting (?coach=off, a ☰ row
  // like every other table toggle). Off means off: the whole panel goes, its
  // expensive server-side build is skipped, and the table takes the stage
  // alone, centred on white.
  const coachOff = coachParam === "off";
  const showCoach = canCoach && !coachOff;
  // The coach payload (his engine): the facts layer (looking) and the reasoning
  // scaffold (think), computed from THIS learner's seat. Both are null for a
  // watcher — nobody's hand to reason from — and the panel then shows its honest
  // empty state. The on-demand "What should I play?" advice is fetched
  // client-side. dealer/vul mirror what the table itself is handed. While parked,
  // `showCoach` is false so this expensive build is skipped entirely.
  const coachState = { ...state, dealer: record.board.dealer, vul: state.vul };
  // The seat they are PLAYING FROM, not the one they were dealt (origin/main's
  // takeover rule): both coach modules branch on "am I dummy" and answer
  // "nothing to decide" — under a takeover that is exactly backwards, the
  // learner is declaring and wants real help. One definition feeds BOTH coach
  // surfaces (the band's data and the Quan sheet), so they can never disagree
  // about which hand is being coached.
  const coachSeat = declaringSeat ?? mySeat;
  const coachLooking = showCoach ? lookingAt(coachState, coachSeat) : null;
  const coachAid = showCoach ? thinkAid(coachState, coachSeat) : null;
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
        looking: coachLooking,
        think: coachAid,
      }
    : undefined;

  // THE ORIGINAL COACH, WHOLE (owner direction 2026-08-05: "bring everything
  // from my original coach back"). The coach band's default screen is the Quan
  // panel's Now view — position, scaffold, advice-before-the-card, chat — and
  // the expand icon opens the entire original sheet: Now/History tabs, the
  // auction as a bidding diagram with each call's replayed meaning, every
  // trick kept, and per-event Q&A. Meanings are replayed from the compiled KB
  // exactly as the old page did — index-aligned with the auction, a lookup.
  const coachCompiled = showCoach ? await sessionService().compiledFor(record) : null;
  const coachHands = {
    N: originalHand(state, "N"),
    E: originalHand(state, "E"),
    S: originalHand(state, "S"),
    W: originalHand(state, "W"),
  };
  const coachMeanings = coachCompiled
    ? bidMeaningReader({ compiled: coachCompiled }).forAuction({
        boardRef: record.board.name,
        dealer: record.board.dealer,
        vul: state.vul,
        hands: coachHands,
        auction: state.auction,
      })
    : [];

  // THE END-OF-BOARD TAKEAWAY (owner decision 2026-08-13): once the board is
  // over, the coach's NOW screen becomes the review — a verdict chip per
  // learner call (the partnership's own system judging), the moment that
  // mattered with the solver's cost lines, and one line to remember. Null
  // whenever the system was silent on every call the learner made — a coach
  // with nothing to say says nothing, and the screen stays as it was.
  const takeaway =
    coachCompiled && boardOver && mySeat
      ? await boardTakeaway({
          record,
          vul: state.vul,
          dealtHands: coachHands,
          learnerSeat: mySeat,
          compiled: coachCompiled,
        })
      : null;
  // The takeaway's verdicts, folded onto the history's auction rows the same
  // way the meanings are — by auction index, a lookup.
  const verdictAt = new Map((takeaway?.chips ?? []).map((c) => [c.auctionIndex, c.verdict]));

  const coachGroups = coachLooking?.eventGroups.map((g) => ({
    ...g,
    events: g.events.map((e) => {
      const m =
        e.kind === "call" && e.auctionIndex !== undefined ? coachMeanings[e.auctionIndex] : undefined;
      const v =
        e.kind === "call" && e.auctionIndex !== undefined ? verdictAt.get(e.auctionIndex) : undefined;
      return {
        ...e,
        ...(m ? { detail: `${m.label}${m.shows ? ` — ${m.shows}` : ""}` } : {}),
        ...(v ? { verdict: v } : {}),
      };
    }),
  }));
  const quanCoach: CoachPanelData | undefined = showCoach
    ? {
        title: "Coach",
        ...(coachLooking ? { looking: coachLooking.looking, facts: coachLooking.facts } : {}),
        ...(coachGroups?.length ? { eventGroups: coachGroups } : {}),
        ...(coachAid ? { aid: coachAid } : {}),
        ...(takeaway ? { takeaway } : {}),
        ...(mySeat
          ? {
              ask: {
                sessionId,
                active: (state.phase === "play" || state.phase === "auction") && myTurn,
                phase: (state.phase === "play"
                  ? "play"
                  : state.phase === "auction"
                    ? "auction"
                    : "other") as "play" | "auction" | "other",
              },
            }
          : {}),
        placeholder: mySeat
          ? "Your coach's notes for this board will appear here."
          : "Take a seat to be coached — right now you're watching.",
      }
    : undefined;

  const score = scoreBoard(state);

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

  // ☰ settings menu (SettingsMenu design): each row navigates with one param
  // changed — the app's convention for table toggles. `paused` is kept so a
  // settings change doesn't remount AutoAdvance and surprise-pause the table.
  const beatMs = speed === "fast" ? 350 : speed === "slow" ? 1500 : 750;
  const settingsHref = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const current = { hands: handsParam, bboAuction, speed, view: viewParam, paused, coach: coachParam, appearance: appearanceParam };
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
    // No "Confirm bids" row (owner direction 2026-08-13): a tap on a call IS
    // the call — the staged-confirm machinery in @bridge/table-ui sits unused.
    // How a tap resolves, and how a finished trick clears. Both persist per
    // user like the appearance rows below rather than riding a search param:
    // they are preferences about how you PLAY, so they should follow you to
    // the next board and the next device without being in the URL. Each row
    // cycles its own values — one row per question, as decided.
    {
      label: "Playing a card",
      value:
        appearance.playMode === "off"
          ? "One tap"
          : appearance.playMode === "raise"
            ? "Tap to lift, tap to play"
            : "Tap for the suit",
      action: patchAppearanceAction.bind(null, sessionId, {
        playMode:
          appearance.playMode === "off"
            ? ("raise" as const)
            : appearance.playMode === "raise"
              ? ("suit" as const)
              : ("off" as const),
      }),
    },
    {
      label: "After a trick",
      value: appearance.trickPause === "tap" ? "Tap to continue" : appearance.trickPause,
      action: patchAppearanceAction.bind(null, sessionId, {
        trickPause:
          appearance.trickPause === "tap"
            ? ("1s" as const)
            : appearance.trickPause === "1s"
              ? ("2s" as const)
              : appearance.trickPause === "2s"
                ? ("3s" as const)
                : ("tap" as const),
      }),
    },
    {
      label: "Card lift",
      value:
        appearance.cardLift === "off"
          ? "Off"
          : appearance.cardLift === "subtle"
            ? "Subtle"
            : "Pronounced",
      action: patchAppearanceAction.bind(null, sessionId, {
        cardLift:
          appearance.cardLift === "off"
            ? ("subtle" as const)
            : appearance.cardLift === "subtle"
              ? ("pronounced" as const)
              : ("off" as const),
      }),
    },
    {
      label: "Group suits in hand",
      value: appearance.suitGroups ? "On" : "Off",
      action: patchAppearanceAction.bind(null, sessionId, { suitGroups: !appearance.suitGroups }),
    },
    // The coach's own switch. Only offered where the coach can exist at all
    // (table.coach) — on a table that never carries one there is nothing to
    // turn off.
    ...(canCoach
      ? [
          {
            label: "Coach panel",
            value: coachOff ? "Off" : "On",
            href: settingsHref({ coach: coachOff ? undefined : "off" }),
          },
        ]
      : []),
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
    // THE WHOLE CONFIGURATOR, at the table (owner, 2026-08-18). This row used
    // to leave for /bridge/skins; it now opens the same configurator as an
    // overlay on the felt — presets, the gallery, colours, the live preview —
    // so dressing the table never means leaving it. Gated like the quick rows
    // above it (the overlay's save is table-side too); the standalone page
    // remains for whoever holds page.skins and prefers it.
    ...(canSkinSettings
      ? [{ label: "Appearance", value: "Open", href: settingsHref({ appearance: "1" }) }]
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
      tricks={state.tricks}
      highlightSeat={complete ? (state.contract?.declarer ?? null) : state.turn}
      info={[
        { label: `NS · ${seatName("N")} & ${seatName("S")}`, value: `${state.trickCount.NS} tricks` },
        { label: `EW · ${seatName("E")} & ${seatName("W")}`, value: `${state.trickCount.EW} tricks` },
      ]}
      result={[
        { label: contractText, value: score ? `${resultLabel(score)} · ${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : "" },
      ]}
      nav={
        // The nav is the page's to size: the embedded app gets the viewer's
        // phone tier, so it gets phone-sized controls; the desktop platform
        // keeps the design's big ones.
        //
        // FROM MY GAMES there is no "⟵ table" (owner decision 2026-08-07):
        // that journey is "read the record of a finished game", the app's own
        // header arrow is the way back, and a live-table door would only
        // invite wandering into a board that's already over.
        embedded && from === "games" && complete ? undefined : embedded ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <Link
              href={settingsHref({ view: undefined })}
              style={{ height: 34, padding: "0 16px", background: "#acc5c5", border: "2px solid #f2f4f4", borderRadius: 8, color: "#000", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
            >
              ⟵ table
            </Link>
            {canStepControls && controlsAt(1)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
            <Link
              href={settingsHref({ view: undefined })}
              style={{ width: 261, height: 64, background: "#acc5c5", border: "3px solid #f2f4f4", borderRadius: 10, color: "#000", fontSize: 30, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
            >
              ⟵ table
            </Link>
            {canStepControls && controlsAt(1.9)}
          </div>
        )
      }
    />
  );

  const table = handsView ? (
    handViewer
  ) : (
    // PHONE TIER ONLY WHEN EMBEDDED (owner decisions 2026-08-06, both ways):
    // inside the coach app the table always renders the phone tier, whatever
    // the window — the tier decision in table-ui is geometric (phone = narrow
    // aspect AND width < 640), so capping the container at a phone width IS
    // the switch. On the desktop platform the cap comes off and the table
    // carries its full desktop view.
    //
    // COACH OFF, EMBEDDED: with no panel below it, a top-anchored table reads
    // as a layout with something missing. The table gets a two-thirds box
    // centred on BLACK (owner direction 2026-08-13, after seeing the cream) —
    // the felt floating in the dark, theatre-style. The phone budget scales
    // the felt to whatever box it is given, so this is composition, not
    // squeezing.
    //
    // The style override: PlayTable's phone tier paints its own wrapper
    // layers white, inline. The component belongs to another workbench right
    // now, so the page blacks out exactly those three wrapper layers from
    // the outside — !important beats an inline style, and the selectors stop
    // above mobileStack, whose own felt and cards paint over everything
    // deeper. Worst case, a structure change under this selector shows a
    // white patch again; it can never break the table.
    <div
      style={
        embedded
          ? {
              maxWidth: 480,
              height: "100%",
              margin: "0 auto",
              background: coachOff ? "#000" : "#fff",
              ...(coachOff
                ? { display: "flex", flexDirection: "column", justifyContent: "center" }
                : {}),
            }
          : { height: "100%" }
      }
    >
      {embedded && coachOff && (
        <style>{`#coach-off-stage > div, #coach-off-stage > div > div, #coach-off-stage > div > div > div { background: #000 !important; }`}</style>
      )}
      <div
        {...(embedded && coachOff ? { id: "coach-off-stage" } : {})}
        style={embedded && coachOff ? { height: "68%" } : { height: "100%" }}
      >
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
        // plate(): under a takeover "you" follows the CARDS, not the chair
        // (origin/main) — the declaring seat says "you", the dealt seat says
        // "your seat · dummy", and the declared hand plays as human.
        seats={{ N: plate("N"), E: plate("E"), S: plate("S"), W: plate("W") }}
        visible={{ N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") }}
        mySeat={mySeat}
        legalCalls={state.phase === "auction" && myTurn ? [...legalCalls(state.auction, state.turn)] : []}
        legalPlays={state.phase === "play" && myTurn ? legalPlays(state, state.turn) : []}
        myTurn={myTurn}
        boardLabel={boardNumber}
        // Embedded: no flash of the desktop-guessed table during hydration —
        // a cream beat, then the phone tier directly.
        bootNeutral={embedded}
        auctionDisplay={bboAuction === "seats" ? "seats" : "box"}
        resultLine={resultLine}
        resultScore={resultScore}
        resultDetail={resultDetail}
        // A finished challenge board draws its way onward ON the canvas — the
        // result card in the centre, not a band stacked around the table.
        completedAction={
          challenge?.done
            ? { label: `${challenge.onward.label} →`, href: challenge.onward.href }
            : undefined
        }
        completedNote={challenge?.done ? challenge.onward.note : undefined}
        controlsExtra={canStepControls ? controlsAt(1) : undefined}
        controlsExtraNarrow={canStepControls ? controlsAt(1.5) : undefined}
        railExtra={seatsPanel}
        // How a tap plays a card, and how a finished trick clears — the two
        // play preferences origin/main's table reads (persisted per user via
        // the ☰ rows above).
        playMode={appearance.playMode}
        trickPause={appearance.trickPause}
        settings={canSettingsMenu ? settings : undefined}
        viewHref={canHandsView ? { label: "Hands", href: settingsHref({ view: "hands" }) } : undefined}
        // Inside the coach app the felt runs edge to edge: no info bar (the
        // app's back arrow floats where it sat, and the coach panel narrates
        // the position). The desktop platform keeps its chips.
        hideTopBar={embedded}
        appearance={resolvedAppearance}
        showToolbars={showToolbars}
        showCoach={showCoach}
        // Off means the BAND goes too — at zero share the table-ui renders no
        // coach region at all, not a white placeholder band.
        {...(coachOff ? { coachShare: 0 } : {})}
        coach={coachData}
        {...(quanCoach ? { coachContent: <CoachDock data={quanCoach} /> } : {})}
      />
      </div>
    </div>
  );

  // With no toolbars there is no controlsExtra, and AutoAdvance lives inside it
  // — so the engine that steps the robot seats would never mount and the board
  // would sit there looking frozen. Mount it headless instead: same driver, no
  // transport buttons. Exactly one instance either way; never both.
  const headlessDriver = showToolbars ? null : (
    <AutoAdvance
      key={paused ?? "run"}
      sessionId={sessionId}
      active={!actingIsHuman && !boardOver}
      seq={record.events.length}
      complete={boardOver}
      beatMs={beatMs}
      initialPaused={Boolean(paused)}
      variant="headless"
      strictBen={Boolean(record.challenge)}
    />
  );

  return (
    <div className="mx-auto w-full">
      {/* The host app's back arrow asks this page's state before deciding
          whether leaving needs a save-or-discard prompt. */}
      <EmbedTableState sessionId={sessionId} phase={state.phase} />
      {headlessDriver}
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
      {/*
        EDGE TO EDGE ON A PHONE (owner, 2026-08-13).

        The bridge layout pads its <main> with p-3 — right for every reading
        page under it, wrong for this one. The table sizes itself from the width
        it is GIVEN, so 12px each side became a 12px white gutter around a felt
        that had shrunk to fit between them.

        The breakout goes on THIS element, the one that clips. Put on a wrapper
        inside it, the table came out 24px wider than the box meant to contain
        it, which left that box quietly scrollable sideways — a worse bug than
        the gutter. And it cannot go on the page root either: that already
        carries `mx-auto`, and two rules setting the same property are settled
        by the order Tailwind emits them, not by the order they are written.

        The rounding goes with it: a card bled to the screen edge has no corners
        to round, and keeping them cut two notches out of the felt.
      */}
      <div
        // Embedded: the WebView is the whole screen — full-bleed and EXACTLY
        // the viewport (owner direction 2026-08-08: the play screen never
        // scrolls as a page; only the coach section scrolls). On the web the
        // phone tier bleeds to the screen edge instead (-mx-3, no corners) and
        // takes back its card chrome from md up.
        className={
          embedded
            ? "overflow-hidden"
            : "-mx-3 overflow-hidden rounded-none md:mx-0 md:rounded-lg"
        }
        style={{
          height: embedded ? "100dvh" : "calc(100vh - 5.5rem)",
        }}
      >
        {/* THE ROBOTS PLAY FOR EVERYONE. AutoAdvance is both the transport
            chips AND the engine that steps AI seats; the chips are gated by
            table.step_controls, but a viewer without them must not inherit a
            board frozen at an AI's turn. Headless instance, mounted only when
            the visible one (inside controlsAt) is denied — never both. */}
        {!canStepControls && (
          <AutoAdvance
            key={paused ?? "run"}
            sessionId={sessionId}
            active={!actingIsHuman && state.phase !== "complete"}
            seq={record.events.length}
            complete={state.phase === "complete"}
            beatMs={beatMs}
            initialPaused={Boolean(paused)}
            hidden
          />
        )}
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
            done={challenge.done}
            onward={challenge.onward}
            // A puzzle's done line is its VERDICT, not the raw score — the
            // score line stays for ordinary boards. Graded with the same
            // client-safe helpers the freeze used, from the same state.
            resultLine={
              challenge.board.puzzle
                ? puzzleKind(challenge.board.puzzle) === "bidding"
                  ? gradeBiddingPuzzle(challenge.board.puzzle, state.auction)
                    ? "Solved — the authored call"
                    : "Not this time — see the answer below"
                  : state.contract &&
                      gradePlayPuzzle(
                        challenge.board.puzzle,
                        state.contract.level,
                        state.contract.declarer === "N" || state.contract.declarer === "S"
                          ? state.trickCount.NS
                          : state.trickCount.EW,
                      )
                    ? "Solved — goal met"
                    : "Not this time — see the answer below"
                : score
                  ? resultLabel(score)
                  : ""
            }
            resultScore={
              challenge.board.puzzle
                ? ""
                : score
                  ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}`
                  : ""
            }
            puzzleBrief={challenge.board.puzzle?.brief}
            puzzleExplanation={challenge.board.puzzle?.explanation}
          >
            {table}
          </ChallengeTableChrome>
        ) : (
          table
        )}
      </div>

      {/* ── the appearance configurator, AT the table (owner, 2026-08-18) ──
          The whole skins page — presets, gallery, layout, colours, live
          preview — as an overlay on the felt, so dressing the table never
          means leaving it. Same component the page mounts, same normalize-on-
          save; Close is a plain href back to this board, and Save lands there
          too with the new look already on. Gated like the ☰ rows it sits
          among (table.skin_settings), and works identically inside the app's
          WebView, which is the same page. */}
      {canSkinSettings && appearanceParam === "1" && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#faf7f2]">
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
            <header className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Appearance &amp; skins</h1>
                <p className="text-sm text-neutral-600">
                  Changes preview live and save to your account — this board wears them the
                  moment you save.
                </p>
              </div>
              <Link
                href={settingsHref({ appearance: undefined })}
                className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-400"
              >
                ✕ Close
              </Link>
            </header>
            <SkinsClient
              initial={appearance}
              save={saveTableAppearanceAction.bind(null, sessionId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
