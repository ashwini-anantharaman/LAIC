// "What I'm looking at" — the coach's reading of the position, in facts only.
//
// This is the layer with no authority in it. Every line it produces is either
// arithmetic over the learner's own cards or a restatement of the auction and
// the tricks as played. It consults no knowledge base, calls no model, and never
// touches a hand the learner cannot see — so there is nothing here that can be
// WRONG, only things that can be missing.
//
// That property is why it exists before anything else. It is also exactly the
// layer "Help me think" needs: facts and options first, with a model's framing
// sentence on top later. Building it here means that button starts from something
// already true rather than from a prompt.
//
// It deliberately does NOT say what to do. No suggested call, no card, no
// judgment on what has happened. The moment this file has an opinion, it needs an
// authority behind it, and it has none.

import { hcp } from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import type { Call, Card, Seat, Suit } from "@bridge/events";

/** What the sheet's context card draws. */
export interface LookingAt {
  /** One sentence on the position, from this learner's side of the table. */
  looking: string;
  /** Compact chips. `label` may be empty for a value that reads alone. */
  facts: { label: string; value: string }[];
}

const GLYPH: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANK: Record<number, string> = {
  14: "A", 13: "K", 12: "Q", 11: "J", 10: "10",
  9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2",
};
/** Clockwise: N → E → S → W → N. */
const ORDER: Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

const step = (seat: Seat, n: number) => ORDER[(ORDER.indexOf(seat) + n) % 4]!;
const partnerOf = (seat: Seat) => step(seat, 2);

/** "1D" → "1♦", "1N" → "1NT", "P" → "Pass". */
export function callLabel(call: Call): string {
  if (call === "P") return "Pass";
  if (call === "X") return "Double";
  if (call === "XX") return "Redouble";
  const level = call.slice(0, 1);
  const strain = call.slice(1);
  return `${level}${strain === "N" ? "NT" : (GLYPH[strain] ?? strain)}`;
}

const cardLabel = (c: Card) => `${RANK[c.rank] ?? c.rank}${GLYPH[c.suit] ?? c.suit}`;

/**
 * How to refer to a seat when talking TO `me`.
 *
 * Partner earns the word "partner" because that relationship is what the auction
 * is about. Opponents get their seat letter's name rather than "your left-hand
 * opponent" — the table already labels the seats, and the long form costs six
 * words to say something the learner can read off the screen.
 */
function relative(seat: Seat, me: Seat): string {
  if (seat === me) return "you";
  if (seat === partnerOf(me)) return "partner";
  return SEAT_NAME[seat];
}

/** "4=3=2=4" in ♠♥♦♣ order, plus the shape's plain-English class. */
function shapeOf(hand: Card[]): { pattern: string; kind: string } {
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
 * The position, as facts.
 *
 * `null` when there is no learner seat — a watcher has no "your hand" to reason
 * from, and describing the position from nobody's point of view is not a thing
 * this can honestly do.
 */
export function lookingAt(
  state: Pick<GameState, "phase" | "auction" | "hands" | "tricks" | "contract" | "turn" | "dealer">,
  seat: Seat | null,
  opts: { systemLabel?: string } = {},
): LookingAt | null {
  if (!seat) return null;

  // The ORIGINAL thirteen. `state.hands` loses cards as they are played, so
  // mid-play it would report the strength of what is left rather than what was
  // dealt — a different number, and not the one anyone means by "my hand".
  const dealt = [
    ...state.hands[seat],
    ...state.tricks.flatMap((t) => t.plays.filter((p) => p.seat === seat).map((p) => p.card)),
  ];
  const points = hcp(dealt);
  const { pattern, kind } = shapeOf(dealt);
  const system = opts.systemLabel?.trim();

  if (state.phase === "auction") {
    return {
      looking: auctionSentence(state.auction, seat, state.turn),
      facts: [
        { label: "HCP", value: String(points) },
        { label: "♠♥♦♣", value: pattern },
        { label: "", value: kind },
        ...(system ? [{ label: "", value: system }] : []),
      ],
    };
  }

  if (state.phase === "play" && state.contract) {
    const c = state.contract;
    const declarer = c.declarer;
    const dummy = partnerOf(declarer);
    const mine = seat === declarer ? "declaring" : seat === dummy ? "dummy" : "defending";
    const strain = c.strain === "N" ? "NT" : (GLYPH[c.strain] ?? c.strain);
    const dbl = c.doubled === 1 ? " doubled" : c.doubled === 2 ? " redoubled" : "";
    const label = `${c.level}${strain}${dbl}`;

    const done = state.tricks.filter((t) => t.winner).length;
    const ours = state.tricks.filter((t) => t.winner === seat || t.winner === partnerOf(seat)).length;
    const current = state.tricks[state.tricks.length - 1];
    const inProgress = current && !current.winner ? current : undefined;

    let sentence =
      mine === "declaring"
        ? `You're declaring ${label}.`
        : mine === "dummy"
          ? `You're dummy in ${label} — partner is playing your cards.`
          : `You're defending ${label} by ${SEAT_NAME[declarer]}.`;

    if (inProgress?.plays.length) {
      const led = inProgress.plays[0]!;
      sentence += ` ${relative(led.seat, seat)} led the ${cardLabel(led.card)}`;
      sentence += state.turn === seat ? " and it's your turn." : ".";
    } else if (state.turn === seat) {
      sentence += " You're on lead.";
    } else {
      sentence += ` ${relative(state.turn, seat)} to play.`;
    }

    return {
      looking: sentence,
      facts: [
        { label: "", value: `Trick ${Math.min(done + 1, 13)}` },
        { label: "yours", value: String(ours) },
        { label: "theirs", value: String(done - ours) },
        { label: "HCP dealt", value: String(points) },
      ],
    };
  }

  // Between boards, or a board that is finished.
  return {
    looking: state.contract
      ? `The board is done — ${state.contract.level}${state.contract.strain === "N" ? "NT" : GLYPH[state.contract.strain]} by ${SEAT_NAME[state.contract.declarer]}.`
      : "Nothing in play yet.",
    facts: [{ label: "HCP dealt", value: String(points) }, { label: "♠♥♦♣", value: pattern }],
  };
}

/**
 * The auction so far, in one sentence.
 *
 * Summarised rather than transcribed. The grid above already lists every call, so
 * repeating it here would be the panel narrating the screen — which is the exact
 * failure this section replaced. What the grid does NOT say is which of those
 * seats is your partner, and that is the fact the sentence exists to carry.
 */
function auctionSentence(auction: readonly { seat: Seat; call: Call }[], me: Seat, turn: Seat): string {
  const whose = turn === me ? " It's your call." : ` ${relative(turn, me)} to call.`;

  const spoken = auction.filter((a) => a.call !== "P");
  const last = spoken[spoken.length - 1];
  if (!last) {
    return auction.length
      ? `${auction.length} pass${auction.length === 1 ? "" : "es"} so far — nobody has bid.${whose}`
      : `Nobody has bid yet.${whose}`;
  }

  // "opened" only if it really was the first thing said at this table.
  const verb = spoken.length === 1 ? "opened" : "bid";
  const who = relative(last.seat, me);
  const subject = who === "you" ? "You" : who.charAt(0).toUpperCase() + who.slice(1);
  let sentence = `${subject} ${verb} ${callLabel(last.call)}`;

  // Passes SINCE that call — the part the sentence can add cheaply, because it
  // tells you whether the auction is about to end.
  const after = auction.slice(auction.indexOf(last) + 1);
  if (after.length === 1) sentence += `, then ${relative(after[0]!.seat, me)} passed`;
  else if (after.length > 1) sentence += `, then ${after.length} passes`;

  return `${sentence}.${whose}`;
}
