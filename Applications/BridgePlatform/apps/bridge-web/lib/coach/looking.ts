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
import type { Call, Seat } from "@bridge/events";

import {
  callLabel, cardLabel, dealtHand, GLYPH, partnerOf, Relative,
  relative, SEAT_NAME, shapeOf,
} from "./position";

/** What the sheet's context card draws. */
export interface LookingAt {
  /** One sentence on the position, from this learner's side of the table. */
  looking: string;
  /** Compact chips. `label` may be empty for a value that reads alone. */
  facts: { label: string; value: string }[];
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

  const dealt = dealtHand(state, seat);
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
  let sentence = `${Relative(last.seat, me)} ${verb} ${callLabel(last.call)}`;

  // Passes SINCE that call — the part the sentence can add cheaply, because it
  // tells you whether the auction is about to end.
  const after = auction.slice(auction.indexOf(last) + 1);
  if (after.length === 1) sentence += `, then ${relative(after[0]!.seat, me)} passed`;
  else if (after.length > 1) sentence += `, then ${after.length} passes`;

  return `${sentence}.${whose}`;
}
