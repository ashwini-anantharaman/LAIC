// Shared vocabulary for reading a position: seats, relationships, and labels.
//
// Extracted from looking.ts when think.ts needed the same four helpers. Two
// definitions of "partner" in one codebase is the kind of thing that diverges
// quietly and then tells a learner their opponent opened the bidding.

import type { Call, Card, Seat, Suit } from "@bridge/events";
import type { GameState } from "@bridge/engine";

export const GLYPH: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
/** Display order: high suit first, as every hand diagram in bridge is printed. */
export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_WORD: Record<Suit, string> = { S: "spade", H: "heart", D: "diamond", C: "club" };
export const RANK: Record<number, string> = {
  14: "A", 13: "K", 12: "Q", 11: "J", 10: "10",
  9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2",
};
/** Clockwise: N → E → S → W → N. */
export const ORDER: Seat[] = ["N", "E", "S", "W"];
export const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

export const step = (seat: Seat, n: number): Seat => ORDER[(ORDER.indexOf(seat) + n) % 4]!;
export const partnerOf = (seat: Seat): Seat => step(seat, 2);
/** An honour for counting purposes — ten and up. */
export const isHonour = (c: Card): boolean => c.rank >= 10;

/** "1D" → "1♦", "1N" → "1NT", "P" → "Pass". */
export function callLabel(call: Call): string {
  if (call === "P") return "Pass";
  if (call === "X") return "Double";
  if (call === "XX") return "Redouble";
  const level = call.slice(0, 1);
  const strain = call.slice(1);
  return `${level}${strain === "N" ? "NT" : (GLYPH[strain] ?? strain)}`;
}

export const cardLabel = (c: Card): string => `${RANK[c.rank] ?? c.rank}${GLYPH[c.suit] ?? c.suit}`;

/**
 * How to refer to a seat when talking TO `me`.
 *
 * Partner earns the word "partner" because that relationship is what the auction
 * is about, and it is the one thing the table's own grid cannot show. Opponents
 * get their seat's name rather than "your left-hand opponent" — the table labels
 * the seats already, and the long form spends six words on something the learner
 * can read off the screen.
 */
export function relative(seat: Seat, me: Seat): string {
  if (seat === me) return "you";
  if (seat === partnerOf(me)) return "partner";
  return SEAT_NAME[seat];
}

/** `relative`, capitalised for the start of a sentence. */
export function Relative(seat: Seat, me: Seat): string {
  const r = relative(seat, me);
  return r === "you" ? "You" : r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * The ORIGINAL thirteen.
 *
 * `state.hands` loses cards as they are played, so mid-play it reports the
 * strength of what is left rather than what was dealt — a different number, and
 * not the one anyone means by "my hand".
 */
export function dealtHand(state: Pick<GameState, "hands" | "tricks">, seat: Seat): Card[] {
  return [
    ...state.hands[seat],
    ...state.tricks.flatMap((t) => t.plays.filter((p) => p.seat === seat).map((p) => p.card)),
  ];
}

/** "4=3=2=4" in ♠♥♦♣ order, plus the shape's plain-English class. */
export function shapeOf(hand: Card[]): { pattern: string; kind: string } {
  const lengths = SUITS.map((s) => hand.filter((c) => c.suit === s).length);
  const sorted = [...lengths].sort((a, b) => b - a);
  const [a = 0, b = 0, , d = 0] = sorted;
  // Balanced in the ordinary sense: no void, no singleton, at most one doubleton.
  const doubletons = sorted.filter((n) => n === 2).length;
  const kind =
    d >= 2 && doubletons <= 1 && a <= 5
      ? "balanced"
      : a >= 7
        ? "very long suit"
        : a >= 6
          ? "six-card suit"
          : b >= 5
            ? "two long suits"
            : d === 0
              ? "a void"
              : "unbalanced";
  return { pattern: lengths.join("="), kind };
}

/**
 * Which hands this learner can legitimately see.
 *
 * During the play dummy is face up, so a defender or declarer sees two hands.
 * Dummy themselves sees only their own — declarer's hand is as hidden from dummy
 * as it is from the defence. Everything downstream of this reads it rather than
 * reasoning about seats, which is what keeps a hidden card out of the coach's
 * mouth.
 */
export function visibleSeats(
  state: Pick<GameState, "phase" | "contract">,
  seat: Seat,
): Seat[] {
  if (state.phase !== "play" || !state.contract) return [seat];
  const dummy = partnerOf(state.contract.declarer);
  return seat === dummy ? [seat] : [seat, dummy];
}
