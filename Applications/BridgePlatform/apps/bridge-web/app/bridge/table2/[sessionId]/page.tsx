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
import { canUse, requireFeature } from "@/lib/access";
import { getAppearance } from "@/lib/appearance";
import { benAvailable, originalHand } from "@/lib/benSeat";
import { kbStore } from "@/lib/kb";
import { libraryKindLabel } from "@/lib/libraryLabels";
import { getBridgeContext, isEmbeddedLaunch } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { lookingAt } from "@/lib/coach/looking";
import { thinkAid } from "@/lib/coach/think";
import { bidMeaningReader } from "@/lib/bidMeanings";
import type { CoachData } from "@/components/table/play/coachContent";
import { CoachDock, type CoachPanelData } from "@/components/table/play/CoachPanel";
import { patchAppearanceAction } from "./actions";

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
  // Inside the coach app's WebView the host owns the frame and the table
  // renders its phone tier; on the desktop platform it keeps the wide view.
  const embedded = await isEmbeddedLaunch();
  const [
    canSeatsPanel,
    canBenSeat,
    canWorkbenchLink,
    canUndo,
    canStepControls,
    canSettingsMenu,
    canHandsView,
    canSkinSettings,
    canSkinsPage,
    canCoach,
  ] = await Promise.all([
    canUse(context, "table.seats_panel"),
    canUse(context, "table.ben_seat"),
    canUse(context, "table.workbench_link"),
    canUse(context, "table.undo"),
    canUse(context, "table.step_controls"),
    canUse(context, "table.settings_menu"),
    canUse(context, "table.hands_view"),
    canUse(context, "table.skin_settings"),
    canUse(context, "page.skins"),
    canUse(context, "table.coach"),
  ]);
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
  const complete = state.phase === "complete";
  // Denied the hands-record view: the ?view=hands param is treated as absent —
  // UNLESS the board is complete. The gate exists so a live viewer can't peek,
  // and a finished board has nothing left to hide (canSee below already opens
  // every hand). My Games' "View board" links straight here.
  const handsView = viewParam === "hands" && (canHandsView || complete);

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

  // COACH UNPARKED (owner, 2026-08-05 post-merge: "where is my coach?"). Main
  // had parked the panel while the table chrome settled; the wires never moved,
  // so bringing it back is this one flag. Gating stays with table.coach.
  const coachParked = false;
  const showCoach = canCoach && !coachParked;
  // The coach payload (his engine): the facts layer (looking) and the reasoning
  // scaffold (think), computed from THIS learner's seat. Both are null for a
  // watcher — nobody's hand to reason from — and the panel then shows its honest
  // empty state. The on-demand "What should I play?" advice is fetched
  // client-side. dealer/vul mirror what the table itself is handed. While parked,
  // `showCoach` is false so this expensive build is skipped entirely.
  const coachState = { ...state, dealer: record.board.dealer, vul: state.vul };
  const coachLooking = showCoach ? lookingAt(coachState, mySeat) : null;
  const coachAid = showCoach ? thinkAid(coachState, mySeat) : null;
  const coachData: CoachData | undefined = showCoach
    ? {
        phase: state.phase === "auction" ? "auction" : state.phase === "play" ? "play" : "other",
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
  const coachMeanings = showCoach
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
  const coachGroups = coachLooking?.eventGroups.map((g) => ({
    ...g,
    events: g.events.map((e) => {
      const m =
        e.kind === "call" && e.auctionIndex !== undefined ? coachMeanings[e.auctionIndex] : undefined;
      return m ? { ...e, detail: `${m.label}${m.shows ? ` — ${m.shows}` : ""}` } : e;
    }),
  }));
  const quanCoach: CoachPanelData | undefined = showCoach
    ? {
        title: "Coach",
        ...(coachLooking ? { looking: coachLooking.looking, facts: coachLooking.facts } : {}),
        ...(coachGroups?.length ? { eventGroups: coachGroups } : {}),
        ...(coachAid ? { aid: coachAid } : {}),
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
        active={!actingIsHuman && state.phase !== "complete"}
        seq={record.events.length}
        complete={state.phase === "complete"}
        beatMs={beatMs}
        initialPaused={Boolean(paused)}
        variant="rail"
        railScale={s}
      />
      {canUndo && record.events.length > 0 && state.phase !== "complete" && (
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
        embedded ? (
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
        // Embedded: the WebView is the whole screen — full-bleed, and TALL
        // ENOUGH that the phone fit reaches full width. The fit prices the
        // table against box height and letterboxes when height binds (a
        // phone browser never has ~2.1× its width to give), so the canvas
        // asks for that much and the page scrolls the remainder — the table
        // region itself already tolerates overflow. Capped for tablets,
        // where 100dvh alone is plenty.
        className={embedded ? "overflow-hidden" : "overflow-hidden rounded-lg"}
        style={{
          height: embedded
            ? "max(100dvh, min(210vw, 1010px))"
            : "calc(100vh - 5.5rem)",
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
        {handsView ? (
          handViewer
        ) : (
          // PHONE TIER ONLY WHEN EMBEDDED (owner decisions 2026-08-06, both
          // ways): inside the coach app the table always renders the phone
          // tier, whatever the window — the tier decision in table-ui is
          // geometric (phone = narrow aspect AND width < 640), so capping the
          // container at a phone width IS the switch. On the desktop platform
          // the cap comes off and the table carries its full desktop view.
          <div
            style={
              embedded
                ? { maxWidth: 480, height: "100%", margin: "0 auto" }
                : { height: "100%" }
            }
          >
            <LivePlayTable
              sessionId={sessionId}
            state={{ ...state, dealer: record.board.dealer, vul: state.vul }}
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
            resultLine={score ? resultLabel(score) : ""}
            resultScore={score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : ""}
            controlsExtra={canStepControls ? controlsAt(1) : undefined}
            controlsExtraNarrow={canStepControls ? controlsAt(1.5) : undefined}
            railExtra={seatsPanel}
            settings={canSettingsMenu ? settings : undefined}
            viewHref={canHandsView ? { label: "Hands", href: settingsHref({ view: "hands" }) } : undefined}
            appearance={resolvedAppearance}
            showCoach={showCoach}
            coach={coachData}
            {...(quanCoach ? { coachContent: <CoachDock data={quanCoach} /> } : {})}
            />
          </div>
        )}
      </div>
    </div>
  );
}
