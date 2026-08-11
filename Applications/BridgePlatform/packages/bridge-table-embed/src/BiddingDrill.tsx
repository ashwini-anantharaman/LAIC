"use client";

// BiddingDrill — N bidding problems in sequence, sized for a tutorial column.
//
// The learner sees ONE hand, makes ONE call, reads the feedback, advances. There
// is no table, no felt, no toolbar and no play phase: a hand diagram, the
// auction that led to the question, a bid pad, and a comparison. That is the
// whole component, which is why it fits in a column of prose where the full
// table cannot.
//
// THE ENGINE POSES THE QUESTION. Each hand is a real GameState: initialState()
// over the seeded deal, the author's opening calls folded in through the same
// pure reducer the table uses, then passes until the learner is on turn. So the
// legal-call set is the engine's, not a guess, and the state handed to `decide`
// is indistinguishable from a live table's — which is what lets createBenDecider
// drop straight in with no adapter.
//
// BEN IS A SECOND OPINION, NOT A MARK. Feedback reads "You bid 1♠ · BEN bid
// 1NT", and says plainly when the two agree. It never says "wrong". BEN bids its
// own system, which may not be the convention the surrounding tutorial teaches,
// and a drill that contradicts its own lesson is worse than no drill at all. The
// author's note is the voice with authority here; BEN is the second reading.
//
// EVERY ANSWER IS PREFETCHED. BEN's /bid is seconds to tens of seconds, and a
// drill's hands are fixed — BEN's answer cannot depend on what the learner does,
// because the learner has not acted when it is asked. So all N are requested on
// mount, a few at a time, while the learner is still reading hand 1. A hand
// whose answer has not landed says so and STILL ADVANCES; a dead endpoint
// degrades to "BEN unavailable" with the hand and the note intact. A tutorial
// must never be wedged by an engine being slow.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEvent,
  initialState,
  legalCalls,
  seededDeal,
  type GameState,
} from "@bridge/engine";
import type { AuctionCall, Call, Card, Seat, Vul } from "@bridge/events";
import { AuctionBox, BidColumns, ResultCard, SeatDiagram } from "@bridge/table-ui";
import type { BridgeDecide } from "./BridgeTable";

/** Display order round the table, and the auction grid's columns. */
const ORDER: readonly Seat[] = ["W", "N", "E", "S"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const VUL_NAME: Record<Vul, string> = {
  none: "Neither vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable",
};

// The three text helpers below are @bridge/table-ui's tokens.ts verbatim. They
// are not on its public barrel, and this package's rule is that nothing reaches
// past a package's exports — same call benDecider.ts makes about the wire format.
const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
const isRed = (s: string) => s === "H" || s === "D";
const isBid = (c: string) => /^[1-7][CDHSN]$/.test(c);

/** The felts of the auction grid and the surfaces this drill draws on. */
const AUCTION_BG = "#dbe8e8";
const SURFACE = "#fbfbfa";
const LINE = "rgba(0,0,0,0.10)";
const INK = "#111827";
const QUIET = "#6B7280";
const ACCENT = "#2f5c8f";

/** One problem: a deal, who deals, who the learner is, and what came before. */
export interface DrillHand {
  /** The deal, derived exactly as <BridgeTable/> derives it. */
  seed?: number;
  /** Or the cards outright, when a drill teaches one specific holding. */
  deal?: Record<Seat, Card[]>;
  dealer?: Seat;
  vul?: Vul;
  /** The seat the learner holds on this hand. */
  seat?: Seat;
  /**
   * The calls BEFORE the learner's turn, starting with the dealer — so a drill
   * can pose a response or an overcall, not only an opening bid. Illegal or
   * over-long prefixes are ignored rather than trusted. Whatever is missing
   * between the prefix and the learner's turn is filled with passes, and the
   * grid shows every call, so the question is never implied.
   */
  auction?: readonly Call[];
  /** The author's word on this hand, shown with the feedback. */
  note?: string;
}

/** What the learner did on one hand, and what BEN said about it. */
export interface DrillAnswer {
  index: number;
  seat: Seat;
  seed: number | null;
  /** The learner's call. */
  yourCall: Call;
  /** BEN's call, or null when it never arrived. */
  benCall: Call | null;
  /** null when there is nothing to compare against. */
  agreed: boolean | null;
  /** How long BEN took, for a host that wants to know. */
  benMs: number | null;
}

export interface BiddingDrillProps {
  /** The problems, in order. */
  hands: readonly DrillHand[];
  /** Defaults for any hand that does not say. */
  dealer?: Seat;
  vul?: Vul;
  seat?: Seat;
  /** The judge. Same signature <BridgeTable/> takes; createBenDecider fits. */
  decide?: BridgeDecide;
  /**
   * How many BEN requests to keep in flight while prefetching. Two, measured:
   * against ben-service a COLD request is ~12s and a warm one ~0.35s, so lanes
   * mostly buy extra cold starts rather than extra answers — six hands cost
   * ~13s either way. Two lanes keep one genuinely slow hand from blocking the
   * queue behind it without paying for six cold starts.
   */
  prefetchConcurrency?: number;
  /** Fires once, when the last hand has been answered. */
  onComplete?: (answers: readonly DrillAnswer[]) => void;
}

/** A posed problem: the state the learner acts into, plus what to draw. */
interface Posed {
  seed: number | null;
  seat: Seat;
  dealer: Seat;
  vul: Vul;
  state: GameState;
  legal: string[];
  /** False when the prefix auction left no question to ask (already over). */
  askable: boolean;
  note: string;
}

const sideVul = (seat: Seat, vul: Vul) =>
  vul === "both" || vul === (seat === "N" || seat === "S" ? "ns" : "ew");

/** A call as "1♠" / "Pass" / "X", with the red suits red. */
function CallText({ call, size = 15 }: Readonly<{ call: string; size?: number }>) {
  if (!isBid(call))
    return (
      <span style={{ fontSize: size, fontWeight: 700, color: INK }}>
        {call === "P" ? "Pass" : call}
      </span>
    );
  const strain = call[1] ?? "N";
  return (
    <span style={{ fontSize: size, fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>
      {call[0]}
      <span style={{ color: isRed(strain) ? "#cc0000" : INK }}>{GLYPH[strain]}</span>
    </span>
  );
}

/**
 * Fold one DrillHand into the position the learner is asked from. Everything is
 * the engine's: the deal, the reducer, the legality. Nothing here decides what a
 * good call is — that is BEN's job and the author's, not the component's.
 */
function pose(
  hand: DrillHand,
  fallback: Readonly<{ dealer: Seat; vul: Vul; seat: Seat }>,
  index: number,
): Posed {
  const seed = hand.deal ? null : hand.seed ?? 1;
  const cards = hand.deal ?? seededDeal(seed ?? 1);
  const dealer = hand.dealer ?? fallback.dealer;
  const vul = hand.vul ?? fallback.vul;
  const seat = hand.seat ?? fallback.seat;

  let state = initialState(`drill-${index}`, dealer, vul, cards);
  let seq = 0;
  const push = (call: Call) => {
    state = applyEvent(state, {
      category: "bid-event",
      seq: (seq += 1),
      ts: 0,
      boardRef: state.boardRef,
      seat: state.turn,
      call,
      fallback: false,
    });
  };

  for (const call of hand.auction ?? []) {
    if (state.phase !== "auction" || state.turn === seat) break;
    if (!legalCalls(state.auction, state.turn).has(call)) break;
    push(call);
  }
  // Fill the gap to the learner's turn with passes. Four is the whole table, so
  // the guard can only bite on a prefix that already finished the auction.
  for (let i = 0; i < 4 && state.phase === "auction" && state.turn !== seat; i++) push("P");

  const askable = state.phase === "auction" && state.turn === seat;
  return {
    seed,
    seat,
    dealer,
    vul,
    state,
    legal: askable ? [...legalCalls(state.auction, seat)] : [],
    askable,
    note: hand.note ?? "",
  };
}

type BenStatus = "off" | "pending" | "ready" | "failed";
interface BenAnswer {
  status: BenStatus;
  call: Call | null;
  ms: number | null;
}

export function BiddingDrill({
  hands,
  dealer = "N",
  vul = "none",
  seat = "S",
  decide,
  prefetchConcurrency = 2,
  onComplete,
}: Readonly<BiddingDrillProps>) {
  // ── the posed problems ─────────────────────────────────────────────────────
  // Cached on a SIGNATURE, not on the array's identity: a host that rebuilds its
  // config object every render (they all do) would otherwise re-pose every hand
  // and, worse, re-fire every prefetch — a render loop that hammers BEN.
  const sig = useMemo(
    () =>
      JSON.stringify([
        dealer,
        vul,
        seat,
        hands.map((h) => [h.seed ?? null, h.dealer ?? null, h.vul ?? null, h.seat ?? null, h.auction ?? null, h.note ?? "", h.deal ? Object.values(h.deal).flat().length : 0]),
      ]),
    [hands, dealer, vul, seat],
  );
  const cache = useRef<{ sig: string; list: Posed[] }>({ sig: "", list: [] });
  if (cache.current.sig !== sig)
    cache.current = { sig, list: hands.map((h, i) => pose(h, { dealer, vul, seat }, i)) };
  const posed = cache.current.list;

  // ── prefetch ──────────────────────────────────────────────────────────────
  // `decide` lives in a ref so an inline arrow from a careless host cannot
  // restart the whole prefetch on every render; only the hands can.
  const decideRef = useRef(decide);
  decideRef.current = decide;
  const hasDecide = !!decide;
  const [ben, setBen] = useState<Record<number, BenAnswer>>({});

  useEffect(() => {
    const list = cache.current.list;
    const off: Record<number, BenAnswer> = {};
    for (let i = 0; i < list.length; i++)
      off[i] = { status: hasDecide && list[i]!.askable ? "pending" : "off", call: null, ms: null };
    setBen(off);
    if (!hasDecide) return;

    let cancelled = false;
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (cancelled || i >= list.length) return;
        const p = list[i]!;
        if (!p.askable) continue;
        const t0 = Date.now();
        try {
          const answer = await decideRef.current?.(p.state, p.seat);
          if (cancelled) return;
          const ms = Date.now() - t0;
          setBen((b) => ({
            ...b,
            [i]: answer?.call
              ? { status: "ready", call: answer.call, ms }
              : { status: "failed", call: null, ms },
          }));
        } catch {
          if (cancelled) return;
          setBen((b) => ({ ...b, [i]: { status: "failed", call: null, ms: Date.now() - t0 } }));
        }
      }
    };
    const lanes = Math.max(1, Math.min(prefetchConcurrency, list.length));
    void Promise.all(Array.from({ length: lanes }, () => worker()));
    return () => {
      cancelled = true;
    };
  }, [sig, hasDecide, prefetchConcurrency]);

  // ── where the learner is ──────────────────────────────────────────────────
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Call>>({});
  const [staged, setStaged] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const restart = useCallback(() => {
    setIndex(0);
    setAnswers({});
    setStaged(null);
    setFinished(false);
    fired.current = false;
  }, []);
  // A new set of hands is a new drill.
  const lastSig = useRef(sig);
  if (lastSig.current !== sig) {
    lastSig.current = sig;
    if (index !== 0 || finished || Object.keys(answers).length) restart();
  }

  const summary: DrillAnswer[] = useMemo(
    () =>
      posed.flatMap((p, i) => {
        const yourCall = answers[i];
        if (!yourCall) return [];
        const b = ben[i];
        const benCall = b?.status === "ready" ? b.call : null;
        return [
          {
            index: i,
            seat: p.seat,
            seed: p.seed,
            yourCall,
            benCall,
            agreed: benCall ? benCall === yourCall : null,
            benMs: b?.ms ?? null,
          },
        ];
      }),
    [posed, answers, ben],
  );

  const fired = useRef(false);
  useEffect(() => {
    if (!finished || fired.current) return;
    fired.current = true;
    onComplete?.(summary);
  }, [finished, summary, onComplete]);

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
  // Side by side once there is room for a readable hand AND the pad; stacked below
  // that. HAND_MIN is what "A K J 10 9 7 4" needs before it starts wrapping mid
  // suit, which looks like a different holding.
  const HAND_MIN = 280;
  const PAD = 14;
  const GAP = 14;
  const wide = width >= HAND_MIN + GAP + 240 + PAD * 2;
  // A pad column is `cell` wide plus its box padding, borders and gaps. Solve that
  // back for the cell the leftover space allows, then hold it in a sane range.
  const forPad = (wide ? width - PAD * 2 - GAP - HAND_MIN : width - PAD * 2) - 6;
  const cell = Math.max(26, Math.min(46, Math.floor((forPad - 70) / 5.65)));
  /**
   * The ask column is FIXED at the pad's own width, not left to grow. Letting it
   * size to its content meant the feedback's prose — longer than the pad — stole
   * the hand's width the moment a call was made, and the hand the learner had just
   * bid re-wrapped into a narrow ribbon behind the answer. It also keeps the
   * layout still between question and feedback, which are the same column.
   */
  const askWidth = 5 * (cell + 14) + 4 * Math.round(cell * 0.13);

  if (posed.length === 0)
    return (
      <div style={{ padding: 16, fontSize: 13, color: QUIET, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12 }}>
        This drill has no hands yet.
      </div>
    );

  const here = posed[Math.min(index, posed.length - 1)]!;
  const answered = answers[index] ?? null;
  const benHere = ben[index];

  // ── the auction that led to the question ─────────────────────────────────
  const rows: (AuctionCall | null)[][] = [];
  {
    const padded: (AuctionCall | null)[] = [
      ...Array.from({ length: ORDER.indexOf(here.dealer) }, () => null),
      ...here.state.auction,
      // The learner's own call, once made, belongs in the grid like any other.
      ...(answered ? [{ seat: here.seat, call: answered } as AuctionCall] : []),
    ];
    for (let i = 0; i < padded.length; i += 4) rows.push(padded.slice(i, i + 4));
  }

  const heads = ORDER.map((s) => ({ seat: s, vul: sideVul(s, here.vul), isDealer: s === here.dealer }));

  const dots = (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {posed.map((_, i) => (
        <span
          key={i}
          title={`Hand ${i + 1}`}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: answers[i] ? ACCENT : "transparent",
            border: `1.5px solid ${i === index && !finished ? ACCENT : "rgba(0,0,0,0.22)"}`,
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );

  // ── the comparison ───────────────────────────────────────────────────────
  const comparison = () => {
    if (!answered) return null;
    const agreed = benHere?.status === "ready" && benHere.call === answered;
    return (
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: QUIET }}>
          <span>You bid</span>
          <CallText call={answered} size={17} />
          {benHere?.status === "ready" && benHere.call ? (
            agreed ? (
              <span style={{ color: "#1a7f4b", fontWeight: 600 }}>— BEN bids that too.</span>
            ) : (
              <>
                <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
                <span>BEN bid</span>
                <CallText call={benHere.call} size={17} />
              </>
            )
          ) : benHere?.status === "pending" ? (
            <>
              <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
              <span style={{ fontStyle: "italic" }}>BEN is still working on this hand…</span>
            </>
          ) : benHere?.status === "failed" ? (
            <>
              <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
              <span>BEN unavailable</span>
            </>
          ) : null}
        </div>
        {here.note && (
          <p style={{ fontSize: 13, lineHeight: 1.45, color: INK, marginTop: 8, marginBottom: 0 }}>{here.note}</p>
        )}
        <button
          type="button"
          onClick={() => (index + 1 < posed.length ? setIndex(index + 1) : setFinished(true))}
          style={{
            marginTop: 12,
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
          {index + 1 < posed.length ? `Next hand →` : "See how you did"}
        </button>
      </div>
    );
  };

  // ── the end ──────────────────────────────────────────────────────────────
  if (finished) {
    const judged = summary.filter((a) => a.benCall);
    const matched = judged.filter((a) => a.agreed).length;
    return (
      <div ref={wrap} style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ResultCard
            line="Drill complete"
            score={judged.length ? `Same call as BEN on ${matched} of ${judged.length}` : ""}
            detail={`${summary.length} hand${summary.length === 1 ? "" : "s"} bid`}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          {summary.map((a) => (
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
              <span style={{ width: 58, flex: "none" }}>Hand {a.index + 1}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span>you</span>
                <CallText call={a.yourCall} />
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
                <span>BEN</span>
                {a.benCall ? <CallText call={a.benCall} /> : <span style={{ fontStyle: "italic" }}>unavailable</span>}
              </span>
              {a.agreed && <span style={{ marginLeft: "auto", color: "#1a7f4b", fontWeight: 700 }}>same</span>}
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
        <p style={{ fontSize: 11.5, color: QUIET, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }}>
          BEN is a neural engine bidding its own system. Where it differs from you, read it as a
          second opinion — not a correction.
        </p>
      </div>
    );
  }

  // ── one hand ─────────────────────────────────────────────────────────────
  const handColumn = (
    <div style={{ flex: wide ? "1 1 0" : undefined, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <SeatDiagram cards={here.state.hands[here.seat]} panelBg="#fff" width="100%" font={20} suitW={18} pad="6px 10px" />
      <div style={{ display: "flex", justifyContent: wide ? "flex-start" : "center" }}>
        <AuctionBox
          bg={AUCTION_BG}
          m={{ width: 236, height: "auto", headFont: 16, cellFont: 15, radius: 6, cellMinH: 20 }}
          heads={heads}
          rows={rows}
          dealerCol={ORDER.indexOf(here.dealer)}
          emptyText={rows.length === 0 ? `${here.dealer === here.seat ? "You deal" : `${here.dealer} deals`}` : null}
        />
      </div>
    </div>
  );

  const askColumn = (
    <div
      style={{
        flex: wide ? `0 0 ${askWidth}px` : undefined,
        width: wide ? askWidth : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {!here.askable ? (
        <p style={{ fontSize: 13, color: QUIET, textAlign: "center", margin: 0 }}>
          This hand's auction is already over — nothing to bid.
        </p>
      ) : answered ? null : (
        <>
          <span style={{ fontSize: 12, color: QUIET, alignSelf: "flex-start" }}>
            {staged ? "Confirm your call" : "Your call?"}
          </span>
          <BidColumns
            cell={cell}
            radius={6}
            legalCalls={here.legal}
            live
            pending={staged}
            onStage={setStaged}
            onConfirm={() => {
              if (!staged) return;
              setAnswers((a) => ({ ...a, [index]: staged as Call }));
              setStaged(null);
            }}
            onCancel={() => setStaged(null)}
          />
        </>
      )}
      {(answered || !here.askable) && (
        <div style={{ width: "100%" }}>
          {answered ? (
            comparison()
          ) : (
            <button
              type="button"
              onClick={() => (index + 1 < posed.length ? setIndex(index + 1) : setFinished(true))}
              style={{ height: 34, padding: "0 14px", border: `1px solid ${LINE}`, borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Skip this hand →
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div ref={wrap} style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
      {/* Counter and dots sit TOGETHER on the left. Pushed apart they ran under
          whatever the host floats in the top-right corner — a close button, in the
          first place this drill was embedded — and a progress dot you cannot see
          is not progress. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
          Hand {index + 1} of {posed.length}
        </span>
        {dots}
      </div>
      <p style={{ fontSize: 12, color: QUIET, margin: "0 0 10px" }}>
        You are {SEAT_NAME[here.seat]} · {VUL_NAME[here.vul]}
      </p>
      <div style={{ display: "flex", flexDirection: wide ? "row" : "column", gap: 14, alignItems: "flex-start" }}>
        {handColumn}
        {askColumn}
      </div>
      <p style={{ fontSize: 11.5, color: QUIET, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }}>
        BEN is a neural engine bidding its own system. Where it differs from you, read it as a second
        opinion — not a correction.
      </p>
    </div>
  );
}
