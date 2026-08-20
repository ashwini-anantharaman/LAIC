// THE K ITEMS, WITH REAL VALUES IN THEM (owner ask 2026-08-19: "I want it to
// actually have real content in it as well that is updated dynamically based on
// the state of the board").
//
// The registry (kItems.ts) declares 29 items a deterministic layer could show.
// looking.ts and think.ts between them produce 12 — the ones they happened to
// need for their own panes — so a lesson naming any of the other 17 drew a chip
// in the waiting list and nothing else. This file produces those 17.
//
// PRODUCED BY ID, not by title. The older producers invent cards from the
// position and title them in prose, which kLesson.ts then has to match back to
// the registry through a lookup table. Here the id IS the key: `kFactsFor` is
// asked for the ids a lesson names and answers with values for the ones this
// position can support. That is the direction the seam was always meant to
// travel (see kLesson.ts's ID_BY_TITLE note); this file is the first producer
// on the far side of it.
//
// THE GUARANTEE IS THE WHOLE POINT. Every value here is arithmetic over what
// the learner may legitimately see — their own hand, dummy once it is down,
// the auction, the cards on the table — and over what pure subtraction proves
// about the rest. Nothing consults a model, a knowledge base or the solver, and
// nothing reads a concealed hand. So a card here can be MISSING (this position
// cannot support it: no trump suit, dummy not down yet, nothing led) but it
// cannot be WRONG, which is the contract the Know panel is built on.
//
// Two rules held throughout:
//   · PARTNER'S CARDS COUNT ONLY WHEN THEY ARE FACE UP. Dummy is public after
//     the opening lead and not before, and dummy themselves never sees
//     declarer's hand — `partnerCards` is the one place that is decided.
//   · A BOUND IS LABELLED AS A BOUND. Where the honest answer is "at least
//     this many" (sure tricks, counted without assuming an entry), the back of
//     the card says so rather than the front overstating it.

import { hcp } from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";

import type { KItemId } from "./kItems";
import { GLYPH, partnerOf, SEAT_NAME, SUITS, SUIT_WORD, dealtHand, visibleSeats } from "./position";

/** One produced card: the registry's item, with this position's value. */
export interface KFact {
  id: KItemId;
  /** The front — short, glanceable. */
  value: string;
  /** The back — the same fact spelled out, including how it was counted. */
  detail: string;
}

/* ───────────────────────── the position, once ───────────────────────── */

interface Ctx {
  state: GameState;
  seat: Seat;
  /** The learner's thirteen AS DEALT — what "my hand" means in the auction. */
  dealt: Card[];
  /** What is left of it — what "my hand" means once cards are being played. */
  remaining: Card[];
  /** Partner's hand as dealt, ONLY when it is face up to this learner. */
  partnerDealt: Card[] | null;
  /** And what is left of it. */
  partnerRemaining: Card[] | null;
  /**
   * Every unplayed card in every hand this learner may SEE — their own, plus
   * dummy once it is down, whichever side dummy is on.
   *
   * Not the same set as "mine and partner's", and the difference is a
   * correctness one: a DEFENDER sees dummy, who is an opponent. Counting what
   * is still out from own-hand-only would claim more cards are missing than
   * really are, which is exactly the kind of wrong this layer may not be.
   */
  visible: Card[];
  /** Every card played by anyone, in any trick — public. */
  played: Card[];
  /** The trump suit, or null in notrump (and before there is a contract). */
  trump: Suit | null;
  /** Completed tricks. */
  done: number;
  /** Completed tricks won by the learner's side. */
  ours: number;
  /** Is the learner's side the declaring side? */
  declaring: boolean;
  /** The learner's own role, for wording. */
  role: "declarer" | "dummy" | "defender" | "bidder";
}

/**
 * Dummy is face up AFTER THE OPENING LEAD, never before.
 *
 * `visibleSeats` answers which hands a learner may see in the play, and this
 * adds the timing it does not carry: between the auction ending and the first
 * card, nobody has seen dummy. One card early would be a leak, and it would be
 * this file's leak, so the rule lives here where it is used.
 */
const leadMade = (state: GameState): boolean => state.tricks.some((t) => t.plays.length > 0);

function partnerCards(state: GameState, seat: Seat): { dealt: Card[]; remaining: Card[] } | null {
  if (state.phase !== "play" || !state.contract) return null;
  if (!leadMade(state)) return null;
  const partner = partnerOf(seat);
  if (!visibleSeats(state, seat).includes(partner)) return null;
  return { dealt: dealtHand(state, partner), remaining: state.hands[partner] ?? [] };
}

/** The hands in front of the learner, as remaining cards. */
function visibleRemaining(state: GameState, seat: Seat): Card[] {
  const seats = state.phase === "play" && leadMade(state) ? visibleSeats(state, seat) : [seat];
  return seats.flatMap((s) => state.hands[s] ?? []);
}

function context(state: GameState, seat: Seat): Ctx {
  const partner = partnerCards(state, seat);
  const contract = state.contract;
  const declarer = contract?.declarer ?? null;
  const dummy = declarer ? partnerOf(declarer) : null;
  return {
    state,
    seat,
    dealt: dealtHand(state, seat),
    remaining: state.hands[seat] ?? [],
    partnerDealt: partner?.dealt ?? null,
    partnerRemaining: partner?.remaining ?? null,
    visible: visibleRemaining(state, seat),
    played: state.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    trump: contract && contract.strain !== "N" ? (contract.strain as Suit) : null,
    done: state.tricks.filter((t) => t.winner).length,
    ours: state.tricks.filter((t) => t.winner === seat || t.winner === partnerOf(seat)).length,
    declaring: !!declarer && (seat === declarer || seat === dummy),
    role:
      state.phase !== "play" || !declarer
        ? "bidder"
        : seat === declarer
          ? "declarer"
          : seat === dummy
            ? "dummy"
            : "defender",
  };
}

/* ───────────────────────── small counting tools ───────────────────────── */

const of = (cards: readonly Card[], suit: Suit): Card[] => cards.filter((c) => c.suit === suit);
const has = (cards: readonly Card[], suit: Suit, rank: number): boolean =>
  cards.some((c) => c.suit === suit && (c.rank as number) === rank);
const A = 14, K = 13, Q = 12, J = 11;

/** "2½" — halves read better than "2.5" on a card front. */
const half = (n: number): string => {
  const whole = Math.floor(n);
  const frac = n - whole === 0.5 ? "½" : "";
  return whole === 0 && frac ? "½" : `${whole}${frac}`;
};

/** Ranks in descending order, as labels — "A K 9". */
const RANK_LABEL: Record<number, string> = {
  14: "A", 13: "K", 12: "Q", 11: "J", 10: "10",
  9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2",
};
const ranksDesc = (cards: readonly Card[]): number[] =>
  [...cards].map((c) => c.rank as number).sort((a, b) => b - a);

/**
 * Which cards of a suit are still unplayed anywhere — the whole outstanding
 * holding, ours included.
 *
 * Pure subtraction over public information: thirteen ranks a suit, minus every
 * one already on the table. It says nothing about WHICH hidden hand holds what,
 * which is exactly the line this file does not cross.
 */
function outstanding(ctx: Ctx, suit: Suit): number[] {
  const played = new Set(of(ctx.played, suit).map((c) => c.rank as number));
  return [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].filter((r) => !played.has(r));
}

/* ───────────────────────── the producers ───────────────────────── */

type Producer = (ctx: Ctx) => { value: string; detail: string } | null;

const PRODUCERS: Partial<Record<KItemId, Producer>> = {
  /* ── the auction, and the two that span both phases ── */

  "longest-suit": (c) => {
    // As dealt while bidding (the suit you would open); of what is LEFT once
    // cards are being played (the suit you might still run).
    const hand = c.state.phase === "play" ? c.remaining : c.dealt;
    if (!hand.length) return null;
    const counts = SUITS.map((s) => [s, of(hand, s).length] as const);
    const top = Math.max(...counts.map(([, n]) => n));
    if (top === 0) return null;
    const suits = counts.filter(([, n]) => n === top).map(([s]) => s);
    const glyphs = suits.map((s) => GLYPH[s]).join("");
    const words = suits.map((s) => `${SUIT_WORD[s]}s`).join(" and ");
    return {
      value: `${glyphs} ${top}`,
      detail:
        c.state.phase === "play"
          ? `${top} ${words} left — your longest holding of what remains.`
          : `${top} ${words} — your longest suit. Length is where extra tricks come from.`,
    };
  },

  vulnerability: (c) => {
    const weAreNS = c.seat === "N" || c.seat === "S";
    const vul = c.state.vul;
    const us = vul === "both" || (weAreNS ? vul === "ns" : vul === "ew");
    const them = vul === "both" || (weAreNS ? vul === "ew" : vul === "ns");
    const value = us && them ? "Both" : us ? "Us" : them ? "Them" : "Neither";
    const detail =
      us && them
        ? "Both sides vulnerable: every penalty and every game bonus is the larger one."
        : us
          ? "You are vulnerable and they are not — your penalties cost more than theirs."
          : them
            ? "They are vulnerable and you are not — their penalties cost more than yours."
            : "Neither side vulnerable: the smaller bonuses, and the cheaper penalties.";
    return { value, detail };
  },

  "total-points": (c) => {
    const points = hcp(c.dealt);
    const length = SUITS.reduce((n, s) => n + Math.max(0, of(c.dealt, s).length - 4), 0);
    return {
      value: String(points + length),
      detail: `${points} high-card points plus ${length} for length — one a card beyond the fourth in a suit.`,
    };
  },

  "quick-tricks": (c) => {
    // The standard table, and nothing beyond it: AK=2, AQ=1½, A=1, KQ=1,
    // K with at least one other card=½. A bare king is worth nothing here.
    let total = 0;
    for (const s of SUITS) {
      const cards = of(c.dealt, s);
      const a = has(cards, s, A), k = has(cards, s, K), q = has(cards, s, Q);
      if (a && k) total += 2;
      else if (a && q) total += 1.5;
      else if (a) total += 1;
      else if (k && q) total += 1;
      else if (k && cards.length >= 2) total += 0.5;
    }
    return {
      value: half(total),
      detail: "Tricks that cannot be stopped: AK=2, AQ=1½, A=1, KQ=1, K with another=½.",
    };
  },

  "losing-trick-count": (c) => {
    let losers = 0;
    for (const s of SUITS) {
      const cards = of(c.dealt, s);
      const top = Math.min(3, cards.length);
      const winners = [A, K, Q].filter((r) => has(cards, s, r)).length;
      losers += Math.max(0, top - Math.min(winners, top));
    }
    return {
      value: String(losers),
      detail:
        "Count only your top three cards in each suit; each of A, K, Q you hold there is not a loser.",
    };
  },

  stoppers: (c) => {
    // A, Kx, Qxx, Jxxx — the holdings that stop a suit once on their own.
    const stopped = SUITS.filter((s) => {
      const cards = of(c.dealt, s);
      const n = cards.length;
      return (
        has(cards, s, A) ||
        (has(cards, s, K) && n >= 2) ||
        (has(cards, s, Q) && n >= 3) ||
        (has(cards, s, J) && n >= 4)
      );
    });
    const open = SUITS.filter((s) => !stopped.includes(s));
    return {
      value: stopped.length === 4 ? "All four" : stopped.length ? stopped.map((s) => GLYPH[s]).join("") : "None",
      detail:
        (stopped.length
          ? `Held once: ${stopped.map((s) => GLYPH[s]).join(" ")}. `
          : "No suit stopped. ") +
        (open.length ? `Wide open: ${open.map((s) => GLYPH[s]).join(" ")}. ` : "") +
        "A, Kx, Qxx or Jxxx stops a suit.",
    };
  },

  "seat-position": (c) => {
    const order: Seat[] = ["N", "E", "S", "W"];
    const n = (order.indexOf(c.seat) - order.indexOf(c.state.dealer) + 4) % 4;
    const label = ["1st", "2nd", "3rd", "4th"][n]!;
    return {
      value: label,
      detail: `${SEAT_NAME[c.state.dealer]} deals, so you speak ${label} — ${
        n === 0
          ? "nobody has spoken before you."
          : n === 3
            ? "you hear all three before deciding."
            : `you hear ${n} call${n === 1 ? "" : "s"} first.`
      }`,
    };
  },

  "partner-ceiling": (c) => {
    const mine = hcp(c.dealt);
    const ceiling = 40 - mine;
    return {
      value: `≤ ${ceiling}`,
      detail: `The deck holds 40 and you hold ${mine}, so partner cannot hold more than ${ceiling}. Their bidding narrows it from there.`,
    };
  },

  /* ── the play ── */

  "contract-target": (c) => {
    if (!c.state.contract) return null;
    const level = c.state.contract.level;
    const toMake = 6 + level;
    const toSet = 14 - toMake;
    return {
      value: String(c.declaring ? toMake : toSet),
      detail: c.declaring
        ? `A ${level}-level contract needs ${toMake} of the 13 tricks.`
        : `They need ${toMake} tricks; ${toSet} for you breaks the contract.`,
    };
  },

  "tricks-needed": (c) => {
    if (!c.state.contract) return null;
    const toMake = 6 + c.state.contract.level;
    const target = c.declaring ? toMake : 14 - toMake;
    const left = Math.max(0, target - c.ours);
    return {
      value: String(left),
      detail:
        left === 0
          ? `You have ${c.ours} of the ${target} you needed — that is ${c.declaring ? "the contract" : "the contract broken"}.`
          : `${target} needed, ${c.ours} won — ${left} to go, with ${13 - c.done} still to play.`,
    };
  },

  "tricks-remaining": (c) => {
    if (c.state.phase !== "play") return null;
    return {
      value: String(13 - c.done),
      detail: `${c.done} trick${c.done === 1 ? "" : "s"} complete, ${13 - c.done} left to play.`,
    };
  },

  "trumps-out": (c) => {
    if (!c.trump) return null;
    const suit = c.trump;
    const playedN = of(c.played, suit).length;
    // Every hand in front of the learner — which for a defender includes dummy,
    // an opponent's hand. Miss that and the count comes out too high.
    const seen = of(c.visible, suit).length;
    const out = 13 - playedN - seen;
    const where = c.visible.length > c.remaining.length ? "the two hands you can see" : "your hand";
    return {
      value: String(out),
      detail: `13 ${SUIT_WORD[suit]}s in all: ${playedN} played, ${seen} in ${where} — ${out} still out.`,
    };
  },

  "my-trumps": (c) => {
    if (!c.trump) return null;
    const cards = of(c.remaining, c.trump);
    return {
      value: String(cards.length),
      detail: cards.length
        ? `${ranksDesc(cards).map((r) => RANK_LABEL[r]).join(" ")} — your ${SUIT_WORD[c.trump]}s, ${cards.length} of the 13.`
        : `No ${SUIT_WORD[c.trump]}s left in your hand.`,
    };
  },

  "combined-trumps": (c) => {
    if (!c.trump || !c.partnerRemaining) return null;
    const mine = of(c.remaining, c.trump).length;
    const pard = of(c.partnerRemaining, c.trump).length;
    return {
      value: String(mine + pard),
      detail: `${mine} in your hand and ${pard} opposite — ${mine + pard} of the 13 ${SUIT_WORD[c.trump]}s, so ${
        13 - mine - pard - of(c.played, c.trump).length
      } are still out.`,
    };
  },

  "combined-hcp": (c) => {
    if (!c.partnerDealt) return null;
    const mine = hcp(c.dealt);
    const pard = hcp(c.partnerDealt);
    return {
      value: String(mine + pard),
      detail: `${mine} in your hand and ${pard} opposite — ${mine + pard} of the 40, leaving ${
        40 - mine - pard
      } between them.`,
    };
  },

  "sure-winners": (c) => {
    // Declarer's count, and only once dummy is down: the two hands have to be
    // in front of you before this is arithmetic rather than a guess.
    if (!c.partnerRemaining || c.role === "defender") return null;
    const named: string[] = [];
    let total = 0;
    for (const s of SUITS) {
      const still = outstanding(c, s);
      const run = (hand: readonly Card[]): number => {
        const held = new Set(of(hand, s).map((x) => x.rank as number));
        let n = 0;
        while (n < still.length && held.has(still[n]!)) n += 1;
        return n;
      };
      // ONE HAND AT A TIME, deliberately: a run split across the two hands
      // needs an entry to cash, and an entry is not something this layer is
      // allowed to assume (see kItems.ts — `dummy-entries` is JUDGMENT).
      const mine = run(c.remaining);
      const pard = run(c.partnerRemaining);
      const best = Math.max(mine, pard);
      if (best > 0) {
        total += best;
        const from = mine >= pard ? c.remaining : c.partnerRemaining;
        named.push(
          `${GLYPH[s]}${ranksDesc(of(from, s)).slice(0, best).map((r) => RANK_LABEL[r]).join("")}`,
        );
      }
    }
    return {
      value: `≥ ${total}`,
      detail: total
        ? `${named.join(", ")} win because nothing higher is left. Counted from one hand at a time, so a run split between the two hands is not counted — at least ${total}.`
        : "No card in either hand is the highest one still out, so nothing is certain yet.",
    };
  },

  "missing-honours": (c) => {
    if (c.state.phase !== "play") return null;
    // The suit in front of the learner: the one being played to, or trumps, or
    // their own longest. Named on the card so it is never ambiguous.
    const trick = c.state.tricks[c.state.tricks.length - 1];
    const led = trick && trick.plays.length > 0 && !trick.winner ? trick.plays[0]!.card.suit : null;
    const longest = SUITS.reduce(
      (best, s) => (of(c.remaining, s).length > of(c.remaining, best).length ? s : best),
      SUITS[0]!,
    );
    const suit = led ?? c.trump ?? longest;
    // ACCOUNTED FOR = in a hand the learner can see, dummy included whichever
    // side dummy is on. What is left is genuinely unlocated.
    const ours = new Set<number>(of(c.visible, suit).map((x) => x.rank as number));
    const playedRanks = new Set<number>(of(c.played, suit).map((x) => x.rank as number));
    const missing = [A, K, Q, J].filter((r) => !ours.has(r) && !playedRanks.has(r));
    const why = led ? "the suit being played" : c.trump === suit ? "trumps" : "your longest suit";
    return {
      value: missing.length ? `${GLYPH[suit]} ${missing.map((r) => RANK_LABEL[r]).join("")}` : `${GLYPH[suit]} none`,
      detail: missing.length
        ? `${missing.map((r) => RANK_LABEL[r]).join(", ")} of ${SUIT_WORD[suit]}s ${
            missing.length === 1 ? "is" : "are"
          } unaccounted for — not in front of you and not yet played. (${why})`
        : `Every ${SUIT_WORD[suit]} honour is either yours or already played. (${why})`,
    };
  },
};

/* ───────────────────────── the door ───────────────────────── */

/**
 * Values for the K items this position can support, in the order asked.
 *
 * An id with no producer, or a producer that answers null, simply does not come
 * back — the caller (the lesson pane) then shows the item as still to come,
 * which is the honest reading: the board has not reached it yet.
 */
export function kFactsFor(
  ids: readonly KItemId[],
  state: GameState,
  seat: Seat,
): KFact[] {
  const ctx = context(state, seat);
  const out: KFact[] = [];
  for (const id of ids) {
    const producer = PRODUCERS[id];
    if (!producer) continue;
    let made: { value: string; detail: string } | null = null;
    try {
      made = producer(ctx);
    } catch {
      // A producer that throws is a bug, not a reason to break the panel: the
      // card goes missing, which the pane already knows how to say.
      made = null;
    }
    if (made) out.push({ id, value: made.value, detail: made.detail });
  }
  return out;
}

/** Which registry ids this layer can produce at all — the census a test pins. */
export const K_FACT_IDS: readonly KItemId[] = Object.keys(PRODUCERS) as KItemId[];
