// The double dummy solver, backed by the real thing.
//
// Bo Haglund and Søren Hein's `dds` — the C++ solver essentially every bridge
// site runs — compiled to WebAssembly and reached through its raw C API. It is
// Apache-2.0, so unlike BEN (GPL, and therefore always a separate service) it
// simply ships inside the app.
//
// WHY NOT A HAND-WRITTEN ONE. Because I wrote a hand-written one first, and it
// was wrong. Alpha-beta with a transposition table is easy to get subtly wrong
// and very hard to notice: cross-checked against naive minimax on three-card
// endings it passed 45 out of 45, because three-card endings barely exercise the
// table at all. Measured properly — solve, play out its own recommendation, and
// count the tricks it actually took — it agreed with itself on 29 of 40 five-card
// endings. DDS is exact everywhere, and about 13ms for a full thirteen-trick
// deal, which a JavaScript search cannot approach: mine ran out of budget around
// trick five and had to fall back to a truncated answer.
//
// The Quan branch reached the same conclusion independently and uses this
// package for the coach's assessors; the patched dependency is shared.

import { legalPlays, type GameState } from "@bridge/engine";
import type { Card, Rank, Seat, Suit } from "@bridge/events";
import { Dds, loadDds, type DdsModule } from "bridge-dds";

/** DDS numbering: suits high-to-low, notrump is trump 4. */
const TRUMP_NO: Record<string, number> = { S: 0, H: 1, D: 2, C: 3, N: 4 };
const SUIT_NO: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
const SUIT_OF: Suit[] = ["S", "H", "D", "C"];
/** DDS seat numbering, and the clockwise order N→E→S→W a PBN deal rotates by. */
const SEAT_NO: Record<Seat, number> = { N: 0, E: 1, S: 2, W: 3 };
const CLOCKWISE: Seat[] = ["N", "E", "S", "W"];
const RANK_CH: Record<number, string> = {
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const rankChar = (r: number) => RANK_CH[r] ?? String(r);

/**
 * One shared module per process. Instantiating the WASM costs ~9ms, so it
 * happens once; the PROMISE is cached rather than the module so two concurrent
 * first-callers share one instantiation instead of racing.
 */
let modulePromise: Promise<DdsModule> | null = null;
const ddsModule = (): Promise<DdsModule> => (modulePromise ??= loadDds());

/**
 * PBN deal: `"<first>:<hand> <hand> <hand> <hand>"`, clockwise from `first`,
 * each hand written spades.hearts.diamonds.clubs, high to low.
 *
 * The rotation is load-bearing. DDS reads the hands in seat order starting at
 * the named seat, so getting it wrong does not fail — it answers confidently
 * about somebody else's cards.
 */
export function toPbn(hands: Record<Seat, Card[]>, first: Seat): string {
  const at = CLOCKWISE.indexOf(first);
  const order = [...CLOCKWISE.slice(at), ...CLOCKWISE.slice(0, at)];
  const one = (cards: Card[]) =>
    SUIT_OF.map((s) =>
      cards
        .filter((c) => c.suit === s)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => rankChar(c.rank))
        .join(""),
    ).join(".");
  return `${first}:${order.map((seat) => one(hands[seat] ?? [])).join(" ")}`;
}

export interface DdCandidate {
  card: Card;
  /** Tricks the side ON PLAY takes from here, with best play all round. */
  tricks: number;
}

export interface DdSolution {
  card: Card;
  tricks: number;
  /** Every legal card, best first. */
  candidates: DdCandidate[];
}

/**
 * Best card for `actingSeat`, seeing all four hands. Exact — there is no
 * budget, no horizon and no approximation.
 *
 * Returns null when the position is one DDS should not be asked about, rather
 * than guessing: the caller falls back and says so.
 */
export async function solvePlay(
  state: GameState,
  actingSeat: Seat,
): Promise<DdSolution | null> {
  const legal = legalPlays(state, actingSeat);
  if (!legal.length) return null;

  const open = state.tricks[state.tricks.length - 1];
  const played = open && open.plays.length < 4 ? open.plays.slice(0, 3) : [];
  const leader = played[0]?.seat ?? actingSeat;

  // DDS is not TOLD whose turn it is — it derives the seat from the trick
  // leader plus the number of cards already down. If that disagrees with the
  // seat we are asking for, it answers correctly about the WRONG HAND, which is
  // the worst thing this function could return.
  const expected = CLOCKWISE[(CLOCKWISE.indexOf(leader) + played.length) % 4];
  if (expected !== actingSeat) return null;

  // Part-way through a trick the hands are UNEVEN — the seats that have already
  // played hold one card fewer, and that is correct, not corrupt. Adding those
  // cards back is what makes the evenness check meaningful.
  const down = new Set(played.map((p) => p.seat));
  const dealt = CLOCKWISE.map((s) => state.hands[s].length + (down.has(s) ? 1 : 0));
  if (dealt.some((n) => n === 0) || new Set(dealt).size > 1) return null;

  const dds = new Dds(await ddsModule());
  const res = dds.SolveBoardPBN(
    {
      trump: TRUMP_NO[state.contract?.strain ?? "N"] ?? 4,
      first: SEAT_NO[leader],
      currentTrickSuit: [0, 1, 2].map((i) => (played[i] ? SUIT_NO[played[i]!.card.suit] : 0)),
      currentTrickRank: [0, 1, 2].map((i) => (played[i] ? played[i]!.card.rank : 0)),
      remainCards: toPbn(state.hands, actingSeat),
    },
    // target -1, solutions 3 (score every card), MODE 1.
    //
    // The mode is the one that bites. Mode 0 skips the search when there is only
    // one distinct card to play and returns a score of -2 — and "one distinct
    // card" is not rare, because DDS collapses equivalents first, so any clean
    // run of winners hits it. Mode 2 searches but REUSES THE TRANSPOSITION TABLE
    // from the previous call, which is only sound on the same deal; a memo
    // carried between positions is precisely the bug that made the hand-written
    // solver wrong, so it is not used here however tempting the speed is.
    -1,
    3,
    1,
  );

  const scored: DdCandidate[] = [];
  for (let i = 0; i < res.cards; i++) {
    const suit = SUIT_OF[res.suit[i]!]!;
    const tricks = res.score[i]!;
    scored.push({ card: { suit, rank: res.rank[i]! as Rank }, tricks });
    // DDS returns only the best card of each equivalence class, plus a bitmask
    // of the lower cards that play identically (bit r = the card of rank r).
    for (let r = 2; r <= 14; r++) {
      if (res.equals[i]! & (1 << r)) scored.push({ card: { suit, rank: r as Rank }, tricks });
    }
  }

  // A NEGATIVE COUNT IS NOT AN ANSWER. DDS uses them as signals — -1 for "target
  // not reached", -2 for "not searched" — and they are ordinary numbers, so they
  // sort and subtract like real ones and flow straight into a plausible-looking
  // verdict. Refusing here is the difference between falling back and being wrong.
  if (scored.some((s) => s.tricks < 0)) return null;

  // DDS answers about the position; legality is ours to reconcile.
  const allowed = new Set(legal.map((c) => `${c.suit}${c.rank}`));
  const usable = scored.filter((s) => allowed.has(`${s.card.suit}${s.card.rank}`));
  if (!usable.length) return null;

  // Best first; among equals prefer the CHEAPEST card — never burn the queen
  // when the jack does the same job.
  usable.sort((a, b) => b.tricks - a.tricks || a.card.rank - b.card.rank);
  const best = usable[0]!;
  return { card: best.card, tricks: best.tricks, candidates: usable };
}
