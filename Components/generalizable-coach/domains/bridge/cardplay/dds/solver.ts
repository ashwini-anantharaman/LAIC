/**
 * Zone 3 — Bridge: a compact double-dummy solver (alpha-beta minimax).
 *
 * Given the remaining cards of all four hands, the trump strain, the current
 * (possibly partial) trick, and the seat to play, it returns — for each legal
 * card that seat could play — the number of tricks the seat's SIDE takes from
 * this point on with best play by everyone (double-dummy).
 *
 * It is deliberately small and dependency-free so it can be unit-tested and run
 * in the browser. It is meant for END-GAME positions (a handful of tricks
 * left); the caller caps how many cards it will solve so the search stays fast.
 * Cards are encoded as integers for speed: suitIndex*13 + (rank-2).
 */

export type SeatId = "N" | "E" | "S" | "W";
export type Side = "NS" | "EW";

const SUIT_INDEX: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER = "23456789TJQKA";

/** Next seat clockwise (S→W→N→E→S), matching BridgeBot's rotation. */
const NEXT: Record<SeatId, SeatId> = { S: "W", W: "N", N: "E", E: "S" };
export const sideOf = (s: SeatId): Side => (s === "N" || s === "S" ? "NS" : "EW");

/** "HQ" → integer code. Returns -1 for a malformed card. */
export function encodeCard(card: string): number {
  const suit = SUIT_INDEX[card[0]?.toUpperCase() ?? ""];
  const rank = RANK_ORDER.indexOf(card.slice(1).toUpperCase());
  if (suit == null || rank < 0) return -1;
  return suit * 13 + rank;
}
export function decodeCard(code: number): string {
  const suit = "SHDC"[Math.floor(code / 13)];
  const rank = RANK_ORDER[code % 13];
  return `${suit}${rank}`;
}
const suitOfCode = (code: number): number => Math.floor(code / 13);
const rankOfCode = (code: number): number => code % 13;

export interface PlayedCard {
  seat: SeatId;
  code: number;
}

export interface Position {
  hands: Record<SeatId, number[]>;
  /** cards already played in the current (incomplete) trick, in play order */
  trick: PlayedCard[];
  toPlay: SeatId;
  /** trump suit index 0..3, or -1 for notrump */
  trump: number;
}

/** Does card `a` beat card `b`, given trump and the led suit index? */
function beats(a: number, b: number, trump: number, led: number): boolean {
  const sa = suitOfCode(a);
  const sb = suitOfCode(b);
  const at = trump >= 0 && sa === trump;
  const bt = trump >= 0 && sb === trump;
  if (at && !bt) return true;
  if (bt && !at) return false;
  if (at && bt) return rankOfCode(a) > rankOfCode(b);
  if (sa !== led) return false;
  if (sb !== led) return true;
  return rankOfCode(a) > rankOfCode(b);
}

function trickWinner(trick: PlayedCard[], trump: number): SeatId {
  // Only ever called with a full trick; the guard is for the type system.
  let best = trick[0]!;
  const led = suitOfCode(best.code);
  for (let i = 1; i < trick.length; i++) {
    const next = trick[i]!;
    if (beats(next.code, best.code, trump, led)) best = next;
  }
  return best.seat;
}

/** Legal plays for `toPlay`: follow the led suit if able, else anything. */
function legalCards(hand: number[], trick: PlayedCard[]): number[] {
  if (trick.length === 0) return hand;
  const led = suitOfCode(trick[0]!.code);
  const following = hand.filter((c) => suitOfCode(c) === led);
  return following.length ? following : hand;
}

function keyOf(pos: Position, refSide: Side): string {
  // Canonical: sorted hands per seat + current trick + toPlay + ref side.
  const h = (["N", "E", "S", "W"] as SeatId[])
    .map((s) => pos.hands[s].slice().sort((a, b) => a - b).join(","))
    .join("|");
  const t = pos.trick.map((p) => `${p.seat}${p.code}`).join(",");
  return `${h}#${t}#${pos.toPlay}#${refSide}`;
}

/**
 * Tricks the reference side takes from `pos` onward, with optimal play by all.
 * Alpha-beta minimax; the reference side maximizes, opponents minimize.
 */
function solve(
  pos: Position,
  refSide: Side,
  alpha: number,
  beta: number,
  memo: Map<string, number>,
): number {
  const remaining = pos.hands.N.length + pos.hands.E.length + pos.hands.S.length + pos.hands.W.length;
  if (remaining === 0 && pos.trick.length === 0) return 0;

  const memoize = pos.trick.length === 0;
  if (memoize) {
    const cached = memo.get(keyOf(pos, refSide));
    if (cached !== undefined) return cached;
  }

  const maximizing = sideOf(pos.toPlay) === refSide;
  const moves = legalCards(pos.hands[pos.toPlay], pos.trick);
  // Move ordering: try high cards first — improves alpha-beta pruning.
  moves.sort((a, b) => rankOfCode(b) - rankOfCode(a));

  let best = maximizing ? -1 : Infinity;

  for (const card of moves) {
    const nextHands = { ...pos.hands, [pos.toPlay]: pos.hands[pos.toPlay].filter((c) => c !== card) };
    const nextTrick = [...pos.trick, { seat: pos.toPlay, code: card }];

    let value: number;
    if (nextTrick.length === 4) {
      const winner = trickWinner(nextTrick, pos.trump);
      const won = sideOf(winner) === refSide ? 1 : 0;
      value = won + solve(
        { hands: nextHands, trick: [], toPlay: winner, trump: pos.trump },
        refSide,
        alpha,
        beta,
        memo,
      );
    } else {
      value = solve(
        { hands: nextHands, trick: nextTrick, toPlay: NEXT[pos.toPlay], trump: pos.trump },
        refSide,
        alpha,
        beta,
        memo,
      );
    }

    if (maximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break; // cutoff
  }

  if (memoize) memo.set(keyOf(pos, refSide), best);
  return best;
}

export interface SolveResult {
  /** tricks the side-to-play takes for each of its legal cards (decoded "HQ") */
  scores: { card: string; tricks: number }[];
  bestTricks: number;
  bestCards: string[];
}

/**
 * Score every legal card for the seat to play. Reference side = that seat's
 * side, so higher tricks = better for the player.
 */
export function solvePosition(pos: Position): SolveResult {
  const refSide = sideOf(pos.toPlay);
  const memo = new Map<string, number>();
  const legal = legalCards(pos.hands[pos.toPlay], pos.trick);

  const scores = legal.map((card) => {
    const nextHands = { ...pos.hands, [pos.toPlay]: pos.hands[pos.toPlay].filter((c) => c !== card) };
    const nextTrick = [...pos.trick, { seat: pos.toPlay, code: card }];
    let tricks: number;
    if (nextTrick.length === 4) {
      const winner = trickWinner(nextTrick, pos.trump);
      const won = sideOf(winner) === refSide ? 1 : 0;
      tricks = won + solve({ hands: nextHands, trick: [], toPlay: winner, trump: pos.trump }, refSide, -1, Infinity, memo);
    } else {
      tricks = solve({ hands: nextHands, trick: nextTrick, toPlay: NEXT[pos.toPlay], trump: pos.trump }, refSide, -1, Infinity, memo);
    }
    return { card: decodeCard(card), tricks };
  });

  const bestTricks = scores.reduce((m, s) => Math.max(m, s.tricks), 0);
  const bestCards = scores.filter((s) => s.tricks === bestTricks).map((s) => s.card);
  return { scores, bestTricks, bestCards };
}
