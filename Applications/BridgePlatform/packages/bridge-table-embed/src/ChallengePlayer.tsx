"use client";

// ChallengePlayer — a solo challenge, played client-side.
//
// It composes exactly what the platform's challenge table composes
// (app/bridge/table2/[sessionId]/ChallengeTableChrome.tsx): the strip is a
// SIBLING above the table, taking its 40px as `flex: none` so PlayTable prices
// its own bands against the shorter box; the whole column is the overlay's
// offset parent, so the results sheet rises from the bottom of the frame and
// closing it returns to the exact same trick.
//
// WHAT IS DIFFERENT IS WHAT SOLO MEANS.
//
//  - THERE IS NO FIELD, so there is no leaderboard. The sheet shows YOUR LINE
//    AND BEN'S, board by board, in a two-column scorecard. An empty standings
//    table would be a promise of a field that does not exist, and an
//    IMPs-vs-datum figure computed from one player is that player's own score
//    with extra steps.
//
//  - THERE IS NO SERVER, so BEN's reference line is folded here, in the page,
//    while the learner plays their own board (see benReferenceLine.ts).
//
//  - THE ATTEMPT IS STILL FROZEN. A board that is over is over: the table
//    unmounts, its result is kept, and nothing can be replayed into it. Which
//    render that happens on is `challengeBoardIsOver`'s decision and no one
//    else's — the same function the server-side freeze consults, which is why
//    a bidding-only board ends with the auction here too.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seededDeal, type GameState } from "@bridge/engine";
import {
  benHistoryHash,
  challengeBoardIsOver,
  challengeFormat,
  isBiddingOnly,
  type ChallengeFormat,
} from "@bridge/challenges";
import type { Card, Seat, Vul } from "@bridge/events";
import type { AppearanceOverrides, TableAppearance } from "@bridge/table-config";
import {
  CHALLENGE_STRIP_HEIGHT,
  ChallengeResultsOverlay,
  ChallengeStrip,
  Scorecard,
  toneColor,
  type ChallengeBoardCell,
} from "@bridge/table-ui";
import { BridgeTable, type BridgeDecide } from "./BridgeTable";
import { freezeLine, runBenReferenceLine } from "./benReferenceLine";
import {
  normalizeDraft,
  packFromDraft,
  tableControls,
  type ChallengeDraftInput,
  type SoloChallengeDraft,
} from "./challengeDraft";
import { buildSoloResults, type SoloBoardOutcome, type SoloChallengeMark } from "./soloResults";
import { ACCENT, INK, INK_FAINT, INK_MUTED, LINE, PAPER, SURFACE, UI_FONT } from "./challengeUi";

export interface ChallengePlayerProps {
  /**
   * The challenge, as <ChallengeCreator/> produced it — or the JSON a host
   * stored it as. It is normalised on the way in, so a blob written by an older
   * version of the wizard opens rather than throws.
   */
  draft: ChallengeDraftInput;
  /** The three seats the learner is not sitting in, and BEN's own line. */
  decide?: BridgeDecide;
  /** The felt's height. The strip's 40px comes out of it, not off it. */
  height?: number | string;
  appearance?: Partial<Omit<TableAppearance, "overrides">> & { overrides?: AppearanceOverrides };
  robotDelayMs?: number;
  /**
   * Run BEN's silent reference line for each board. It is what every figure on
   * the results surface is measured against, so switching it off leaves the
   * boards playable and unrated — which is the honest degradation, not a
   * fabricated comparison.
   */
  benReference?: boolean;
  /** Fires whenever completion or the mark moves. The host's progress edge. */
  onProgress?: (mark: SoloChallengeMark) => void;
  /** Fires once, when the last board is frozen. */
  onComplete?: (mark: SoloChallengeMark) => void;
}

interface PreparedBoard {
  boardNo: number;
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
}

/** The draft's boards with their packs resolved — seeds re-dealt, hand-set
 *  packs parsed. A pack that will not parse falls back to its seed. */
function prepareBoards(draft: SoloChallengeDraft): PreparedBoard[] {
  return draft.boards.map((b, i) => {
    let hands = seededDeal(b.seed);
    if (b.pack) {
      const parsed = packFromDraft(b.pack);
      if (!("error" in parsed)) hands = parsed.hands;
    }
    return {
      boardNo: i + 1,
      seed: b.seed,
      dealer: b.dealer,
      humanSeat: b.humanSeat,
      vul: b.vul ?? "none",
      hands,
    };
  });
}

export function ChallengePlayer({
  draft: input,
  decide,
  height = 520,
  appearance,
  robotDelayMs = 350,
  benReference = true,
  onProgress,
  onComplete,
}: Readonly<ChallengePlayerProps>) {
  const draft = useMemo<SoloChallengeDraft>(
    () =>
      normalizeDraft(input) ?? {
        title: "",
        description: "",
        scoring: "imps",
        boards: [],
        controlOverrides: {},
      },
    [input],
  );
  const boards = useMemo(() => prepareBoards(draft), [draft]);
  const format: ChallengeFormat = challengeFormat(draft);
  const biddingOnly = isBiddingOnly(draft);
  const { showAllHands } = tableControls(draft.controlOverrides);

  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<number, SoloBoardOutcome>>({});
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(true);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const board = boards[Math.min(index, boards.length - 1)];
  const frozen = board ? !!outcomes[board.boardNo]?.you : false;

  // ── the tier, measured with PlayTable's own rule ──────────────────────────
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth || 390;
      const h = el.clientHeight || 844;
      setPhone(w / Math.max(1, h) < 1.25 && w < 640);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── BEN, asked once per position ─────────────────────────────────────────
  // The platform keys its fairness cache on (challenge, board, history hash) so
  // identical lines meet identical opposition and a repeat position costs zero
  // BEN calls. The same key works here, with the seat's own holding standing in
  // for the board id.
  //
  // THE PROMISE IS CACHED, NOT THE ANSWER, because here the two askers are
  // simultaneous: the learner's table and the silent reference line reach the
  // same opening position at the same moment on every board, and a cache filled
  // on resolution would still pay for both. Storing the pending request halves
  // what a board costs.
  const cache = useRef(new Map<string, Promise<unknown>>());
  const cachedDecide = useMemo<BridgeDecide | undefined>(() => {
    if (!decide) return undefined;
    return async (state: GameState, seat: Seat) => {
      const key = `${state.dealer}|${seat}|${benHistoryHash({
        dealer: state.dealer,
        auction: state.auction.map((a) => ({ seat: a.seat, call: a.call })),
        play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
      })}|${state.hands[seat].length}|${state.hands[seat][0]?.suit ?? ""}${state.hands[seat][0]?.rank ?? ""}`;
      const hit = cache.current.get(key);
      if (hit) return (await hit) as Awaited<ReturnType<BridgeDecide>>;
      const inFlight = Promise.resolve(decide(state, seat));
      cache.current.set(key, inFlight);
      try {
        const answer = await inFlight;
        // A refusal is not cached: BEN was unreachable, not decided.
        if (!answer) cache.current.delete(key);
        return answer;
      } catch (e) {
        cache.current.delete(key);
        throw e;
      }
    };
  }, [decide]);

  // ── BEN's silent reference line for the open board ────────────────────────
  useEffect(() => {
    if (!benReference || !cachedDecide || !board) return;
    if (outcomes[board.boardNo]?.ben || outcomes[board.boardNo]?.benFailed) return;
    let dead = false;
    void (async () => {
      const line = await runBenReferenceLine({
        hands: board.hands,
        dealer: board.dealer,
        vul: board.vul,
        humanSeat: board.humanSeat,
        biddingOnly,
        decide: cachedDecide,
        cancelled: () => dead,
      });
      if (dead) return;
      setOutcomes((prev) => ({
        ...prev,
        [board.boardNo]: {
          boardNo: board.boardNo,
          ...prev[board.boardNo],
          ...(line ? { ben: line } : { benFailed: true }),
        },
      }));
    })();
    return () => {
      dead = true;
    };
    // `outcomes` is deliberately READ, not depended on: re-running whenever any
    // board's outcome changes — including the one this effect writes — would
    // restart the line mid-flight, forever.
  }, [benReference, cachedDecide, board?.boardNo, biddingOnly]);

  // ── the learner's own line ───────────────────────────────────────────────
  const freeze = useCallback(
    (state: GameState) => {
      if (!board) return;
      setOutcomes((prev) =>
        prev[board.boardNo]?.you
          ? prev
          : {
              ...prev,
              [board.boardNo]: {
                boardNo: board.boardNo,
                ...prev[board.boardNo],
                you: freezeLine(state, board.humanSeat, biddingOnly),
              },
            },
      );
    },
    [board, biddingOnly],
  );

  const onState = useCallback(
    (state: GameState) => {
      if (challengeBoardIsOver(state.phase, biddingOnly)) freeze(state);
    },
    [biddingOnly, freeze],
  );

  // ── the results view model ───────────────────────────────────────────────
  const view = useMemo(
    () =>
      buildSoloResults({
        format,
        scoring: draft.scoring,
        boardsTotal: boards.length,
        outcomes: Object.values(outcomes),
        ...(board ? { currentBoardNo: board.boardNo } : {}),
      }),
    [format, draft.scoring, boards.length, outcomes, board],
  );

  // The host's progress edge. Compared as JSON so a re-render that moved
  // nothing the host can see does not report again.
  const markJson = JSON.stringify(view.mark);
  const reported = useRef("");
  const completedOnce = useRef(false);
  useEffect(() => {
    if (reported.current === markJson) return;
    reported.current = markJson;
    const mark = JSON.parse(markJson) as SoloChallengeMark;
    onProgress?.(mark);
    if (mark.completed && !completedOnce.current) {
      completedOnce.current = true;
      onComplete?.(mark);
    }
    // The mark is the whole dependency; the two callbacks are the host's and
    // depending on their identity would report on every parent render.
  }, [markJson]);

  const cells: ChallengeBoardCell[] = view.squares.map((s) => ({
    boardNo: s.boardNo,
    text: s.score ?? "",
    ...(s.value === undefined ? {} : { value: s.value }),
    ...(s.tone === undefined ? {} : { tone: s.tone }),
    current: board?.boardNo === s.boardNo,
  }));

  const last = index >= boards.length - 1;
  const detail = board ? view.details[board.boardNo] : undefined;

  if (!board) {
    return (
      <div style={{ fontFamily: UI_FONT, padding: 16, color: INK_MUTED }}>
        This challenge has no boards yet.
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      style={{
        position: "relative",
        height,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#0e1a1c",
      }}
    >
      <ChallengeStrip
        title={draft.title || "Challenge"}
        boardNo={board.boardNo}
        boardsTotal={boards.length}
        showResults={view.mark.boardsDone > 0}
        height={CHALLENGE_STRIP_HEIGHT}
        onResults={() => setOpen(true)}
      />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {frozen ? (
          <BoardOver
            boardNo={board.boardNo}
            boardsTotal={boards.length}
            headline={detail?.headline ?? ""}
            sub={detail?.sub ?? ""}
            tone={detail?.tone ?? "neutral"}
            last={last}
            onNext={() => setIndex((i) => i + 1)}
            onResults={() => setOpen(true)}
          />
        ) : (
          <BridgeTable
            key={`${board.boardNo}:${board.seed}`}
            deal={board.hands}
            seed={board.seed}
            dealer={board.dealer}
            vul={board.vul}
            humanSeat={board.humanSeat}
            showAllHands={showAllHands}
            robotDelayMs={robotDelayMs}
            {...(appearance ? { appearance } : {})}
            {...(cachedDecide ? { decide: cachedDecide } : {})}
            onState={onState}
          />
        )}
      </div>

      <ChallengeResultsOverlay
        open={open}
        onClose={() => setOpen(false)}
        boards={cells}
        viewportPhone={phone}
        subtitle={view.subtitle}
      >
        <SoloSummary view={view} />
      </ChallengeResultsOverlay>
    </div>
  );
}

/** The results sheet's body: the headline, then your line beside BEN's. */
function SoloSummary({ view }: Readonly<{ view: ReturnType<typeof buildSoloResults> }>) {
  return (
    <div style={{ fontFamily: UI_FONT }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "10px 8px 12px",
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 800, color: toneColor(view.headline.tone) }}>
          {view.headline.text}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#8b9a93" }}>
            {view.unitLabel.toUpperCase()}
          </div>
          <div style={{ fontSize: 11.5, color: "#5c6b64" }}>{view.headline.sub}</div>
        </div>
      </div>
      <Scorecard columns={view.columns} rows={view.rows} totals={view.totals} />
      <div style={{ marginTop: 10, fontSize: 10.5, color: "#a2ada7", lineHeight: 1.5 }}>
        Solo — there is no field. Every figure is your board set beside BEN's on the same deal, and
        a different contract is a difference, not a mistake.
      </div>
    </div>
  );
}

/** A frozen board: what happened, how it stood beside BEN, and the way onward. */
function BoardOver({
  boardNo,
  boardsTotal,
  headline,
  sub,
  tone,
  last,
  onNext,
  onResults,
}: Readonly<{
  boardNo: number;
  boardsTotal: number;
  headline: string;
  sub: string;
  tone: "pos" | "neg" | "neutral";
  last: boolean;
  onNext: () => void;
  onResults: () => void;
}>) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#0e1a1c",
        fontFamily: UI_FONT,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          padding: 16,
          borderRadius: 14,
          background: SURFACE,
          color: INK,
          boxShadow: "0 18px 48px rgba(0,0,0,.42)",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: INK_FAINT,
          }}
        >
          Board {boardNo} of {boardsTotal} · done
        </div>
        <div style={{ marginTop: 6, fontSize: 19, fontWeight: 800, color: toneColor(tone) }}>
          {headline || "Board complete"}
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: INK_MUTED, lineHeight: 1.5 }}>{sub}</div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={onResults}
            style={{
              flex: "none",
              height: 42,
              padding: "0 14px",
              borderRadius: 9,
              border: `1px solid ${LINE}`,
              background: PAPER,
              color: INK_MUTED,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Results
          </button>
          {!last && (
            <button
              type="button"
              onClick={onNext}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 9,
                border: 0,
                background: ACCENT,
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Next board →
            </button>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: INK_FAINT }}>
          {last
            ? `All ${boardsTotal} board${boardsTotal === 1 ? "" : "s"} played`
            : `${boardsTotal - boardNo} board${boardsTotal - boardNo === 1 ? "" : "s"} left`}
        </div>
      </div>
    </div>
  );
}
