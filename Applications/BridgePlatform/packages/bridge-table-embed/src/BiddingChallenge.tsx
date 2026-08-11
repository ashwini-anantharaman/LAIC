"use client";

// BiddingChallenge — the opening-bid drill. One hand, one call, the AUTHOR's
// answer, and the author's reason in the author's own words.
//
// THIS COMPONENT NEVER CALLS BEN. Not as a fallback, not as a second opinion,
// not behind a prop. <BiddingDrill/> beside it does exactly that and says so on
// screen, which is right for a drill whose question is "what would a strong
// engine do here". This one asks a different question: "what does the lesson
// above you teach". BEN bids its own system — it opens hands this set passes and
// passes hands this set opens — so an engine's call rendered next to the
// author's would be a second authority contradicting the first, in a component
// whose whole purpose is to reinforce one. There is no `decide` prop to pass and
// no network call to make: openingBidDrill.ts judges an answer by comparing two
// strings, and that is the whole of it.
//
// THE HAND IS DRAWN BY table-ui, not by this file. SeatDiagram is the same panel
// the felt table uses for a seat, so a hand in the drill and the same hand at the
// table are the same picture — the red suits, the ten as "10", the suit order.
// The bidding pad is BidColumns, the pad the table itself bids with, so the
// learner answers the drill with the control they will answer a board with. A
// drill that invents its own buttons teaches its own buttons.
//
// THE DATA'S FAULTS ARE ON SCREEN, not swallowed. Five of the authored hands
// arrived a card short (6, 9, 10, 17, 21) and several notes stated a point count
// the cards did not hold. The author has since completed them — openingBidHands.ts
// records every card added and the one CHANGED — so `validateDrillHands` finds
// nothing today and this component says nothing. That is the notice working, not
// the notice being absent: a set with a twelve-card hand in it, whoever supplies
// it, gets an amber panel naming the hand, an inline line under the diagram
// saying the picture is incomplete, and a drill that RUNS anyway — the taught
// call never depended on the missing card. Nothing here crashes on bad data and
// nothing here hides it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { legalCalls } from "@bridge/engine";
import { BidColumns, bidColumnsH, ResultCard, SeatDiagram } from "@bridge/table-ui";
import {
  OPENING_BID_HANDS,
  hcp,
  validateDrillHands,
  type DrillHand,
  type DrillHandProblem,
} from "./openingBidHands";
import {
  judgeHand,
  markAnswers,
  normalizeCall,
  type BiddingChallengeAnswer,
  type BiddingChallengeMark,
} from "./openingBidDrill";

/**
 * The legal set for an OPENING call, out of the engine rather than typed here:
 * an empty auction has no bid to overcall and nothing to double, so
 * `legalCalls` returns pass plus all thirty-five contract bids. The engine
 * answers this without a deal, which matters — a drill hand is one hand, and
 * five of them are a card short, so there is no GameState to build.
 */
const OPENING_CALLS: readonly string[] = [...legalCalls([], "S")];

// table-ui's tokens.ts verbatim; they are not on its public barrel and this
// package does not reach past a package's exports. Same call BiddingDrill makes.
const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
const isRed = (s: string) => s === "H" || s === "D";
const isBid = (c: string) => /^[1-7][CDHSN]$/.test(c);

const SURFACE = "#fbfbfa";
const LINE = "rgba(0,0,0,0.10)";
const INK = "#111827";
const QUIET = "#6B7280";
const ACCENT = "#2f5c8f";
const RIGHT = "#1a7f4b";
const WRONG = "#b4451c";
/** The author-notice amber: a warning about the data, not about the learner. */
const WARN_INK = "#8a5a00";
const WARN_BG = "#fff8e6";
const WARN_LINE = "rgba(180,130,0,0.35)";

export interface BiddingChallengeProps {
  /**
   * The hands, in order. Defaults to the authored set so the drill is a drill
   * with no configuration at all; an author with their own set passes it here
   * and everything below — the judging, the notice, the mark — reads theirs.
   */
  hands?: readonly DrillHand[];
  /** Ask only the first N. Anything ≤ 0 or absent asks the whole set. */
  limit?: number;
  /**
   * Show the aggregate "this data has problems" notice. True by default: a
   * component that knows its hands are broken should say so wherever it is
   * mounted. A host that has its own author-facing surface for it — the
   * learning platform prints it in the block's Configure panel — turns it off
   * for readers, who are told about the hand in front of them either way.
   */
  showDataNotice?: boolean;
  /** Fires after every answer, with the running mark. */
  onProgress?: (mark: BiddingChallengeMark) => void;
  /** Fires once, when the last hand has been answered. */
  onComplete?: (
    mark: BiddingChallengeMark,
    answers: readonly BiddingChallengeAnswer[],
  ) => void;
}

/** A call as "1♠" / "Pass", with the red suits red. */
function CallText({ call, size = 15, tone = INK }: Readonly<{ call: string; size?: number; tone?: string }>) {
  const c = normalizeCall(call);
  if (!isBid(c))
    return <span style={{ fontSize: size, fontWeight: 700, color: tone }}>{c === "P" ? "Pass" : c}</span>;
  const strain = c[1] ?? "N";
  return (
    <span style={{ fontSize: size, fontWeight: 700, color: tone, whiteSpace: "nowrap" }}>
      {c[0]}
      <span style={{ color: isRed(strain) ? "#cc0000" : tone }}>{GLYPH[strain]}</span>
    </span>
  );
}

/** The problems `validateDrillHands` found, as one non-fatal paragraph. */
function DataNotice({ problems }: Readonly<{ problems: readonly DrillHandProblem[] }>) {
  const short = problems.filter((p) => p.kind === "short");
  const points = problems.filter((p) => p.kind === "hcp");
  return (
    <div
      style={{
        background: WARN_BG,
        border: `1px solid ${WARN_LINE}`,
        borderRadius: 10,
        padding: "8px 10px",
        marginBottom: 10,
        fontSize: 12,
        lineHeight: 1.45,
        color: WARN_INK,
      }}
    >
      <strong style={{ fontWeight: 700 }}>This hand set needs patching.</strong>{" "}
      {short.length > 0 && (
        <>
          {short.length} hand{short.length === 1 ? " is" : "s are"} short of thirteen cards (
          {short.map((p) => `#${p.no} — ${p.detail}`).join("; ")}), so the hand DRAWN below is
          incomplete. The taught call is unaffected, and the drill runs.{" "}
        </>
      )}
      {points.length > 0 && (
        <>
          {points.length} note{points.length === 1 ? "" : "s"} state a point count the cards do not
          hold ({points.map((p) => `#${p.no} — ${p.detail}`).join("; ")}).
        </>
      )}
    </div>
  );
}

export function BiddingChallenge({
  hands = OPENING_BID_HANDS,
  limit,
  showDataNotice = true,
  onProgress,
  onComplete,
}: Readonly<BiddingChallengeProps>) {
  const asked = useMemo(
    () => (limit && limit > 0 ? hands.slice(0, limit) : hands.slice()),
    [hands, limit],
  );
  // Validate the WHOLE set the author supplied, not the slice being asked: an
  // author who shortened the drill to five hands still needs to know that hand
  // 17 is broken, because the fix belongs in the data, not in the slice.
  const problems = useMemo(() => validateDrillHands([...hands]), [hands]);

  // A different set — or a different length of the same set — is a different
  // drill, and answers from the old one do not belong to it.
  const sig = useMemo(
    () => JSON.stringify(asked.map((h) => [h.no, h.bid, h.hand.length])),
    [asked],
  );

  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<Record<number, string>>({});
  const [staged, setStaged] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const fired = useRef(false);

  const restart = useCallback(() => {
    setIndex(0);
    setGiven({});
    setStaged(null);
    setFinished(false);
    fired.current = false;
  }, []);
  const lastSig = useRef(sig);
  if (lastSig.current !== sig) {
    lastSig.current = sig;
    if (index !== 0 || finished || Object.keys(given).length) restart();
  }

  const answers = useMemo<BiddingChallengeAnswer[]>(
    () =>
      asked.flatMap((h, i) => {
        const call = given[i];
        return call ? [judgeHand(h, i, call)] : [];
      }),
    [asked, given],
  );
  const mark = useMemo(() => markAnswers(answers, asked.length), [answers, asked.length]);

  // The host hears about every answer, and about completion exactly once — the
  // same contract <ChallengePlayer/> has, so a host that reports one reports
  // the other with the same code.
  const progressSink = useRef(onProgress);
  progressSink.current = onProgress;
  const completeSink = useRef(onComplete);
  completeSink.current = onComplete;
  useEffect(() => {
    if (mark.handsDone === 0 && !finished) return;
    progressSink.current?.(mark);
  }, [mark, finished]);
  useEffect(() => {
    if (!finished || fired.current) return;
    fired.current = true;
    completeSink.current?.(mark, answers);
  }, [finished, mark, answers]);

  // ── width ────────────────────────────────────────────────────────────────
  const wrap = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth || 560);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Same geometry as <BiddingDrill/>: side by side once a readable hand and the
  // pad both fit, stacked below that, and the ask column pinned to the pad's
  // width so the layout does not shift between question and answer.
  const HAND_MIN = 260;
  const PAD = 12;
  const GAP = 12;
  const wide = width >= HAND_MIN + GAP + 230 + PAD * 2;
  const forPad = (wide ? width - PAD * 2 - GAP - HAND_MIN : width - PAD * 2) - 6;
  // Capped well below the pad's design 46: this drill asks for ONE call in a
  // block sitting inside a lesson, not a hand of bridge on a table, and every
  // px the pad gains is a px the reserved slot below gains on all 25 hands.
  const cell = Math.max(24, Math.min(34, Math.floor((forPad - 70) / 5.65)));
  const askWidth = 5 * (cell + 14) + 4 * Math.round(cell * 0.13);
  // ONE HEIGHT FOR THE ASK, WHATEVER IS IN IT. The pad, the pad plus its
  // Confirm row, and the verdict card are three different heights, and letting
  // the column take each in turn made the whole block jump twice per hand and
  // 50 times per run. The slot is priced at the tallest of them — the pad with
  // Confirm showing — so staging a call fills reserved space instead of
  // pushing, and the verdict lands in the box the pad left. `bidColumnsH` is
  // the pad's own arithmetic, exported so this number cannot drift from it.
  const ASK_LABEL = 24;
  const askSlot = ASK_LABEL + bidColumnsH(cell, { pending: true });
  // The hand takes the column it is given. Reserving the ask slot leaves the
  // left column short of it, and a small diagram floating over dead felt reads
  // as a bug; a big one reads as the point of the screen. Thirteen ranks plus a
  // suit glyph is the widest row a hand can have, so the width over that is the
  // largest font that still cannot wrap.
  const handW = wide ? width - PAD * 2 - GAP - askWidth : width - PAD * 2;
  const handFont = Math.max(17, Math.min(28, Math.floor(handW / 13)));

  if (asked.length === 0)
    return (
      <div style={{ padding: 16, fontSize: 13, color: QUIET, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12 }}>
        This drill has no hands yet.
      </div>
    );

  const here = asked[Math.min(index, asked.length - 1)]!;
  const verdict = answers.find((a) => a.index === index) ?? null;
  const points = hcp(here.hand);
  const shortBy = 13 - here.hand.length;

  const dots = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      {asked.map((_, i) => {
        const a = answers.find((x) => x.index === i);
        return (
          <span
            key={i}
            title={`Hand ${i + 1}`}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: a ? (a.matched ? RIGHT : WRONG) : "transparent",
              border: `1.5px solid ${i === index && !finished ? ACCENT : "rgba(0,0,0,0.22)"}`,
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );

  const advance = () => (index + 1 < asked.length ? setIndex(index + 1) : setFinished(true));

  // ── the end ──────────────────────────────────────────────────────────────
  if (finished)
    return (
      <div ref={wrap} style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ResultCard
            line="Drill complete"
            score={`${mark.matched} of ${mark.handsDone} matched`}
            detail={`the author's opening bid · ${mark.percent}%`}
          />
        </div>
        <div style={{ marginTop: 12, maxHeight: 240, overflowY: "auto" }}>
          {answers.map((a) => (
            <div
              key={a.index}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "7px 4px",
                borderTop: `1px solid ${LINE}`,
                fontSize: 13,
                color: QUIET,
              }}
            >
              <span style={{ width: 58, flex: "none" }}>Hand {a.no}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span>you</span>
                <CallText call={a.yourCall} tone={a.matched ? RIGHT : WRONG} />
              </span>
              {!a.matched && (
                <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
                  <span>the book</span>
                  <CallText call={a.authorCall} />
                </span>
              )}
              <span style={{ marginLeft: "auto", color: a.matched ? RIGHT : WRONG, fontWeight: 700 }}>
                {a.matched ? "match" : "no"}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={restart}
          style={{
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            background: "#fff",
            color: INK,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Bid them again
        </button>
        {showDataNotice && problems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <DataNotice problems={problems} />
          </div>
        )}
      </div>
    );

  // ── one hand ─────────────────────────────────────────────────────────────
  const handColumn = (
    <div style={{ flex: wide ? "1 1 0" : undefined, minWidth: 0, alignSelf: wide ? "stretch" : undefined, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
      <SeatDiagram cards={here.hand} panelBg="#fff" width="100%" font={handFont} suitW={Math.round(handFont * 0.9)} pad="6px 10px" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, color: QUIET }}>
        <span style={{ fontWeight: 700, color: INK }}>{points} HCP</span>
        <span>{here.hand.length} cards</span>
      </div>
      {shortBy > 0 && (
        <p style={{ fontSize: 11.5, lineHeight: 1.4, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 8, padding: "6px 8px", margin: 0 }}>
          This hand was supplied {shortBy === 1 ? "one card" : `${shortBy} cards`} short, so the
          diagram is incomplete. The opening call it teaches is unaffected — bid it as it stands.
        </p>
      )}
    </div>
  );

  // ── the verdict ──────────────────────────────────────────────────────────
  const feedback = verdict && (
    // height:100% + the button on `marginTop:auto` — the card fills the slot the
    // pad vacated and puts "Next hand" on the slot's bottom edge, so it is in
    // the same place on every one of the 25 hands rather than wherever this
    // hand's reason happened to end.
    <div style={{ flex: 1, minHeight: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: QUIET }}>
        <span>You bid</span>
        <CallText call={verdict.yourCall} size={17} tone={verdict.matched ? RIGHT : INK} />
        {verdict.matched ? (
          <span style={{ color: RIGHT, fontWeight: 700 }}>— that is the opening bid.</span>
        ) : (
          <>
            <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
            <span>the opening bid is</span>
            <CallText call={verdict.authorCall} size={17} tone={WRONG} />
          </>
        )}
      </div>
      {/* The author's own words, verbatim — not paraphrased, not recomputed. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.4, color: INK, marginTop: 6, marginBottom: 0 }}>
        {here.why}
      </p>
      <button
        type="button"
        onClick={advance}
        style={{
          marginTop: "auto",
          alignSelf: "flex-start",
          height: 38,
          padding: "0 18px",
          border: 0,
          borderRadius: 8,
          background: ACCENT,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {index + 1 < asked.length ? "Next hand →" : "See how you did"}
      </button>
    </div>
  );

  const askColumn = (
    <div
      style={{
        flex: wide ? `0 0 ${askWidth}px` : undefined,
        width: wide ? askWidth : "100%",
        minHeight: askSlot,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 6,
      }}
    >
      {verdict ? (
        <div style={{ width: "100%", flex: 1, minHeight: 0, display: "flex" }}>{feedback}</div>
      ) : (
        <>
          <span style={{ fontSize: 12, lineHeight: `${ASK_LABEL - 6}px`, color: QUIET, alignSelf: "flex-start" }}>
            {staged ? "Confirm your call" : "Your opening call?"}
          </span>
          <BidColumns
            cell={cell}
            radius={6}
            legalCalls={OPENING_CALLS}
            live
            pending={staged}
            onStage={setStaged}
            onConfirm={() => {
              if (!staged) return;
              setGiven((g) => ({ ...g, [index]: staged }));
              setStaged(null);
            }}
            onCancel={() => setStaged(null)}
          />
        </>
      )}
    </div>
  );

  return (
    <div ref={wrap} style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: PAD }}>
      {/* Counter and dots together on the LEFT, clear of whatever the host floats
          in the top-right corner — the learning platform floats a Close there. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 10px", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, flex: "none" }}>
          Hand {index + 1} of {asked.length}
        </span>
        <span style={{ fontSize: 12, color: QUIET, flex: "none" }}>
          you deal, nobody vulnerable
        </span>
        {dots}
      </div>
      {showDataNotice && problems.length > 0 && <DataNotice problems={problems} />}
      <div style={{ display: "flex", flexDirection: wide ? "row" : "column", gap: GAP, alignItems: "flex-start" }}>
        {handColumn}
        {askColumn}
      </div>
    </div>
  );
}
