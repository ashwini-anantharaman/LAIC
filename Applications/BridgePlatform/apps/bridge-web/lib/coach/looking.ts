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
  relative, SEAT_NAME, shapeOf, SUITS, SUIT_WORD,
} from "./position";

/**
 * One event at the table, as an addressable row rather than prose.
 *
 * The sentence above summarizes; these itemize, so the panel can hang
 * interaction off each one — expand a call to see what it meant, ask about a
 * card. Same discipline as the rest of this file: the label is a restatement
 * of what happened, never a judgment of it.
 */
export interface LookingEvent {
  /** Stable key — "call-3" for auction[3], "play-6-1" for tricks[6].plays[1]. */
  id: string;
  /** The whole event as one sentence — "West led the A♠" — for screen readers
   *  and any surface that can't draw the structured parts below. */
  label: string;
  /** A call in the auction, or a card in a trick. */
  kind: "call" | "play";
  /** Who acted, for the seat badge. */
  seat: Seat;
  /** The actor from the learner's side of the table — "You", "Partner", "East". */
  who: string;
  /** What they did — "led", "played", "bid", "passed", "doubled", "redoubled". */
  verb: string;
  /** The card or call itself — "A♠", "1♦" — drawn as a small card face. Absent
   *  where the verb already says everything (passed, doubled). */
  token?: string;
  /**
   * For a call: its index into the auction. What a call MEANT is the KB's to
   * say, not this file's (no authority here) — the index is how the caller
   * attaches the meaning it already computed for the bidding grid.
   */
  auctionIndex?: number;
  /**
   * For a play: where the card sits — trick number and position within it.
   * The address `ben-tell?play=` wants, same role as auctionIndex above.
   */
  trickIndex?: number;
  playIndex?: number;
  /**
   * The decision behind this card was the LEARNER'S — their own card (unless
   * they were dummy, whose cards declarer chose), or dummy's card while they
   * were declaring. What gates the "what if" ask: BEN reasoning from any
   * other seat reads a hand the learner never controlled.
   */
  mine?: boolean;
}

/**
 * One section of the board's history — the auction, or one trick.
 *
 * Groups exist because the history ACCUMULATES (owner decision 2026-08-05):
 * past tricks and the auction stay on the card for the whole board rather
 * than being replaced at each new trick. Thirteen tricks of four cards is a
 * wall as a flat list; as sections it is a table of contents, with only the
 * current one open by default.
 */
export interface LookingEventGroup {
  /** Stable key — "auction", "trick-0" … */
  id: string;
  /** "The auction", "Trick 3", "This trick". */
  title: string;
  /** A completed trick's outcome — "won by partner". */
  note?: string;
  /** The section the board is in right now; the panel opens it by default. */
  current?: boolean;
  events: LookingEvent[];
}

/** What the sheet's context card draws. */
export interface LookingAt {
  /** One sentence on the position, from this learner's side of the table. */
  looking: string;
  /**
   * Compact chips. `label` may be empty for a value that reads alone.
   * `detail` is the flip side — the same fact spelled out, for the Game State
   * card's back. Factual only, like everything in this file: a definition or
   * a count, never advice.
   */
  facts: { label: string; value: string; detail?: string }[];
  /** The whole board so far — the auction and every trick, one group each. */
  eventGroups: LookingEventGroup[];
}

/** The flip side of the HCP chip — one definition, used in every phase.
 *  Backs are read inside a ~110px card, so every one is cut to the bone. */
const HCP_DETAIL = "A=4, K=3, Q=2, J=1. The deck holds 40.";

/** The flip side of each shape `kind` — a definition, not a recommendation. */
const KIND_DETAIL: Record<string, string> = {
  balanced: "No void or singleton, at most one doubleton.",
  "very long suit": "Seven or more cards in one suit.",
  "six-card suit": "Six cards in your longest suit.",
  "two long suits": "Two suits of five or more cards.",
  "a void": "A suit with no cards in it.",
  unbalanced: "Short in at least one suit.",
};

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
  const { kind } = shapeOf(dealt);
  // The shape spelled per suit — "♠4 ♥4 ♦4 ♣1" — rather than the bridge
  // column's "4=4=4=1": the glyphs say which suit is which without a legend,
  // and a learner shouldn't need the notation to read their own hand.
  const shape = SUITS
    .map((s) => `${GLYPH[s]}${dealt.filter((c) => c.suit === s).length}`)
    .join(" ");
  const system = opts.systemLabel?.trim();

  // The auction as rows — built the same way whichever phase we are in,
  // because the calls stay on the card for the whole board.
  const callEvents = (): LookingEvent[] =>
    state.auction.map((a, i) => {
      const who = Relative(a.seat, seat);
      const verb =
        a.call === "P" ? "passed" : a.call === "X" ? "doubled" : a.call === "XX" ? "redoubled" : "bid";
      const token = verb === "bid" ? callLabel(a.call) : undefined;
      return {
        id: `call-${i}`,
        label: token ? `${who} bid ${token}` : `${who} ${verb}`,
        kind: "call" as const,
        seat: a.seat,
        who,
        verb,
        ...(token ? { token } : {}),
        auctionIndex: i,
      };
    });

  // Every played trick as a group — shared by the live play and the finished
  // board, because the history must not vanish when the last card lands.
  const trickGroups = (): LookingEventGroup[] => {
    const declarer = state.contract?.declarer;
    const dummy = declarer ? partnerOf(declarer) : null;
    const groups: LookingEventGroup[] = [];
    state.tricks.forEach((t, ti) => {
      if (!t.plays.length) return;
      groups.push({
        id: `trick-${ti}`,
        // An unfinished trick can only be the last one; every completed trick
        // keeps its number and its outcome.
        title: t.winner ? `Trick ${ti + 1}` : "This trick",
        ...(t.winner ? { note: `won by ${relative(t.winner, seat)}` } : {}),
        events: t.plays.map((p, i) => {
          const who = Relative(p.seat, seat);
          const verb = i === 0 ? "led" : "played";
          const token = cardLabel(p.card);
          // Whose DECISION the card was: the learner's own card (unless they
          // were dummy — declarer chose those), or dummy's card while the
          // learner declared.
          const mine =
            (p.seat === seat && seat !== dummy) || (seat === declarer && p.seat === dummy);
          return {
            id: `play-${ti}-${i}`,
            label: `${who} ${verb} the ${token}`,
            kind: "play" as const,
            seat: p.seat,
            who,
            verb,
            token,
            trickIndex: ti,
            playIndex: i,
            ...(mine ? { mine } : {}),
          };
        }),
      });
    });
    return groups;
  };

  // The shape's flip side spells the glyphs out in words, so the back can be
  // read by someone who hasn't internalized the symbols yet.
  const shapeDetail = `${SUITS
    .map((s) => {
      const n = dealt.filter((c) => c.suit === s).length;
      return `${n} ${SUIT_WORD[s]}${n === 1 ? "" : "s"}`;
    })
    .join(", ")}.`;

  if (state.phase === "auction") {
    return {
      looking: auctionSentence(state.auction, seat, state.turn),
      facts: [
        { label: "HCP", value: String(points), detail: HCP_DETAIL },
        // Titled ON PURPOSE (owner direction 2026-08-13): a titled card
        // starts sealed — count your own suits before peeking. The system
        // card below stays untitled and open: identity, not an exercise.
        { label: "Distribution", value: shape, detail: shapeDetail },
        { label: "Shape", value: kind, ...(KIND_DETAIL[kind] ? { detail: KIND_DETAIL[kind] } : {}) },
        ...(system
          ? [{ label: "", value: system, detail: "The bidding system this table plays." }]
          : []),
      ],
      eventGroups: state.auction.length
        ? [{ id: "auction", title: "The auction", current: true, events: callEvents() }]
        : [],
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

    // Declarer plays dummy's cards too, so dummy's turn IS the learner's turn —
    // and which hand they are playing from is the thing they need told.
    const playsDummy = mine === "declaring" && state.turn === dummy;
    const myTurn = state.turn === seat || playsDummy;
    const fromWhere = playsDummy ? " — you're playing from dummy" : "";

    if (inProgress?.plays.length) {
      const led = inProgress.plays[0]!;
      sentence += ` ${relative(led.seat, seat)} led the ${cardLabel(led.card)}`;
      sentence += myTurn ? ` and it's your turn${fromWhere}.` : ".";
    } else if (myTurn) {
      sentence += playsDummy ? " Dummy is on lead, so it's your card." : " You're on lead.";
    } else {
      sentence += ` ${relative(state.turn, seat)} to play.`;
    }

    // The whole board so far, one group per section: the auction first, then
    // every trick in order. Nothing is replaced — a new lead ADDS a group.
    const groups: LookingEventGroup[] = [];
    if (state.auction.length) {
      groups.push({ id: "auction", title: "The auction", events: callEvents() });
    }
    groups.push(...trickGroups());
    // Where the board is right now — a just-finished trick stays current (and
    // open in the panel) until the next lead, exactly when you'd ask about it.
    if (groups.length) groups[groups.length - 1]!.current = true;

    return {
      looking: sentence,
      facts: [
        {
          label: "",
          value: `Trick ${Math.min(done + 1, 13)}`,
          detail: `Trick ${Math.min(done + 1, 13)} of 13.`,
        },
        { label: "yours", value: String(ours), detail: "Won by you and partner so far." },
        { label: "theirs", value: String(done - ours), detail: "Won by the opponents so far." },
        { label: "HCP dealt", value: String(points), detail: HCP_DETAIL },
      ],
      eventGroups: groups,
    };
  }

  // Between boards, or a board that is finished. The RECORD stays: a finished
  // board keeps its whole history — the auction and every trick — because
  // review is exactly when the History screen gets read (and asked: the
  // "what if" affordance lives on these rows once the board is over).
  return {
    looking: state.contract
      ? `The board is done — ${state.contract.level}${state.contract.strain === "N" ? "NT" : GLYPH[state.contract.strain]} by ${SEAT_NAME[state.contract.declarer]}.`
      : "Nothing in play yet.",
    facts: [
      { label: "HCP dealt", value: String(points), detail: HCP_DETAIL },
      { label: "Distribution", value: shape, detail: shapeDetail },
    ],
    eventGroups: [
      ...(state.auction.length
        ? [{ id: "auction", title: "The auction", events: callEvents() }]
        : []),
      ...trickGroups(),
    ],
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
