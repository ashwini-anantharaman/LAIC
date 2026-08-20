"use client";

// The PUZZLE POSITION editor (owner, 2026-08-19) — where a coach freezes a
// board mid-story. The story is written the only way it can be true: one legal
// action at a time. The editor folds the board's own pack through the engine
// (initialState + applyEvent, the same pure fold the table runs) and offers
// ONLY the calls and cards that are legal at the frozen point — so an illegal
// position is not caught by validation, it is simply impossible to write.
//
// The KIND falls out of the story: stop mid-auction and the learner's next
// call is the answer (a bidding puzzle — the editor insists the frozen turn is
// the learner's seat); finish the auction and the rest is played out toward a
// goal (a play puzzle). The solution control follows the kind by itself.

import { useMemo } from "react";

import {
  applyEvent,
  initialState,
  legalCalls,
  legalPlays,
  type GameState,
} from "@bridge/engine";
import { callLabel, type Call, type Card, type Seat, type Vul } from "@bridge/events";

import type { ChallengeBoardDraft } from "../draft";

type DraftPuzzle = NonNullable<ChallengeBoardDraft["puzzle"]>;

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_TEXT: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const rankText = (r: number) => RANK_TEXT[r] ?? String(r);
const cardText = (c: Card) => `${c.suit}${rankText(c.rank)}`;
const cardLabel = (c: Card) => `${SUIT_GLYPH[c.suit]}${rankText(c.rank)}`;
const NEXT_SEAT: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };

/** All levels × strains the engine could offer, in rank order — filtered by
 *  the legal set each render, so only real choices ever paint. */
const ALL_CALLS: Call[] = (() => {
  const out: Call[] = [];
  for (let level = 1; level <= 7; level++)
    for (const strain of ["C", "D", "H", "S", "N"]) out.push(`${level}${strain}` as Call);
  return out;
})();

export function emptyPuzzle(): DraftPuzzle {
  return { auction: [], play: [], brief: "", solution: { kind: "call", call: "P" }, explanation: "" };
}

export function PuzzleEditor({
  boardNo,
  dealer,
  vul,
  hands,
  humanSeat,
  value,
  onChange,
}: Readonly<{
  boardNo: number;
  dealer: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
  humanSeat: Seat;
  value: DraftPuzzle;
  onChange: (next: DraftPuzzle) => void;
}>) {
  // THE FOLD. The story replayed onto this board's actual pack — never a
  // parallel bookkeeping that could disagree with the table's.
  const folded = useMemo(() => {
    let state: GameState = initialState(`draft#${boardNo}`, dealer, vul, hands);
    let seq = 0;
    const base = { ts: 0, boardRef: `draft#${boardNo}`, fallback: false } as const;
    try {
      for (const a of value.auction) {
        state = applyEvent(state, {
          ...base,
          seq: seq++,
          category: "bid-event",
          seat: a.seat,
          call: a.call as Call,
        });
      }
      for (const p of value.play) {
        const rank = p.card.slice(1);
        const card: Card = {
          suit: p.card[0] as Card["suit"],
          rank: (rank === "A" ? 14 : rank === "K" ? 13 : rank === "Q" ? 12 : rank === "J" ? 11 : rank === "T" ? 10 : Number(rank)) as Card["rank"],
        };
        state = applyEvent(state, {
          ...base,
          seq: seq++,
          category: "play-event",
          seat: p.seat,
          card,
        });
      }
      return { state, broken: false };
    } catch {
      // A story that no longer replays (the pack was re-dealt under it) —
      // offer only the reset, never a picker computed from a lie.
      return { state: initialState(`draft#${boardNo}`, dealer, vul, hands), broken: true };
    }
  }, [boardNo, dealer, vul, hands, value.auction, value.play]);

  const { state, broken } = folded;
  const inAuction = state.phase === "auction";
  const bidding = inAuction; // the derived KIND, live
  const turn = state.turn;

  const patch = (p: Partial<DraftPuzzle>) => onChange({ ...value, ...p });

  const appendCall = (call: Call) =>
    patch({
      auction: [...value.auction, { seat: turn, call }],
      // The kind may have just flipped (auction settled) — keep the solution
      // control coherent with it.
      ...(call === "P" &&
      value.auction.length >= 3 &&
      value.auction.slice(-2).every((c) => c.call === "P")
        ? { solution: { kind: "goal" } }
        : {}),
    });

  const appendCard = (card: Card) =>
    patch({ play: [...value.play, { seat: turn, card: cardText(card) }] });

  const undoLast = () =>
    value.play.length
      ? patch({ play: value.play.slice(0, -1) })
      : patch({
          auction: value.auction.slice(0, -1),
          ...(value.auction.length <= 4 ? { solution: { kind: "call", call: "P" } } : {}),
        });

  const reset = () => onChange(emptyPuzzle());

  const legalNow: { calls: Call[]; cards: Card[] } = useMemo(() => {
    if (broken || state.phase === "complete") return { calls: [], cards: [] };
    if (inAuction) {
      const set = legalCalls(state.auction, turn);
      return { calls: ["P", "X", "XX", ...ALL_CALLS].filter((c) => set.has(c)) as Call[], cards: [] };
    }
    return { calls: [], cards: legalPlays(state, turn) };
  }, [broken, state, inAuction, turn]);

  // A bidding puzzle must freeze on the LEARNER's turn — the answer is theirs
  // to give. Said here, live, rather than discovered at Create.
  const wrongTurn = bidding && !broken && turn !== humanSeat;

  const solutionCalls = useMemo(
    () =>
      bidding
        ? (["P", "X", "XX", ...ALL_CALLS].filter((c) =>
            legalCalls(state.auction, humanSeat).has(c as Call),
          ) as Call[])
        : [],
    [bidding, state.auction, humanSeat],
  );

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[11px] font-extrabold tracking-[0.08em] text-amber-700">
          🧩 PUZZLE POSITION
        </span>
        <span className="text-[11.5px] text-neutral-600">
          {broken
            ? "The story no longer fits this deal — reset it."
            : bidding
              ? `Bidding puzzle — frozen with ${turn} to call`
              : state.phase === "complete"
                ? "The story played the whole board — leave room for the solver."
                : `Play puzzle — frozen with ${turn} to play, ${state.tricks.length === 0 ? "no cards down" : `trick ${state.tricks.length}`}`}
        </span>
        <span className="flex-1" />
        {(value.auction.length > 0 || value.play.length > 0) && (
          <>
            <button
              type="button"
              onClick={undoLast}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:border-amber-400"
            >
              ← undo
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-500 hover:border-red-300 hover:text-red-700"
            >
              reset
            </button>
          </>
        )}
      </div>

      {/* The story so far, as it will read at the table. */}
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
        {value.auction.map((a, i) => (
          <span key={`a${i}`} className="rounded bg-white px-1.5 py-0.5 font-mono text-neutral-700 ring-1 ring-neutral-200">
            {a.seat}:{callLabel(a.call as Call)}
          </span>
        ))}
        {value.play.map((p, i) => (
          <span
            key={`p${i}`}
            className={`rounded bg-white px-1.5 py-0.5 font-mono ring-1 ring-neutral-200 ${
              p.card[0] === "H" || p.card[0] === "D" ? "text-red-700" : "text-neutral-800"
            }`}
          >
            {p.seat}:{SUIT_GLYPH[p.card[0]!]}{p.card.slice(1)}
          </span>
        ))}
        {value.auction.length === 0 && value.play.length === 0 && (
          <span className="text-neutral-400">Nothing yet — {dealer} deals and calls first.</span>
        )}
      </div>

      {/* Only what is LEGAL next. An empty picker means the story is whole. */}
      {!broken && (legalNow.calls.length > 0 || legalNow.cards.length > 0) && (
        <div className="mt-2">
          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-neutral-400">
            {turn} {inAuction ? "calls" : "plays"}…
          </p>
          <div className="flex flex-wrap gap-1">
            {legalNow.calls.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => appendCall(c)}
                className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-[12px] font-semibold text-neutral-700 hover:border-emerald-500 hover:text-emerald-800"
              >
                {callLabel(c)}
              </button>
            ))}
            {legalNow.cards.map((c) => (
              <button
                key={cardText(c)}
                type="button"
                onClick={() => appendCard(c)}
                className={`rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-[12px] font-semibold hover:border-emerald-500 ${
                  c.suit === "H" || c.suit === "D" ? "text-red-700" : "text-neutral-800"
                }`}
              >
                {cardLabel(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {wrongTurn && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[11.5px] text-amber-900">
          The frozen turn is {turn}&apos;s, but the learner sits {humanSeat} — a bidding puzzle
          must stop on THEIR call. Add calls until it is {humanSeat}&apos;s turn, or change the
          seat.
        </p>
      )}

      {/* The column's voice: what to solve for, and the ANSWER. */}
      <label className="mt-3 block text-[10.5px] font-bold uppercase tracking-wide text-neutral-400">
        Brief — what to solve for
      </label>
      <input
        value={value.brief}
        onChange={(e) => patch({ brief: e.target.value })}
        placeholder={bidding ? "Three passes to you. What do you call?" : "West led the ♣K. Lose only one trump trick."}
        className="mt-0.5 h-9 w-full rounded border border-neutral-300 px-2 text-[12.5px]"
      />

      <div className="mt-2">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-neutral-400">
          {bidding ? "The correct call" : "The goal"}
        </p>
        {bidding ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {solutionCalls.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={value.solution.kind === "call" && value.solution.call === c}
                onClick={() => patch({ solution: { kind: "call", call: c } })}
                className={`rounded border px-2 py-1 font-mono text-[12px] font-semibold ${
                  value.solution.kind === "call" && value.solution.call === c
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-emerald-500"
                }`}
              >
                {callLabel(c)}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
            <button
              type="button"
              aria-pressed={value.solution.kind === "goal" && !value.solution.tricks}
              onClick={() => patch({ solution: { kind: "goal" } })}
              className={`rounded border px-2.5 py-1 font-semibold ${
                value.solution.kind === "goal" && !value.solution.tricks
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-neutral-300 bg-white text-neutral-700"
              }`}
            >
              Make the contract
            </button>
            <span className="text-neutral-400">or take at least</span>
            <input
              type="number"
              min={1}
              max={13}
              value={value.solution.kind === "goal" ? (value.solution.tricks ?? "") : ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  solution:
                    Number.isInteger(n) && n >= 1 && n <= 13
                      ? { kind: "goal", tricks: n }
                      : { kind: "goal" },
                });
              }}
              className="h-8 w-16 rounded border border-neutral-300 px-2"
            />
            <span className="text-neutral-400">tricks</span>
          </div>
        )}
      </div>

      <label className="mt-2 block text-[10.5px] font-bold uppercase tracking-wide text-neutral-400">
        Answer — revealed after the attempt
      </label>
      <textarea
        value={value.explanation}
        onChange={(e) => patch({ explanation: e.target.value })}
        placeholder="Lead your king of hearts. When West takes the ace, you know East has the ace of trumps…"
        rows={3}
        className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-[12.5px] leading-relaxed"
      />
    </div>
  );
}
